import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createModel } from './editor-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = createModel(root);
const port = 1314;
const token = crypto.randomBytes(32).toString('hex');
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
let ownedPreview;
let publishing;
const job = { running: false, exitCode: null, output: '', started: null };
let mutations = Promise.resolve();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' };

async function requestBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 23_000_000) { const error = new Error('请求过大，请使用小于 15 MB 的图片。'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}
function logJob(buffer) { job.output = (job.output + buffer.toString('utf8')).slice(-50000); }
function publish() {
  if (job.running) throw new Error('已有发布正在进行，请等待完成。');
  job.running = true; job.exitCode = null; job.output = ''; job.started = new Date().toISOString();
  publishing = spawn(process.execPath, ['scripts/publish.mjs'], { cwd: root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  publishing.stdout.on('data', logJob); publishing.stderr.on('data', logJob);
  publishing.on('error', error => { job.running = false; job.exitCode = 1; job.output += '\n' + error.message; });
  publishing.on('close', code => { job.running = false; job.exitCode = code; });
  return job;
}
const server = http.createServer(async (request, response) => {
  try {
    if (!allowedHosts.has(request.headers.host)) return json(response, 403, { error: 'This editor is available on this computer only.' });
    const origin = request.headers.origin;
    if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) return json(response, 403, { error: 'Origin not allowed.' });
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${token}'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self'; frame-src http://localhost:1313; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    const url = new URL(request.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      if (request.headers['x-editor-token'] !== token) return json(response, 403, { error: '编辑会话已变化，请刷新页面。' });
      if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, model.state());
      if (request.method === 'GET' && url.pathname === '/api/publish') return json(response, 200, job);
      if (!['POST', 'PUT'].includes(request.method)) return json(response, 405, { error: 'Method not allowed.' });
      const body = await requestBody(request);
      const operation = async () => {
        if (job.running && url.pathname !== '/api/publish') { const error = new Error('发布进行中，请完成后再保存。'); error.status = 409; throw error; }
        if (url.pathname === '/api/settings') return model.saveSettings(body.key, body.value, body.revision);
        if (url.pathname === '/api/record') return model.saveRecord(body.record, body.revision);
        if (url.pathname === '/api/remove') return model.removeRecord(body.id, body.revision);
        if (url.pathname === '/api/upload') return model.upload(body);
        if (url.pathname === '/api/publish') return publish();
        const error = new Error('Unknown operation.'); error.status = 404; throw error;
      };
      const result = mutations.then(operation);
      mutations = result.catch(() => {});
      return json(response, 200, await result);
    }
    if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8').replace('<!--EDITOR_BOOTSTRAP-->', `<script nonce="${token}">window.EDITOR_TOKEN=${JSON.stringify(token)};</script>`);
      response.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' }); return response.end(html);
    }
    let file;
    if (['/app.js', '/editor.css'].includes(url.pathname)) file = path.join(root, 'editor', url.pathname.slice(1));
    else if (url.pathname.startsWith('/media/images/')) {
      const relative = decodeURIComponent(url.pathname.slice('/media/'.length));
      file = model.resolve(`static/${relative}`);
      if (!file.startsWith(path.join(root, 'static', 'images') + path.sep)) return json(response, 403, { error: 'Image path not allowed.' });
    } else return json(response, 404, { error: 'Not found.' });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, { error: 'Not found.' });
    response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    if (!response.headersSent) json(response, error.status || 400, { error: error.message });
    else response.end();
  }
});

async function start() {
  try { const preview = await fetch('http://localhost:1313/', { signal: AbortSignal.timeout(1500) }); if (!preview.ok) throw new Error(); }
  catch {
    const local = path.join(root, '.tools/hugo', process.platform === 'win32' ? 'hugo.exe' : 'hugo');
    ownedPreview = spawn(fs.existsSync(local) ? local : 'hugo', ['server', '--bind', '127.0.0.1', '--port', '1313', '--disableFastRender'], { cwd: root, windowsHide: true, stdio: 'inherit' });
    ownedPreview.on('error', error => console.error('Preview could not start:', error.message));
  }
  server.listen(port, '127.0.0.1', () => console.log(`Website editor: http://localhost:${port}/\nWebsite preview: http://localhost:1313/\nEditing folder: ${root}`));
}
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'The editor is already running. Open http://localhost:1314/.' : error.message); process.exit(1); });
function stop() { ownedPreview?.kill(); server.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await start();

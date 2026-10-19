import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
async function openEditor() {
  const url = 'http://localhost:1314/';
  if (process.platform === 'win32') spawn('rundll32', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' }).unref();
}
try {
  const existing = await fetch('http://localhost:1314/', { signal: AbortSignal.timeout(1200) });
  if (existing.ok && (await existing.text()).includes('EDITOR_TOKEN')) { await openEditor(); process.exit(0); }
} catch { /* Start the local editor below. */ }
if (!fs.existsSync(path.join(root, 'node_modules/yaml'))) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/c', 'npm.cmd ci --ignore-scripts --no-audit --no-fund'], { cwd: root, windowsHide: true, stdio: 'inherit' })
    : spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) { console.error('首次初始化未完成，请检查网络后重试。'); process.exit(1); }
}
if (process.platform === 'win32' && !fs.existsSync(path.join(root, '.tools/hugo/hugo.exe'))) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/setup.ps1')], { cwd: root, windowsHide: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
const child = spawn(process.execPath, ['scripts/editor-server.mjs'], { cwd: root, windowsHide: true, stdio: 'inherit' });
child.on('error', error => console.error(error.message));
let timer;
async function waitUntilReady() {
  try { const response = await fetch('http://localhost:1314/', { signal: AbortSignal.timeout(1000) }); if (response.ok) { await openEditor(); return; } }
  catch { /* The server is still starting. */ }
  timer = setTimeout(waitUntilReady, 500);
}
waitUntilReady();
child.on('close', code => { clearTimeout(timer); process.exit(code || 0); });
process.on('SIGINT', () => child.kill());

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const editorURL = 'http://localhost:1314/';
const launchLog = path.join(root, '.tools', 'editor-launch.log');
fs.mkdirSync(path.dirname(launchLog), { recursive: true });
function status(message) {
  console.log(message);
  fs.appendFileSync(launchLog, `${new Date().toISOString()} ${message}\n`, 'utf8');
}
async function openEditor() {
  status(`Editor is ready: ${editorURL}`);
  let result;
  if (process.platform === 'win32') {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${editorURL}' -ErrorAction Stop`], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
  } else result = spawnSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [editorURL], { encoding: 'utf8', timeout: 15000 });
  if (result.error || result.status !== 0) {
    status(`The browser did not open automatically. Open ${editorURL} in your browser.`);
    status(result.error?.message || result.stderr?.trim() || 'The browser launcher returned an error.');
  } else status(`Browser open request sent. If no new tab is visible, open ${editorURL} in your browser.`);
  status(`Startup log: ${launchLog}`);
}
status('Checking the website editor...');
try {
  const existing = await fetch(editorURL, { signal: AbortSignal.timeout(1500) });
  if (existing.ok && (await existing.text()).includes('EDITOR_TOKEN')) { status('The editor is already running.'); await openEditor(); process.exit(0); }
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
child.on('error', error => status(`Could not start the editor: ${error.message}`));
const startupDeadline = Date.now() + 45000;
let timer;
async function waitUntilReady() {
  try { const response = await fetch(editorURL, { signal: AbortSignal.timeout(1000) }); if (response.ok && (await response.text()).includes('EDITOR_TOKEN')) { await openEditor(); return; } }
  catch { /* The server is still starting. */ }
  if (Date.now() >= startupDeadline) {
    status('The editor did not become ready. Please share the startup log for help.');
    child.kill();
    process.exit(1);
  }
  timer = setTimeout(waitUntilReady, 500);
}
waitUntilReady();
child.on('close', code => { clearTimeout(timer); process.exit(code || 0); });
process.on('SIGINT', () => child.kill());

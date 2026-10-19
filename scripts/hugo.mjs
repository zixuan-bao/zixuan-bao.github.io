import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const localBinary = path.join(root, '.tools', 'hugo', process.platform === 'win32' ? 'hugo.exe' : 'hugo');
const binary = existsSync(localBinary) ? localBinary : 'hugo';
const args = process.argv.slice(2);
const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error('Hugo is not installed. Run the local setup script or install Hugo Extended 0.168.0.');
  process.exit(1);
}
process.exit(result.status ?? 1);

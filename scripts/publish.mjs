import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const remote = 'https://github.com/zixuan-bao/zixuan-bao.github.io.git';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...options });
  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(options.failure || `步骤未完成：${command} ${args[0] || ''}`);
  }
  return result.stdout?.trim() || '';
}
try {
  console.log('1 / 4 构建网站');
  run(process.execPath, ['scripts/hugo.mjs', '--environment', 'production', '--minify', '--cleanDestinationDir']);
  console.log('2 / 4 检查页面和链接');
  run(process.execPath, ['scripts/verify.mjs']);
  if (!fs.existsSync(path.join(root, '.git'))) {
    run('git', ['init', '-b', 'main']);
    run('git', ['remote', 'add', 'origin', remote]);
  }
  const origin = run('git', ['remote', 'get-url', 'origin']);
  if (origin !== remote) throw new Error('仓库地址与网站不一致，已停止发布。');
  const branch = run('git', ['branch', '--show-current']);
  if (branch !== 'main') throw new Error('当前不在 main 分支，已停止发布。');
  run('git', ['config', 'credential.https://github.com.username', 'zixuanb3']);
  console.log('3 / 4 保存网站版本');
  const source = ['.github', 'assets', 'content', 'data', 'editor', 'layouts', 'scripts', 'static', 'themes', '.gitignore', 'hugo.toml', 'package.json', 'package-lock.json', 'README.md', '使用说明.md', '编辑器使用指南.md', 'ASSETS.md', 'Start-Preview.cmd', 'Edit-Website.cmd', 'Edit-Website.vbs', 'Connect-GitHub.cmd'];
  run('git', ['add', '--', ...source.filter(file => fs.existsSync(path.join(root, file)))]);
  const changed = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root, windowsHide: true });
  if (changed.status === 1) run('git', ['commit', '-m', 'feat: update website and content editor']);
  else if (changed.status !== 0) throw new Error('无法检查待发布文件。');
  console.log('4 / 4 上传到 GitHub');
  run('git', ['push', '-u', 'origin', 'main'], { failure: '上传未完成。本机内容和版本已保留。若提示登录，请先双击 Connect-GitHub.cmd；若远程已有新修改，请先同步仓库。' });
  console.log('\n上传成功。GitHub Pages 正在部署：\nhttps://github.com/zixuan-bao/zixuan-bao.github.io/actions\n公开网址：https://zixuan-bao.github.io/');
} catch (error) {
  console.error('\n' + error.message);
  process.exit(1);
}

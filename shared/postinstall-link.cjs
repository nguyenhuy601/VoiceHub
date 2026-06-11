/**
 * Symlink node_modules/@enterprise/shared → thư mục shared này.
 * Gọi từ postinstall service: node ../../shared/postinstall-link.cjs (api-gateway: ../shared/...)
 */
const { existsSync, mkdirSync, rmSync, symlinkSync } = require('fs');
const { join, resolve, dirname } = require('path');

const sharedDir = resolve(__dirname);
const linkPath = join(process.cwd(), 'node_modules', '@enterprise', 'shared');

if (!existsSync(join(sharedDir, 'package.json'))) {
  console.warn('[postinstall-link] shared package.json missing, skip');
  process.exit(0);
}

mkdirSync(dirname(linkPath), { recursive: true });
try {
  rmSync(linkPath, { recursive: true, force: true });
} catch {
  /* ignore */
}

try {
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(sharedDir, linkPath, type);
  console.log(`[postinstall-link] ${linkPath} -> ${sharedDir}`);
} catch (err) {
  console.warn(`[postinstall-link] failed: ${err.message}`);
  process.exit(0);
}

import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
const archive = new URL(`tubeorder-${manifest.version}.zip`, output);
await rm(archive, { force: true });
const result = spawnSync('zip', ['-q', '-r', fileURLToPath(archive), '.', '-x', '*.DS_Store'], {
  cwd: fileURLToPath(new URL('extension/', root)),
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Extensão empacotada: ${fileURLToPath(archive)}`);

import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(fileURLToPath(new URL('../extension/', import.meta.url)));
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3, 'A extensão deve usar Manifest V3.');
assert.ok(manifest.name && manifest.version, 'Manifest deve conter nome e versão.');
const actionIcons = typeof manifest.action?.default_icon === 'string'
  ? [manifest.action.default_icon]
  : Object.values(manifest.action?.default_icon ?? {});
const references = new Set([
  ...Object.values(manifest.icons ?? {}),
  ...actionIcons,
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
].filter(Boolean));

if (manifest.action?.default_popup) {
  const popup = await readFile(path.join(directory, manifest.action.default_popup), 'utf8');
  for (const match of popup.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (!/^(?:[a-z]+:|#)/i.test(match[1])) {
      references.add(path.join(path.dirname(manifest.action.default_popup), match[1]));
    }
  }
}

for (const reference of references) {
  const target = path.resolve(directory, reference);
  assert.ok(target.startsWith(directory + path.sep), `Referência fora da extensão: ${reference}`);
  assert.ok((await stat(target)).isFile(), `Arquivo ausente: ${reference}`);
}

for (const [size, reference] of Object.entries(manifest.icons ?? {})) {
  if (!reference.endsWith('.png')) continue;
  const bytes = await readFile(path.join(directory, reference));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `PNG inválido: ${reference}`);
  assert.equal(bytes.readUInt32BE(16), Number(size), `Largura incorreta: ${reference}`);
  assert.equal(bytes.readUInt32BE(20), Number(size), `Altura incorreta: ${reference}`);
}

async function checkJavaScript(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) await checkJavaScript(target);
    else if (/\.m?js$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
      assert.equal(result.status, 0, `Erro de sintaxe em ${target}: ${result.stderr}`);
    }
  }
}

await checkJavaScript(directory);
console.log(`Manifest V3, ${references.size} referências, ícones e sintaxe JavaScript: OK.`);

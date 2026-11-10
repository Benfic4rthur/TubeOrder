import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const directory = new URL('../extension/icons/', import.meta.url);
const source = await readFile(new URL('icon.svg', directory), 'utf8');

for (const size of [16, 32, 48, 128]) {
  const rendered = new Resvg(source, {
    fitTo: { mode: 'width', value: size },
  }).render();
  const target = new URL(`icon${size}.png`, directory);
  await writeFile(target, rendered.asPng());
  console.log(`Gerado: ${fileURLToPath(target)}`);
}

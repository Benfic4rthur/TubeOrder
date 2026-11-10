# Desenvolvimento

[← Voltar à apresentação](../README.md)

O código instalável fica em `extension/`. As dependências abaixo são usadas somente no desenvolvimento e nos testes; não entram no ZIP.

Use Node.js 22 ou superior e npm:

```sh
npm ci
npx playwright install chromium
node scripts/check.mjs
npm test
```

Os testes carregam a extensão real em um navegador temporário e usam páginas simuladas do YouTube. Não exigem login nem alteram playlists de contas reais. Veja a [cobertura e os resultados documentados](../tests/README.md).

## Ícones

O original fica em [`extension/icons/icon.svg`](../extension/icons/icon.svg). Para gerar os PNGs de 16, 32, 48 e 128 pixels:

```sh
node scripts/generate-icons.mjs
```

A capa do repositório fica em [`.github/assets/tubeorder-cover.svg`](../.github/assets/tubeorder-cover.svg). Para gerar seu PNG:

```sh
node - <<'JS'
const fs = require('node:fs');
const { Resvg } = require('@resvg/resvg-js');
const source = fs.readFileSync('.github/assets/tubeorder-cover.svg');
const png = new Resvg(source).render().asPng();
fs.writeFileSync('.github/assets/tubeorder-cover.png', png);
JS
```

## Pacote de distribuição

```sh
npm run package
```

O empacotador lê a versão do manifesto e cria `dist/tubeorder-VERSÃO.zip`, com apenas o conteúdo de `extension/`. O `manifest.json` fica na raiz do ZIP; quem baixar a release deve selecionar essa pasta extraída ao instalar.

Durante o desenvolvimento, carregue a pasta `extension/` em `edge://extensions` ou `chrome://extensions`. Após mudar o código, clique em **Recarregar** no cartão da extensão e recarregue as abas do YouTube.

Para disponibilizar o pacote no site, siga o [guia de publicação](publicacao.md).

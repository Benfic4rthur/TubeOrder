# Publicar uma atualização

[← Voltar à apresentação](../README.md)

O TubeOrder é distribuído pelas [Releases deste repositório](https://github.com/Benfic4rthur/TubeOrder/releases). A página oficial fica em [allm4.com/tubeorder](https://allm4.com/tubeorder/).

O site consulta automaticamente a **última Release estável** deste repositório. Para disponibilizar uma atualização:

1. Atualize a versão em `extension/manifest.json`, `package.json` e `package-lock.json` e envie o código para o GitHub.
2. Rode as verificações e `npm run package`. O arquivo gerado será `dist/tubeorder-VERSÃO.zip`.
3. Em **Releases → Draft a new release**, escolha a tag da versão (por exemplo, `v1.4.5`), anexe `tubeorder-1.4.5.zip`, marque como **Latest** e publique. Deixe a opção de pré-release desmarcada.

Também é possível publicar pelo GitHub CLI. Exemplo após preparar a versão 1.4.5:

```sh
gh release create v1.4.5 dist/tubeorder-1.4.5.zip --repo Benfic4rthur/TubeOrder --latest --title "TubeOrder 1.4.5" --generate-notes
```

O site aceita o ZIP versionado produzido pelo empacotador e também um arquivo chamado `tubeorder.zip`. **Somente enviar um commit ou criar uma tag não publica o download:** é necessário publicar a Release com o ZIP anexado. Os arquivos automáticos “Source code” do GitHub não são o pacote de instalação.

O site consulta os metadados ao abrir a página, ao voltar à aba e a cada cinco minutos enquanto ela estiver visível. Um clique normal no botão de download consulta a release novamente. Versão, tamanho e ZIP são obtidos juntos da mesma release. Uma nova release completa atualiza os downloads sem republicar o ALLM4.

Se a consulta falhar ou o pacote estiver incompleto, o botão encaminha para a página da última release estável, sem oferecer um ZIP antigo. Os downloads continuam sendo uma instalação manual: o navegador não atualiza automaticamente uma extensão carregada sem compactação.

Para atualizar a extensão instalada, extraia a nova versão na mesma pasta, substitua os arquivos e clique em **Recarregar** no cartão do TubeOrder em `edge://extensions` ou `chrome://extensions`. Recarregue também as abas abertas do YouTube.

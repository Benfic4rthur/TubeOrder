<p align="center">
  <img src=".github/assets/tubeorder-cover.png" alt="TubeOrder — Seu tempo, na ordem certa. Organize o Assistir mais tarde por duração." width="1200" />
</p>

<h1 align="center">TubeOrder</h1>

<p align="center">
  Seu <strong>Assistir mais tarde</strong> do YouTube, em ordem de duração.<br />
  Gratuito, em português, para Chrome, Microsoft Edge e navegadores Chromium compatíveis.
</p>

<p align="center">
  <strong><a href="https://allm4.com/tubeorder/">Conhecer e experimentar</a></strong>
  &nbsp; · &nbsp;
  <strong><a href="https://github.com/Benfic4rthur/TubeOrder/releases/latest">Baixar a última versão</a></strong>
  &nbsp; · &nbsp;
  <a href="#instalação">Como instalar</a>
</p>

---

## Uma fila que acompanha seu tempo

Escolha **Curtos primeiro** ou **Longos primeiro**. O TubeOrder salva a sequência na própria playlist do YouTube, e a reprodução automática segue essa ordem.

| Recurso | Como funciona |
| --- | --- |
| **A lista inteira em ordem** | Carrega as próximas páginas e organiza por duração, sem um limite artificial de vídeos. |
| **Sua preferência lembrada** | Ao entrar no Assistir mais tarde, aplica a última regra escolhida. |
| **Também enquanto você assiste** | Funciona na playlist lateral dos vídeos abertos com `list=WL`. |
| **Controles simples** | Faixa roxa compacta, ícone próprio e status verde para organizado ou vermelho para desorganizado. |
| **Progresso visível** | Exibe estimativa de tempo e bloqueia a página durante a organização, mantendo o vídeo e seus controles disponíveis. |
| **Trabalho só quando necessário** | Encerra o acompanhamento da ordenação ao terminar, sem varrer a página continuamente. |

O tempo depende do tamanho da lista e das respostas do YouTube. Vídeos sem duração identificável ficam no final. É necessário estar conectado à sua conta do YouTube.

## Instalação

**[Baixe o ZIP na última release](https://github.com/Benfic4rthur/TubeOrder/releases/latest)**, extraia e guarde a pasta em um lugar fixo. O mesmo pacote serve para os dois navegadores.

| Microsoft Edge | Google Chrome / Chromium |
| --- | --- |
| Abra `edge://extensions` | Abra `chrome://extensions` |
| Ative **Modo do desenvolvedor** | Ative **Modo do desenvolvedor** |
| Clique em **Carregar sem compactação** ou **Carregar sem pacote** | Clique em **Carregar sem compactação** |

1. Selecione **a pasta extraída que contém `manifest.json`**. Se você clonou o repositório, selecione a pasta [`extension`](extension/).
2. Fixe o ícone do TubeOrder no menu de extensões e recarregue as abas do YouTube.
3. Abra o [Assistir mais tarde](https://www.youtube.com/playlist?list=WL). Na primeira utilização, o TubeOrder organiza dos mais curtos para os mais longos.

A distribuição é por ZIP; a extensão ainda não está nas lojas dos navegadores. **Não é necessário instalar Node.js, dependências ou um servidor para usar.** As atualizações também são manuais: substitua os arquivos na pasta instalada, clique em **Recarregar** no cartão da extensão e recarregue o YouTube.

## Assistiu? Você pode manter ou remover

**A remoção de assistidos vem ativada** e pode ser desligada no ícone da extensão. Depois de pelo menos **80% efetivamente reproduzidos**, avance manualmente ou deixe o YouTube iniciar o próximo vídeo. O TubeOrder mostra um aviso de **6 segundos** antes de remover o anterior do Assistir mais tarde.

Clique em **Não apagar** para cancelar **somente aquela tentativa**. Se reassistir ao vídeo e avançar novamente, ele poderá receber outro aviso. Pausar o próximo vídeo interrompe a contagem; ao retomar, o prazo começa de novo. [Veja as regras completas](docs/guia.md#remover-vídeos-assistidos).

## Leveza e privacidade

- O pacote instalado usa JavaScript, CSS e ícones locais, sem dependências de execução, analytics ou servidor próprio.
- A única permissão declarada é `storage`. Os scripts são carregados em `www.youtube.com`; as ações da playlist ficam restritas ao Assistir mais tarde.
- As preferências ficam no navegador. As alterações na playlist são gravadas pelo próprio cliente do YouTube, com a sessão já conectada.
- Após a ordenação, os observadores temporários são desconectados. Com a remoção opcional ligada, o acompanhamento usa eventos nativos do vídeo ativo.
- O TubeOrder não baixa vídeos nem guarda cópias. Mudanças na interface do YouTube podem exigir atualizações da extensão.

Consulte o [manifesto](extension/manifest.json), o [código da extensão](extension/) e o [guia de funcionamento](docs/guia.md).

## Para quem quer olhar por dentro

| Diretório | Conteúdo |
| --- | --- |
| [`extension/`](extension/) | Extensão instalável e ícone oficial. |
| [`tests/`](tests/) | Testes de ordenação, reprodução e remoção cancelável, com páginas simuladas. |
| [`scripts/`](scripts/) | Verificação, geração dos ícones e empacotamento do ZIP. |
| [`docs/`](docs/) | Guia de uso, desenvolvimento e publicação de versões. |

**[Desenvolver e testar](docs/desenvolvimento.md)** · **[Publicar uma versão](docs/publicacao.md)** · **[Relatar um problema](https://github.com/Benfic4rthur/TubeOrder/issues)**

As releases alimentam os downloads do site automaticamente: versão, tamanho e pacote pertencem à mesma release estável. Em caso de falha na consulta, o site leva à página da última release.

---

<p align="center">
  Feito pela <a href="https://allm4.com/">ALLM4</a>.<br />
  <sub>Projeto independente, sem vínculo com YouTube, Google ou Microsoft.</sub>
</p>

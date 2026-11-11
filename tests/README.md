# Validação da TubeOrder

Executar `npm test` para testes unitários e de navegador. Os testes usam o Chromium do Playwright e carregam a extensão Manifest V3 real. As páginas do YouTube são substituídas por uma fixture local: não exigem login e não alteram playlists de contas reais.

## Cobertura

- Durações com minutos e horas; itens sem duração reconhecida.
- Ordenação crescente/decrescente, estabilidade em empates e itens sem duração no fim.
- Plano de movimentos conferido para as 120 permutações de cinco vídeos.
- Ordenação pelos comandos nativos de mover, com persistência simulada e recarregamento da página.
- Organização automática ao entrar no Assistir mais tarde, respeitando a última regra salva.
- Comandos manuais enviados pelo contexto da extensão, como no popup, sem painel permanente na playlist.
- Bloqueio da página somente durante o trabalho, removido após sucesso, cancelamento ou erro.
- Barra compacta com dois botões na mesma linha, altura de até 34 pixels, status de organização e escolha lembrada após atualizar.
- Carregamento automático de 157 vídeos em quatro páginas.
- Gravação de 157 vídeos em lotes de até 50 ações, com no máximo quatro chamadas nativas e nenhum menu individual.
- Persistência da ordem em lote ao atualizar; uma lista já ordenada não gera novas chamadas.
- Falha no lote sem usar menus como fallback nem anunciar sucesso.
- Painel lateral da reprodução do Assistir mais tarde: ordenação pelo mecanismo nativo de arrastar, confirmação da fila salva e persistência ao atualizar manualmente.
- Reprodução preservada durante a organização do painel: nenhuma atualização automática da página, mesma URL, tempo, velocidade e estado de reprodução.
- Trocar apenas o vídeo dentro da mesma sessão do Assistir mais tarde não inicia outra organização.
- Contador duplicado em texto de acessibilidade oculto: o total visível é 5, embora `textContent` pareça indicar 51; o carregamento termina corretamente.
- Intervalos de 1,7 segundo sem elemento de continuação durante o carregamento.
- Controles inativos em outra playlist, na reprodução fora do Assistir mais tarde e sem conta conectada.
- Navegação SPA do YouTube que ativa os controles ao entrar no Assistir mais tarde e os remove ao sair, sem erro de página.
- Cancelamento que interrompe novos movimentos.
- Falha do comando nativo sem anúncio incorreto de sucesso.
- Remoção do vídeo anterior somente após pelo menos 80% realmente assistidos e início estável do próximo vídeo, inclusive após clicar manualmente em Próximo.
- O aviso aparece antes de qualquer pedido de remoção e aguarda seis segundos; em 5999 milissegundos ainda não há pedido.
- O botão Não apagar, uma nova troca de vídeo ou desligar a preferência cancelam a remoção pendente.
- Não apagar cancela somente a tentativa atual: reassistir o mesmo vídeo com um recurso de mídia novo permite outro aviso.
- Seek para o fim sem cobertura de 80%, soma de trechos inferior a 80%, pausa sem próximo vídeo, próximo ainda sem `playing`, outra playlist ou ID divergente não solicitam remoção.
- Pausar o próximo vídeo esconde o aviso; retomar a reprodução reinicia o prazo completo de seis segundos.
- Ranges herdados de um recurso anterior não qualificam um vídeo novo; uma mídia de seis segundos não vale como reprodução completa de um vídeo com metadados de cem segundos.
- Eventos duplicados produzem uma única tentativa; falha não cria retentativa automática; preferência desligada impede a remoção.
- Dois casos usam o tracker e a ponte nativa de remoção reais: sucesso atualiza a fila e preserva a reprodução; falha do servidor mantém a fila sem nova tentativa.
- `playing` anterior à atualização da URL é preservado; o aviso espera a URL correta.
- Um anúncio transitório durante a navegação preserva o candidato até a reprodução do conteúdo.
- O desbloqueio da ordenação permite mostrar o aviso se o próximo vídeo já estiver tocando.
- O preview do aviso usa o mesmo botão Não apagar, mas seu caminho de expiração nunca envia pedidos de remoção, inclusive com reprodução pausada.
- CSP com `require-trusted-types-for 'script'`: o preview permanece visível e o botão Não apagar funciona com a remoção desligada, sem exceções nem pedidos de remoção.

## Versão 1.5.2 — 11 de novembro de 2026

Cinco testes de navegador direcionados à remoção passaram, além da verificação do manifesto, 17 referências, ícones e sintaxe JavaScript. A fixture inclui o bloco de metadados ao redor do nome do canal, como no YouTube. Os testes conferem que Remover pertence à linha do canal, fica à direita do nome e tem o mesmo centro vertical, tanto sem Bloquear desde o início como após sua remoção. A confirmação de exclusão, a persistência após recarregar, a recusa do servidor e a reprodução preservada continuam cobertas.

## Versão 1.5.1 — 11 de novembro de 2026

Cinco testes de navegador direcionados à remoção passaram, além da verificação do manifesto, 17 referências, ícones e sintaxe JavaScript. As duas regressões novas reproduzem a ausência inicial de Bloquear e sua remoção de uma linha já aberta. Em ambos os casos, Remover permanece compacto, sem duplicação. A exclusão sem Bloquear é confirmada pelo transporte nativo simulado e continua válida após recarregar. Sucesso, falha do servidor, reprodução e página da playlist também foram conferidos nos testes direcionados.

## Versão 1.5.0 — 11 de novembro de 2026

Passaram **4 testes unitários e 54 testes de navegador**. Manifesto, 17 referências, ícones e sintaxe JavaScript também passaram.

Os casos novos conferem o botão Reorganizar com a última regra, o cache de edição desatualizado após adicionar ou remover itens, a organização automática durante a reprodução, adições em sequência com Longos primeiro, a remoção manual junto a Bloquear e sua persistência após recarregar. Também cobrem remoção na página da playlist e do vídeo atual, opção automática desligada, falha do servidor e ausência de comandos de pausa, avanço ou busca enviados ao player.

A instalação local no Edge foi recarregada e mostrou a versão 1.5.0. Os controles foram conferidos no YouTube real; o usuário confirmou o funcionamento. Os testes automatizados de exclusão usam playlists simuladas, sem cliques de teste em Remover na conta real.

## Versão 1.4.5 — 10 de novembro de 2026

A suíte completa passou com **4 testes unitários e 48 testes de navegador**. A execução de navegador levou 59,5 segundos. Manifesto, referências, ícones e sintaxe JavaScript também passaram na verificação.

As novas regressões reproduzem o aviso que termina sem enviar a remoção quando a resposta interna ainda aponta para o vídeo anterior ou o getter privado da fila não está disponível. Também verificam o avanço automático após o final completo, a recusa de comandos para outro item e a ausência de sucesso quando o servidor confirma mas a fila do player continua antiga. O prazo de seis segundos, o botão Não apagar e a reprodução preservada continuam cobertos.

O transporte do YouTube e as playlists são simulados em um navegador temporário. Nenhum vídeo de uma conta real foi removido para validar esta versão.

## Resultado em 9 de novembro de 2026

Ordenação: quatro testes unitários e onze testes de navegador foram validados, incluindo os comandos em lote e o painel durante a reprodução. O caso de 157 vídeos em lote, incluindo atualização da página, demorou 4,1 segundos. A regressão do contador duplicado foi validada em 1,4 segundo, com `status.total` igual a 5.

Remoção com a regra de 80% e aviso de seis segundos: todos os 21 testes dirigidos passaram em 7,2 segundos. Dezenove casos simulam a resposta da ponte para testar elegibilidade e cancelamentos. Dois usam o tracker e `removal.js` reais, com o cliente nativo do YouTube simulado. Nenhum caso acessa ou exclui vídeos de uma conta real.

Três testes adicionais de sincronização — `playing` antes da URL, anúncio transitório e desbloqueio da ordenação — passaram em execução dirigida de 2 segundos.

Na versão 1.4.1, mais três testes passaram em 2,7 segundos: cancelamento restrito à tentativa atual, cancelamento do preview pelo botão real e expiração do preview sem pedidos de remoção. A cobertura de remoção soma 27 testes, dos quais dois usam a ponte nativa real.

A regressão de Trusted Types passou em 336 milissegundos, sob um CSP real enviado no cabeçalho HTTP. O teste confirmou que `innerHTML` é bloqueado, depois percorreu o preview e seu cancelamento com a preferência desligada. A cobertura de remoção e avisos soma 28 testes.

O prazo de seis segundos é controlado pelo [relógio do Playwright](https://playwright.dev/docs/clock). O relógio é instalado antes da navegação e pausado após a organização inicial; as asserções verificam o aviso e a ausência de pedido antes do prazo, sem esperar seis segundos reais em cada caso.

Esses testes verificam integração com o navegador e o contrato da página simulada. A validação da conta real no Edge é feita separadamente.

Na versão 1.4.0, a suíte completa passou com **4 testes unitários e 35 testes de navegador** em aproximadamente 55 segundos. São 24 casos da remoção de assistidos e 11 da ordenação. A regra de remoção exige pelo menos 80% efetivamente reproduzido, início do próximo vídeo e aviso cancelável de seis segundos. Os testes controlam o relógio do navegador para verificar o prazo sem esperar seis segundos em cada caso.

Os casos cobrem “Não apagar”, avanço manual, pausa e retomada da contagem, desativação da preferência, reprodução herdada de outro recurso, anúncios e divergência de duração/identidade. Dois fluxos completos executam o rastreador e a ponte de remoção reais da extensão contra o transporte nativo simulado; confirmam a alteração exata da fila ou a rejeição do servidor, mantendo o próximo vídeo em reprodução. Nenhum vídeo da conta do usuário é removido para testar.

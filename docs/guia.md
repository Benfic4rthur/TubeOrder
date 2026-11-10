# Guia do TubeOrder

[← Voltar à apresentação](../README.md) · [Baixar a última versão](https://github.com/Benfic4rthur/TubeOrder/releases/latest)

## Como usar

1. Abra o YouTube com sua conta conectada e entre em [Assistir mais tarde](https://www.youtube.com/playlist?list=WL), ou abra um vídeo dessa playlist com `list=WL` na URL. A TubeOrder organiza automaticamente ao entrar em uma dessas telas, usando a última ordem escolhida neste navegador. Na primeira utilização, organiza dos mais curtos para os mais longos.
2. Para trocar a ordem, use **Curtos primeiro** ou **Longos primeiro** na faixa roxa compacta. Na página da playlist, ela fica ao lado do seletor **Manual**; durante a reprodução, fica no cabeçalho da playlist lateral, junto ao nome do dono da playlist e à contagem de vídeos. Você também pode clicar no ícone roxo da TubeOrder na barra do navegador e escolher **Mais curtos primeiro** ou **Mais longos primeiro**. A escolha fica salva para as próximas entradas.
3. Deixe a aba aberta enquanto a extensão carrega os vídeos e salva a sequência. O bloqueio de interação mostra **Aguarde enquanto o TubeOrder organiza seus vídeos**, o progresso e a estimativa de tempo restante. Na tela de reprodução, o vídeo permanece visível e o cartão de progresso fica ao lado quando há espaço. Para interromper, clique em **Parar organização** ou pressione **Esc**.
4. Quando terminar, use **Reproduzir tudo** no YouTube. Mantenha a reprodução aleatória desativada para seguir a ordem.

O processo inclui o carregamento das próximas páginas. Não há um teto artificial de vídeos imposto pela extensão. Listas maiores podem levar mais tempo para carregar e salvar; o tempo exibido é uma estimativa, atualizada conforme as respostas do YouTube. Vídeos sem duração identificável ficam no final. Se a lista já estiver em ordem, nenhuma alteração precisa ser enviada.

Na tela de reprodução, a organização automática ocorre uma vez por entrada no contexto do Assistir mais tarde. A passagem para o próximo vídeo da mesma playlist não dispara outra organização. Os botões continuam disponíveis para iniciar uma nova ordenação quando você quiser.

A faixa compacta permanece em uma linha e indica **✓ Vídeos organizados**, em verde, ou **× Vídeos desorganizados**, em vermelho. **Itens carregados em ordem** significa que apenas a parte carregada foi verificada; **Lista vazia** indica que não há vídeos exibidos. A organização automática carrega o restante da playlist antes de confirmar a sequência completa.

## Remover vídeos assistidos

A opção **Remover vídeos assistidos**, no popup da extensão, fica ativada por padrão. Depois de assistir a pelo menos **80% do vídeo**, você pode avançar manualmente ou deixar o YouTube passar para o seguinte. A extensão espera o novo vídeo começar a tocar e mostra um aviso de **6 segundos** antes de remover o anterior do Assistir mais tarde.

Clique em **Não apagar** durante o aviso para manter o vídeo. Isso cancela somente a tentativa atual: se você reassistir ao vídeo e avançar outra vez, ele poderá receber um novo aviso. Se o próximo for pausado, o aviso espera; ao retomar, os seis segundos começam novamente. Sair da playlist ou mudar de vídeo durante a contagem cancela aquela remoção. A confirmação de sucesso só aparece depois da resposta do YouTube e da atualização da fila. Falhas não causam tentativas automáticas em sequência.

O percentual considera os trechos efetivamente reproduzidos, não apenas a posição do cursor. Pular diretamente para perto do fim não conta como 80% assistido. A extensão não guarda um histórico de reprodução: a medição vale para a sessão atual da página. Vídeos ao vivo e estados de mídia cuja identidade ou duração não podem ser confirmadas não são removidos automaticamente.

Os avisos não bloqueiam o vídeo, não alteram sua posição ou velocidade e não recarregam a página. Você pode desligar essa função no popup sem desativar a ordenação.

## Instalação local

### Microsoft Edge

1. Abra `edge://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta extraída do ZIP que contém o `manifest.json`. Se clonou o repositório, selecione a pasta `extension`.
5. Atualize a página do YouTube se ela já estava aberta.
6. No menu **Extensões** do Edge, fixe a TubeOrder na barra de ferramentas para acessar os botões pelo ícone.

### Google Chrome / Chromium

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta extraída do ZIP que contém o `manifest.json`. Se clonou o repositório, selecione a pasta `extension`.
5. Atualize a página do YouTube.
6. No menu **Extensões**, clique no alfinete da TubeOrder para deixar seu ícone visível na barra.

O pacote ZIP deve ser extraído antes de escolher a pasta. Não é preciso compilar nem instalar dependências para usar a extensão.

## Como a ordenação funciona

A TubeOrder usa o próprio cliente do YouTube para salvar as ações de mover vídeos. Na página da playlist, envia lotes de até **50 movimentos por solicitação**. No painel lateral da reprodução, usa o manipulador nativo de arrastar e a fila de gravações do YouTube, que agrupa as alterações pendentes. A mudança fica salva na conta e a reprodução automática segue a fila organizada.

A extensão não lê cookies nem tokens de autenticação; o YouTube usa sua própria sessão para executar os comandos. A ordenação só atua em `youtube.com/playlist?list=WL` e `youtube.com/watch?...&list=WL`, com uma conta conectada. Outras playlists e vídeos abertos sem o contexto do Assistir mais tarde permanecem fora desse fluxo.

Antes de enviar alterações, a extensão verifica os vídeos, seus identificadores na playlist e a sequência planejada. Se o cliente do YouTube não oferecer o mecanismo necessário, ela tenta os menus nativos **Mover para o início** e **Mover para o fim**, quando disponíveis. Essa alternativa só é iniciada antes do envio de qualquer lote. Se ocorrer um erro depois que o envio começou, a extensão informa o problema e não repete a operação por outro caminho.

Durante a operação, a lista e o restante da página ficam bloqueados. Na tela da playlist, o fundo é opaco. Na tela de reprodução, o vídeo permanece visível e seus controles continuam funcionando: pausa, volume, busca e atalhos. O vídeo não precisa ser recarregado: a extensão não manda pausar, mudar seu ponto de reprodução ou alterar a velocidade.

Se cancelar ou sair da página, os movimentos já salvos permanecem; uma solicitação que já foi enviada pode terminar antes da interrupção. Clique novamente no sentido desejado para concluir. Se o YouTube interromper o carregamento ou impedir uma alteração, a extensão mostra o problema.

A extensão preserva trechos já ordenados para reduzir a quantidade de movimentos. Depois que a ordem foi salva, o YouTube cuida da reprodução sem depender da extensão.

Se o YouTube não oferecer os comandos de mover, escolha **Manual** no seletor de ordenação da playlist e tente novamente.

A extensão depende dos componentes da interface do YouTube; mudanças no site podem exigir uma atualização. Ela não baixa vídeos nem faz backups.

## Consumo quando termina

Após concluir ou interromper a organização, a extensão desconecta os observadores da lista e libera os dados temporários da operação. Não mantém intervalos ativos nem verificações periódicas da página. A ordenação volta a trabalhar quando você entra novamente no Assistir mais tarde ou usa um dos seus controles. O popup consulta o estado da tarefa somente enquanto estiver aberto e houver uma organização em andamento.

Com a remoção de assistidos ligada, a extensão acompanha os eventos nativos do vídeo ativo, sem varrer a página. A medição de progresso para ao confirmar 80% assistido; temporizadores ficam restritos à transição, ao aviso de remoção e à confirmação. Desligar a opção remove os ouvintes de acompanhamento e os avisos pendentes.

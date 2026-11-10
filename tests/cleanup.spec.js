const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const extensionPath=path.resolve(__dirname,'../extension');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/cleanup.html'),'utf8');
const trustedTypesFixture=fs.readFileSync(path.join(__dirname,'fixtures/cleanup-trusted-types.html'),'utf8');
let context;
let worker;
let clock;

test.beforeAll(async()=>{
  context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
  [worker]=context.serviceWorkers();
  if(!worker) worker=await context.waitForEvent('serviceworker');
  const clockPage=context.pages()[0]||await context.newPage();
  clock=clockPage.clock;
  await clock.install();
  await context.route('https://www.youtube.com/**',route=>{
    const trusted=new URL(route.request().url()).searchParams.has('trusted');
    return route.fulfill({contentType:'text/html',body:trusted?trustedTypesFixture:fixture,
      ...(trusted?{headers:{'Content-Security-Policy':"require-trusted-types-for 'script'"}}:{})});
  });
});
test.afterAll(async()=>{await context?.close();});
test.afterEach(async()=>{
  for(const page of context?.pages()||[]) if(page.url().startsWith('https://www.youtube.com/')) await page.close();
});
test.beforeEach(async()=>{
  await clock.resume();
  await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.local.set({lastOrder:'asc',removeWatched:true});});
});

async function open(query=''){
  const page=await context.newPage();
  await page.goto(`https://www.youtube.com/watch?v=old00000001&list=WL${query}`);
  await page.bringToFront();
  const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
  await expect.poll(async()=>{
    try{return(await worker.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'TUBEORDER_STATUS'}),tabId)).status.phase;}
    catch{return 'loading';}
  }).toBe('done');
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.evaluate(()=>cleanupFixture.prime());
  return page;
}
async function count(page){return page.evaluate(()=>cleanupFixture.requests.length);}
function notice(page){return page.locator('#tubeorder-cleanup-notice');}
async function shown(page){
  await page.clock.fastForward(350);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page).getByRole('button',{name:'Não apagar',exact:true})).toBeVisible();
}
async function approve(page){
  await page.clock.fastForward(6000);
  await page.clock.fastForward(100);
  await expect.poll(()=>count(page)).toBe(1);
}
async function none(page){
  await page.clock.fastForward(10000);
  expect(await count(page)).toBe(0);
  await expect(notice(page)).toHaveCount(0);
  await page.close();
}

test('80% reais mostram aviso por seis segundos antes de remover',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  expect(await count(page)).toBe(0);
  await page.clock.fastForward(5999);
  expect(await count(page)).toBe(0);
  await page.clock.fastForward(2);
  await page.clock.fastForward(100);
  await expect.poll(()=>count(page)).toBe(1);
  const request=await page.evaluate(()=>cleanupFixture.requests[0]);
  expect(request.videoId).toBe('old00000001');
  expect(request.nextVideoId).toBe('next0000001');
  await expect(page.locator('#tubeorder-cleanup-result')).toContainText('Vídeo assistido removido do Assistir mais tarde.');
  await page.close();
});

test('Próximo manual com 80% assistidos também permite remoção após o aviso',async()=>{
  const page=await open();
  await page.evaluate(()=>cleanupFixture.watch([[0,80]],80));
  await page.getByRole('button',{name:'Próximo manual'}).click({force:true});
  await shown(page);
  await approve(page);
  await page.close();
});

test('a soma de trechos realmente assistidos pode atingir 80% mesmo com uma lacuna',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,40],[60,100]],100);cleanupFixture.navigate();});
  await shown(page);
  await approve(page);
  await page.close();
});

test('79% assistidos não removem mesmo com o cursor quase no fim',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,79]],99.9);cleanupFixture.navigate();});
  await none(page);
});

test('seek para 99% sem assistir 80% não remove',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[99,100]],100);cleanupFixture.navigate();});
  await none(page);
});

test('trechos com lacuna e soma inferior a 80% não removem',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,40],[80,100]],100);cleanupFixture.navigate();});
  await none(page);
});

test('pausar o vídeo anterior sem iniciar outro não remove',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.pause();});
  await none(page);
});

test('navegar sem o próximo começar playing não mostra aviso nem remove',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate({playing:false});});
  await none(page);
});

test('próximo tocando fora do Assistir mais tarde não remove',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate({listId:'LL'});});
  await none(page);
});

test('identidade do player divergente do novo vídeo não remove',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate({dataId:cleanupFixture.OTHER});});
  await none(page);
});

test('Não apagar cancela o aviso e impede novas tentativas daquele candidato',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await notice(page).getByRole('button',{name:'Não apagar',exact:true}).click({force:true});
  await expect(notice(page)).toHaveCount(0);
  await page.evaluate(()=>{cleanupFixture.event('playing');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await none(page);
});

test('avançar novamente antes do prazo cancela a remoção anterior',async()=>{
  const page=await open('&three=1');
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await page.clock.fastForward(3000);
  await page.evaluate(()=>cleanupFixture.navigate({id:cleanupFixture.OTHER}));
  await none(page);
});

test('pausar o próximo interrompe o aviso e retomar reinicia os seis segundos',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await page.clock.fastForward(2000);
  await page.evaluate(()=>cleanupFixture.pause());
  await expect(notice(page)).toHaveCount(0);
  await page.clock.fastForward(10000);
  expect(await count(page)).toBe(0);
  await page.evaluate(()=>{cleanupFixture.state.paused=false;cleanupFixture.event('playing');});
  await shown(page);
  await page.clock.fastForward(5999);
  expect(await count(page)).toBe(0);
  await page.clock.fastForward(2);
  await page.clock.fastForward(100);
  await expect.poll(()=>count(page)).toBe(1);
  await page.close();
});

test('desligar a preferência durante o aviso cancela a remoção',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await worker.evaluate(()=>chrome.storage.local.set({removeWatched:false}));
  await expect(notice(page)).toHaveCount(0);
  await none(page);
});

test('opção inicialmente desligada não mostra aviso nem remove',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({removeWatched:false}));
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await none(page);
});

test('eventos duplicados produzem um aviso e uma única tentativa de remoção',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();cleanupFixture.event('playing');cleanupFixture.event('playing');});
  await shown(page);
  await approve(page);
  await page.evaluate(()=>{cleanupFixture.event('playing');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await page.clock.fastForward(30000);
  expect(await count(page)).toBe(1);
  await page.close();
});

test('falha na remoção não produz uma sequência de novas tentativas',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.bridgeFail();cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await approve(page);
  await page.evaluate(()=>{cleanupFixture.event('playing');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await page.clock.fastForward(30000);
  expect(await count(page)).toBe(1);
  await page.close();
});

test('played do recurso antigo reutilizado não torna o próximo vídeo elegível',async()=>{
  const page=await open('&three=1&sameDuration=1');
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate({reuseMedia:true});});
  await page.clock.fastForward(350);
  await page.evaluate(()=>cleanupFixture.navigate({id:cleanupFixture.OTHER,reuseMedia:true}));
  await none(page);
});

test('mídia de seis segundos com metadados de cem segundos não conta como 100% do vídeo',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,6]],6);cleanupFixture.state.duration=6;cleanupFixture.event('timeupdate');cleanupFixture.navigate();});
  await none(page);
});

test('pipeline nativo aguarda o aviso, remove só o anterior e preserva a reprodução',async()=>{
  const page=await open('&native=1');
  let reloads=0;
  page.on('domcontentloaded',()=>{reloads+=1;});
  await page.evaluate(()=>cleanupFixture.watch([[0,80]],80));
  await page.getByRole('button',{name:'Próximo manual'}).click({force:true});
  await page.evaluate(()=>{cleanupFixture.state.currentTime=8.25;});
  await shown(page);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(0);
  await approve(page);
  await expect.poll(()=>page.evaluate(()=>cleanupFixture.results.some(result=>result.type==='done'))).toBe(true);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests)).toEqual([{
    playlistId:'WL',actions:[{action:'ACTION_REMOVE_VIDEO',setVideoId:'set-old00000001'}],
    clientActions:[{playlistRemoveVideosAction:{setVideoIds:['set-old00000001']}}]
  }]);
  expect(await page.locator('ytd-playlist-panel-video-renderer').evaluateAll(rows=>rows.map(row=>row.data.videoId))).toEqual(['next0000001']);
  expect(await page.evaluate(()=>cleanupFixture.manager.responsePlaylistData.contents.map(item=>item.playlistPanelVideoRenderer.videoId))).toEqual(['next0000001']);
  expect(await page.evaluate(()=>cleanupFixture.playbackManager.getPlaylistData().contents.map(item=>item.playlistPanelVideoRenderer.videoId))).toEqual(['next0000001']);
  expect(await page.locator('video').evaluate(video=>({time:video.currentTime,rate:video.playbackRate,paused:video.paused}))).toEqual({time:8.25,rate:1.25,paused:false});
  expect(page.url()).toBe('https://www.youtube.com/watch?v=next0000001&list=WL');
  expect(reloads).toBe(0);
  await expect(page.locator('#tubeorder-cleanup-result')).toContainText('Vídeo assistido removido do Assistir mais tarde.');
  await page.close();
});

test('pipeline nativo preserva a fila se o servidor recusar e não repete a remoção',async()=>{
  const page=await open('&native=1');
  await page.evaluate(()=>{cleanupFixture.bridgeFail();cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await approve(page);
  await expect.poll(()=>page.evaluate(()=>cleanupFixture.results.some(result=>result.type==='error'))).toBe(true);
  expect(await page.locator('ytd-playlist-panel-video-renderer').evaluateAll(rows=>rows.map(row=>row.data.videoId))).toEqual(['old00000001','next0000001']);
  expect(await page.evaluate(()=>cleanupFixture.results.some(result=>result.type==='done'))).toBe(false);
  await page.evaluate(()=>{cleanupFixture.event('playing');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await page.clock.fastForward(30000);
  expect(await count(page)).toBe(1);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(1);
  expect(await page.locator('video').evaluate(video=>video.paused)).toBe(false);
  await page.close();
});

test('playing antes da URL atualizar aguarda a navegação e preserva o candidato',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate({deferURL:true});});
  await page.clock.fastForward(400);
  await expect(notice(page)).toHaveCount(0);
  expect(await count(page)).toBe(0);
  await page.evaluate(()=>cleanupFixture.finishNavigation());
  await shown(page);
  await approve(page);
  await page.close();
});

test('anúncio transitório durante a navegação preserva o candidato até o conteúdo tocar',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate({ad:true});});
  await page.clock.fastForward(1000);
  await expect(notice(page)).toHaveCount(0);
  expect(await count(page)).toBe(0);
  await page.evaluate(()=>cleanupFixture.finishAd());
  await shown(page);
  await approve(page);
  await page.close();
});

test('desbloqueio da ordenação libera o aviso quando o próximo já está tocando',async()=>{
  const page=await open();
  await page.evaluate(()=>{
    cleanupFixture.watch([[0,80]],80);
    const lock=document.createElement('div');lock.id='tubeorder-lock';lock.hidden=true;document.documentElement.append(lock);
    cleanupFixture.navigate();
  });
  await page.clock.fastForward(400);
  await expect(notice(page)).toHaveCount(0);
  expect(await count(page)).toBe(0);
  await page.evaluate(()=>{document.getElementById('tubeorder-lock').remove();window.dispatchEvent(new CustomEvent('tubeorder:sort-unlocked'));});
  await shown(page);
  await approve(page);
  await page.close();
});

test('cancelar uma tentativa permite novo aviso após reassistir o mesmo vídeo',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.watch([[0,80]],80);cleanupFixture.navigate();});
  await shown(page);
  await notice(page).getByRole('button',{name:'Não apagar',exact:true}).click({force:true});
  await page.clock.fastForward(10000);
  expect(await count(page)).toBe(0);
  await page.evaluate(()=>{
    cleanupFixture.navigate({id:cleanupFixture.OLD});
    cleanupFixture.watch([[0,80]],80);
    cleanupFixture.navigate();
  });
  await shown(page);
  await approve(page);
  expect(await count(page)).toBe(1);
  await page.close();
});

test('preview cancelado por Não apagar mantém o vídeo sem qualquer pedido de remoção',async()=>{
  const page=await open();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tubeorder:cleanup-preview')));
  await shown(page);
  await notice(page).getByRole('button',{name:'Não apagar',exact:true}).click({force:true});
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#tubeorder-cleanup-result')).toContainText('Vídeo mantido no Assistir mais tarde.');
  await page.clock.fastForward(30000);
  expect(await count(page)).toBe(0);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(0);
  await page.close();
});

test('preview expirado com vídeo pausado nunca envia pedido de remoção',async()=>{
  const page=await open();
  await page.evaluate(()=>{cleanupFixture.pause();window.dispatchEvent(new CustomEvent('tubeorder:cleanup-preview'));});
  await shown(page);
  await page.clock.fastForward(6000);
  await page.clock.fastForward(100);
  await expect(page.locator('#tubeorder-cleanup-result')).toContainText('Teste concluído. Nenhum vídeo foi removido.');
  expect(await count(page)).toBe(0);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(0);
  expect(await page.locator('video').evaluate(video=>video.paused)).toBe(true);
  await page.close();
});

test('Trusted Types permite aviso e Não apagar sem ativar a remoção',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({removeWatched:false}));
  const page=await open('&trusted=1');
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  expect(await page.evaluate(()=>{
    try{document.createElement('div').innerHTML='<b>Trusted Types probe</b>';return false;}
    catch(error){return error instanceof TypeError;}
  })).toBe(true);
  expect(await page.evaluate(()=>cleanupFixture.settings)).toBe(false);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tubeorder:cleanup-preview')));
  await shown(page);
  await notice(page).getByRole('button',{name:'Não apagar',exact:true}).click({force:true});
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('#tubeorder-cleanup-result')).toContainText('Vídeo mantido no Assistir mais tarde.');
  await page.clock.fastForward(30000);
  expect(await count(page)).toBe(0);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(0);
  expect(errors).toEqual([]);
  await page.close();
});

test('preview funciona com remoção desligada e continua sem poder apagar',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({removeWatched:false}));
  const page=await open('&native=1');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tubeorder:cleanup-preview')));
  await shown(page);
  await notice(page).getByRole('button',{name:'Não apagar',exact:true}).click({force:true});
  await expect(page.locator('#tubeorder-cleanup-result')).toContainText('Vídeo mantido no Assistir mais tarde.');
  await page.clock.fastForward(30000);
  expect(await count(page)).toBe(0);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(0);
  await page.close();
});

test('ponte nativa também recusa pedidos quando a remoção está desligada',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({removeWatched:false}));
  const page=await open('&native=1');
  await page.evaluate(()=>{
    cleanupFixture.navigate();
    window.dispatchEvent(new CustomEvent('tubeorder:remove-watched-request',{detail:{
      requestId:'disabled-guard-check',videoId:cleanupFixture.OLD,
      setVideoId:`set-${cleanupFixture.OLD}`,nextVideoId:cleanupFixture.NEXT,
    }}));
  });
  await expect.poll(()=>page.evaluate(()=>cleanupFixture.results.some(result=>result.requestId==='disabled-guard-check'&&result.type==='unsupported'))).toBe(true);
  expect(await page.evaluate(()=>cleanupFixture.nativeRequests.length)).toBe(0);
  expect(await page.locator('ytd-playlist-panel-video-renderer').count()).toBe(2);
  await page.close();
});

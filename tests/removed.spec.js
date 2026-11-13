const {test,expect,chromium}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/youtube.html'),'utf8');
const cleanupFixture=fs.readFileSync(path.join(__dirname,'fixtures/cleanup.html'),'utf8');
let context,worker;
const base='https://www.youtube.com/watch?v=short000001&list=WL&watchpanel=1&batch=1';
const notice=page=>page.locator('#tubeorder-notice');
const toggle=page=>notice(page).getByRole('button',{name:'Removidos',exact:true});
const removed=page=>page.locator('#tubeorder-removed-list');
const nativeIds=page=>page.locator('ytd-playlist-panel-video-renderer').evaluateAll(rows=>rows.map(row=>row.dataset.id));
async function done(page){
  await page.bringToFront();
  const id=await worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
  await expect.poll(async()=>{try{return(await worker.evaluate(id=>chrome.tabs.sendMessage(id,{type:'TUBEORDER_STATUS'}),id)).status.phase;}catch{return 'loading';}}).toBe('done');
}
async function accountKey(page){return page.evaluate(async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('tubeorder:fixture-history-account')))].map(b=>b.toString(16).padStart(2,'0')).join(''));}
async function history(page){const key=await accountKey(page);return worker.evaluate(async key=>(await chrome.storage.local.get('removed:'+key))['removed:'+key]||[],key);}
async function open(query=''){const page=await context.newPage();await page.goto(base+query);await done(page);return page;}
async function removeVideo(page,id='long0000001'){
  await page.locator(`[data-id="${id}"]`).getByRole('button',{name:'Remover do Assistir mais tarde',exact:true}).click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo removido');
  await expect.poll(async()=>(await history(page)).some(entry=>entry.videoId===id&&entry.state==='removed')).toBe(true);
}
async function openHistory(page){await toggle(page).click();await expect(removed(page)).toBeVisible();await expect(toggle(page)).toHaveAttribute('aria-pressed','true');}

test.beforeAll(async()=>{
  const extension=path.resolve(__dirname,'../extension');
  context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:new URL(route.request().url()).searchParams.has('historycleanup')?cleanupFixture:fixture}));
  await context.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#555"/></svg>'}));
});
test.afterAll(async()=>{await context?.close();});
test.afterEach(async()=>{for(const page of context.pages())if(page.url().startsWith('https://www.youtube.com/'))await page.close();});
test.beforeEach(async()=>{
  await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.local.set({lastOrder:'asc',removeWatched:false});});
  const clean=await context.newPage();await clean.goto('https://www.youtube.com/playlist?list=LL');await clean.evaluate(()=>localStorage.clear());await clean.close();
});

test('barra mínima tem quatro botões com tooltips, ícones de ordem e status, sem segunda linha',async()=>{
  const page=await open();
  const controls=notice(page).getByRole('button');await expect(controls).toHaveCount(4);
  for(const control of await controls.all())await expect(control).toHaveAttribute('title',/.+/);
  await expect(notice(page).getByRole('button',{name:'Reorganizar',exact:true})).toHaveText('');
  await expect(notice(page).getByRole('button',{name:'Mais curtos primeiro',exact:true})).toHaveText('');
  await expect(notice(page).getByRole('button',{name:'Mais longos primeiro',exact:true})).toHaveText('');
  await expect(notice(page).getByRole('status')).toHaveAttribute('title','Vídeos organizados');
  await expect(notice(page).locator('.status-mark')).toHaveText('✓');
  const bounds=await notice(page).boundingBox();expect(bounds.width).toBeLessThan(240);expect(bounds.height).toBeLessThanOrEqual(34);
  const boxes=await controls.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));expect(Math.max(...boxes)-Math.min(...boxes)).toBeLessThanOrEqual(1);
});

test('Removidos alterna título, conteúdo e cor sem editar a playlist ou comandar o vídeo',async()=>{
  const page=await open();const ids=await nativeIds(page);
  const off=await toggle(page).evaluate(b=>getComputedStyle(b).backgroundColor);
  await openHistory(page);
  await expect(page.locator('#tubeorder-removed-title')).toHaveText('Removidos');
  await expect(removed(page)).toContainText('Nenhum vídeo removido');
  await expect(page.locator('ytd-playlist-panel-renderer > #contents')).toBeHidden();
  expect(await toggle(page).evaluate(b=>getComputedStyle(b).backgroundColor)).not.toBe(off);
  expect(await nativeIds(page)).toEqual(ids);
  await toggle(page).click();await expect(removed(page)).toHaveCount(0);
  await expect(page.locator('ytd-playlist-panel-renderer h3')).toHaveText('Assistir mais tarde');
  await expect(toggle(page)).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>fixtureRemoveCalls.length+fixtureSaveCalls.length)).toBe(0);
  expect(await page.evaluate(()=>fixtureVideoState)).toEqual({pauseCalls:0,playCalls:0});
  expect(await page.locator('video').evaluate(v=>({time:v.currentTime,paused:v.paused,rate:v.playbackRate}))).toEqual({time:42,paused:false,rate:1.25});
});

test('remoção guarda título, canal, thumbnail e duração; restauração real persiste após recarregar',async()=>{
  const page=await open();await removeVideo(page);
  const entry=(await history(page))[0];expect(entry).toMatchObject({videoId:'long0000001',title:'Vídeo long0000001',channel:'Canal de exemplo',duration:'1:02:03',state:'removed'});
  expect(entry.thumbnail).toBe('https://i.ytimg.com/vi/long0000001/hqdefault.jpg');
  await page.reload();await done(page);await openHistory(page);
  await expect(removed(page).getByRole('link',{name:entry.title,exact:true})).toBeVisible();
  await expect(removed(page).locator('img')).toHaveAttribute('src',entry.thumbnail);
  await expect(removed(page).locator('.removed-duration')).toHaveText('1:02:03');
  await removed(page).getByRole('button',{name:`Restaurar ${entry.title}`,exact:true}).click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo restaurado');
  await expect.poll(()=>page.evaluate(()=>fixtureSaveCalls)).toEqual([[{action:'ACTION_ADD_VIDEO',addedVideoId:'long0000001'}]]);
  await expect.poll(()=>nativeIds(page)).toEqual(['short000001','medium00001','tie00000001','long0000001','private0001']);
  await done(page);
  await expect.poll(async()=>(await history(page)).length).toBe(0);
  await expect(toggle(page)).toHaveAttribute('aria-pressed','true');
  await page.reload();await done(page);await expect(page.locator('[data-id="long0000001"]')).toHaveCount(1);
});

test('falha ao remover não cria removido e falha ao restaurar preserva o registro',async()=>{
  const failed=await open('&removalerror=1');
  await failed.locator('[data-id="long0000001"] .tubeorder-remove').click();
  await expect(failed.locator('#tubeorder-action-result')).toContainText('não confirmou a remoção');
  await openHistory(failed);await expect(removed(failed)).toContainText('Nenhum vídeo removido');
  await failed.close();
  const page=await open('&saveerror=1');await removeVideo(page);await openHistory(page);
  const restore=removed(page).getByRole('button',{name:'Restaurar Vídeo long0000001',exact:true});await restore.click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('não confirmou a restauração');
  await expect(restore).toBeEnabled();expect((await history(page)).length).toBe(1);
  await expect(page.locator('[data-id="long0000001"]')).toHaveCount(0);
});

test('restaurar um vídeo já recolocado não duplica a entrada',async()=>{
  const page=await open();await removeVideo(page);
  await page.evaluate(()=>fixtureAddVideo('long0000001','1:02:03'));await done(page);await openHistory(page);
  await removed(page).getByRole('button',{name:'Restaurar Vídeo long0000001',exact:true}).click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('já aparece no Assistir mais tarde');
  expect(await page.evaluate(()=>fixtureSaveCalls)).toEqual([]);await expect(page.locator('[data-id="long0000001"]')).toHaveCount(1);
  await expect.poll(async()=>(await history(page)).length).toBe(1);
});

test('comando nativo confirmado também é registrado sem depender do botão TubeOrder',async()=>{
  const page=await open();
  await page.evaluate(()=>{const row=document.querySelector('[data-id="long0000001"]');const endpoint=row.data.menu.menuRenderer.items[1].menuServiceItemRenderer.serviceEndpoint;row.dispatchEvent(new CustomEvent('yt-action',{bubbles:true,composed:true,detail:{actionName:'yt-service-request',args:[row,endpoint],returnValue:[]}}));});
  await expect.poll(async()=>(await history(page)).some(entry=>entry.videoId==='long0000001'&&entry.state==='removed')).toBe(true);
  await openHistory(page);await expect(removed(page).getByRole('button',{name:'Restaurar Vídeo long0000001',exact:true})).toBeVisible();
});

test('restaura o vídeo removido mesmo quando o player ainda o retém na fila de reprodução',async()=>{
  const page=await open();await removeVideo(page,'short000001');
  await page.evaluate(()=>{document.getElementById('movie_player').getPlaylist=()=>['short000001',...fixtureVideos.map(v=>v.id)];});
  await openHistory(page);
  await removed(page).getByRole('button',{name:'Restaurar Vídeo short000001',exact:true}).click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo restaurado');
  expect(await page.evaluate(()=>fixtureSaveCalls)).toEqual([[{action:'ACTION_ADD_VIDEO',addedVideoId:'short000001'}]]);
  await expect(page.locator('[data-id="short000001"]')).toHaveCount(1);
});

test('uma lista vazia continua permitindo abrir Removidos e devolver um vídeo',async()=>{
  const page=await open();for(const id of await nativeIds(page))await removeVideo(page,id);
  await expect(toggle(page)).toBeEnabled();await openHistory(page);
  await expect(removed(page).getByRole('listitem')).toHaveCount(5);
  await removed(page).getByRole('button',{name:'Restaurar Vídeo short000001',exact:true}).click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo restaurado');
  await expect(page.locator('[data-id="short000001"]')).toHaveCount(1);
});

test('o histórico é separado por conta e a visualização marcada acompanha a navegação WL',async()=>{
  const page=await open();await removeVideo(page);await openHistory(page);
  await page.evaluate(()=>{document.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/watch?v=medium00001&list=WL&watchpanel=1&batch=1');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await expect(toggle(page)).toHaveAttribute('aria-pressed','true');await expect(removed(page)).toContainText('Vídeo long0000001');
  await page.goto(base+'&account=other-account');await done(page);await openHistory(page);await expect(removed(page)).toContainText('Nenhum vídeo removido');
  await page.goto(base);await done(page);await openHistory(page);await expect(removed(page)).toContainText('Vídeo long0000001');
});

test('gravações de abas diferentes não perdem registros e o histórico fica limitado a 500 vídeos',async()=>{
  const a=await open(),b=await open(),key=await accountKey(a);
  await Promise.all([a.evaluate(key=>{for(let batch=0;batch<6;batch++){const entries=Array.from({length:50},(_,i)=>({id:crypto.randomUUID(),videoId:'arc'+String(batch*50+i).padStart(8,'0'),title:'Vídeo removido',removedAt:Date.now()}));window.dispatchEvent(new CustomEvent('tubeorder:removed-record',{detail:{accountKey:key,phase:'done',entries}}));}},key),b.evaluate(key=>{for(let batch=6;batch<12;batch++){const entries=Array.from({length:50},(_,i)=>({id:crypto.randomUUID(),videoId:'arc'+String(batch*50+i).padStart(8,'0'),title:'Vídeo removido',removedAt:Date.now()}));window.dispatchEvent(new CustomEvent('tubeorder:removed-record',{detail:{accountKey:key,phase:'done',entries}}));}},key)]);
  await expect.poll(async()=>(await history(a)).length).toBe(500);
  const entries=await history(a);expect(new Set(entries.map(e=>e.videoId)).size).toBe(500);expect(JSON.stringify(entries).length).toBeLessThan(600000);
  await openHistory(a);await expect(removed(a).getByRole('listitem')).toHaveCount(50);await removed(a).getByRole('button',{name:'Mostrar mais',exact:true}).click();await expect(removed(a).getByRole('listitem')).toHaveCount(100);
});

test('metadados pendentes de uma aba interrompida só viram removidos após conferir a lista inteira',async()=>{
  const page=await open(),key=await accountKey(page);
  await page.evaluate(key=>window.dispatchEvent(new CustomEvent('tubeorder:removed-record',{detail:{accountKey:key,phase:'pending',entries:[{id:crypto.randomUUID(),videoId:'lost0000001',title:'Vídeo preservado antes da exclusão'},{id:crypto.randomUUID(),videoId:'long0000001',title:'Não foi excluído'}]}})),key);
  await expect.poll(async()=>(await history(page)).length).toBe(2);await openHistory(page);
  await expect(removed(page)).toContainText('Vídeo preservado antes da exclusão');await expect(removed(page)).not.toContainText('Não foi excluído');
  await expect.poll(async()=>(await history(page)).length).toBe(1);
});

test('remoção automática confirmada guarda o anterior e Não apagar continua disponível',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({removeWatched:true}));
  const page=await context.newPage();await page.clock.install();await page.goto('https://www.youtube.com/watch?v=old00000001&list=WL&native=1&historycleanup=1');await done(page);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.evaluate(()=>{cleanupFixture.prime();cleanupFixture.watch([[0,90]],90);cleanupFixture.navigate();});
  await page.clock.fastForward(350);await expect(page.getByRole('button',{name:'Não apagar',exact:true})).toBeVisible();
  await page.clock.fastForward(6000);await page.clock.fastForward(100);
  await expect.poll(()=>page.evaluate(()=>cleanupFixture.results.some(r=>r.type==='done'))).toBe(true);
  await expect.poll(async()=>(await history(page)).some(entry=>entry.videoId==='old00000001'&&entry.state==='removed')).toBe(true);
});

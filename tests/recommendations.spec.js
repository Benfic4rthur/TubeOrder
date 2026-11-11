const {test,expect,chromium}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/youtube.html'),'utf8');
let context,worker;
const base='https://www.youtube.com/watch?v=short000001&list=WL&watchpanel=1&batch=1&recommendations=1';

test.beforeAll(async()=>{
  const extension=path.resolve(__dirname,'../extension');
  context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
  await context.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}));
});
test.afterAll(async()=>{await context?.close();});
test.beforeEach(async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({lastOrder:'asc',removeWatched:false}));
  const clean=await context.newPage();await clean.goto('https://www.youtube.com/playlist?list=LL');await clean.evaluate(()=>localStorage.clear());await clean.close();
});
const card=(page,id)=>page.locator(`[data-recommendation="${id}"]`);
const button=(page,id)=>card(page,id).getByRole('button',{name:'Salvar no Assistir mais tarde',exact:true});
async function open(query='') {
  const page=await context.newPage();await page.goto(base+query);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await expect(button(page,'reco0000001')).toBeVisible();
  return page;
}
async function ordered(page,ids) {
  await expect.poll(()=>page.locator('ytd-playlist-panel-video-renderer').evaluateAll(rows=>rows.map(row=>row.dataset.id))).toEqual(ids);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
}

test('salvar recomendado usa ADD nativo, entra na fila ordenada e persiste ao recarregar sem alterar o player',async()=>{
  const page=await open();
  await button(page,'reco0000001').click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo salvo');
  expect(await page.evaluate(()=>fixtureSaveCalls)).toEqual([[{action:'ACTION_ADD_VIDEO',addedVideoId:'reco0000001'}]]);
  await ordered(page,['reco0000001','short000001','medium00001','tie00000001','long0000001','private0001']);
  await expect(button(page,'reco0000001')).toHaveCount(0);
  await expect(page.locator('[data-id="reco0000001"] .tubeorder-remove')).toBeVisible();
  expect(await page.locator('video').evaluate(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused}))).toEqual({time:42,rate:1.25,paused:false});
  expect(await page.evaluate(()=>fixtureVideoState)).toEqual({pauseCalls:0,playCalls:0});
  expect(page.url()).toBe(base);
  await page.reload();
  await ordered(page,['reco0000001','short000001','medium00001','tie00000001','long0000001','private0001']);
  await expect(button(page,'reco0000001')).toHaveCount(0);
  await page.close();
});

test('vídeos já salvos, assistidos, parcialmente assistidos e comandos de outra lista não recebem botão',async()=>{
  const page=await open();
  await expect(page.locator('.tubeorder-save')).toHaveCount(2);
  for(const id of ['short000001','saved000001','saved000002','watched0001','partial0001','watched0002','watched0003','badcmd00001','badcmd00002']) await expect(button(page,id)).toHaveCount(0);
  expect(await page.evaluate(()=>fixtureSaveCalls)).toEqual([]);
  await page.close();
});

test('overlay legado não confunde REMOVE inativo com salvo e grava usando o endpoint ADD',async()=>{
  const page=await open();
  await button(page,'legacy00001').click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo salvo');
  expect(await page.evaluate(()=>fixtureSaveCalls)).toEqual([[{action:'ACTION_ADD_VIDEO',addedVideoId:'legacy00001'}]]);
  await expect(page.locator('[data-id="legacy00001"]')).toHaveCount(1);
  await page.close();
});

test('recusa ou resposta ambígua do servidor não anuncia sucesso nem acrescenta vídeo visualmente',async()=>{
  for(const query of ['&saveerror=1','&saveambiguous=1']) {
    const page=await open(query);
    await button(page,'reco0000001').click();
    await expect(page.locator('#tubeorder-action-result')).toContainText('não confirmou a inclusão');
    await expect(button(page,'reco0000001')).toBeEnabled();
    await expect(page.locator('[data-id="reco0000001"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await page.evaluate(()=>fixtureSaveCalls.length)).toBe(1);
    await page.close();
  }
});

test('clique duplo e cards duplicados geram apenas uma inclusão',async()=>{
  const page=await open('&slowsave=1');
  await page.evaluate(()=>fixtureRecommend('reco0000001'));
  await expect(button(page,'reco0000001')).toHaveCount(2);
  await button(page,'reco0000001').first().click();
  await expect(button(page,'reco0000001').first()).toBeDisabled();
  await expect(button(page,'reco0000001').last()).toBeDisabled();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Vídeo salvo');
  expect(await page.evaluate(()=>fixtureSaveCalls.length)).toBe(1);
  await expect(page.locator('[data-id="reco0000001"]')).toHaveCount(1);
  await page.close();
});

test('preflight recusa um card reciclado ou marcado como assistido antes do clique',async()=>{
  const page=await open();
  await card(page,'reco0000001').evaluate(row=>{row.componentProps.data().contentImage.thumbnailViewModel.overlays=[{thumbnailBottomOverlayViewModel:{progressBar:{thumbnailOverlayProgressBarViewModel:{startPercent:80}}}}];});
  await button(page,'reco0000001').click();
  await expect(page.locator('#tubeorder-action-result')).toContainText('Nenhum pedido de inclusão');
  expect(await page.evaluate(()=>fixtureSaveCalls)).toEqual([]);
  await expect(button(page,'reco0000001')).toHaveCount(0);
  await page.close();
});

test('novos recomendados recebem botão e a fila completa impede duplicar um item não renderizado',async()=>{
  const page=await open();
  await page.evaluate(()=>{fixtureHiddenPlaylistIds=['hidden00001'];fixtureRecommend('hidden00001');fixtureRecommend('newcard0001');});
  await expect(button(page,'newcard0001')).toBeVisible();
  await expect(button(page,'hidden00001')).toHaveCount(0);
  await card(page,'newcard0001').evaluate(row=>{const p=document.createElement('div');p.className='ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment';p.style.width='50%';row.append(p);});
  await expect(button(page,'newcard0001')).toHaveCount(0);
  await page.close();
});

test('fica ociosa e ignora animações de miniaturas e alterações fora dos recomendados',async()=>{
  const page=await open();
  await page.waitForTimeout(1000);
  const count=await page.evaluate(()=>fixtureRecommendationScans);
  await card(page,'reco0000001').evaluate(row=>{const animation=document.createElement('div');row.append(animation);for(let i=0;i<30;i++)animation.style.transform=`translateX(${i}px)`;document.body.append(document.createElement('div'));});
  await page.waitForTimeout(600);
  expect(await page.evaluate(()=>fixtureRecommendationScans)).toBe(count);
  await page.close();
});

test('não atua fora do Assistir mais tarde, sem login e desmonta ao sair por SPA',async()=>{
  for(const url of [base.replace('&list=WL','&list=LL'),base+'&signedout=1']) {
    const page=await context.newPage();await page.goto(url);await page.waitForTimeout(350);
    await expect(page.locator('.tubeorder-save')).toHaveCount(0);
    expect(await page.evaluate(()=>fixtureRecommendationScans)).toBe(0);await page.close();
  }
  const page=await open();
  await page.evaluate(()=>{document.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/watch?v=short000001');document.dispatchEvent(new Event('yt-navigate-finish'));});
  await expect(page.locator('.tubeorder-save')).toHaveCount(0);
  await expect(page.locator('.tubeorder-save-row')).toHaveCount(0);
  const scans=await page.evaluate(()=>fixtureRecommendationScans);
  await page.evaluate(()=>fixtureRecommend('outside0001'));
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>fixtureRecommendationScans)).toBe(scans);
  await page.close();
});

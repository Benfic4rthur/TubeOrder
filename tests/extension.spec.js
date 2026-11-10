const { test, expect, chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const extensionPath = path.resolve(__dirname, '../extension');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/youtube.html'), 'utf8');
let context;
let worker;
const tabIds = new WeakMap();

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  await context.route('https://www.youtube.com/**', route => route.fulfill({contentType:'text/html',body:fixture}));
});

test.afterAll(async () => { await context?.close(); });
test.beforeEach(async () => {
  await context.clearCookies();
  await worker.evaluate(()=>chrome.storage.local.set({lastOrder:'asc'}));
  const page = await context.newPage();
  await page.goto('https://www.youtube.com/playlist?list=WL');
  await page.evaluate(() => localStorage.clear());
  await page.close();
});

async function targetId(page) {
  if (tabIds.has(page)) return tabIds.get(page);
  await page.bringToFront();
  const id = await worker.evaluate(async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id);
  if (!Number.isInteger(id)) throw new Error('A aba de teste não foi encontrada pela extensão.');
  tabIds.set(page,id);
  return id;
}
async function command(page,payload) {
  const tabId=await targetId(page);
  return worker.evaluate(({tabId,payload}) => chrome.tabs.sendMessage(tabId,payload), {tabId,payload});
}
async function readStatus(page) {
  return (await command(page,{type:'TUBEORDER_STATUS'})).status;
}
async function phase(page,expected,timeout=30000) {
  await expect.poll(async () => (await readStatus(page)).phase,{timeout}).toBe(expected);
}
async function open(query='',options={}) {
  const page=await context.newPage();
  await page.goto(`https://www.youtube.com/playlist?list=WL${query}`);
  await expect.poll(async () => (await readStatus(page)).available).toBe(true);
  await expect(page.locator('#tubeorder-toolbar')).toHaveCount(0);
  if(options.waitDone!==false) {
    await phase(page,'done',150000);
    await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  }
  return page;
}
async function ids(page) {
  return page.locator('ytd-playlist-video-renderer,ytd-playlist-panel-video-renderer').evaluateAll(rows => rows.map(row=>row.dataset.id));
}
async function sort(page,order) {
  await command(page,{type:'TUBEORDER_SORT',order});
}

test('salva ordem crescente e decrescente sem painel permanente e libera a página ao concluir', async () => {
  const page=await open();
  expect(await ids(page)).toEqual(['short000001','medium00001','tie00000001','long0000001','private0001']);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await sort(page,'desc');
  await phase(page,'done');
  expect(await ids(page)).toEqual(['long0000001','medium00001','tie00000001','short000001','private0001']);
  await page.reload();
  await phase(page,'done');
  expect(await ids(page)).toEqual(['long0000001','medium00001','tie00000001','short000001','private0001']);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await expect(page.locator('#tubeorder-toolbar')).toHaveCount(0);
  await page.close();
});

test('a entrada automática carrega e organiza mais de uma página de vídeos', async () => {
  test.setTimeout(180000);
  const page=await open('&large=1');
  await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(157,{timeout:30000});
  const expected=await page.evaluate(() => [...window.fixtureVideos].sort((a,b)=> {
    const seconds=s=>s.split(':').reduce((n,v)=>n*60+Number(v),0);
    return seconds(a.duration)-seconds(b.duration);
  }).map(v=>v.id));
  await phase(page,'done',150000);
  expect(await ids(page)).toEqual(expected);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await page.close();
});

test('não permite ordenar em outra playlist nem sem conta logada', async () => {
  for (const url of ['https://www.youtube.com/playlist?list=LL','https://www.youtube.com/playlist?list=WL&signedout=1','https://www.youtube.com/watch?v=short000001&list=LL&watchpanel=1','https://www.youtube.com/watch?v=short000001&list=WL&watchpanel=1&signedout=1']) {
    const page=await context.newPage();
    await page.goto(url);
    const result=await command(page,{type:'TUBEORDER_SORT',order:'asc'});
    expect(result.status.available).toBe(false);
    expect(result.status.busy).toBe(false);
    await expect(page.locator('#tubeorder-toolbar')).toHaveCount(0);
    await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
    expect(await page.evaluate(()=>window.fixtureMoves.length)).toBe(0);
    await page.close();
  }
});

test('aguarda páginas lentas mesmo quando a continuação some temporariamente', async () => {
  const page=await open('&large=1&gap=1');
  await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(157,{timeout:30000});
  await phase(page,'done',10000);
  expect(await page.evaluate(()=>window.fixtureMoves.length)).toBe(0);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await page.close();
});

test('cancelar interrompe novos movimentos e remove o bloqueio da página', async () => {
  const page=await open('&slow=1',{waitDone:false});
  await expect(page.locator('#tubeorder-lock')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.fixtureMoves.length)).toBeGreaterThan(0);
  await page.getByRole('button',{name:/Parar organização|cancelar/i}).click();
  await phase(page,'cancelled');
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  const count=await page.evaluate(()=>window.fixtureMoves.length);
  await page.waitForTimeout(2300);
  expect(await page.evaluate(()=>window.fixtureMoves.length)).toBe(count);
  await page.close();
});

test('uma falha do YouTube libera a página sem anunciar sucesso', async () => {
  const page=await open('&blocked=1',{waitDone:false});
  await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(5);
  const original=await ids(page);
  await phase(page,'error',35000);
  expect(await ids(page)).toEqual(original);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await page.close();
});

test('barra compacta fica em uma linha, organiza pelos dois botões e lembra a escolha', async () => {
  await worker.evaluate(()=>chrome.storage.local.set({lastOrder:'asc'}));
  const page=await open('&sorted=1');
  const notice=page.locator('#tubeorder-notice');
  await expect(notice.getByRole('status')).toHaveText(/Vídeos organizados/);
  expect((await notice.locator('.notice').boundingBox()).height).toBeLessThanOrEqual(34);
  const buttons=notice.getByRole('button');
  await expect(buttons).toHaveCount(2);
  const tops=await buttons.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));
  expect(Math.max(...tops)-Math.min(...tops)).toBeLessThanOrEqual(1);
  await notice.getByRole('button',{name:'Mais longos primeiro',exact:true}).click();
  await phase(page,'done');
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await expect.poll(()=>worker.evaluate(async ()=>(await chrome.storage.local.get('lastOrder')).lastOrder)).toBe('desc');
  await page.reload();
  await phase(page,'done');
  await expect(notice.getByRole('status')).toHaveText(/Vídeos organizados/);
  await expect(notice.getByRole('button',{name:'Mais longos primeiro',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await ids(page)).toEqual(['long0000001','medium00001','tie00000001','short000001','private0001']);
  await notice.getByRole('button',{name:'Mais curtos primeiro',exact:true}).click();
  await phase(page,'done');
  await expect(notice.getByRole('status')).toHaveText(/Vídeos organizados/);
  expect(await ids(page)).toEqual(['short000001','medium00001','tie00000001','long0000001','private0001']);
  await page.close();
});

test('navegação SPA ativa os controles somente ao entrar no Assistir mais tarde', async () => {
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://www.youtube.com/playlist?list=LL');
  await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(5);
  await expect(page.locator('#tubeorder-notice')).toHaveCount(0);
  await page.evaluate(()=>{
    history.pushState({},'', '/playlist?list=WL');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(page.locator('#tubeorder-notice')).toBeVisible();
  await page.evaluate(()=>{
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({},'', '/playlist?list=LL');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect(page.locator('#tubeorder-notice')).toHaveCount(0);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.close();
});

test('salva 157 vídeos em lotes nativos sem abrir menus individuais', async () => {
  const page=await open('&large=1&batch=1');
  await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(157);
  const expected=await page.evaluate(()=>[...window.fixtureVideos].sort((a,b)=>{
    const seconds=s=>s.split(':').reduce((n,v)=>n*60+Number(v),0);
    return seconds(a.duration)-seconds(b.duration);
  }).map(video=>video.id));
  expect(await ids(page)).toEqual(expected);
  const calls=await page.evaluate(()=>window.fixtureBatchCalls.map(actions=>actions.length));
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.length).toBeLessThanOrEqual(4);
  expect(calls.every(length=>length<=50)).toBe(true);
  expect(await page.evaluate(()=>window.fixtureMoves.length)).toBe(0);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await page.reload();
  await phase(page,'done');
  expect(await ids(page)).toEqual(expected);
  expect(await page.evaluate(()=>window.fixtureBatchCalls.length)).toBe(0);
  await page.close();
});

test('erro na gravação em lote não cai para menus nem anuncia sucesso', async () => {
  const page=await open('&batch=1&batcherror=1',{waitDone:false});
  await expect(page.locator('ytd-playlist-video-renderer')).toHaveCount(5);
  const original=await ids(page);
  await phase(page,'error');
  expect(await ids(page)).toEqual(original);
  expect(await page.evaluate(()=>window.fixtureBatchCalls.length)).toBe(1);
  expect(await page.evaluate(()=>window.fixtureMoves.length)).toBe(0);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await page.close();
});

test('a reprodução do Assistir mais tarde organiza o painel e mantém a ordem salva', async () => {
  const page=await context.newPage();
  let loads=0;
  page.on('domcontentloaded',()=>{loads+=1;});
  const url='https://www.youtube.com/watch?v=short000001&list=WL&watchpanel=1&batch=1';
  await page.goto(url);
  await phase(page,'done',8000);
  expect(await page.locator('#publisher-container').evaluate(node=>Number(node.textContent.match(/\/\s*(\d+)/)[1]))).toBe(51);
  expect((await readStatus(page)).total).toBe(5);
  const target=['short000001','medium00001','tie00000001','long0000001','private0001'];
  await expect.poll(()=>ids(page)).toEqual(target);
  expect(loads).toBe(1);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(()=>window.fixtureDropCalls.length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>Number(localStorage.getItem('fixture-watch-save-total')))).toBeGreaterThan(0);
  expect(await page.locator('video').evaluate(video=>({time:video.currentTime,rate:video.playbackRate,paused:video.paused}))).toEqual({time:42,rate:1.25,paused:false});
  expect(await page.evaluate(()=>window.fixtureMoves.length)).toBe(0);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  const saves=await page.evaluate(()=>Number(localStorage.getItem('fixture-watch-save-total')));
  await page.reload();
  await phase(page,'done');
  await expect.poll(()=>ids(page)).toEqual(target);
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  expect(await page.evaluate(()=>window.fixtureDropCalls.length)).toBe(0);
  await page.evaluate(()=>{
    const contents=document.querySelector('ytd-playlist-panel-renderer #contents');
    contents.prepend(contents.querySelector('[data-id="long0000001"]'));
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({},'', '/watch?v=medium00001&list=WL&watchpanel=1&batch=1');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>window.fixtureDropCalls.length)).toBe(0);
  expect(await page.evaluate(()=>Number(localStorage.getItem('fixture-watch-save-total')))).toBe(saves);
  expect((await ids(page))[0]).toBe('long0000001');
  await expect(page.locator('#tubeorder-lock')).toHaveCount(0);
  await page.close();
});

test('a lista lateral mantém o vídeo atual visível sem alterar a reprodução nem a rolagem da página', async () => {
  for (const videoId of ['short000001','tie00000001','private0001']) {
    const page=await context.newPage();
    let loads=0;
    page.on('domcontentloaded',()=>{loads+=1;});
    const url=`https://www.youtube.com/watch?v=${videoId}&list=WL&watchpanel=1&batch=1&nestedscroll=1`;
    await page.goto(url);
    await phase(page,'done');
    const viewport=page.locator('ytd-playlist-panel-renderer #contents');
    await expect.poll(()=>viewport.evaluate((node,id)=>{
      const item=node.querySelector(`[data-id="${id}"]`).getBoundingClientRect();
      const bounds=node.getBoundingClientRect();
      return item.top>=bounds.top+node.clientTop-1 && item.bottom<=bounds.top+node.clientTop+node.clientHeight+1;
    },videoId)).toBe(true);
    if(videoId==='short000001') expect(await viewport.evaluate(node=>node.scrollTop)).toBe(0);
    expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual({x:0,y:180});
    expect(await page.locator('video').evaluate(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused})))
      .toEqual({time:42,rate:1.25,paused:false});
    expect(await page.evaluate(()=>fixtureVideoState)).toEqual({pauseCalls:0,playCalls:0});
    expect(page.url()).toBe(url);
    expect(loads).toBe(1);
    await page.close();
  }
});

test('a rolagem manual permanece livre e a troca de vídeo reposiciona só a lista lateral', async () => {
  const page=await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=short000001&list=WL&watchpanel=1&batch=1&nestedscroll=1');
  await phase(page,'done');
  const viewport=page.locator('ytd-playlist-panel-renderer #contents');
  await expect.poll(()=>viewport.evaluate(node=>node.scrollTop)).toBe(0);
  const saves=await page.evaluate(()=>fixtureDropCalls.length);
  await viewport.evaluate(node=>{
    node.dispatchEvent(new WheelEvent('wheel',{bubbles:true,composed:true,deltaY:240}));
    node.scrollTo({top:240,behavior:'instant'});
    document.dispatchEvent(new Event('yt-page-data-updated'));
  });
  await page.waitForTimeout(650);
  expect(await viewport.evaluate(node=>node.scrollTop)).toBe(240);
  await page.evaluate(()=>{
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({},'', '/watch?v=private0001&list=WL&watchpanel=1&batch=1&nestedscroll=1');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect.poll(()=>viewport.evaluate(node=>node.scrollTop)).toBe(240);
  await page.evaluate(()=>{
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({},'', '/watch?v=short000001&list=WL&watchpanel=1&batch=1&nestedscroll=1');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await expect.poll(()=>viewport.evaluate(node=>node.scrollTop)).toBe(0);
  expect(await page.evaluate(()=>fixtureDropCalls.length)).toBe(saves);
  expect(await page.evaluate(()=>fixtureVideoState)).toEqual({pauseCalls:0,playCalls:0});
  expect(await page.locator('video').evaluate(v=>({time:v.currentTime,rate:v.playbackRate,paused:v.paused})))
    .toEqual({time:42,rate:1.25,paused:false});
  await page.close();
});

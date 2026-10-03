'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4186';
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.png':'image/png', '.m4a':'audio/mp4', '.mp3':'audio/mpeg' };
const ready = { protocol:1, mode:'simulation', canCall:true, supportsIdempotency:true, supportsResultLookup:true };
let browser;
test.before(async () => { browser = await chromium.launch({ headless:true, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] }); });
test.after(async () => { await browser.close(); });

async function setup(options = {}) {
  const context = await browser.newContext({ viewport:options.viewport || {width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block', reducedMotion:options.reducedMotion || 'reduce' });
  const requests = [], errors = [];
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) {
      assert.equal(url.hostname, 'cdn.jsdelivr.net', 'All real device/network access is forbidden in this test');
      return route.fulfill({ contentType:'text/javascript', body:'' });
    }
    if (url.pathname.startsWith('/api/')) {
      assert(url.pathname.startsWith('/api/elevator/'), 'No existing device API may be called');
      const input = req.postDataJSON();
      requests.push({method:req.method(), path:url.pathname, input});
      if (options.api) return options.api(route, url, input);
      if (url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready});
      return route.fulfill({status:202,json:{protocol:1,mode:'simulation',requestId:input?.requestId || url.pathname.split('/').at(-1),status:'accepted',receipt:{id:'SIM-RECEIPT',acceptedAt:new Date().toISOString()}}});
    }
    if (!options.disabled && url.pathname === '/shared/elevator-config-v1.js') return route.fulfill({ contentType:'text/javascript', body:'window.LW5_ELEVATOR_CONFIG = ' + JSON.stringify({apiBase:options.apiBase || '/api/elevator/', mode: options.mode || 'simulation'}) });
    const file = path.join(root, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    assert(file.startsWith(root + path.sep));
    try { return await route.fulfill({contentType:types[path.extname(file)] || 'application/octet-stream',body:await fs.readFile(file)}); }
    catch(error) { if(error.code !== 'ENOENT') throw error; return route.fulfill({status:404,body:''}); }
  });
  if (options.init) await context.addInitScript(options.init);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/?visual-test=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.LW5_ELEVATOR_CONFIG);
  return {context,page,requests,errors};
}
async function open(page) { await page.locator('#elevatorLaunch').click(); }
async function state(page, value) { await page.locator('.elevator-sheet[data-state="' + value + '"]').waitFor(); }
async function finish(s) { assert.deepEqual(s.errors, []); await s.context.close(); }
const posts = s => s.requests.filter(r => r.method === 'POST');
const reply = (status, extra = {}) => async (route, url, input) => {
  if (url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready});
  return route.fulfill({status:extra.http || 200,json:{protocol:1,mode:'simulation',requestId:input?.requestId || url.pathname.split('/').at(-1),status,...extra}});
};

test('default shipping config is unconfigured and makes zero API requests', async () => {
  const s = await setup({disabled:true});
  await open(s.page); await state(s.page, 'not_configured');
  assert.equal(s.requests.length, 0);
  assert.match(await s.page.locator('#elevatorDetail').innerText(), /没有发送/);
  assert(await s.page.locator('#elevatorSimulation').isHidden());
  await s.page.locator('#elevatorClose').click();
  assert.equal(await s.page.evaluate(() => document.activeElement.id), 'elevatorLaunch');
  await finish(s);
});

test('unconfigured capability and unavailable/malformed preflight never POST', async () => {
  for (const data of [{protocol:1,mode:'unconfigured',canCall:false}, {ok:true}, {...ready,supportsIdempotency:false}, {...ready,mode:'real'}]) {
    const s = await setup({api:route => route.fulfill({json:data})});
    await open(s.page); await state(s.page, data.mode === 'unconfigured' ? 'not_configured' : 'unavailable');
    assert.equal(posts(s).length,0); await finish(s);
  }
});

test('known disconnected panel is distinct from an unverified call and never POSTs', async () => {
  const s=await setup({api:route=>route.fulfill({json:{protocol:1,mode:'unconfigured',canCall:false,code:'PANEL_NOT_CONNECTED'}})});
  await open(s.page);await state(s.page,'panel_disconnected');
  assert.match(await s.page.locator('#elevatorTitle').innerText(),/中控暂未连接/);
  await s.page.locator('#elevatorAction').click();
  await s.page.waitForFunction(()=>!document.querySelector('#elevatorAction').disabled);
  assert.equal(posts(s).length,0);await finish(s);
});

test('disabled resident-panel channel reads diagnostics without treating a visible entry as callable', async () => {
  for(const connected of [false,true]){
    const s=await setup({api:(route,url)=>route.fulfill({json:url.pathname.endsWith('/capabilities')?{protocol:1,mode:'unconfigured',canCall:false,candidateChannel:'resident_panel_ui'}:{protocol:1,mode:'unconfigured',canCall:false,code:connected?'PANEL_ENTRY_VISIBLE_UNVERIFIED':'PANEL_NOT_CONNECTED',panel:{connection:connected?'device':'disconnected'}}})});
    await open(s.page);await state(s.page,connected?'panel_unverified':'panel_disconnected');
    assert.equal(posts(s).length,0);assert(s.requests.some(r=>r.path.endsWith('/panel-status')));
    await finish(s);
  }
});

test('one hidden pocket badge tracks the unchanged artwork with a usable touch target', async () => {
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1365,height:900}]){
    const s=await setup({disabled:true,viewport});
    await s.page.locator('#elevatorLaunch').scrollIntoViewIfNeeded();
    const g=await s.page.evaluate(()=>{
      const button=document.querySelector('#elevatorLaunch'),b=button.getBoundingClientRect(),body=document.body.getBoundingClientRect(),card=document.querySelector('main.card').getBoundingClientRect();
      return {count:document.querySelectorAll('#elevatorLaunch').length,x:b.x+scrollX,y:b.y+scrollY,w:b.width,h:b.height,sceneW:body.width,sceneH:body.height,cardBottom:card.bottom+scrollY,badge:getComputedStyle(button).backgroundColor,label:button.getAttribute('aria-label'),background:getComputedStyle(document.body,'::before').backgroundPosition};
    });
    assert.equal(g.count,1);assert(g.w>=48&&g.h>=48);assert.equal(g.badge,'rgba(0, 0, 0, 0)');assert.match(g.label,/口袋.*电梯/);
    assert(g.y>=g.cardBottom,JSON.stringify(g));
    const imageScale=Math.max(g.sceneW/853,g.sceneH/1280)*1.02;
    const expectedX=g.sceneW/2+(366-426.5)*imageScale;
    const expectedY=g.sceneH*1.01-164*imageScale;
    assert(Math.abs(g.x+g.w/2-expectedX)<2&&Math.abs(g.y+g.h/2-expectedY)<2,JSON.stringify(g));
    await open(s.page);await state(s.page,'not_configured');
    await finish(s);
  }
});

test('only matching receipt confirms acceptance; UI labels simulation and does not claim arrival', async () => {
  const s = await setup();
  await open(s.page); await state(s.page,'accepted');
  assert.match(await s.page.locator('#elevatorTitle').innerText(), /模拟.*已受理/);
  assert.match(await s.page.locator('#elevatorSimulation').innerText(), /不会呼叫真实电梯/);
  assert.match(await s.page.locator('#elevatorReceipt').innerText(), /SIM-RECEIPT/);
  assert(await s.page.locator('#elevatorAction').isDisabled());
  await s.page.locator('#elevatorClose').click(); await open(s.page);
  await state(s.page,'accepted'); assert.equal(posts(s).length,1);
  await s.page.reload(); await open(s.page); await state(s.page,'accepted');
  assert.equal(posts(s).length,1); await finish(s);
});

test('animation and repeated taps cannot complete or duplicate an in-flight request', async () => {
  let pending;
  const s = await setup({reducedMotion:'no-preference',api:async(route,url) => {
    if(url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready});
    pending = route;
  }});
  await open(s.page); await state(s.page,'calling');
  await s.page.waitForTimeout(2200);
  assert.equal(await s.page.locator('.elevator-sheet').getAttribute('data-state'),'calling');
  assert.equal(await s.page.locator('[aria-valuenow]').count(),0);
  await s.page.locator('#elevatorClose').click();
  await s.page.locator('#elevatorLaunch').evaluate(button => {button.click();button.click();button.click();});
  assert.equal(posts(s).length,1);
  await pending.fulfill({status:202,json:{protocol:1,mode:'simulation',requestId:posts(s)[0].input.requestId,status:'accepted',receipt:{id:'SIM-ONCE',acceptedAt:new Date().toISOString()}}});
  await state(s.page,'accepted'); await finish(s);
});

test('false success, wrong request, wrong mode, bad JSON and HTTP failures stay unknown', async () => {
  const bad = [{ok:true}, {status:'accepted'}, {status:'accepted',requestId:'different-request-id',receipt:{id:'SIM',acceptedAt:new Date().toISOString()}}, {status:'accepted',mode:'real',receipt:{id:'SIM',acceptedAt:new Date().toISOString()}}, {status:'accepted',http:500,receipt:{id:'SIM',acceptedAt:new Date().toISOString()}}];
  for (const value of bad) {
    const s = await setup({api:reply('unknown',value)});
    await open(s.page); await state(s.page,'unknown');
    assert.equal(posts(s).length,1); await finish(s);
  }
  const s = await setup({api:(route,url) => route.fulfill(url.pathname.endsWith('/capabilities') ? {json:ready} : {status:200,contentType:'text/html',body:'OK'})});
  await open(s.page); await state(s.page,'unknown'); await finish(s);
});

test('explicit rejection is distinct from an unconfirmed network result', async () => {
  const s = await setup({api:reply('rejected',{http:409,code:'RESIDENT_NOT_AUTHORIZED'})});
  await open(s.page); await state(s.page,'rejected');
  assert.match(await s.page.locator('#elevatorTitle').innerText(), /未受理/);
  assert(await s.page.locator('#elevatorAction').isEnabled());
  await finish(s);
});

test('timeout is persisted; reopening and reloading cannot retry; result lookup only GETs', async () => {
  const s = await setup({api:async(route,url,input) => {
    if(url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready});
    if(input) return; // Deliberately leave the command response unresolved.
    return route.fulfill({json:{protocol:1,mode:'simulation',requestId:url.pathname.split('/').at(-1),status:'unknown'}});
  }});
  await s.page.clock.install();
  await open(s.page); await state(s.page,'calling');
  await s.page.clock.fastForward(12500); await state(s.page,'unknown');
  await s.page.locator('#elevatorClose').click(); await open(s.page); await state(s.page,'unknown');
  await s.page.reload(); await open(s.page); await state(s.page,'unknown');
  await s.page.locator('#elevatorAction').click();
  await s.page.waitForFunction(() => document.querySelector('.elevator-sheet').dataset.state === 'unknown' && !document.querySelector('#elevatorAction').disabled);
  assert.equal(posts(s).length,1);
  assert(s.requests.some(r => r.method === 'GET' && /\/calls\//.test(r.path)));
  await finish(s);
});

test('refreshing during dispatch keeps the pending request and does not send a second command', async () => {
  const s = await setup({api:async(route,url) => { if(url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready}); }});
  await open(s.page); await state(s.page,'calling');
  await s.page.reload(); await open(s.page); await state(s.page,'unknown');
  assert.equal(posts(s).length,1); await finish(s);
});

test('a later correlated receipt resolves unknown using only a status read', async () => {
  const s = await setup({api:async(route,url,input) => {
    if(url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready});
    return route.fulfill({json:{protocol:1,mode:'simulation',requestId:input?.requestId || url.pathname.split('/').at(-1),status:input ? 'unknown' : 'accepted',...(!input ? {receipt:{id:'SIM-LATE',acceptedAt:new Date().toISOString()}} : {})}});
  }});
  await open(s.page); await state(s.page,'unknown');
  await s.page.locator('#elevatorAction').click(); await state(s.page,'accepted');
  assert.equal(posts(s).length,1); assert.equal(s.requests.filter(r=>r.method==='GET' && r.path.includes('/calls/')).length,1);
  await finish(s);
});

test('a second tab shares the pending guard; only one tab can dispatch', async () => {
  const s = await setup({api:async(route,url) => { if(url.pathname.endsWith('/capabilities')) return route.fulfill({json:ready}); }});
  await open(s.page); await state(s.page,'calling');
  const second = await s.context.newPage();
  await second.goto(origin + '/?visual-test=1'); await open(second); await state(second,'unknown');
  assert.equal(posts(s).length,1); await finish(s);
});

test('blocked storage prevents dispatch; failed storage after dispatch preserves uncertainty', async () => {
  const s = await setup({init:() => {Storage.prototype.setItem = () => {throw new Error('blocked');};}});
  await open(s.page); await state(s.page,'unsupported'); assert.equal(posts(s).length,0); await finish(s);
  const t = await setup({init:() => {const original = Storage.prototype.setItem;let n=0;Storage.prototype.setItem=function(key,value){if(key.startsWith('lw5-elevator-') && ++n>1)throw new Error('quota');return original.call(this,key,value);};}});
  await open(t.page); await state(t.page,'unknown');
  assert.equal(posts(t).length,1); await t.page.reload(); await open(t.page); await state(t.page,'unknown');
  assert.equal(posts(t).length,1); await finish(t);
});

test('cross-origin endpoint is rejected and simulation response cannot enter real mode', async () => {
  const s = await setup({apiBase:'https://untrusted.example.invalid/api/elevator/'});
  await open(s.page); await state(s.page,'not_configured'); assert.equal(s.requests.length,0); await finish(s);
  const t = await setup({mode:'real'});
  await open(t.page); await state(t.page,'unavailable'); assert.equal(posts(t).length,0); await finish(t);
});

test('dialog fits phone, landscape and desktop, traps focus and respects reduced motion', async () => {
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1365,height:900}]) {
    const s = await setup({disabled:true,viewport});
    await open(s.page); await state(s.page,'not_configured');
    const bounds = await s.page.locator('#elevatorDialog').boundingBox();
    assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=viewport.width+1 && bounds.y+bounds.height<=viewport.height+1);
    const geometry = await s.page.locator('#elevatorDialog').evaluate(d => ({scroll:d.scrollWidth,width:d.clientWidth,animation:getComputedStyle(d).animationName}));
    assert(geometry.scroll<=geometry.width+1); assert.equal(geometry.animation,'none');
    await s.page.keyboard.press('Tab');
    assert(await s.page.evaluate(() => document.querySelector('#elevatorDialog').contains(document.activeElement)));
    if(process.env.SCREENSHOT_DIR){await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await s.page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`elevator-unconfigured-${viewport.width}.png`)});}
    await s.page.keyboard.press('Escape'); assert(await s.page.locator('#elevatorDialog').isHidden());
    await finish(s);
  }
});

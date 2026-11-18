// Fully intercepted browser tests. Never starts the home server or sends device commands.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const knownHosts = ['192.168.1.105','192.168.1.136','5damidemac-mini.local'];
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
let browser;
test.before(async () => { browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}); });
test.after(async () => { await browser?.close(); });

async function setup({https=false,hold=false,winner='192.168.1.136',stay=false,viewport={width:390,height:844}}={}) {
  const base = https ? 'https://app.example.test' : 'http://127.0.0.1:4175';
  const context = await browser.newContext({viewport,hasTouch:true,isMobile:viewport.width<600,serviceWorkers:'block'});
  context.setDefaultTimeout(8000);
  const pending=[],pings=[],navigations=[],forbidden=[],errors=[];
  async function answer(route) {
    const url = new URL(route.request().url());
    if (url.hostname !== winner) return route.abort('failed');
    return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':base},body:JSON.stringify({ok:true,service:'lw5-local-control'})});
  }
  await context.route('**/*', async route => {
    const request=route.request(),url=new URL(request.url());
    if (url.origin !== base) {
      if (knownHosts.includes(url.hostname) && url.pathname==='/api/ping' && request.method()==='GET') {
        pings.push(request.url());
        if (hold) { pending.push(route); return; }
        return answer(route);
      }
      if (knownHosts.includes(url.hostname) && url.pathname==='/lights-on' && request.method()==='GET' && request.isNavigationRequest()) {
        navigations.push(request.url());
        return route.fulfill(stay ? {status:204,body:''} : {contentType:'text/html',body:'<p>MOCK LIGHTS PROGRESS — no device code</p>'});
      }
      if (url.hostname==='cdn.jsdelivr.net') return route.fulfill({contentType:'text/javascript',body:''});
      forbidden.push(request.method()+' '+url.origin+url.pathname); return route.abort();
    }
    if (request.method()!=='GET' || url.pathname.includes('/api/')) {
      forbidden.push(request.method()+' '+url.pathname); return route.abort();
    }
    const file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
    try { return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)}); }
    catch { return route.fulfill({status:404,body:'Missing fixture'}); }
  });
  const page=await context.newPage();
  await page.addInitScript(() => {
    window.__lightsUUIDs=[];
    if (typeof crypto.randomUUID !== 'function') return;
    const make=crypto.randomUUID.bind(crypto);
    crypto.randomUUID=()=>{const id=make();window.__lightsUUIDs.push(id);return id;};
  });
  page.on('pageerror',error=>errors.push(error.message));
  async function release() {
    await Promise.all(pending.splice(0).map(route=>answer(route).catch(()=>{})));
  }
  return {context,page,base,pings,navigations,forbidden,errors,release};
}
async function waitFor(predicate) {
  const start=Date.now();
  while (!predicate()) { if (Date.now()-start>8000) throw Error('Condition timed out'); await new Promise(resolve=>setTimeout(resolve,20)); }
}
function clean(s) { assert.deepEqual(s.forbidden,[]); assert.deepEqual(s.errors,[]); }

test('the home preview opens without device discovery and cancels an outstanding bulb handoff', async () => {
  const s = await setup({hold:true});
  try {
    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.getByRole('link', {name:'开灯动画预览', exact:true}).click();
    await s.page.waitForURL(s.base+'/smart-home/lights-demo.html');
    assert.equal(s.pings.length,0);
    assert.equal(s.navigations.length,0);

    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.locator('#lightsOnLaunch').click();
    await waitFor(()=>s.pings.length===3);
    await s.page.locator('#lightsOnPreview').click();
    await s.page.waitForURL(s.base+'/smart-home/lights-demo.html');
    await s.release();
    assert.equal(s.navigations.length,0);
    clean(s);
  } finally { await s.context.close(); }
});

test('only a real bulb click creates one fresh ID, discovers with GET, then navigates to local progress',async()=>{
  const s=await setup({hold:true});
  try {
    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.reload();
    await s.page.evaluate(()=>document.getElementById('lightsOnLaunch').click());
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),0);
    assert.equal(s.pings.length,0);assert.equal(s.navigations.length,0);
    await s.page.locator('#lightsOnLaunch').click();
    assert.equal(await s.page.locator('#lightsOnTitle').innerText(),'连接中');
    assert(await s.page.locator('#lightsOnDialog').isVisible());
    await waitFor(()=>s.pings.length===3);
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),1);
    await s.release();
    await s.page.waitForURL('http://192.168.1.136:8788/lights-on#start=*');
    const id=new URLSearchParams(new URL(s.page.url()).hash.slice(1)).get('start');
    assert.match(id,/^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert(Math.abs(Date.now()-Number(id.slice(0,13)))<10000);
    assert.equal(s.navigations.length,1);
    assert(s.navigations.every(url=>!url.includes('start=') && !url.includes('#')),'ID stays in URL fragment');
    assert.match(await s.page.locator('body').innerText(),/MOCK LIGHTS PROGRESS/);
    clean(s);
  } finally {await s.context.close();}
});

test('a double click starts only one attempt; closing or Escape cancels late discoveries',async()=>{
  const s=await setup({hold:true});
  try {
    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.locator('#lightsOnLaunch').dblclick({delay:20});
    await waitFor(()=>s.pings.length===3);
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),1);
    await s.page.locator('#lightsOnClose').click();
    await s.release();
    await s.page.waitForTimeout(300);
    assert.equal(s.navigations.length,0);
    assert.equal(await s.page.evaluate(()=>document.activeElement.id),'lightsOnLaunch');
    await s.page.locator('#lightsOnLaunch').click();
    await waitFor(()=>s.pings.length===6);
    await s.page.keyboard.press('Escape');
    await s.release();
    await s.page.waitForTimeout(300);
    assert.equal(s.navigations.length,0);
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),2);
    assert.equal(await s.page.locator('#lightsOnDialog').isVisible(),false);
    clean(s);
  } finally {await s.context.close();}
});

test('offline clicks create no request or ID; a network drop cancels the pending handoff',async()=>{
  const s=await setup({hold:true});
  try {
    await s.page.goto(s.base+'/?visual-test=1');
    await s.context.setOffline(true);
    await s.page.locator('#lightsOnLaunch').click();
    assert.match(await s.page.locator('#lightsOnDetail').innerText(),/尚未发送开灯请求/);
    assert(await s.page.getByRole('link', {name:'动画预览', exact:true}).isVisible());
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),0);
    assert.equal(s.pings.length,0);assert.equal(s.navigations.length,0);
    await s.page.locator('#lightsOnClose').click();
    await s.context.setOffline(false);
    await s.page.locator('#lightsOnLaunch').click();
    await waitFor(()=>s.pings.length===3);
    await s.context.setOffline(true);
    await s.release();
    await s.context.setOffline(false);
    await s.page.waitForTimeout(300);
    assert.equal(s.navigations.length,0);
    assert.match(await s.page.locator('#lightsOnTitle').innerText(),/网络已断开/);
    clean(s);
  } finally {await s.context.close();}
});

test('failed HTTPS discovery still uses same-window known fallback, without claiming lights are on',async()=>{
  const s=await setup({https:true,winner:null});
  try {
    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.locator('#lightsOnLaunch').click();
    await s.page.waitForURL('http://192.168.1.136:8788/lights-on#start=*');
    assert.equal(s.navigations.length,1);
    assert.equal(s.pings.length,3);
    assert.equal(s.context.pages().length,1);
    clean(s);
  } finally {await s.context.close();}
});

test('manual fallback links reuse one ID, expire together, and never auto-run after returning',async()=>{
  const s=await setup({stay:true});
  try {
    await s.page.clock.install();
    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.locator('#lightsOnLaunch').click();
    await waitFor(()=>s.navigations.length===1);
    await s.page.clock.fastForward(6100);
    await s.page.locator('#lightsOnHelp').waitFor({state:'visible'});
    const hrefs=await s.page.locator('#lightsOnLinks a').evaluateAll(all=>all.map(a=>a.href));
    const ids=hrefs.map(href=>new URLSearchParams(new URL(href).hash.slice(1)).get('start'));
    assert.equal(hrefs.length,3);assert(ids.every(id=>id===ids[0]));
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),1);
    await s.page.locator('#lightsOnLinks a').first().click();
    await waitFor(()=>s.navigations.length===2);
    assert.equal(await s.page.evaluate(()=>window.__lightsUUIDs.length),1);
    await s.page.clock.fastForward(61000);
    assert.match(await s.page.locator('#lightsOnTitle').innerText(),/已过期/);
    assert.equal(await s.page.locator('#lightsOnLinks a[href]').count(),0);
    await s.page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    assert.equal(await s.page.locator('#lightsOnDialog').isVisible(),false);
    await s.page.clock.fastForward(10000);
    assert.equal(s.navigations.length,2);
    clean(s);
  } finally {await s.context.close();}
});

test('bulb stays aligned above the pill, avoids other launchers, and modal is usable on small screens',async()=>{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1365,height:900}]) {
    const s=await setup({hold:true,viewport});
    try {
      await s.page.goto(s.base+'/?visual-test=1');
      await s.page.locator('#lightsOnLaunch').scrollIntoViewIfNeeded();
      const boxes=await s.page.evaluate(()=>Object.fromEntries(['lightsOnLaunch','supplementLaunch','islandsOpen','elevatorLaunch'].map(id=>{
        const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}];
      })));
      const b=boxes.lightsOnLaunch,p=boxes.supplementLaunch;
      assert.equal(b.width,p.width);assert.equal(b.height,p.height);
      assert(Math.abs(b.x-p.x)<1);assert(Math.abs(p.y-b.bottom-12)<1);
      for(const other of [p,boxes.islandsOpen,boxes.elevatorLaunch])assert(b.right<=other.x || b.x>=other.right || b.bottom<=other.y || b.y>=other.bottom);
      const geometry=await s.page.evaluate(()=>{
        const scroll=document.documentElement.scrollWidth;
        const added=[document.getElementById('lightsOnLaunch'),document.getElementById('lightsOnDialog')];
        const sheet=document.querySelector('link[href="./shared/lights-on-v1.css?ui=78"]').sheet;
        added.forEach(el=>{el.style.display='none';});sheet.disabled=true;
        const baseline=document.documentElement.scrollWidth;
        sheet.disabled=false;added.forEach(el=>{el.style.removeProperty('display');});
        return {width:innerWidth,scroll,baseline};
      });
      assert.equal(geometry.scroll,geometry.baseline,'The new control must not add horizontal overflow');
      assert(b.x>=0 && b.right<=viewport.width,'Bulb remains inside viewport');
      if(process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
        await s.page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`lights-on-home-${viewport.width}.png`),fullPage:true});
      }
      await s.page.locator('#supplementLaunch').click();
      assert.equal(await s.page.locator('#lightsOnLaunch').isVisible(),false);
      await s.page.locator('#supplementClose').click();
      await s.page.locator('#lightsOnLaunch').click();
      assert.equal(await s.page.evaluate(()=>document.activeElement.id),'lightsOnClose');
      assert.equal(await s.page.evaluate(()=>{document.getElementById('supplementLaunch').focus();return document.activeElement.id;}),'lightsOnClose');
      const modal=await s.page.locator('#lightsOnDialog').boundingBox();
      assert(modal.x>=0 && modal.x+modal.width<=viewport.width, JSON.stringify({modal,viewport}));
      assert.equal(await s.page.locator('#lightsOnDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
      await s.page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await s.page.locator('.lights-on-progress span').evaluate(el=>getComputedStyle(el).animationName),'none');
      if(process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
        await s.page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`lights-on-dialog-${viewport.width}.png`)});
      }
      await s.page.keyboard.press('Escape');
      await s.release();
      clean(s);
    } finally {await s.context.close();}
  }
});

test('a failed optional animation cannot block the existing connection or close action', async () => {
  for (const failCreation of [true, false]) {
    const s = await setup({hold:true});
    try {
      await s.page.addInitScript(failCreation => {
        Object.defineProperty(window, 'LW5LightsUniverse', {
          configurable:true, set() {},
          get() { return { create() {
            if (failCreation) throw new Error('Visuals unavailable');
            return { update() { throw new Error('Visuals unavailable'); }, destroy() { throw new Error('Visuals unavailable'); } };
          } }; },
        });
      }, failCreation);
      await s.page.goto(s.base+'/?visual-test=1');
      await s.page.locator('#lightsOnLaunch').click();
      await waitFor(() => s.pings.length === 3);
      await s.page.locator('#lightsOnClose').click();
      await s.release();
      assert.equal(await s.page.locator('#lightsOnDialog').isVisible(), false);
      assert.equal(s.navigations.length, 0);
      await s.page.locator('#lightsOnLaunch').click();
      await waitFor(() => s.pings.length === 6);
      await s.release();
      await s.page.waitForURL('http://192.168.1.136:8788/lights-on#start=*');
      assert.equal(s.navigations.length, 1);
      clean(s);
    } finally { await s.context.close(); }
  }
});

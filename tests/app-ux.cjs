const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4175';
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.m4a':'audio/mp4','.mp3':'audio/mpeg','.json':'application/json'};
let browser;
test.before(async () => { browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}); });
test.after(async () => { await browser.close(); });

async function setup(options={}) {
  const context = await browser.newContext({viewport:options.viewport||{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:options.reducedMotion||'no-preference'});
  await context.route('**/*',async route => {
    const url=new URL(route.request().url());
    if(options.intercept && await options.intercept(route,url)) return;
    if(url.hostname==='192.168.1.105' && url.pathname.startsWith('/assets/')) return route.fulfill({status:404,body:'Offline test'});
    if(url.origin!==origin){
      assert.equal(url.hostname,'cdn.jsdelivr.net','Unexpected external/device request');
      return route.fulfill({contentType:'text/javascript',body:''});
    }
    assert(!url.pathname.includes('/api/'),'Unexpected device API request');
    const file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
    assert(file.startsWith(root+path.sep));
    try { await route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)}); }
    catch(error){if(error.code!=='ENOENT')throw error;await route.fulfill({status:404,body:'Not found'});}
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  return {context,page,errors};
}

test('all everyday screens fit small phones and desktop without script errors',async()=>{
  const screens=['/','/stock/','/travel/','/conflict/','/smart-home/hyperion.html','/smart-home/aurora.html','/smart-home/chione.html'];
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1365,height:900}]){
    const {context,page,errors}=await setup({viewport});
    for(const url of screens){
      await page.goto(origin+url+'?visual-test=1',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>Boolean(window.LW5UI));
      await page.waitForTimeout(200);
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert(geometry.scroll<=geometry.width+1,`${url} overflow: ${JSON.stringify(geometry)}`);
      if(process.env.SCREENSHOT_DIR){
        await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`ux-${url.replaceAll('/','_')}-${viewport.width}.png`)});
      }
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
});

test('embedded tool opens despite a stalled cloud SDK; back restores home',async()=>{
  let sdkRoute;
  const {context,page}=await setup({intercept:async(route,url)=>{
    if(url.hostname==='cdn.jsdelivr.net'){sdkRoute=route;return true;}return false;
  }});
  await page.goto(origin+'/?visual-test=1',{waitUntil:'domcontentloaded'});
  await page.locator('[data-tool="stock"]').click();
  await page.locator('#toolLoading').waitFor({state:'hidden'});
  assert.equal(await page.locator('#toolPanel').getAttribute('aria-busy'),'false');
  const frame=page.frameLocator('#toolFrame');
  assert(await frame.locator('#inventory-list').isVisible());
  await frame.locator('body').evaluate(()=>scrollTo(0,250));
  await sdkRoute.fulfill({contentType:'text/javascript',body:''});
  await page.waitForFunction(()=>document.querySelector('#toolFrame').contentDocument.readyState==='complete');
  assert.equal(await frame.locator('body').evaluate(()=>scrollY),250,'Late SDK load must not reset user scroll');
  assert.equal(await page.locator('main.card').evaluate(e=>e.inert),true);
  await page.goBack({waitUntil:'domcontentloaded'});
  await page.locator('#toolOverlay').waitFor({state:'hidden'});
  assert.equal(await page.locator('main.card').evaluate(e=>e.inert),false);
  await context.close();
});

test('failed embedded page offers retry without trapping the user',async()=>{
  let fail=true;
  const {context,page}=await setup({intercept:async(route,url)=>{
    if(fail&&url.pathname==='/travel/'){await route.fulfill({status:503,contentType:'text/html',body:'<body>Unavailable</body>'});return true;}return false;
  }});
  await page.goto(origin+'/?visual-test=1');
  await page.locator('[data-tool="travel"]').click();
  await page.locator('#toolRetry').waitFor({state:'visible'});
  assert(await page.locator('#toolClose').isEnabled());
  fail=false;await page.locator('#toolRetry').click();
  await page.locator('#toolLoading').waitFor({state:'hidden'});
  await page.locator('#toolClose').click();
  await page.locator('#toolOverlay').waitFor({state:'hidden'});
  await context.close();
});

test('canceling inventory upload does not leave its button disabled',async()=>{
  const {context,page,errors}=await setup();
  await page.goto(origin+'/stock/');
  const button=page.locator('.btn-cloud-mini').first();
  const before=await button.textContent();
  await button.click();
  assert(await button.isEnabled());assert.equal(await button.textContent(),before);
  assert.deepEqual(errors,[]);await context.close();
});

test('consumption cloud payload uses edited values, not the previous saved values',async()=>{
  const {context,page}=await setup();
  await page.goto(origin+'/stock/');
  await page.evaluate(()=>{
    window.confirm=()=>true;window.alert=()=>{};
    window.supabase={createClient:()=>({from:()=>({upsert:async rows=>{window.uploadedRows=rows;return {error:null};}})})};
    switchTab('settings');
  });
  await page.locator('#days-0').fill('12.5');
  await page.evaluate(()=>uploadSettingsCloud());
  const value=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem('inventory'))[0].daysPerUnit,rows:window.uploadedRows}));
  assert.equal(value.saved,12.5);assert(value.rows,'Missing cloud payload');
  assert(JSON.stringify(value.rows).includes('12.5'));
  await context.close();
});

test('travel transport errors never trigger delete/replace of cloud data',async()=>{
  const {context,page}=await setup();
  await page.goto(origin+'/travel/');
  await page.evaluate(()=>{
    window.deleteCalls=0;window.upsertCalls=0;
    checkSupabaseReachable=async()=>true;
    window.supabase={createClient:()=>({from:()=>({
      upsert:async()=>{window.upsertCalls++;return {error:new Error('Failed to fetch')};},
      delete:()=>{window.deleteCalls++;throw new Error('Must not delete');}
    })})};
  });
  await page.locator('#cloudUploadBtn').click();
  await page.waitForFunction(()=>window.upsertCalls===1);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>window.deleteCalls),0);
  assert(await page.locator('#cloudUploadBtn').isEnabled());
  await context.close();
});

test('shared feedback clears after drag/cancel, respects reduced motion, and bounds fetch waits',async()=>{
  const {context,page}=await setup();
  await page.goto(origin+'/smart-home/hyperion.html');
  const result=await page.evaluate(async()=>{
    const button=document.createElement('button');button.textContent='test';document.body.append(button);
    button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:10,clientY:10}));
    const pressed=button.classList.contains('lw5-pressed');
    button.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:50,clientY:10}));
    const cleared=!button.classList.contains('lw5-pressed');
    window.fetch=(_input,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
    let message='';try{await LW5UI.fetch('/timeout',{timeoutMs:20});}catch(e){message=e.message;}
    return {pressed,cleared,message};
  });
  assert(result.pressed&&result.cleared);assert.match(result.message,/超时/);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>{let n=0;navigator.vibrate=()=>n++;LW5UI.haptic();return n;}),0);
  await context.close();
});

test('wheel loading failure keeps home and retry reachable',async()=>{
  const {context,page}=await setup({intercept:async(route,url)=>{
    if(url.pathname==='/wheel/scene.js'){await route.fulfill({status:503,body:''});return true;}return false;
  }});
  await page.goto(origin+'/wheel/');
  await page.locator('#loadingRetry').waitFor({state:'visible'});
  assert(await page.locator('#loadingMark a').isVisible());
  await page.locator('#loadingMark a').click();
  await page.waitForURL(origin+'/');
  await context.close();
});

async function pixelStats(page,buffer){
  return page.evaluate(async base64=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let bright=0,sum=0;for(let i=0;i<pixels.length;i+=4){const value=Math.max(pixels[i],pixels[i+1],pixels[i+2]);sum+=value;if(value>40)bright++;}
    return {mean:sum/(pixels.length/4),bright:bright/(pixels.length/4)};
  },buffer.toString('base64'));
}

test('nebula and loaded 3D wheel remain nonblank, fitted and interactive on phone/desktop',async()=>{
  for(const viewport of [{width:390,height:844},{width:1365,height:900}]){
    const {context,page,errors}=await setup({viewport});
    await page.goto(origin+'/?visual-test=1');
    await page.locator('#sunPress.nebula-live').waitFor();
    await page.locator('#sunPress').click();
    await page.locator('#nebulaOverlay.control-ready').waitFor();
    const before=await page.locator('#nebulaCanvas').screenshot();
    await page.mouse.move(viewport.width*.15,viewport.height*.48);await page.mouse.down();
    await page.mouse.move(viewport.width*.85,viewport.height*.48,{steps:20});await page.mouse.up();
    await page.waitForTimeout(500);
    assert((await page.evaluate(()=>window.lw5NebulaControl.step))>0);
    const after=await page.locator('#nebulaCanvas').screenshot();
    assert.notDeepEqual(after,before);assert((await pixelStats(page,after)).bright>.015);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`nebula-${viewport.width}.png`)});
    await page.locator('#nebulaBack').click();
    await page.waitForFunction(()=>window.lw5NebulaControl.mode==='mini');
    await page.locator('[data-tool="wheel"]').click();
    await page.locator('#loadingMark').waitFor({state:'hidden',timeout:60000});
    assert.equal(await page.locator('#scene').getAttribute('data-detailed-assets'),'loaded');
    const room=await page.locator('#scene canvas').screenshot();
    const pixels=await pixelStats(page,room);assert(pixels.bright>.25,JSON.stringify(pixels));
    const bounds=await page.locator('#scene canvas').boundingBox();
    assert.equal(bounds.width,viewport.width);assert.equal(bounds.height,viewport.height);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`wheel-${viewport.width}.png`)});
    await page.locator('#enterRoom').click();
    await page.locator('body.table-view').waitFor({timeout:15000});
    const table=await page.locator('#scene canvas').screenshot();assert.notDeepEqual(table,room);
    await page.mouse.move(viewport.width*.3,viewport.height*.5);await page.mouse.down();
    await page.mouse.move(viewport.width*.6,viewport.height*.5,{steps:12});await page.mouse.up();
    await page.waitForTimeout(300);
    assert.notDeepEqual(await page.locator('#scene canvas').screenshot(),table);
    assert.deepEqual(errors,[]);await context.close();
  }
});

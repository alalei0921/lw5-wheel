const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

test('installed PWA opens cached modules offline and preserves local data',async()=>{
  const root=path.resolve(__dirname,'..');
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json'};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const name=url.pathname.replace(/^\/lw5-wheel\//,'');
    const file=path.resolve(root,name.endsWith('/')?name+'index.html':name||'index.html');
    if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    try{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(file));}
    catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/lw5-wheel/`;
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext();
    await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
    const page=await context.newPage();
    await page.goto(base+'?visual-test=1');
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;localStorage.setItem('ux-offline-check','preserved');});
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    const cachesBefore=await page.evaluate(()=>caches.keys());assert(cachesBefore.includes('lw5-home-v50-elevator-ascent'));
    await context.setOffline(true);
    for(const route of ['stock/','travel/','conflict/']){
      await page.goto(base+route,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>Boolean(window.LW5UI));
      assert.equal(await page.evaluate(()=>localStorage.getItem('ux-offline-check')),'preserved');
      assert(await page.locator('h1').first().isVisible());
    }
    await page.goto(base+'?v=123',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Boolean(window.LW5UI));
    assert.match(await page.locator('h1').innerText(),/Lw&5之家/);
    await page.locator('#elevatorLaunch').click();
    await page.locator('.elevator-sheet[data-state="preview"]').waitFor();
    assert.match(await page.locator('#elevatorDetail').innerText(),/不会呼叫/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ux-offline-check')),'preserved');
    await context.close();
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

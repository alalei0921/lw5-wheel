'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),key='lw5.supplements.v1.config',names=['镁片','鱼油','蛋白粉','肌酸'];
const productNames=['DEMO 甘氨酸镁','TEST-B 鱼油（可选）','QA 蛋白粉','EXAMPLE 单方肌酸'];
const date=new Date('2028-02-01T12:00:00Z');
const config=list=>({format:'lw5-supplements',version:1,items:list.map((name,i)=>({name,description:'保留原说明 '+i}))});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webmanifest':'application/manifest+json'};
let browser,server,base,legacy=true;
test.before(async()=>{
 server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');let rel=u.pathname.slice(1)||'index.html';if(rel.endsWith('/'))rel+='index.html';if(legacy&&rel==='sw.js')rel='tests/fixtures/supplements-sw-v60.js';if(legacy&&rel==='shared/supplements-store-v1.js')rel='tests/fixtures/supplements-store-v60.js';const p=path.resolve(root,rel);if(!p.startsWith(root+path.sep)){res.writeHead(404);return res.end();}try{res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port+'/';browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
});
test.after(async()=>{await browser?.close();await new Promise(ok=>server.close(ok));});
for(const variant of [{name:'isolated PWA without browser-imported data',value:null,expected:names},{name:'saved old placeholder list',value:config(['补给一','补给二','补给三','补给四']),expected:names},{name:'complete legacy imported product list',value:config(productNames),expected:names},{name:'custom list',value:config(['我的镁片','周末鱼油','训练后的蛋白粉','肌酸备忘']),expected:['我的镁片','周末鱼油','训练后的蛋白粉','肌酸备忘']}]){
 test('v60 one-click update, cache replacement and offline reopen: '+variant.name,async()=>{
  legacy=true;const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const outside=[];
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==new URL(base).origin||u.pathname.includes('/api/')){outside.push(u.href);return r.abort();}return r.continue();});
  let p=await context.newPage();await p.clock.setFixedTime(date);await p.goto(base+'?visual-test=1');await p.evaluate(async()=>{await navigator.serviceWorker.ready;});await p.waitForFunction(()=>navigator.serviceWorker.controller);
  if(variant.value)await p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:variant.value});
  await p.evaluate(()=>{localStorage.setItem('unrelated-upgrade','preserve');localStorage.setItem('lw5.supplements.v1.check.0','2028-02-01');});
  await p.evaluate(async()=>{await caches.open('unrelated-app-cache');await new Promise((ok,no)=>{const r=indexedDB.open('lw5-island-journal',1);r.onupgradeneeded=()=>r.result.createObjectStore('journal');r.onsuccess=()=>{const db=r.result,tx=db.transaction('journal','readwrite');tx.objectStore('journal').put({revision:17,records:[],synthetic:'preserve'},'state');tx.oncomplete=()=>{db.close();ok()};tx.onerror=()=>no(tx.error)};r.onerror=()=>no(r.error)});});
  const raw=await p.evaluate(k=>localStorage.getItem(k),key);
  await p.locator('#supplementLaunch').click();const before=variant.value?variant.value.items.map(x=>x.name):['补剂 1','补剂 2','补剂 3','补剂 4'];assert.deepEqual(await p.locator('.supplement-name').allTextContents(),before);await p.locator('#supplementClose').click();
  // Separate contexts model an imported browser and a PWA with its own storage.
  const separate=await browser.newContext({serviceWorkers:'block'});const q=await separate.newPage();await q.goto(base+'?visual-test=1');await q.evaluate(k=>localStorage.setItem(k,JSON.stringify({format:'lw5-supplements',version:1,items:Array.from({length:4},(_,i)=>({name:'Other browser '+i,description:'separate'}))})),key);
  legacy=false;
  assert.match(await p.evaluate(async()=>await(await fetch('./shared/supplements-store-v1.js')).text()),/name: '补剂 '/,'legacy worker still serves cached old JS before update');
  await p.locator('#updateBtn').click();await p.waitForURL(/v=/);await p.waitForFunction(()=>window.LW5Supplements);await p.evaluate(async()=>{await navigator.serviceWorker.ready;});await p.waitForFunction(async()=>navigator.serviceWorker.controller&&(await caches.keys()).includes('lw5-home-v61-supplement-labels'));
  await p.locator('#supplementLaunch').click();assert.deepEqual(await p.locator('.supplement-name').allTextContents(),variant.expected);assert.equal(await p.locator('[role=switch]').first().getAttribute('aria-checked'),'true');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);
  assert.equal(await p.evaluate(()=>localStorage.getItem('unrelated-upgrade')),'preserve');const cacheNames=await p.evaluate(()=>caches.keys());assert(cacheNames.includes('unrelated-app-cache'));assert(!cacheNames.includes('lw5-home-v60-supplements'));
  assert.equal(await p.evaluate(async()=>await new Promise(ok=>{const r=indexedDB.open('lw5-island-journal',1);r.onsuccess=()=>{const db=r.result,read=db.transaction('journal').objectStore('journal').get('state');read.onsuccess=()=>{ok(read.result.synthetic);db.close()}}})),'preserve');
  assert.match(await q.evaluate(k=>localStorage.getItem(k),key),/Other browser/);await separate.close();
  if(variant.value)assert.deepEqual(await p.locator('.supplement-description').allTextContents(),variant.value.items.map(x=>x.description));
  await context.setOffline(true);await p.close();p=await context.newPage();await p.clock.setFixedTime(date);await p.goto(base,{waitUntil:'domcontentloaded'});await p.locator('#supplementLaunch').click();assert.deepEqual(await p.locator('.supplement-name').allTextContents(),variant.expected);assert.equal(await p.locator('[role=switch]').first().getAttribute('aria-checked'),'true');
  await p.clock.setFixedTime(new Date('2028-02-01T16:00:00Z'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(await p.locator('[role=switch]').first().getAttribute('aria-checked'),'false');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),raw);
  assert.deepEqual(outside,[]);await context.close();
 });
}

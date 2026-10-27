'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),key='lw5.supplements.v1.config';
const payload={format:'lw5-supplements',version:1,items:Array.from({length:4},(_,i)=>({name:'PRIVATE-QA-ONLY-'+i,description:'合成测试 '+i}))};
const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
let browser,server,base;const received=[];
test.before(async()=>{
 server=http.createServer(async(req,res)=>{received.push({url:req.url,referrer:req.headers.referer||'',method:req.method});const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}try{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
});
test.after(async()=>{await browser?.close();await new Promise(ok=>server.close(ok));});
async function setup(){const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),offsite=[],errors=[];await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.includes('/api/')){offsite.push(u.origin+u.pathname);return r.abort();}return r.continue();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page,offsite,errors};}
async function enter(p,value=encoded){await p.goto(base+'/supplements/setup.html#s='+value);await p.locator('#supplementDialog[open]').waitFor();}
async function close(s){assert.deepEqual(s.offsite,[]);assert.deepEqual(s.errors,[]);await s.context.close();}
test('one-click private link initializes and opens panel; server receives no fragment, content, or referrer leak',async()=>{
 const s=await setup(),p=s.page;await enter(p);assert.equal(new URL(p.url()).hash,'');assert.equal(await p.locator('#supplementName0').textContent(),payload.items[0].name);assert.equal(await p.locator('[role=switch][aria-checked=false]').count(),4);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),JSON.stringify(payload));assert(!received.some(r=>JSON.stringify(r).includes(encoded)||JSON.stringify(r).includes('PRIVATE-QA-ONLY')||r.url.includes('#')));assert(received.every(r=>r.method==='GET'));await close(s);
});
test('reopening an identical link preserves current checks and unrelated storage',async()=>{
 const s=await setup(),p=s.page;await enter(p);await p.locator('[role=switch]').first().click();await p.evaluate(()=>localStorage.setItem('unrelated-qa','keep'));await enter(p);assert.equal(await p.locator('[role=switch]').first().getAttribute('aria-checked'),'true');assert.equal(await p.evaluate(()=>localStorage.getItem('unrelated-qa')),'keep');await close(s);
});
test('different existing settings remain until explicit replacement; checks survive replacement',async()=>{
 const s=await setup(),p=s.page;await enter(p);await p.locator('[role=switch]').first().click();const different={...payload,items:payload.items.map((x,i)=>({...x,name:'NEW-'+i}))};const link=Buffer.from(JSON.stringify(different)).toString('base64url');await p.goto(base+'/supplements/setup.html#s='+link);await p.locator('#save:not([hidden])').waitFor();assert.equal(new URL(p.url()).hash,'');assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),key)).items[0].name,payload.items[0].name);await p.locator('#home').click();await p.locator('#supplementDialog[open]').waitFor();assert.equal(await p.locator('#supplementName0').textContent(),payload.items[0].name);await p.goto(base+'/supplements/setup.html#s='+link);await p.locator('#save').click();await p.locator('#supplementDialog[open]').waitFor();assert.equal(await p.locator('#supplementName0').textContent(),'NEW-0');assert.equal(await p.locator('[role=switch]').first().getAttribute('aria-checked'),'true');await close(s);
});
test('malformed/oversize/missing links are scrubbed and never write config',async()=>{
 const s=await setup(),p=s.page;for(const hash of ['#s=!!!','#s='+Buffer.from('{}').toString('base64url'),'#s='+'a'.repeat(24001),'']){await p.goto(base+'/supplements/setup.html'+hash);await p.waitForFunction(()=>location.hash==='');assert.equal(new URL(p.url()).hash,'');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);assert.equal(await p.locator('#save').isVisible(),false);}await close(s);
});
test('all personal text is rendered literally; bootstrap has no external resources or network-capable scripts',async()=>{
 const s=await setup(),p=s.page;await enter(p);const literal={...payload,items:payload.items.map(x=>({...x,name:'<img src=x onerror=alert(1)>',description:'<script>fetch("https://invalid.test")</script>'}))};await p.goto(base+'/supplements/setup.html#s='+Buffer.from(JSON.stringify(literal)).toString('base64url'));assert.equal(await p.locator('#items img,#items script').count(),0);assert.equal(await p.locator('#items strong').first().textContent(),literal.items[0].name);assert.equal(await p.locator('script[src],link[href],iframe,img').count(),0);assert.match(await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/connect-src 'none'/);await close(s);
});
test('quota failure keeps link data only in memory; retry saves without changing checks',async()=>{
 const s=await setup(),p=s.page;await s.context.addInitScript(()=>{const set=Storage.prototype.setItem;window.__failWrites=true;Storage.prototype.setItem=function(k,v){if(k==='lw5.supplements.v1.config'&&window.__failWrites)throw Error('test quota');return set.call(this,k,v)}});await p.goto(base+'/supplements/setup.html#s='+encoded);assert.equal(new URL(p.url()).hash,'');assert.match(await p.locator('#status').textContent(),/无法保存/);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);await p.evaluate(()=>window.__failWrites=false);await p.locator('#save').click();await p.locator('#supplementDialog[open]').waitFor();assert.equal(await p.locator('[role=switch][aria-checked=false]').count(),4);await close(s);
});
test('if early fragment removal fails, no storage initialization or external load occurs',async()=>{
 const s=await setup(),p=s.page;await s.context.addInitScript(()=>{history.replaceState=()=>{throw Error('test replace denied')}});await p.goto(base+'/supplements/setup.html#s='+encoded);assert.match(await p.locator('#status').textContent(),/无法清除/);assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);await close(s);
});

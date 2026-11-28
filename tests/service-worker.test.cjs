const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const scope='https://example.test/lw5-wheel/';

function setup(){
  const listeners={},stores=new Map(),installed=[];
  let network=async()=>response('new page'),calls=0;
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const store=stores.get(name);
      return {
        match:async key=>store.get(String(key))?.clone(),
        put:async(key,value)=>store.set(String(key),value),
        addAll:async requests=>{installed.push(...requests.map(req=>req.url));}
      };
    },
    keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)
  };
  const context=vm.createContext({
    self:{location:{href:scope+'sw.js'},registration:{scope},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches,URL,Request,Response,AbortController,
    fetch:(...args)=>{calls++;return network(...args);},
    setTimeout:(fn)=>setTimeout(fn,25),clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
  const name=vm.runInContext('CACHE',context);
  async function event(type,request){
    const tasks=[];let result;
    listeners[type]({request,waitUntil:p=>tasks.push(p),respondWith:p=>result=p});
    const value=await result;await Promise.all(tasks);return value;
  }
  function request(url='index.html',overrides={}){
    return {url:new URL(url,scope).href,method:'GET',mode:'navigate',headers:new Headers(),...overrides};
  }
  return {event,request,stores,name,caches,installed,setNetwork:fn=>network=fn,get calls(){return calls;}};
}
function response(body,status=200){const r=new Response(body,{status});Object.defineProperty(r,'type',{value:'basic'});return r;}

test('offline manifest covers every module and shared asset without eager heavy media',async()=>{
  const s=setup();await s.event('install');
  for(const url of s.installed){
    let rel=new URL(url).pathname.replace('/lw5-wheel/','');if(!rel||rel.endsWith('/'))rel+='index.html';
    assert(fs.existsSync(path.join(root,rel)),`Missing offline asset: ${rel}`);
  }
  for(const file of ['shared/supplements-v1.js','shared/supplements-store-v1.js','shared/supplements-v1.css','conflict/index.html','stock/bg.jpg','smart-home/panel-mute.html','shared/app-ui-v1.js','shared/local-control-v1.js','shared/elevator-v1.js','shared/elevator-ascent-v1.js','shared/particle-light-v1.js','shared/scene-depth-v1.js','shared/elevator-v1.css','shared/elevator-config-v1.js'])assert(s.installed.includes(scope+file));
  assert(s.installed.includes(scope+'smart-home/lights-demo.html'));
  const media=s.installed.filter(url=>url.includes('.m4a')||url.includes('.mp4')||url.includes('/lights-film/')||url.includes('room-data'));
  assert.deepEqual(media,[]);
  assert(s.installed.includes(scope+'smart-home/lights-preview.html'));
  for(const file of ['shared/lights-on-v1.js?ui=90','shared/lights-on-v1.css?ui=78','shared/lights-on-universe.js?scene=92','shared/lights-on-universe.css'])assert(s.installed.includes(scope+file));
});

test('activation only removes older LW5 caches, not unrelated apps',async()=>{
  const s=setup();await s.caches.open('other-app');await s.caches.open('lw5-home-v1');await s.caches.open(s.name);
  await s.event('activate');assert.deepEqual([...s.stores.keys()],['other-app',s.name]);
});

test('HTML is network-first, normalized timestamp links share their offline copy',async()=>{
  const s=setup();let r=await s.event('fetch',s.request('stock/?v=123&ts=456'));
  assert.equal(await r.text(),'new page');
  assert(s.stores.get(s.name).has(scope+'stock/'));
  s.setNetwork(async()=>{throw new Error('offline');});
  r=await s.event('fetch',s.request('stock/?v=789'));
  assert.equal(await r.text(),'new page');
});

test('stalled or failed HTML request returns the cached page',async()=>{
  const s=setup();await s.event('fetch',s.request());
  s.setNetwork((_req,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  assert.equal(await (await s.event('fetch',s.request())).text(),'new page');
  s.setNetwork(async()=>response('bad',503));
  assert.equal(await (await s.event('fetch',s.request())).text(),'new page');
});

test('assets are cached; APIs, writes, ranges and other origins never intercepted',async()=>{
  const s=setup();const req=s.request('shared/app-ui-v1.js',{mode:'cors'});
  await s.event('fetch',req);await s.event('fetch',req);assert.equal(s.calls,1);
  for(const req of [s.request('assets/lights-film/demo-v1.mp4'),s.request('assets/lights-film/v1/level-09.mp4'),s.request('api/status'),s.request('x',{method:'POST'}),s.request('x',{headers:new Headers({range:'bytes=0-1'})}),s.request('https://other.test/x'),s.request('../other/index.html')])assert.equal(await s.event('fetch',req),undefined);
  assert.equal(s.calls,1);
});

test('shared calendar routes and callback URLs bypass the offline cache',async()=>{
  const s=setup();
  await s.event('install');
  assert(!s.installed.some(url=>new URL(url).pathname.startsWith(new URL('dog-calendar',scope).pathname)));
  assert(s.installed.some(url=>url.includes('/shared/dog-calendar-core-v3.js')),'only generic shared code is precached');
  const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const tag=home.match(/<a\b[^>]*\bid="dogCalendarLaunch"[^>]*>/)?.[0];
  const homeEntry=tag?.match(/\bhref="([^"]+)"/)?.[1];
  assert.ok(homeEntry,'the home dog needs a real calendar link');
  assert.equal(new URL(homeEntry,scope).pathname,new URL('dog-calendar/',scope).pathname);
  s.setNetwork(async()=>{throw new Error('synthetic offline');});
  for(const url of [homeEntry,'dog-calendar','dog-calendar/','dog-calendar/?code=example',
    'dog-calendar/records','dog-calendar/app.js?v=synthetic-new-release',
    'dog-calendar/period-sharing.js','dog-calendar/assets/good.webp']) {
    assert.equal(await s.event('fetch',s.request(url)),undefined);
  }
  for(const op of ['read','save']) {
    const url='https://cloud.example.test/functions/v1/lw5-dog-calendar/lw5_dog_flow_'+op;
    assert.equal(await s.event('fetch',s.request(url,{method:'POST',mode:'cors'})),undefined);
  }
  assert.deepEqual([...s.stores.get(s.name).keys()],[],'no calendar URL or private response stored');
  assert.equal(s.calls,0);
});

test('an installed home worker loads the new calendar core alongside its cached legacy copy',async()=>{
  const s=setup(), cache=await s.caches.open(s.name);
  const html=fs.readFileSync(path.join(root,'dog-calendar/index.html'),'utf8');
  const tag=html.match(/<script\b[^>]*\bsrc="([^"]*dog-calendar-core[^"]*)"/);
  assert.ok(tag,'calendar must reference its shared state and transport core');
  const url=new URL(tag[1],new URL('dog-calendar/',scope)).href;
  const oldCore=scope+'shared/dog-calendar-core-v3.js';
  // v92 precaches the original query, then strips v/ts on runtime cache reads.
  await cache.put(oldCore+'?v=87',response('legacy core'));
  await cache.put(oldCore,response('legacy core'));
  s.setNetwork(async()=>response('new core'));
  const r=await s.event('fetch',s.request(url,{mode:'cors'}));
  assert.equal(await r.text(),'new core');
  assert.equal(s.calls,1);
  assert.equal(await (await cache.match(oldCore)).text(),'legacy core');
});

test('offline demo navigation reuses the precached page for presentation query parameters',async()=>{
  const s=setup(),cache=await s.caches.open(s.name);
  await cache.put(scope+'smart-home/lights-demo.html',response('offline scene'));
  s.setNetwork(async()=>{throw new Error('offline');});
  const page=await s.event('fetch',s.request('smart-home/lights-demo.html?ui=78'));
  assert.equal(await page.text(),'offline scene');
});

test('uncached offline navigation offers retry and home instead of a blank page',async()=>{
  const s=setup();s.setNetwork(async()=>{throw new Error('offline');});
  const r=await s.event('fetch',s.request('new-page.html'));
  assert.equal(r.status,503);const body=await r.text();assert.match(body,/重试/);assert.match(body,/返回主页/);
});

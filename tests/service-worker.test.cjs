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
  for(const file of ['conflict/index.html','stock/bg.jpg','shared/app-ui-v1.js','shared/elevator-v1.js','shared/elevator-ascent-v1.js','shared/particle-light-v1.js','shared/scene-depth-v1.js','shared/elevator-v1.css','shared/elevator-config-v1.js'])assert(s.installed.includes(scope+file));
  assert(!s.installed.some(url=>url.includes('.m4a')||url.includes('room-data')));
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
  for(const req of [s.request('api/status'),s.request('x',{method:'POST'}),s.request('x',{headers:new Headers({range:'bytes=0-1'})}),s.request('https://other.test/x'),s.request('../other/index.html')])assert.equal(await s.event('fetch',req),undefined);
  assert.equal(s.calls,1);
});

test('uncached offline navigation offers retry and home instead of a blank page',async()=>{
  const s=setup();s.setNetwork(async()=>{throw new Error('offline');});
  const r=await s.event('fetch',s.request('new-page.html'));
  assert.equal(r.status,503);const body=await r.text();assert.match(body,/重试/);assert.match(body,/返回主页/);
});

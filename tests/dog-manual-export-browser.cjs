'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium, webkit, expect} = require('@playwright/test');
const {createFixture, keys} = require('./fixtures/dog-edge-fixture.cjs');

const root = path.resolve(__dirname, '..');
const engine = process.env.LW5_UI_ENGINE === 'webkit' ? webkit : chromium;
const origin = 'http://127.0.0.1:49199';
const entry = '/lw5-wheel/';
const today = '2025-10-19';
const since = '2025-10-16';
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.png':'image/png', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json'
};
let browser;

test.before(async () => {
  const executablePath = process.env.LW5_TEST_BROWSER_EXECUTABLE;
  browser = await engine.launch({headless:true, ...(executablePath ? {executablePath} : {})});
  console.log(engine.name(), browser.version(), 'isolated synthetic records');
});
test.after(async () => { await browser?.close(); });

function legacyState(starts) {
  return {
    version:2, personal:true, configured:true, customSpans:false, spans:[5,7,3,13],
    anchor:starts.at(-1) || '', startSelectionVersion:1,
    starts:['2024-01-01',...starts], // May include undone dates; never export the raw history.
    periodEnds:Object.fromEntries(starts.slice(0,-1).map(s=>[s,s])),
    moods:{'2025-10-18':'good','2025-10-19':'best','2025-10-20':'tired','2024-02-02':'synthetic-invalid-state'},
    notes:{'2025-10-19':'synthetic-opaque'}, unrelated:'synthetic-excluded'
  };
}

async function client(t, state) {
  const fixture = createFixture();
  assert.equal((await fixture.rpc('lw5_dog_save',{p_key:keys[0],p_revision:0,p_state:state})).data.ok,true);
  const context = await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',
    timezoneId:'Asia/Shanghai',serviceWorkers:'block',acceptDownloads:true
  });
  t.after(()=>context.close());
  const tracking={reads:[],denied:[],hold:null,fail:null,requests:[]};
  await context.addInitScript(() => {
    window.syntheticCopies=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{
      if(window.syntheticDenyClipboard) throw new Error('Synthetic clipboard denial');
      window.syntheticCopies.push(value);
    }}});
  });
  // Fulfill every HTTP(S) request locally. Even an unexpected write or action URL
  // cannot leave this test; the route rejects it and the assertion reports its type.
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['http:','https:'].includes(url.protocol))return route.continue();
    tracking.requests.push(req.method()+' '+url.pathname);
    if(url.origin===origin && url.pathname.startsWith(entry) && req.method()==='GET') {
      const name=url.pathname.slice(entry.length)+(url.pathname.endsWith('/')?'index.html':'');
      const file=path.resolve(root,name);
      if(!file.startsWith(root+path.sep))return route.abort();
      try {
        const headers={'Content-Type':mime[path.extname(file)] || 'application/octet-stream'};
        if(url.pathname===entry)headers['Content-Security-Policy']="media-src 'none'";
        return await route.fulfill({status:200,headers,body:await fs.readFile(file)});
      } catch { return route.fulfill({status:404,body:''}); }
    }
    const op=url.pathname.split('/').at(-1);
    if(url.hostname!=='lrtglriomkxjxmxpzivj.supabase.co' || req.method()!=='POST' ||
       !['lw5_dog_read','lw5_dog_flow_read'].includes(op)) {
      tracking.denied.push(req.method()+' '+url.pathname);
      return route.abort();
    }
    const body=req.postDataJSON();
    assert.equal(body.p_key,keys[0]); // All keys in this fixture are invented.
    tracking.reads.push({op,date:body.p_date});
    if(op==='lw5_dog_flow_read' && tracking.hold)await tracking.hold;
    if(op==='lw5_dog_flow_read' && body.p_date===tracking.fail)return route.abort();
    const response=await fixture.rpc(op,body);
    await route.fulfill({status:response.status,json:response.data,headers:{
      'Access-Control-Allow-Origin':origin,'Cache-Control':'no-store'
    }}).catch(()=>{}); // The dialog can abort a pending request on lock/cancel.
  });
  const p=await context.newPage();
  await p.clock.setFixedTime(new Date(today+'T04:00:00Z'));
  await p.goto(origin+entry,{waitUntil:'domcontentloaded'});
  await p.locator('#dogCalendarLaunch').click();
  await expect(p.locator('#calendar-lock')).toBeVisible();
  await expect(p.locator('#share-periods-btn')).toBeHidden();
  await p.locator('#login-key').fill(keys[0]);
  await p.locator('#login-submit').click();
  await expect(p.locator('#calendar-app')).toBeVisible();
  await p.locator('#share-periods-btn').click();
  await expect(p.locator('dialog.period-share')).toBeVisible();
  const local=()=>tracking.reads.filter(r=>r.op==='lw5_dog_flow_read').map(r=>r.date);
  t.after(()=>assert.deepEqual(tracking.denied,[],'unexpected network destination or write'));
  return {p,context,tracking,fixture,local};
}

async function chooseAll(p) {
  await p.locator('#share-manual-mode').click();
  await expect(p.locator('#share-manual-consent')).not.toBeChecked();
  await expect(p.locator('#share-manual-prepare')).toBeDisabled();
}
async function sinceChoice(p) {
  await p.locator('#share-flow-source').selectOption('since');
  await expect(p.locator('#share-flow-since')).toHaveValue('');
  await p.locator('#share-flow-since').fill(since);
  await p.locator('#share-flow-bound-confirm').check();
}
async function prepare(p) {
  await p.locator('#share-manual-consent').check();
  await p.locator('#share-manual-prepare').click();
  await expect(p.locator('#share-manual-output')).toBeVisible();
  return JSON.parse(await p.locator('#share-manual-output').inputValue());
}
async function seed(fixture) {
  assert.equal((await fixture.save(since,0,'light')).data.ok,true);
  assert.equal((await fixture.save('2025-10-17',0,'heavy')).data.ok,true);
  assert.equal((await fixture.save('2025-10-17',1,null)).data.ok,true);
  assert.equal((await fixture.save('2025-10-18',0,'medium')).data.ok,true);
}
const validDays=[
  {date:since,flow:'量少',state:null},
  {date:'2025-10-18',flow:'中等',state:'好'},
  {date:today,flow:null,state:'最好'}
];

test('home → export: legacy 10 episodes, opt-in, all manual fields and network-free copy/download',async t=>{
  const starts=Array.from({length:10},(_,i)=>'2025-'+String(i+1).padStart(2,'0')+'-10');
  const {p,context,tracking,fixture,local}=await client(t,legacyState(starts));
  await seed(fixture);
  const dates=p.locator('dialog.period-share');
  await dates.getByRole('checkbox').check();
  await dates.getByRole('button',{name:'一键导出全部',exact:true}).click();
  const [dateCopy]=await p.evaluate(()=>syntheticCopies);
  assert.equal(dateCopy.split('\n').length-1,10);
  assert.doesNotMatch(dateCopy,/量少|中等|最好|opaque|excluded|2024-01-01/);
  assert.deepEqual(local(),[]);
  await chooseAll(p);
  await sinceChoice(p);
  assert.deepEqual(local(),[]);
  const doc=await prepare(p);
  assert.deepEqual(Object.keys(doc).sort(),['days','periods','version']);
  assert.equal(doc.version,1);
  assert.deepEqual(doc.periods,starts.map((s,i)=>({start:s,end:i===9?null:s})));
  assert.deepEqual(doc.days,validDays);
  assert.deepEqual([...new Set(local())].sort(),[since,'2025-10-17','2025-10-18',today]);
  await context.setOffline(true);
  const requestCount=tracking.requests.length;
  await p.locator('#share-manual-copy').click();
  const copies=await p.evaluate(()=>syntheticCopies);
  assert.deepEqual(JSON.parse(copies.at(-1)),doc);
  const downloading=p.waitForEvent('download');
  await p.locator('#share-manual-save').click();
  const download=await downloading;
  assert.match(download.suggestedFilename(),/\.json$/i);
  assert.deepEqual(JSON.parse(await fs.readFile(await download.path(),'utf8')),doc);
  assert.equal(tracking.requests.length,requestCount,'export payload must stay on device');
  await p.locator('#share-dates-mode').click();
  await expect(dates.getByRole('checkbox')).not.toBeChecked();
  await chooseAll(p);
  await expect(p.locator('#share-manual-output')).toBeHidden();
});

test('a flow before the oldest episode is included; clipboard refusal leaves local selectable JSON',async t=>{
  const {p,fixture,tracking}=await client(t,legacyState(['2025-10-19']));
  await seed(fixture);
  await chooseAll(p);
  await sinceChoice(p);
  const doc=await prepare(p);
  assert.deepEqual(doc.periods,[{start:today,end:null}]);
  assert.deepEqual(doc.days,validDays);
  await p.evaluate(()=>{window.syntheticDenyClipboard=true;});
  const before=tracking.requests.length;
  await p.locator('#share-manual-copy').click();
  await expect(p.locator('#share-manual-output')).toBeFocused();
  await expect(p.locator('#share-manual-status')).toContainText(/长按|手动复制/);
  assert.deepEqual(JSON.parse(await p.locator('#share-manual-output').inputValue()),doc);
  assert.equal(tracking.requests.length,before);
  assert.deepEqual(await p.evaluate(()=>syntheticCopies),[]);
});

test('confirmed empty data has no sampled, default or private values; no network is needed for local output',async t=>{
  const empty=legacyState([]);empty.moods={};
  const {p,local,tracking}=await client(t,empty);
  await chooseAll(p);
  await p.locator('#share-flow-source').selectOption('none');
  assert.deepEqual(local(),[]);
  const doc=await prepare(p);
  assert.deepEqual(doc,{version:1,periods:[],days:[]});
  assert.deepEqual(local(),[]);
  const before=tracking.requests.length;
  await p.locator('#share-manual-copy').click();
  assert.deepEqual(JSON.parse((await p.evaluate(()=>syntheticCopies))[0]),doc);
  assert.equal(tracking.requests.length,before);
});

test('failed flow read blocks partial export; locking removes pending UI and any prepared output',async t=>{
  const {p,tracking,local}=await client(t,legacyState([today]));
  await chooseAll(p);
  await sinceChoice(p);
  await p.locator('#share-manual-consent').check();
  tracking.fail='2025-10-17';
  await p.locator('#share-manual-prepare').click();
  await expect(p.locator('#share-manual-status')).toContainText(/失败|重试|未能|未完成|中断/);
  await expect(p.locator('#share-manual-output')).toBeHidden();
  tracking.fail=null;
  let release;
  tracking.hold=new Promise(resolve=>{release=resolve;});
  try {
    const before=local().length;
    await p.locator('#share-manual-prepare').click();
    await expect.poll(()=>local().length).toBeGreaterThan(before);
    // Simulate the actual calendar's lock action while its modal is awaiting a response.
    await p.locator('#logout-btn').dispatchEvent('click');
    await expect(p.locator('#calendar-lock')).toBeVisible();
    await expect(p.locator('dialog.period-share')).toHaveCount(0);
    const count=local().length;
    release();
    await p.waitForLoadState('networkidle');
    assert.equal(local().length,count);
    assert.deepEqual(await p.evaluate(()=>syntheticCopies),[]);
  } finally {release();}
});

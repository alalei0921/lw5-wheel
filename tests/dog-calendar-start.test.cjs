const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const root=process.env.LW5_TEST_ROOT||path.resolve(__dirname,'..');
const {chromium}=require('playwright');
const RPC='https://lrtglriomkxjxmxpzivj.supabase.co/functions/v1/lw5-dog-calendar/';
const KEY='synthetic-calendar-start-test-only';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){return {version:2,personal:true,configured:true,customSpans:false,anchor:'2026-11-10',starts:['2026-11-01','2026-11-10','2026-11-15','2026-11-10'],spans:[5,7,3,13],moods:{'2026-11-03':'good'},notes:{'2026-11-07':'synthetic memo'},history:[{kind:'synthetic',value:17}]};}
let browser,server,base;
test.before(async()=>{server=http.createServer(async(req,res)=>{let n=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(n.endsWith('/'))n+='index.html';if(n.includes('..')){res.writeHead(404);return res.end()}try{const f=path.join(root,n),data=await fs.readFile(f);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port+'/';browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();await new Promise(ok=>server?.close(ok));});
async function scenario(run,initial=fixture()){
 const cloud={revision:1,state:clone(initial)},writes=[],contexts=[],errors=[];let holdRead=null,held=null;
 async function page(){const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',timezoneId:'Asia/Shanghai'});contexts.push(c);
 await c.route('**/*',async r=>{const req=r.request();if(req.url().startsWith(RPC)){
 const input=req.postDataJSON();assert.equal(input.p_key,KEY);let value;
 if(req.url().endsWith('lw5_dog_save')){writes.push(clone(input));if(input.p_revision!==cloud.revision)value={ok:false,...clone(cloud)};else {cloud.revision++;cloud.state=clone(input.p_state);value={ok:true,...clone(cloud)};}}
 else {value=clone(cloud);if(holdRead){const h=holdRead;holdRead=null;h.started();await h.wait;}}
 return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':new URL(base).origin},body:JSON.stringify(value)});}
 if(!req.url().startsWith(base)||req.method()!=='GET')throw Error('Unexpected network '+req.url());return r.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-11-21T04:00:00Z'));await p.goto(base+'dog-calendar/?v=82');await p.locator('#login-key').fill(KEY);await p.locator('#remember-key').check();await p.locator('#login-submit').click();await p.locator('#calendar-app').waitFor({state:'visible'});return p;}
 function delayRead(){let release,started;const wait=new Promise(r=>release=r),seen=new Promise(r=>started=r);holdRead={wait,started};held=release;return {seen,release};}
 try{await run({page,cloud,writes,delayRead});assert.deepEqual(errors,[]);}finally{held?.();for(const c of contexts)await c.close();}
}
async function marked(p,date){await p.waitForFunction(d=>{const all=[...document.querySelectorAll('.has-period-start')];return d?all.length===1&&all[0].dataset.date===d:all.length===0},date,{timeout:3000});}
async function sync(p){await p.locator('#sync-btn').click();await p.waitForFunction(()=>document.getElementById('sync-label').textContent==='云端已同步');}
async function setDate(p,date,settings=false){await p.locator(settings?'#settings-btn':'#period-history').click();await p.locator('dialog input[name=date]').fill(date);await p.locator('dialog .dg-btn').click();await p.locator('dialog').waitFor({state:'detached'});await marked(p,date);}
async function undo(p){await p.locator('#dog-toast button').click();}
function retained(state,old){assert.deepEqual(state.starts.slice(0,old.starts.length),old.starts);assert.deepEqual(state.moods,old.moods);assert.deepEqual(state.notes,old.notes);assert.deepEqual(state.history,old.history);}

test('legacy duplicate dates select one explicit anchor without writing or deleting history',async()=>scenario(async({page,cloud,writes})=>{const before=clone(cloud);const p=await page();await marked(p,'2026-11-10');assert.deepEqual(cloud,before);assert.equal(writes.length,0);assert.equal(await p.locator('[data-date="2026-11-03"]').getAttribute('data-kind'),'logged');await p.locator('#period-history').click();assert.equal(await p.locator('dialog input[type=date]').count(),1);assert.equal(await p.locator('dialog select').count(),0);}));
test('legacy fallback picks latest valid date; explicit clear never resurrects history',async()=>{for(const [anchor,version,expected] of [['invalid',undefined,'2026-11-15'],['',undefined,'2026-11-15'],['',1,null]]){const f=fixture();f.anchor=anchor;if(version)f.startSelectionVersion=version;f.starts.push('invalid','2026-02-30');await scenario(async({page,writes})=>{await marked(await page(),expected);assert.equal(writes.length,0)},f);}});
test('settings accepts an earlier existing historical date, forecasts from it and preserves unrelated fields',async()=>scenario(async({page,cloud})=>{const old=clone(cloud.state),p=await page();await setDate(p,'2026-11-01',true);assert.equal(cloud.state.anchor,'2026-11-01');retained(cloud.state,old);assert.equal(await p.locator('[data-date="2026-11-21"]').getAttribute('data-tone'),'grumpy');await p.reload();await p.locator('#calendar-app').waitFor({state:'visible'});await marked(p,'2026-11-01');}));
test('date editor, today shortcut, clear and undo always have at most one active date',async()=>scenario(async({page,cloud,writes})=>{const old=clone(cloud.state),p=await page();await setDate(p,'2026-11-05');await undo(p);await marked(p,'2026-11-10');await p.locator('#period-btn').click();await marked(p,'2026-11-21');await undo(p);await marked(p,'2026-11-10');await p.locator('#period-history').click();await p.locator('dialog .dg-minor').click();await p.locator('dialog').waitFor({state:'detached'});await marked(p,null);assert.equal(cloud.state.anchor,'');await undo(p);await marked(p,'2026-11-10');retained(cloud.state,old);await setDate(p,'2026-11-04');await p.locator('#period-history').click();await p.locator('dialog .dg-minor').click();await p.locator('dialog').waitFor({state:'detached'});await p.reload();await p.locator('#calendar-app').waitFor({state:'visible'});await marked(p,null);assert.equal(cloud.state.startSelectionVersion,1);assert(writes.every(w=>typeof w.p_state.anchor==='string'));}));
test('cancel and invalid future date do not save; repeated today is idempotent',async()=>scenario(async({page,writes})=>{const p=await page();await p.locator('#period-history').click();await p.locator('dialog input[name=date]').fill('2026-11-25');await p.locator('dialog .dg-btn').click();assert.equal(writes.length,0);await p.locator('dialog .dg-x').click();await marked(p,'2026-11-10');await p.locator('#period-btn').click();await marked(p,'2026-11-21');await p.locator('#period-btn').click();assert.equal(writes.length,1);}));
test('two clients reject stale writes, sync one date and allow deliberate retry',async()=>scenario(async({page,cloud,writes})=>{const p=await page(),q=await page();await q.locator('#period-history').click();await q.locator('dialog input[name=date]').fill('2026-11-02');await setDate(p,'2026-11-06');await q.locator('dialog .dg-btn').click();await q.waitForFunction(()=>document.querySelector('.dg-error').textContent.includes('另一台设备'));await marked(q,'2026-11-06');assert.equal(cloud.state.anchor,'2026-11-06');await q.locator('dialog .dg-x').click();await setDate(q,'2026-11-02');await sync(p);await marked(p,'2026-11-02');assert.equal(writes.length,3);}));
test('outdated dialog and undo cannot overwrite a newer synced selection',async()=>scenario(async({page,cloud,writes})=>{const p=await page(),q=await page();await p.locator('#settings-btn').click();await setDate(q,'2026-11-04');await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await marked(p,'2026-11-04');const n=writes.length;await p.locator('dialog .dg-btn').click();assert.equal(writes.length,n);await p.locator('dialog .dg-x').click();await setDate(p,'2026-11-05');cloud.revision++;cloud.state.anchor='2026-11-08';cloud.state.starts.push('2026-11-08');await undo(p);await marked(p,'2026-11-08');assert.equal(cloud.state.anchor,'2026-11-08');}));
test('late read and old-client multi-date save cannot reintroduce two visible starts',async()=>scenario(async({page,cloud,delayRead})=>{const p=await page();const old=delayRead();await p.locator('#sync-btn').click();await old.seen;await setDate(p,'2026-11-02');old.release();await p.waitForTimeout(40);await marked(p,'2026-11-02');cloud.revision++;cloud.state={...fixture(),anchor:'2026-11-15'};delete cloud.state.startSelectionVersion;await sync(p);await marked(p,'2026-11-15');await setDate(p,'2026-11-01');assert.equal(cloud.state.anchor,'2026-11-01');assert.deepEqual(cloud.state.starts,fixture().starts);}));

test('first-time settings creates only one current date',async()=>scenario(async({page,cloud})=>{const p=await page();await p.locator('dialog input[name=date]').fill('2026-11-09');await p.locator('dialog .dg-btn').click();await p.locator('dialog').waitFor({state:'detached'});await marked(p,'2026-11-09');assert.equal(cloud.state.anchor,'2026-11-09');assert.deepEqual(cloud.state.starts,['2026-11-09']);await p.locator('#period-btn').click();await marked(p,'2026-11-21');await undo(p);await marked(p,'2026-11-09');},null));

async function setEnd(p, date) {
  await p.locator('#period-end-btn').click();
  await p.locator('dialog input[name=end]').fill(date);
  await p.locator('dialog .dg-btn').click();
  await p.locator('dialog').waitFor({state:'detached'});
  await p.locator('[data-date="'+date+'"].has-period-end').waitFor();
}

test('last bleeding day can be backfilled, corrected, synced and kept after moving the active start',async()=>scenario(async({page,cloud,writes})=>{
  const old=clone(cloud.state), p=await page(), q=await page();
  await p.locator('#period-end-btn').click();
  for (const impossible of ['2026-11-09','2026-11-22']) {
    await p.locator('dialog input[name=end]').fill(impossible);
    await p.locator('dialog .dg-btn').click();
    assert.equal(writes.length,0);
  }
  await p.locator('dialog .dg-x').click();
  await setEnd(p,'2026-11-14');
  assert.match(await p.locator('#selected-status').innerText(),/经期结束日/);
  assert(!/预计/.test(await p.locator('#selected-status').innerText()));
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-10':'2026-11-14'});
  assert.deepEqual(cloud.state.spans,old.spans);
  await sync(q);
  await q.locator('[data-date="2026-11-14"].has-period-end').waitFor();
  await setEnd(p,'2026-11-15');
  assert.equal(await p.locator('[data-date="2026-11-14"].has-period-end').count(),0);
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-10':'2026-11-15'});
  await p.locator('#period-btn').click();
  await marked(p,'2026-11-21');
  await setEnd(p,'2026-11-21');
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-10':'2026-11-15','2026-11-21':'2026-11-21'});
  retained(cloud.state,old);
  await p.reload();
  await p.locator('#calendar-app').waitFor({state:'visible'});
  await p.locator('#period-records-btn').click();
  assert.match(await p.locator('dialog').innerText(),/2026-11-10 至 2026-11-15（6 天）/);
  await p.locator('dialog [data-period-start="2026-11-10"]').click();
  await p.locator('dialog .dg-minor').click();
  await p.locator('dialog').waitFor({state:'detached'});
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-21':'2026-11-21'});
  await p.locator('#logout-btn').click();
  assert.equal(await p.locator('#period-actions').isVisible(),false);
  assert.equal(await p.locator('.has-period-end').count(),0);
}));

test('an already saved end is compatible with legacy data and stale writes cannot overwrite the newer date',async()=>scenario(async({page,cloud,writes})=>{
  const p=await page(),q=await page();
  await q.locator('#period-end-btn').click();
  await q.locator('dialog input[name=end]').fill('2026-11-13');
  await setEnd(p,'2026-11-14');
  await q.locator('dialog .dg-btn').click();
  await q.waitForFunction(()=>document.querySelector('.dg-error')?.textContent.includes('另一台设备'));
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-10':'2026-11-14'});
  await q.locator('dialog .dg-x').click();
  await setEnd(q,'2026-11-15');
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-10':'2026-11-15'});
  assert.equal(writes.length,3);
}));

test('history ignores legacy corrections and missing-cycle gaps and only applies after deliberate settings save',async()=>{
  const f=fixture();
  f.customSpans=true; f.spans=[5,10,3,10];
  f.periodEnds={
    '2026-06-10':'2026-06-13','2026-08-10':'2026-08-13',
    '2026-09-10':'2026-09-13','2026-10-10':'2026-10-13','2026-11-10':'2026-11-13',
    '2026-11-25':'2026-11-27','2026-10-30':'invalid'
  };
  await scenario(async({page,cloud,writes})=>{
    const p=await page();
    await p.locator('#settings-btn').click();
    assert.match(await p.locator('dialog').innerText(),/周期间隔约 31 天，出血约 4 天/);
    assert.equal(await p.locator('dialog input[name=length]').inputValue(),'28');
    await p.locator('dialog .dg-history-apply').click();
    assert.equal(await p.locator('dialog input[name=length]').inputValue(),'31');
    assert.equal(await p.locator('dialog input[name=bleed]').inputValue(),'4');
    assert.equal(writes.length,0);
    await p.locator('dialog .dg-x').click();
    await p.locator('#settings-btn').click();
    assert.equal(await p.locator('dialog input[name=length]').inputValue(),'28');
    await p.locator('dialog .dg-history-apply').click();
    await p.locator('dialog .dg-btn').click();
    await p.locator('dialog').waitFor({state:'detached'});
    assert.equal(cloud.state.spans.reduce((a,b)=>a+b,0),31);
    assert.equal(cloud.state.spans[0],4);
    assert.equal(cloud.state.customSpans,false);
    assert.deepEqual(cloud.state.periodEnds,f.periodEnds);
  },f);
  delete f.periodEnds['2026-08-10'];
  await scenario(async({page})=>{
    const p=await page();await p.locator('#settings-btn').click();
    assert.equal(await p.locator('dialog .dg-history-apply').count(),0);
  },f);
});

test('actual end adjusts this cycle automatic colors without changing manual or future defaults',async()=>{
  for(const custom of [false,true]) {
    const f=fixture(); f.anchor='2026-11-20'; f.customSpans=custom;
    await scenario(async({page,cloud})=>{
      const p=await page();
      assert.equal(await p.locator('[data-date="2026-11-22"]').getAttribute('data-tone'),'tired');
      await setEnd(p,'2026-11-21');
      assert.equal(await p.locator('[data-date="2026-11-22"]').getAttribute('data-tone'),custom?'tired':'good');
      assert.deepEqual(cloud.state.spans,f.spans);
      await p.locator('#next-month').click();
      assert.equal(await p.locator('[data-date="2026-12-18"]').getAttribute('data-tone'),'tired');
    },f);
  }
});

test('episodes keep an unfinished prior start when the next starts; late end and corrections remain with the same stable ID',async()=>scenario(async({page,cloud,writes})=>{
  const p=await page(), oracle=()=>cloud.state.periodEpisodes;
  await p.locator('#period-btn').click();await marked(p,'2026-11-21');
  assert.deepEqual(oracle().map(r=>[r.start,r.end]),[['2026-11-10',null],['2026-11-21',null]]);
  const ids=oracle().map(r=>r.id);
  await p.locator('#period-records-btn').click();
  assert.equal(await p.locator('dialog li').count(),2);
  await p.locator('[data-period-start="2026-11-10"]').click();
  await p.locator('input[name=end]').fill('2026-11-21');await p.locator('dialog .dg-btn').click();
  assert.equal(writes.length,1);
  await p.locator('input[name=end]').fill('2026-11-14');await p.locator('dialog .dg-btn').click();
  await p.locator('dialog').waitFor({state:'detached'});
  await p.locator('#period-records-btn').click();await p.locator('[data-correct-start="2026-11-10"]').click();
  await p.locator('input[name=date]').fill('2026-11-15');await p.locator('dialog .dg-btn').click();
  assert.equal(writes.length,2);assert.match(await p.locator('.dg-error').innerText(),/结束日/);
  await p.locator('input[name=date]').fill('2026-11-09');await p.locator('dialog .dg-btn').click();
  await p.locator('dialog').waitFor({state:'detached'});
  assert.deepEqual(cloud.state.periodEnds,{'2026-11-09':'2026-11-14'});
  assert.deepEqual(oracle(),[{id:ids[0],start:'2026-11-09',end:'2026-11-14'},{id:ids[1],start:'2026-11-21',end:null}]);
  assert.equal(cloud.state.anchor,'2026-11-21');await p.reload();await marked(p,'2026-11-21');
  await p.locator('#period-records-btn').click();await p.locator('.dg-add-period').click();
  await p.locator('input[name=date]').fill('2026-11-09');await p.locator('dialog .dg-btn').click();
  assert.equal(writes.length,3);assert.match(await p.locator('.dg-error').innerText(),/记录过/);
  await p.locator('input[name=date]').fill('2026-10-12');await p.locator('dialog .dg-btn').click();
  await p.locator('dialog').waitFor({state:'detached'});
  assert.equal(oracle().find(r=>r.start==='2026-10-12').end,null);
  assert.equal(cloud.state.anchor,'2026-11-21');await sync(p);await p.locator('#today-btn').click();await marked(p,'2026-11-21');
}));
test('actual unlocked export shows only paired or explicitly pending dates; private preview closes on lock, with no save',async()=>{
  const f=fixture();f.periodEnds={'2026-10-11':'2026-10-15'};
  await scenario(async({page,writes})=>{
    const p=await page();await p.locator('#share-periods-btn').click();
    const preview=p.locator('.period-share textarea');
    const text=await preview.inputValue();
    assert.equal(await preview.getAttribute('readonly'),'');
    assert.match(text,/开始：2026-10-11｜结束：2026-10-15/);
    assert.match(text,/开始：2026-11-10｜结束：未记录/);
    assert.doesNotMatch(text,/2026-11-15|2026-11-01|synthetic|口令/);
    await p.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'lw5.calendar.private-access.v1',newValue:null})));
    await p.locator('#calendar-lock').waitFor({state:'visible'});
    assert.equal(await p.locator('.period-share').count(),0);
    assert.equal(await p.locator('#share-periods-btn').isVisible(),false);assert.equal(writes.length,0);
  },f);
});
test('ambiguous legacy fallback marker is not an episode; no history invented on export or unrelated sync',async()=>{
  const f=fixture();delete f.anchor;
  await scenario(async({page,writes})=>{
    const p=await page();await marked(p,'2026-11-15');await p.locator('#share-periods-btn').click();
    assert.equal(await p.locator('.period-share textarea').inputValue(),'');
    await p.locator('.period-share .dg-x').click();await sync(p);
    assert.equal(writes.length,0);
  },f);
});

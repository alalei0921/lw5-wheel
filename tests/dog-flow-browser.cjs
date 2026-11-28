'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit, expect } = require('@playwright/test');
const { createFixture, keys } = require('./fixtures/dog-edge-fixture.cjs');

const root = path.resolve(__dirname, '..');
const engine = process.env.LW5_UI_ENGINE === 'webkit' ? webkit : chromium;
const capture = process.env.LW5_FLOW_CAPTURE;
const entry = '/lw5-wheel/';
const publicApi = 'https://lrtglriomkxjxmxpzivj.supabase.co/functions/v1/lw5-dog-calendar/';
const day = '2025-09-19', prior = '2025-09-18', future = '2025-09-20';
const fixtureState = {
  version: 2, personal: true, configured: true, customSpans: false, anchor: '2025-09-16',
  startSelectionVersion: 1, starts: ['2025-09-16'], spans: [5,7,3,13],
  periodEnds: {'2025-08-17':'2025-08-21'},
  periodEpisodes: [{id:'fixture-Aug',start:'2025-08-17',end:'2025-08-21'}, {id:'fixture-Sep',start:'2025-09-16',end:null}],
  moods: {[day]:'best',[prior]:'good'}
};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
let server, browser, base;
test.before(async () => {
  server = http.createServer(async (req,res) => {
    const route = new URL(req.url,'http://localhost').pathname;
    const file = path.resolve(root, '.' + route.slice(entry.length-1), route.endsWith('/') ? 'index.html' : '');
    if(req.method!=='GET' || !route.startsWith(entry) || !file.startsWith(root+path.sep)) {
      res.writeHead(404);res.end();return;
    }
    try {
      const bytes=await fs.readFile(file);
      const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'};
      // This fixture omits the unrelated home soundtrack. WPE WebKit on Linux cannot
      // decode its AAC metadata. The rest of the home and all calendar assets run normally.
      if(route===entry)headers['Content-Security-Policy']="media-src 'none'";
      res.writeHead(200,headers);
      res.end(bytes);
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  base='http://127.0.0.1:'+server.address().port;
  browser=await engine.launch({headless:true});
  if(capture) await fs.mkdir(capture,{recursive:true});
  console.log('Rendered with '+engine.name()+' '+browser.version()+', fictional dates only.');
});
test.after(async()=>{await browser?.close();if(server)await new Promise(done=>server.close(done));});

async function fixture() {
  const f=createFixture();
  const result=await f.rpc('lw5_dog_save',{p_key:keys[0],p_revision:0,p_state:fixtureState});
  assert.equal(result.data.ok,true);
  return f;
}
async function client(f, width, height, member=0) {
  const c=await browser.newContext({viewport:{width,height},isMobile:width<800,hasTouch:width<800,
    deviceScaleFactor:1,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  const rpcCalls=[],errors=[],fault={};
  await c.route(url=>['http:','https:'].includes(url.protocol) && url.origin!==base, async route=>{
    const req=route.request(),url=req.url();
    // The browser never forwards any external URL. Only the in-memory handler can see fixture values.
    if(!url.startsWith(publicApi) || req.method()!=='POST')return route.abort();
    const op=url.slice(publicApi.length), payload=req.postDataJSON();
    rpcCalls.push({op,date:payload.p_date});
    assert.ok(keys.includes(payload.p_key));
    if(fault.next && op===fault.next.op){
      const intercept=fault.next; delete fault.next;
      return intercept.handle(route,payload);
    }
    const r=await f.rpc(op,payload);
    await route.fulfill({status:r.status,json:r.data,headers:{'Access-Control-Allow-Origin':base,'Cache-Control':'no-store'}});
  });
  const p=await c.newPage();
  p.on('pageerror',err=>errors.push(String(err)));
  await p.clock.setFixedTime(new Date(day+'T04:00:00Z'));
  await p.goto(base+entry,{waitUntil:'domcontentloaded'});
  const homeDog=p.locator('#dogCalendarLaunch');
  await expect(homeDog).toBeVisible();
  await homeDog.click();
  await expect(p.locator('#login-form')).toBeVisible();
  await p.locator('#login-key').fill(keys[member]);await p.locator('#login-submit').click();
  await expect(p.locator('#calendar-app')).toBeVisible();
  await p.evaluate(()=>document.fonts.ready);
  return {p,c,errors,rpcCalls,fault};
}
const flow=(p,id)=>p.locator('#flow-options [data-flow="'+id+'"]');
const dateButton=(p,val)=>p.locator('#calendar-grid [data-date="'+val+'"]');
const selectDate=async(p,val)=>{await dateButton(p,val).click();await expect(p.locator('#flow-date')).toHaveText(val);};
const expectSaved=async(p,id)=>{await expect(flow(p,id)).toHaveAttribute('aria-pressed','true');await expect(p.locator('#flow-status')).toContainText('已保存');};
async function screenshot(p,name,full=false){
  if(!capture)return;
  await p.screenshot({path:path.join(capture,engine.name()+'-'+name+'.png'),fullPage:full,animations:'disabled'});
}
for(const [width,height] of [[320,568],[375,812],[390,844],[430,932],[1280,900]]){
  test('home → chosen day → confirmed amount at '+width+'px', async()=>{
    const f=await fixture(), {p,c,rpcCalls,errors}=await client(f,width,height);
    try {
      assert.equal(rpcCalls.filter(v=>v.op.includes('flow')).length,0);
      const actions=p.locator('#flow-options button');
      assert.equal(await actions.count(),3);await expect(actions.nth(0)).toBeDisabled();
      assert.equal(await p.locator('#weekdays span').count(),7);
      await selectDate(p,day);
      await expect(p.locator('#flow-status')).toHaveText('未记录经量');
      assert.equal(await p.locator('#flow-options [aria-pressed=true]').count(),0);
      for(const action of await actions.all()){
        const box=await action.boundingBox();assert.ok(box.width>=44 && box.height>=44,'comfortable amount hit target (>=44px): '+JSON.stringify(box));
      }
      await flow(p,'medium').click();await expectSaved(p,'medium');
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width===390 || width===1280 || width===320 || width===430){
        await p.evaluate(()=>window.scrollTo(0,0));await screenshot(p,width+'-calendar',width===390);
        if(width===390){
          await p.locator('#flow-panel').evaluate(el=>el.scrollIntoView({block:'center'}));await screenshot(p,'390-selected-day');
        }
      }
      await selectDate(p,future);await expect(actions.first()).toBeDisabled();
      assert.equal(rpcCalls.filter(v=>v.date===future).length,0);
      assert.deepEqual(errors,[]);
    }finally{await c.close();}
  });
}
test('two independent devices, corrections, old snapshot, parallel dates, clear, ambiguous ack, manual status and lock',async()=>{
  const f=await fixture();const a=await client(f,390,844,0),b=await client(f,375,812,1);
  try {
    await selectDate(a.p,day);await selectDate(b.p,day);
    await expect(flow(a.p,'medium')).toBeEnabled();await expect(flow(b.p,'medium')).toBeEnabled();
    await flow(a.p,'light').click();await expectSaved(a.p,'light');
    await flow(b.p,'heavy').click();
    await expect(b.p.locator('#flow-status')).toContainText('未保存');
    await expect(flow(b.p,'light')).toHaveAttribute('aria-pressed','true');
    await flow(b.p,'medium').click();await expectSaved(b.p,'medium');
    await a.p.locator('#sync-btn').click();await expectSaved(a.p,'medium');
    const read=await f.rpc('lw5_dog_read',{p_key:keys[0]});
    assert.deepEqual(read.data.state,fixtureState);
    const legacy=structuredClone(read.data.state);legacy.moods[prior]='grumpy';
    assert.equal((await f.rpc('lw5_dog_save',{p_key:keys[1],p_revision:read.data.revision,p_state:legacy})).data.ok,true);
    await a.p.locator('#sync-btn').click();await expectSaved(a.p,'medium');
    await selectDate(a.p,prior);
    await Promise.all([flow(a.p,'heavy').click(),flow(b.p,'light').click()]);
    await expectSaved(a.p,'heavy');await expectSaved(b.p,'light');
    await selectDate(b.p,prior);await expectSaved(b.p,'heavy');
    await b.p.locator('#flow-clear').click();await expect(b.p.locator('#flow-status')).toContainText('已清除');
    await selectDate(a.p,day);await expectSaved(a.p,'light');
    f.controls.failReadbackAfterInsert=true;
    await flow(a.p,'heavy').click();
    await expect(a.p.locator('#flow-status')).toContainText('未能确认保存');
    await expect(a.p.locator('#flow-options [aria-pressed=true]')).toHaveCount(0);
    f.controls.failReadbackAfterInsert=false;
    await a.p.locator('#flow-retry').click();await expectSaved(a.p,'heavy');
    a.fault.next={op:'lw5_dog_flow_save',handle:r=>r.abort('internetdisconnected')};
    await flow(a.p,'medium').click();await expect(a.p.locator('#flow-status')).toContainText('未能确认保存');
    await a.p.locator('#flow-retry').click();await expectSaved(a.p,'heavy');
    const beforeNetwork=a.rpcCalls.filter(row=>row.op.includes('flow')).length;
    await a.p.locator('#mood-options [data-mood=best]').click();
    assert.equal(a.rpcCalls.filter(row=>row.op.includes('flow')).length,beforeNetwork);
    await a.p.locator('#logout-btn').click();await expect(a.p.locator('#calendar-lock')).toBeVisible();
    await expect(a.p.locator('#flow-panel')).toBeHidden();
    assert.ok(!(await a.p.locator('#flow-status').textContent()).includes('已保存'));
    assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
  } finally {await Promise.all([a.c.close(),b.c.close()]);}
});
test('delayed and misaddressed sign-offs cannot change the selected day or leave records visible after locking',async()=>{
  const f=await fixture(),a=await client(f,390,844);
  let release;
  function delayNext() {
    let signal;
    const seen=new Promise(resolve=>signal=resolve);
    const barrier=new Promise(resolve=>release=resolve);
    a.fault.next={op:'lw5_dog_flow_save',handle:async(route,payload)=>{
      const result=await f.rpc('lw5_dog_flow_save',payload);
      signal();await barrier;
      await route.fulfill({status:result.status,json:result.data,headers:{'Access-Control-Allow-Origin':base}}).catch(()=>{});
    }};
    return seen;
  }
  try {
    await selectDate(a.p,day);await expect(flow(a.p,'medium')).toBeEnabled();
    const seen=delayNext();await flow(a.p,'medium').click();await seen;
    await expect(a.p.locator('#flow-status')).toHaveText('正在保存…');
    await expect(a.p.locator('#flow-options [aria-pressed=true]')).toHaveCount(0);
    await selectDate(a.p,prior);await expect(a.p.locator('#flow-status')).toHaveText('未记录经量');release();
    await expect(a.p.locator('#flow-date')).toHaveText(prior);
    a.fault.next={op:'lw5_dog_flow_save',handle:route=>route.fulfill({
      json:{ok:true,date:day,revision:1,flow:'light'},headers:{'Access-Control-Allow-Origin':base}})};
    await flow(a.p,'light').click();await expect(a.p.locator('#flow-status')).toContainText('未能确认保存');
    await a.p.locator('#flow-retry').click();await expect(a.p.locator('#flow-status')).toHaveText('未记录经量');
    const seen2=delayNext();await flow(a.p,'heavy').click();await seen2;
    await a.p.locator('#logout-btn').click();release();
    await expect(a.p.locator('#login-form')).toBeVisible();await expect(a.p.locator('#flow-panel')).toBeHidden();
    assert.equal(await a.p.locator('#flow-options [aria-pressed=true]').count(),0);
    assert.deepEqual(a.errors,[]);
  }finally{release?.();await a.c.close();}
});

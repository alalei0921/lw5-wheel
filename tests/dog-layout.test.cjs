const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {chromium,webkit} = require('playwright');
const engine = process.env.LW5_UI_ENGINE === 'webkit' ? webkit : chromium;
const root = path.resolve(process.env.LW5_TEST_ROOT || path.join(__dirname,'..'));
const rpc = 'https://lrtglriomkxjxmxpzivj.supabase.co/functions/v1/lw5-dog-calendar/';
const fixedNow = new Date('2025-09-19T04:00:00Z');
const state = {version:2,personal:true,configured:true,customSpans:false,anchor:'2025-09-12',
  starts:['2025-08-13','2025-09-12'],startSelectionVersion:1,spans:[5,7,3,13],moods:{},
  periodEnds:{'2025-08-13':'2025-08-17'}};
let server,browser,base;
test.before(async()=>{
  server = http.createServer(async(req,res)=>{
    const rel = new URL(req.url,'http://localhost').pathname;
    const file=path.join(root,rel.endsWith('/')?rel+'index.html':rel);
    try{
      if(!file.startsWith(root+path.sep)) throw new Error('outside fixture');
      const body=await fs.readFile(file);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  base='http://127.0.0.1:'+server.address().port;
  browser=await engine.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(ok=>server.close(ok));});
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<=1.25,msg+' ('+a+' vs '+b+')');
async function rect(p,selector) {const result=await p.locator(selector).boundingBox(); assert.ok(result,'Visible: '+selector);return result;}
const right=r=>r.x+r.width;
async function equal(p,a,b){
  const r=await rect(p,a),s=await rect(p,b);
  near(r.width,s.width,'Matching widths: '+a+', '+b);
  near(r.height,s.height,'Matching heights: '+a+', '+b);
  near(r.y,s.y,'Matching vertical positions: '+a+', '+b);
}
async function fieldEdges(p,selectors){
  const d=await rect(p,'dialog[open]'),b=await rect(p,'dialog[open] .dg-btn');
  for (const selector of selectors) {
    const field=await rect(p,selector);
    near(field.x,b.x,'Input and submit left edges: '+selector);near(right(field),right(b),'Input and submit right edges: '+selector);
    assert.ok(field.height>=44,'Touch target: '+selector);
  }
  near(b.x-d.x,right(d)-right(b),'Equal left and right dialog insets');
  const overflow = await p.locator('dialog[open]').evaluate(el=>el.scrollWidth-el.clientWidth);
  assert.ok(overflow<=1,'Dialog has no horizontal overflow: '+overflow);
}
async function modal(p,opener,fields=[]){
  await p.locator(opener).click();
  await fieldEdges(p,fields);
}
async function close(p){await p.locator('dialog[open] .dg-x').click();await p.locator('dialog[open]').waitFor({state:'detached'});}
async function client(width,height){
  const c=await browser.newContext({viewport:{width,height},isMobile:width<800,hasTouch:width<800,
    deviceScaleFactor:2,locale:'zh-CN',timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  const unexpected=[],errors=[];
  await c.route('**/*', r=>{
    const req=r.request(),url=req.url();
    if(url===rpc+'lw5_dog_read') return r.fulfill({json:{revision:1,state},headers:{'Access-Control-Allow-Origin':base}});
    if(url.startsWith(base+'/')&&req.method()==='GET') return r.continue();
    unexpected.push(req.method()+' '+url);return r.abort();
  });
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.clock.setFixedTime(fixedNow);
  await p.goto(base+'/dog-calendar/?v=88');await p.locator('#login-key').fill('synthetic-responsive-fixture');
  await p.locator('#login-submit').click();await p.locator('#calendar-app').waitFor({state:'visible'});
  await p.evaluate(()=>document.fonts.ready);
  return {c,p,unexpected,errors};
}
for(const [width,height] of [[320,568],[375,812],[390,844],[430,932],[1024,768]]) test('balanced calendar and aligned fields at '+width+'px ('+engine.name()+')',async()=>{
  const {c,p,unexpected,errors}=await client(width,height);
  const capture=process.env.LW5_LAYOUT_CAPTURE;
  const snap=async part=>{if(capture&&width===390)await p.screenshot({path:path.join(capture,engine.name()+'-'+part+'.png'),fullPage:part==='page'});};
  try {
    const pageWidth=await p.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(pageWidth<=width,'No horizontal page overflow');
    await equal(p,'#period-end-btn','#period-records-btn');
    const pairLeft=await rect(p,'#period-end-btn'),pairRight=await rect(p,'#period-records-btn');
    const exportButton=await rect(p,'#share-periods-btn');
    near(exportButton.x,pairLeft.x,'Export spans left edge');near(right(exportButton),right(pairRight),'Export spans right edge');
    assert.ok(pairLeft.height>=44 && exportButton.height>=44);
    const mood=[...await p.locator('.mood-option').all()];
    const cards=await Promise.all(mood.map(e=>e.boundingBox()));
    cards.forEach(r=>{near(r.width,cards[0].width,'Equal mood card widths');near(r.height,cards[0].height,'Equal mood card heights');});
    await snap('page');
    await modal(p,'#period-end-btn',['dialog input[name=end]']);await snap('ending');
    await close(p);
    await modal(p,'#period-history',['dialog input[name=date]']);await close(p);
    await modal(p,'#settings-btn',['dialog input[name=date]']);
    await equal(p,'dialog input[name=length]','dialog input[name=bleed]');
    await p.locator('dialog details summary').click();
    await equal(p,'dialog input[name=tired]','dialog input[name=grumpy]');
    await close(p);
    await modal(p,'#period-records-btn');
    await equal(p,'dialog [data-correct-start="2025-08-13"]','dialog [data-period-start="2025-08-13"]');
    await p.locator('dialog .dg-add-period').click();await fieldEdges(p,['dialog input[name=date]']);
    await close(p);
    await modal(p,'#month-label');await equal(p,'dialog input[name=year]','dialog select[name=month]');await close(p);
    await modal(p,'#share-periods-btn',['dialog select','dialog textarea']);
    assert.equal(await p.locator('dialog textarea').getAttribute('readonly'),'');
    await snap('export');
    await close(p);
    assert.deepEqual(unexpected,[]);
    assert.deepEqual(errors,[]);
  } finally {await c.close();}
});

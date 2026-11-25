const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
test('four tools in one animated folder, original navigation and responsive direct shortcuts',async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{let p=new URL(req.url,'http://localhost').pathname.slice(1); if(!p||p.endsWith('/'))p+='index.html';try{const f=path.join(root,p), body=await fs.readFile(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(f)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port+'/';
 let b;
 try{
 b=await chromium.launch({headless:true});
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
  const c=await b.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:width===390?'no-preference':'reduce'});
  await c.route('**/*',r=>r.request().method()==='GET'&&r.request().url().startsWith(base)?r.continue():r.abort());
  const p=await c.newPage(), launch=p.locator('#toolboxLaunch'), box=p.locator('#toolboxDialog');
  await p.goto(base);
  assert(await box.isHidden());
  for(const x of ['#drawdownOpen','#dogCalendarLaunch','#lightsOnLaunch','#supplementLaunch','#elevatorLaunch','[data-tool=travel]','a[href*="hyperion"]','a[href*="aurora"]','a[href*="chione"]','a[href*="panel-mute"]']) assert(await p.locator(x).isVisible(),x);
  assert.equal(await p.locator('main [data-tool]').count(),1);
  const a=await launch.boundingBox(), m=await p.locator('main').boundingBox();
  assert(a.x+a.width<=m.x||a.y>=m.y+m.height||a.y+a.height<=m.y);
  await launch.click();
  assert.deepEqual(await box.locator('[data-tool]').evaluateAll(x=>x.map(e=>e.dataset.tool)),['wheel','stock','conflict','islands']);
  assert.equal(await launch.getAttribute('aria-expanded'),'true');
  if(width===390){
   assert(await box.evaluate(el=>el.getAnimations().some(a=>a.effect?.getKeyframes()[0]?.transform?.includes('scale'))));
   await p.waitForTimeout(330);
   if(process.env.LW5_SCREENSHOT) await p.screenshot({path:process.env.LW5_SCREENSHOT});
  } else assert.equal(await box.evaluate(el=>el.getAnimations().length),0);
  const d=await box.boundingBox();assert(d.x>=0&&d.y>=0&&d.x+d.width<=width&&d.y+d.height<=height);
  await p.keyboard.press('Escape');await box.waitFor({state:'hidden'});
  assert.equal(await launch.getAttribute('aria-expanded'),'false');
  assert(await launch.evaluate(el=>el===document.activeElement));
  await launch.click();await p.mouse.click(3,3);await box.waitFor({state:'hidden'});
  if(width===390){
   for(const tool of ['stock','conflict','islands','travel']){
    if(tool!=='travel') await launch.click();
    await p.locator('[data-tool='+tool+']').click();
    await p.waitForURL('**/#'+tool);
    await p.frameLocator('#toolFrame').locator('body').waitFor();
    if(tool==='islands') await p.locator('#toolClose').evaluate(el=>el.click());else await p.locator('#toolClose').click();
    await p.waitForURL(base);
    assert(await p.locator(tool==='travel'?'[data-tool=travel]':'#toolboxLaunch').evaluate(el=>el===document.activeElement));
   }
   await launch.click();await p.locator('[data-tool=wheel]').click();await p.waitForURL('**/wheel/');
  }
  await c.close();
 }
 }finally{await b?.close();await new Promise(ok=>server.close(ok));}
});

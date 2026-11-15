// All requests are fulfilled/aborted in memory. No web server or device access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4175';
let browser;
test.before(async () => { browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}); });
test.after(async () => { await browser?.close(); });

async function setup({winner='192.168.1.136',width=390,https=false}={}) {
  const base = https ? 'https://app.example.test' : origin;
  const context = await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  context.setDefaultTimeout(7000);
  context.setDefaultNavigationTimeout(10000);
  const calls=[],forbidden=[],errors=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base){
      if(url.pathname==='/api/ping' && request.method()==='GET' && ['192.168.1.105','192.168.1.136','5damidemac-mini.local'].includes(url.hostname)){
        calls.push(url.hostname);
        if(url.hostname!==winner)return route.abort('failed');
        return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':base},body:JSON.stringify({ok:true,service:'lw5-local-control'})});
      }
      if(request.isNavigationRequest() && request.method()==='GET' && ['/sun-mode','/aurora','/wind','/panel-mute','/'].includes(url.pathname) && ['192.168.1.105','192.168.1.136','5damidemac-mini.local'].includes(url.hostname)){
        return route.fulfill({contentType:'text/html',body:'<p>MOCK CONTROLLER — no device code</p>'});
      }
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:''});
      forbidden.push(request.method()+' '+url.origin+url.pathname);return route.abort();
    }
    if(request.method()!=='GET'||url.pathname.includes('/api/')) {forbidden.push(request.method()+' '+url.pathname);return route.abort();}
    const file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
    try{return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
    catch{return route.fulfill({status:404,body:'Missing fixture'});}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page,base,calls,forbidden,errors};
}

test('all preview pages automatically select the current address and fit a small phone',async()=>{
  const s=await setup({width:320});
  try {
    for(const [file,destination] of [['hyperion','/'],['aurora','/aurora'],['chione','/wind'],['panel-mute','/panel-mute']]){
      await s.page.goto(s.base+'/smart-home/'+file+'.html');
      await s.page.waitForFunction(()=>document.querySelector('#localControl').classList.contains('connected'));
      assert.equal(await s.page.locator('#localControl').getAttribute('href'),'http://192.168.1.136:8788'+destination);
      await s.page.locator('.local-connection-help summary').click();
      assert(await s.page.locator('.local-connection-help a').nth(1).isVisible());
      assert(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    assert.deepEqual(s.errors,[]);assert.deepEqual(s.forbidden,[]);
  } finally {await s.context.close();}
});
test('mute entry discovers only the bridge and leaves device state unknown until local navigation',async()=>{
  const s=await setup();
  try {
    await s.page.goto(s.base+'/?visual-test=1');
    await s.page.getByRole('link',{name:'打开中控静音设置'}).click();
    await s.page.waitForFunction(()=>document.querySelector('#localControl')?.classList.contains('connected'));
    assert.match(await s.page.locator('#deviceState').innerText(),/尚未读取中控状态/);
    assert.match(await s.page.locator('#status').innerText(),/中控状态请进入后查看/);
    assert.equal(await s.page.getByRole('switch').count(),0);
    assert.equal(new URL(s.page.url()).pathname,'/smart-home/panel-mute.html');
    await s.page.locator('#localControl').click();
    await s.page.waitForURL('http://192.168.1.136:8788/panel-mute');
    assert.match(await s.page.locator('body').innerText(),/MOCK CONTROLLER/);
    assert.deepEqual(s.errors,[]);assert.deepEqual(s.forbidden,[]);
  } finally {await s.context.close();}
});
test('mute entry keeps a direct local link when HTTPS discovery fails and offline never implies muted',async()=>{
  const s=await setup({winner:null,https:true,width:320});
  try {
    await s.page.goto(s.base+'/smart-home/panel-mute.html');
    await s.page.waitForFunction(()=>document.querySelector('#status').textContent.includes('暂未确认'),{},{timeout:6000});
    assert.match(await s.page.locator('#deviceState').innerText(),/尚未读取中控状态/);
    await s.context.setOffline(true);
    await s.page.waitForFunction(()=>document.querySelector('#status').textContent.includes('请先连接家庭 Wi-Fi'));
    assert.equal(await s.page.locator('#localControl').getAttribute('href'),'http://192.168.1.136:8788/panel-mute');
    assert.match(await s.page.locator('#deviceState').innerText(),/尚未读取中控状态/);
    assert(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await s.context.setOffline(false);
    await s.page.locator('#localControl').click();
    await s.page.waitForURL('http://192.168.1.136:8788/panel-mute');
    assert.deepEqual(s.errors,[]);assert.deepEqual(s.forbidden,[]);
  } finally {await s.context.close();}
});
test('home with an old recent-handoff flag still discovers the new IP, then navigates only to a mocked page',async()=>{
  const s=await setup();
  try {
    await s.page.addInitScript(()=>localStorage.setItem('lw5_nebula_recent_local_v1',String(Date.now())));
    await s.page.goto(s.base+'/');await s.page.locator('#sunPress').click();
    await s.page.waitForURL('http://192.168.1.136:8788/sun-mode**');
    assert(s.calls.includes('192.168.1.136')); assert.match(await s.page.locator('body').innerText(),/MOCK CONTROLLER/);
    assert.deepEqual(s.errors,[]);assert.deepEqual(s.forbidden,[]);
  } finally {await s.context.close();}
});
test('blocked HTTPS probes show bounded failure and a direct current-IP link',async()=>{
  const s=await setup({winner:null,https:true});
  try {
    await s.page.goto(s.base+'/smart-home/aurora.html');
    await s.page.waitForFunction(()=>document.querySelector('#status').textContent.includes('暂未确认'),{},{timeout:6000});
    assert.equal(await s.page.locator('#localControl').getAttribute('href'),'http://192.168.1.136:8788/aurora');
    await s.page.locator('#localControl').click();
    await s.page.waitForURL('http://192.168.1.136:8788/aurora');
    assert.match(await s.page.locator('body').innerText(),/MOCK CONTROLLER/);
    assert.deepEqual(s.errors,[]);assert.deepEqual(s.forbidden,[]);
  } finally {await s.context.close();}
});
test('home failure offers usable help; repeated resume events do not navigate away',async()=>{
  const s=await setup({winner:null,width:320});
  try {
    await s.page.goto(s.base+'/');await s.page.locator('#sunPress').click();
    await s.page.waitForFunction(()=>document.querySelector('#nebulaHint').textContent.includes('自动连接未确认'),{},{timeout:7000});
    await s.page.locator('.local-connection-help summary').click();
    assert(await s.page.locator('.local-connection-help a').nth(1).isVisible());
    assert(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await s.page.evaluate(()=>{dispatchEvent(new Event('pageshow'));dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await s.page.locator('#nebulaHint').getAttribute('aria-disabled'),'false');
    assert.match(await s.page.locator('#nebulaHint').innerText(),/重新查找/);
    assert(s.page.url().startsWith(s.base));
    if(process.env.SCREENSHOT_DIR){
      await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
      await s.page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'home-connection-help-320.png')});
    }
    await s.page.locator('.local-connection-help a').nth(1).click();
    await s.page.waitForURL('http://192.168.1.136:8788/sun-mode**');
    assert.deepEqual(s.errors,[]);assert.deepEqual(s.forbidden,[]);
  } finally {await s.context.close();}
});

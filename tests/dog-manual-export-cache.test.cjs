const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const scope = '/lw5-wheel/';
const engine = process.env.LW5_UI_ENGINE === 'webkit' ? webkit : chromium;
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json',
  '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};

test('installed home and cached v93 calendar scripts hand off by the original dog link to the current export without caching records', {timeout:60000}, async t => {
  const requests = [], oldScripts = ['period-sharing.js?v=90', 'app.js?v=93'];
  let upgraded = false;
  const server = http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://localhost');
    if (!url.pathname.startsWith(scope) || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    const calendar = url.pathname.startsWith(scope+'dog-calendar/');
    const file = path.resolve(root,url.pathname.slice(scope.length)+(url.pathname.endsWith('/')?'index.html':''));
    if (!file.startsWith(root+path.sep)) { res.writeHead(404); res.end(); return; }
    let body;
    try { body = await fs.readFile(file); } catch { res.writeHead(404); res.end(); return; }
    if (calendar) {
      requests.push({path:url.pathname.slice(scope.length+'dog-calendar/'.length)+url.search, upgraded});
      if (!upgraded && url.pathname === scope+'dog-calendar/') {
        body = Buffer.from('<!doctype html><title>v93 fixture</title>'+oldScripts.map(src=>'<script src="'+src+'"></script>').join(''));
      }
      if (oldScripts.includes(url.pathname.split('/').at(-1)+url.search)) body = Buffer.from('window.staleExportBundle=true;');
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',
      'Cache-Control':calendar && /\.js$/.test(url.pathname)?'public, max-age=31536000, immutable':'no-cache',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'none'; connect-src 'self'; worker-src 'self'"});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base='http://127.0.0.1:'+server.address().port+scope;
  const browser=await engine.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(); page.setDefaultTimeout(10000);
  await page.goto(base);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const href=await page.locator('#dogCalendarLaunch').getAttribute('href');
  await page.locator('#dogCalendarLaunch').click();
  await page.waitForFunction(()=>window.staleExportBundle===true);
  await page.goBack(); await page.locator('#dogCalendarLaunch').waitFor();
  await context.setOffline(true);
  await page.waitForFunction(()=>!navigator.onLine);
  await page.locator('#updateBtn').click();
  assert.equal(await page.locator('#updateBtn').isEnabled(),true);
  upgraded=true;
  await context.setOffline(false); await page.waitForFunction(()=>navigator.onLine);
  await page.locator('#dogCalendarLaunch').click();
  await page.locator('#login-key').waitFor();
  await page.waitForLoadState('load');
  assert.equal(new URL(page.url()).pathname,new URL(href,base).pathname);
  assert.deepEqual(await page.evaluate(()=>({
    stale:Boolean(window.staleExportBundle), formatter:typeof window.LW5ManualExport?.format,
    dialog:typeof window.LW5Share?.open, gate:!document.querySelector('#calendar-lock').hidden
  })),{stale:false,formatter:'function',dialog:'function',gate:true});
  const upgradeURLs=requests.filter(r=>r.upgraded).map(r=>r.path);
  assert.ok(upgradeURLs.some(u=>/^manual-export\.js\?/.test(u)));
  assert.ok(upgradeURLs.some(u=>/^period-sharing\.js\?/.test(u)&&!oldScripts.includes(u)));
  assert.ok(upgradeURLs.some(u=>/^app\.js\?/.test(u)&&!oldScripts.includes(u)));
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async k=>(await(await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat();});
  assert.ok(cached.length);
  assert.ok(cached.every(v=>!v.includes('/dog-calendar/')));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {chromium, webkit} = require('playwright');

const engine = process.env.LW5_UI_ENGINE === 'webkit' ? webkit : chromium;
const root = path.resolve(__dirname, '..');
const scope = '/lw5-wheel/';
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp',
  '.woff2':'font/woff2', '.webmanifest':'application/manifest+json'};

test('installed home keeps its offline update and opens the new calendar from its existing dog icon', {timeout:60000}, async t => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(scope)) { res.writeHead(404); res.end(); return; }
    const relative = url.pathname.slice(scope.length) + (url.pathname.endsWith('/') ? 'index.html' : '');
    const file = path.resolve(root,relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404); res.end(); return; }
    try {
      const bytes = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type':types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control':'no-store',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'none'; worker-src 'self'",
      });
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => {server.closeAllConnections();return new Promise(resolve => server.close(resolve));});
  const base = 'http://127.0.0.1:' + server.address().port + scope;
  const browser = await engine.launch({headless:true});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport:{width:375,height:812}});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);

  // Provide only local, fictional replies. The HTTP CSP also rejects every
  // external origin even if a future request bypasses this fixture.
  await context.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const target = new URL(args[0] instanceof Request ? args[0].url : args[0], location.href);
      if (target.origin === location.origin) return original(...args);
      if (!target.pathname.endsWith('/lw5_dog_read')) throw Error('Unexpected external fixture request');
      const data = JSON.parse(args[1].body);
      if (data.p_key !== 'fictional-test-only') throw Error('Unknown fixture');
      return Response.json({revision:1,state:{version:2,configured:true,personal:true,
        anchor:'2025-06-01',starts:['2025-06-01'],spans:[5,7,3,13],moods:{}}});
    };
  });
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cacheName = await page.evaluate(async () => (await caches.keys()).find(key => key.startsWith('lw5-home-')));
  assert.ok(cacheName);
  await page.evaluate(async name => {
    const cache = await caches.open(name);
    const previous = new URL('shared/dog-calendar-core-v3.js', location.href);
    await cache.put(previous.href, new Response('window.staleCalendarCoreLoaded = true;',{
      headers:{'Content-Type':'text/javascript'},
    }));
    localStorage.setItem('synthetic-update-marker','unchanged');
  }, cacheName);
  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await page.locator('#updateBtn').click();
  assert.equal(await page.locator('#updateBtn').isEnabled(), true);
  assert.equal(await page.evaluate(name => caches.has(name),cacheName),true);
  assert.equal(await page.evaluate(() => localStorage.getItem('synthetic-update-marker')),'unchanged');
  await context.setOffline(false);
  await page.locator('#dogCalendarLaunch').click();
  await page.locator('#login-key').fill('fictional-test-only');
  await page.locator('#login-submit').click();
  await page.locator('#calendar-app').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => window.staleCalendarCoreLoaded),undefined);
  const urls = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(req => req.url),cacheName);
  assert.ok(urls.length);
  assert.equal(urls.some(value => new URL(value).pathname.startsWith('/lw5-wheel/dog-calendar/') ||
    new URL(value).origin !== new URL(base).origin), false);
});

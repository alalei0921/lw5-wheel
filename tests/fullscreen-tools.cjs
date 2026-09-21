const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:4175';
const screenshotDir = process.env.SCREENSHOT_DIR;

test('embedded tools cover the nebula and restore the homepage on return', async () => {
  const browser = await chromium.launch({headless:true, args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    if (screenshotDir) await fs.mkdir(screenshotDir, {recursive:true});
    for (const viewport of [{width:390,height:844}, {width:844,height:390}, {width:1440,height:900}]) {
      const context = await browser.newContext({viewport, serviceWorkers:'block'});
      const errors = [];
      // Use real module pages, but isolate the test from cloud storage and home devices.
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          assert.equal(url.hostname, 'cdn.jsdelivr.net');
          return route.fulfill({status:200, contentType:'text/javascript', body:''});
        }
        const pathname = decodeURIComponent(url.pathname);
        const file = path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
        assert(file.startsWith(root + path.sep));
        const types = {'.html':'text/html', '.js':'text/javascript', '.jpg':'image/jpeg', '.png':'image/png', '.m4a':'audio/mp4', '.mp3':'audio/mpeg'};
        try {
          await route.fulfill({status:200, contentType:types[path.extname(file)] || 'application/octet-stream', body:await fs.readFile(file)});
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await route.fulfill({status:404, body:'Not found'});
        }
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/?visual-test=1');
      await page.locator('#sunPress.nebula-live').waitFor();
      for (const tool of ['stock', 'travel', 'conflict']) {
        await page.locator(`[data-tool="${tool}"]`).click();
        const frame = await page.locator('#toolFrame').contentFrame();
        await frame.locator('body').waitFor();
        await page.waitForFunction(tool => document.querySelector('#toolFrame').contentWindow.location.pathname === '/' + tool + '/', tool);
        const geometry = await page.evaluate(() => {
          const rect = id => {const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
          const sun = rect('sunPress');
          return {panel:rect('toolPanel'),frame:rect('toolFrame'),
            nebula:getComputedStyle(document.getElementById('nebulaOverlay')).visibility,
            sun:getComputedStyle(document.getElementById('sunPress')).visibility,
            topElement:document.elementFromPoint(sun.x+sun.width/2,sun.y+sun.height/2)?.id};
        });
        assert.deepEqual(geometry.panel, {x:0,y:0,width:viewport.width,height:viewport.height,bottom:viewport.height});
        assert.equal(geometry.frame.x, 0);
        assert.equal(geometry.frame.width, viewport.width);
        assert.equal(geometry.frame.bottom, viewport.height);
        assert(geometry.frame.height > viewport.height-100);
        assert.equal(geometry.nebula, 'hidden');
        assert.equal(geometry.sun, 'hidden');
        assert(!['sunPress','nebulaCanvas','nebulaOverlay'].includes(geometry.topElement));
        if (screenshotDir) await page.screenshot({path:path.join(screenshotDir, `${tool}-${viewport.width}.png`)});
        if (tool === 'conflict') await frame.locator('.close-btn').click();
        else await page.locator('#toolClose').click();
        await page.locator('#toolOverlay').waitFor({state:'hidden'});
        assert(await page.locator('#sunPress').isVisible());
        assert.equal(await page.locator('#nebulaOverlay').evaluate(el=>getComputedStyle(el).visibility), 'visible');
        assert.equal(await page.evaluate(()=>document.body.classList.contains('tool-active')), false);
      }
      // Direct hash entry uses the same fullscreen path.
      await page.goto(origin + '/?visual-test=1&entry=travel#travel');
      await page.locator('#toolOverlay.show').waitFor();
      assert.equal(await page.locator('#sunPress').isVisible(), false);
      await page.locator('#toolClose').click();
      await page.locator('#sunPress.nebula-live').waitFor();
      await page.locator('#sunPress').click();
      await page.locator('#nebulaOverlay.control-ready').waitFor();
      await page.locator('#nebulaBack').click();
      await page.waitForFunction(()=>window.lw5NebulaControl.mode==='mini');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

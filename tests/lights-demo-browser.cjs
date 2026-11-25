'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://demo.test';
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(() => browser?.close());

async function openDemo(reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 300, height: 480 }, reducedMotion, serviceWorkers: 'block' });
  const assets = {
    '/smart-home/lights-demo.html': 'text/html',
    '/shared/lights-on-universe.js': 'text/javascript',
    '/shared/lights-on-universe.css': 'text/css',
  };
  const errors = [];
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET' || url.origin !== origin || !assets[url.pathname]) {
      errors.push('Unexpected request: ' + req.url());
      return route.abort();
    }
    return route.fulfill({ contentType: assets[url.pathname], body: await fs.readFile(path.join(root, url.pathname)) });
  });
  // Run the real 2D renderer here; the universe suite exercises WebGL separately.
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.includes('webgl') ? null : original.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(origin + '/smart-home/lights-demo.html');
  await page.locator('#universe canvas').waitFor();
  assert.equal(await page.locator('video,img').count(), 0);
  return { context, page, errors };
}

test('preview plays the code-rendered timeline, holds nine and supports replay', async () => {
  const { context, page, errors } = await openDemo();
  try {
    await page.waitForFunction(() => window.blackholeDemo.getState().seconds > 0);
    assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
    assert.equal(await page.getByRole('link', { name: '返回小程序' }).getAttribute('href'), '../index.html');
    await page.getByRole('button', { name: '暂停' }).click();
    for (let level = 0; level <= 9; level++) {
      await page.evaluate(level => window.blackholeDemo.seek(level + .5), level);
      assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), String(level));
      assert.equal(await page.locator('#universe').getAttribute('data-completed'), String(level));
    }
    await page.evaluate(() => window.blackholeDemo.seek(15.95));
    await page.getByRole('button', { name: '继续' }).click();
    await page.getByRole('button', { name: '重播' }).waitFor();
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '9');
    await page.getByRole('button', { name: '重播' }).click();
    await page.waitForFunction(() => window.blackholeDemo.getState().seconds < 1);
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reduced motion waits for manual play, pause freezes the clock and backgrounding stops it', async () => {
  const { context, page, errors } = await openDemo('reduce');
  try {
    assert.equal(await page.evaluate(() => window.blackholeDemo.getState().playing), false);
    await page.getByRole('button', { name: '播放' }).click();
    await page.waitForFunction(() => window.blackholeDemo.getState().seconds > .1);
    await page.getByRole('button', { name: '暂停' }).click();
    const pausedAt = await page.evaluate(() => window.blackholeDemo.getState().seconds);
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => window.blackholeDemo.getState().seconds), pausedAt);
    await page.getByRole('button', { name: '继续' }).click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.blackholeDemo.getState().playing), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

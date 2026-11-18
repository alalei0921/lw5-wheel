'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://demo.test';
let browser, html, movie;

test.before(async () => {
  html = await fs.readFile(path.join(root, 'smart-home/lights-demo.html'));
  movie = await fs.readFile(path.join(root, 'assets/lights-film/demo-v1.mp4'));
  browser = await chromium.launch({ headless: true });
});
test.after(() => browser?.close());

async function openDemo(options = {}, blockAutoplay = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...options });
  const errors = [];
  await context.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.origin === origin) {
      if (url.pathname === '/smart-home/lights-demo.html') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname === '/assets/lights-film/demo-v1.mp4') {
        const range = req.headers().range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), movie.length - 1) : movie.length - 1;
        const headers = { 'accept-ranges': 'bytes' };
        if (range) headers['content-range'] = 'bytes ' + start + '-' + end + '/' + movie.length;
        return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers, body: movie.subarray(start, end + 1) });
      }
    }
    errors.push('Unexpected request: ' + req.method() + ' ' + url);
    return route.abort();
  });
  if (blockAutoplay) await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!navigator.userActivation.isActive) return Promise.reject(new DOMException('Tap required', 'NotAllowedError'));
      return play.call(this);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(origin + '/smart-home/lights-demo.html', { waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}

test('preview counts each second of the real movie, holds nine, and replays without contacting a controller', async () => {
  const { context, page, errors } = await openDemo();
  try {
    await page.evaluate(() => {
      const film = document.querySelector('video');
      window.samples = [];
      const save = () => window.samples.push({ level: Number(document.getElementById('count').textContent), time: film.currentTime });
      save();
      new MutationObserver(save).observe(document.getElementById('count'), { childList: true });
    });
    await page.waitForFunction(() => document.querySelector('video').currentTime > .2);
    assert.equal(await page.locator('video').evaluate(v => v.muted && v.playsInline && v.videoWidth === 540 && v.videoHeight === 960), true);
    assert.equal(await page.locator('video').evaluate(v => getComputedStyle(v).objectPosition), '27% 50%');
    assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
    assert.equal(await page.getByRole('link', { name: '返回小程序' }).getAttribute('href'), '../index.html');
    await page.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 22000 });
    const samples = await page.evaluate(() => window.samples);
    assert.deepEqual(samples.map(s => s.level), Array.from({ length: 10 }, (_, i) => i));
    for (const { time, level } of samples.slice(1)) assert(Math.abs(time - level) < .3, 'Counter at ' + time + 's shows ' + level);
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '9');
    await page.getByRole('button', { name: '重播' }).click();
    await page.waitForFunction(() => document.querySelector('video').currentTime > .1 && document.querySelector('video').currentTime < 1);
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reduced motion and blocked autoplay both support manual play, pause and hide', async () => {
  for (const reduced of [true, false]) {
    const { context, page, errors } = await openDemo({ reducedMotion: reduced ? 'reduce' : 'no-preference' }, !reduced);
    try {
      await page.getByRole('button', { name: '播放' }).waitFor();
      assert.equal(await page.locator('video').evaluate(v => v.paused), true);
      await page.getByRole('button', { name: '播放' }).click();
      await page.waitForFunction(() => document.querySelector('video').currentTime > .3);
      await page.getByRole('button', { name: '暂停' }).click();
      await page.getByRole('button', { name: '继续' }).waitFor();
      assert.equal(await page.locator('video').evaluate(v => v.paused), true);
      await page.getByRole('button', { name: '继续' }).click();
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await page.locator('video').evaluate(v => v.paused), true);
      await page.setViewportSize({ width: 844, height: 390 });
      assert.equal(await page.locator('video').evaluate(v => getComputedStyle(v).objectFit), 'contain');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

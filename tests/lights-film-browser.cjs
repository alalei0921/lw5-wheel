// The player never sees a device API. Media is mocked or decoded from a local QA fixture.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser, scripts, css;
test.before(async () => {
  scripts = await Promise.all(['lights-on-film-manifest.js', 'lights-on-film.js'].map(name => fs.readFile(path.join(root, 'shared', name), 'utf8')));
  css = await fs.readFile(path.join(root, 'shared/lights-on-film.css'), 'utf8');
  browser = await chromium.launch({ headless: true });
});
test.after(async () => browser?.close());
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFgwJ/lkV+FAAAAABJRU5ErkJggg==', 'base64');

async function setup({ reducedMotion = 'no-preference', width = 390, height = 844, realVideo = null, rejectPosters = false, renderer } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
  const requests = [], errors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push({ url: url.href, method: request.method() });
    assert.equal(request.method(), 'GET'); assert.equal(url.origin, 'https://film.test');
    assert.equal(url.searchParams.get('scene'), '76');
    assert.match(url.pathname, /^\/assets\/lights-film\/v1\/level-0[0-9]\.(jpg|mp4)$/);
    if (url.pathname.endsWith('.jpg')) return route.fulfill(rejectPosters ? { status: 404, body: '' } : { contentType: 'image/png', body: pixel });
    if (realVideo) {
      const range = request.headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(realVideo.length - 1, Number(range[2])) : realVideo.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: realVideo.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${realVideo.length}` } : {}) } });
    }
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><style>html,body{margin:0;overflow:hidden}#host{position:fixed;inset:0;overflow:hidden}</style><main id="wrapper"><div id="host"></div></main>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ mocked, renderer }) => {
    window.LW5LightsFilmConfig = { assetBase: 'https://film.test/assets/lights-film/v1/', renderer };
    window.__legacy = { creates: 0, updates: [], destroys: 0 };
    window.LW5LightsUniverse = { create(host) {
      window.__legacy.creates++; host.dataset.renderer = 'legacy';
      return { update(state) { window.__legacy.updates.push(state); host.dataset.completed = String(state.completed); host.dataset.phase = state.status; }, destroy() { window.__legacy.destroys++; } };
    } };
    if (!mocked) return;
    // Unit cases control media events explicitly; suppress native decoder errors
    // caused by their intentionally absent video bytes.
    document.addEventListener('error', event => {
      if (event.target instanceof HTMLVideoElement && event.isTrusted) event.stopImmediatePropagation();
    }, true);
    const media = HTMLMediaElement.prototype;
    Object.defineProperties(media, {
      readyState: { get() { return this.__ready || 0; } },
      duration: { get() { return 16; } },
      seeking: { get() { return false; } },
      paused: { get() { return !this.__playing; } },
      currentTime: { get() { return this.__time || 0; }, set(value) { this.__time = value; queueMicrotask(() => this.dispatchEvent(new Event('seeked'))); } },
      src: { get() { return this.getAttribute('src') || ''; }, set(value) { this.setAttribute('src', value); } },
    });
    media.load = function () { this.__ready = 0; this.__playing = false; this.__time = 0; };
    media.play = function () { this.__playing = true; return Promise.resolve(); };
    media.pause = function () { this.__playing = false; };
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) { return setTimeout(() => callback(performance.now(), {}), 0); };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = clearTimeout;
    window.readyFilm = level => {
      const video = [...document.querySelectorAll('video')].find(video => video.src && new URL(video.src).pathname.endsWith('level-' + String(level).padStart(2, '0') + '.mp4'));
      if (!video) throw new Error('No pending film for ' + level);
      video.__ready = 4;
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('loadeddata'));
    };
    window.failFilm = () => [...document.querySelectorAll('video')].find(video => video.hasAttribute('src'))?.dispatchEvent(new Event('error'));
  }, { mocked: !realVideo, renderer });
  for (const script of scripts) await page.addScriptTag({ content: script });
  await page.evaluate(() => { window.scene = window.LW5LightsUniverse.create(document.getElementById('host')); });
  return { page, context, requests, errors };
}
async function update(page, state) { await page.evaluate(state => window.scene.update(state), state); }
async function ready(page, level) {
  await page.locator('video[src*="/level-' + String(level).padStart(2, '0') + '.mp4"]').waitFor({ state: 'attached' });
  await page.evaluate(level => window.readyFilm(level), level);
  await page.waitForFunction(level => document.getElementById('host').dataset.filmLevel === String(level) && document.getElementById('host').dataset.filmState === 'playing', level);
}

test('real confirmations select the exact level, skip stale loads and retain loop phase', async () => {
  const s = await setup();
  try {
    await ready(s.page, 0);
    await s.page.evaluate(() => { document.querySelector('video[src]').currentTime = 7.25; });
    await update(s.page, { status: 'running', completed: 3, currentIndex: 4 });
    await ready(s.page, 3);
    assert.equal(await s.page.locator('video[src*="/level-03.mp4"]').evaluate(video => video.currentTime), 7.25);
    await update(s.page, { status: 'running', completed: 4 });
    await update(s.page, { status: 'running', completed: 7 });
    assert.equal(await s.page.locator('video[src*="/level-04.mp4"]').count(), 0);
    await ready(s.page, 7);
    await s.page.waitForTimeout(250);
    assert.equal(await s.page.locator('video[src]').count(), 1);
    await s.page.locator('video[src]').dispatchEvent('ended');
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'), '7');
    await update(s.page, { status: 'verifying', completed: 9 }); await ready(s.page, 9);
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'verifying');
    await update(s.page, { status: 'succeeded', completed: 9 });
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'succeeded');
    await update(s.page, { status: 'failed', completed: 8 });
    assert.equal(await s.page.locator('video[src]').count(), 0);
    assert.match(new URL(await s.page.locator('.lights-film-poster').getAttribute('src')).pathname, /level-08.jpg$/);
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'), '8');
    await update(s.page, { status: 'connecting', completed: 0 }); await ready(s.page, 0);
    assert.deepEqual(s.errors, []);
  } finally { await s.context.close(); }
});

test('hidden scenes pause, reduced motion uses only the confirmed poster, destroy unloads media', async () => {
  const s = await setup();
  try {
    await ready(s.page, 0);
    await s.page.evaluate(() => { document.getElementById('wrapper').hidden = true; });
    await s.page.waitForFunction(() => [...document.querySelectorAll('video')].every(video => video.paused));
    await update(s.page, { status: 'running', completed: 5 });
    assert.equal(await s.page.locator('video[src*="/level-05.mp4"]').count(), 0);
    await s.page.evaluate(() => { document.getElementById('wrapper').hidden = false; }); await ready(s.page, 5);
    await s.page.emulateMedia({ reducedMotion: 'reduce' });
    await s.page.waitForFunction(() => !document.querySelector('video[src]'));
    await update(s.page, { status: 'running', completed: 6 });
    assert.match(new URL(await s.page.locator('.lights-film-poster').getAttribute('src')).pathname, /level-06.jpg$/);
    await s.page.evaluate(() => { window.scene.destroy(); window.scene.update({ status: 'succeeded', completed: 9 }); });
    assert.equal(await s.page.locator('#host').evaluate(host => host.childElementCount), 0);
    assert.deepEqual(s.errors, []);
  } finally { await s.context.close(); }
});

test('media errors retain the same poster; loss of both assets rolls back with the same snapshot', async () => {
  const s = await setup();
  try {
    await update(s.page, { status: 'running', completed: 4 });
    await s.page.evaluate(() => window.failFilm());
    assert.equal(await s.page.locator('#host').getAttribute('data-film-state'), 'unavailable');
    assert.match(new URL(await s.page.locator('.lights-film-poster').getAttribute('src')).pathname, /level-04.jpg$/);
    assert.equal(await s.page.evaluate(() => window.__legacy.creates), 0);
  } finally { await s.context.close(); }
  const missing = await setup({ rejectPosters: true });
  try {
    await update(missing.page, { status: 'running', completed: 4 });
    await missing.page.evaluate(() => window.failFilm());
    await missing.page.waitForFunction(() => document.getElementById('host').dataset.renderer === 'legacy');
    assert.equal(await missing.page.locator('#host').getAttribute('data-completed'), '4');
    await update(missing.page, { status: 'verifying', completed: 9 });
    assert.equal(await missing.page.locator('#host').getAttribute('data-phase'), 'verifying');
    assert.equal(await missing.page.locator('video').count(), 0);
    await missing.page.evaluate(() => window.scene.destroy());
    assert.equal(await missing.page.evaluate(() => window.__legacy.destroys), 1);
  } finally { await missing.context.close(); }
});

test('explicit rollback bypasses film assets; host aspect ratio controls portrait fill and safe containment', async () => {
  const legacy = await setup({ renderer: 'webgl' });
  try {
    assert.equal(await legacy.page.evaluate(() => window.__legacy.creates), 1);
    assert.equal(await legacy.page.locator('video,img').count(), 0);
    assert.deepEqual(legacy.requests, []);
  } finally { await legacy.context.close(); }
  const s = await setup({ reducedMotion: 'reduce', width: 1365, height: 768 });
  try {
    assert.equal(await s.page.locator('.lights-film-poster').evaluate(image => getComputedStyle(image).objectFit), 'contain');
    await s.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await s.page.locator('.lights-film-poster').evaluate(image => getComputedStyle(image).objectFit), 'cover');
    assert.equal(await s.page.locator('video').first().evaluate(video => getComputedStyle(video).objectFit), 'cover');
    // A narrow embedded host must use its own shape, not the phone's media query.
    await s.page.locator('#host').evaluate(host => { host.style.width = '200px'; host.style.height = '844px'; });
    assert.equal(await s.page.locator('.lights-film-poster').evaluate(image => getComputedStyle(image).objectFit), 'contain');
    assert.equal(await s.page.locator('video[src]').count(), 0);
    assert.equal(await s.page.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight), true);
    assert.deepEqual(s.errors, []);
  } finally { await s.context.close(); }
});

test('real H264 playback changes level without resetting the sixteen-second phase', async () => {
  const s = await setup({ realVideo: await fs.readFile(process.env.LW5_FILM_TEST_VIDEO || path.join(root, 'smart-home/blackhole-loop.mp4')) });
  try {
    await s.page.waitForFunction(() => document.getElementById('host').dataset.filmState === 'playing');
    await s.page.locator('video[src]').evaluate(video => { video.currentTime = 6; });
    await s.page.waitForFunction(() => { const video = document.querySelector('video[src]'); return !video.seeking && video.currentTime >= 6; });
    await update(s.page, { status: 'running', completed: 3 });
    await s.page.waitForFunction(() => document.getElementById('host').dataset.filmLevel === '3');
    const time = await s.page.locator('video[src*="/level-03.mp4"]').evaluate(video => video.currentTime);
    assert(time > 6 && time < 8, 'New film retains the current phase: ' + time);
    const difference = await s.page.evaluate(() => {
      const old = document.querySelector('video[src*="/level-00.mp4"]');
      const current = document.querySelector('video[src*="/level-03.mp4"]');
      return old ? Math.abs(old.currentTime - current.currentTime) : 0;
    });
    assert(difference < .25, 'Both transition films remain in phase: ' + difference);
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'), '3');
    assert.deepEqual(s.errors, []);
  } finally { await s.context.close(); }
});

test('the public preview plays and simulates nine levels without device requests', async () => {
  const video = await fs.readFile(process.env.LW5_FILM_TEST_VIDEO || path.join(root, 'smart-home/blackhole-loop.mp4'));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = [], requests = [];
  const allowed = new Set(['smart-home/lights-preview.html', 'shared/lights-on-universe.js', 'shared/lights-on-universe.css', 'shared/lights-on-film-manifest.js', 'shared/lights-on-film.js', 'shared/lights-on-film.css']);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push(url.href);
    assert.equal(request.method(), 'GET'); assert.equal(url.origin, 'https://preview.test');
    const relative = url.pathname.replace(/^\/lw5-wheel\//, '');
    if (/^assets\/lights-film\/v1\/level-0[0-9]\.jpg$/.test(relative)) return route.fulfill({ contentType: 'image/png', body: pixel });
    if (/^assets\/lights-film\/v1\/level-0[0-9]\.mp4$/.test(relative)) {
      const range = request.headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(video.length - 1, Number(range[2])) : video.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', body: video.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${video.length}` } : {}) } });
    }
    assert(allowed.has(relative), 'Preview cannot request a device endpoint: ' + relative);
    return route.fulfill({ contentType: relative.endsWith('.html') ? 'text/html' : relative.endsWith('.js') ? 'text/javascript' : 'text/css', body: await fs.readFile(path.join(root, relative)) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('https://preview.test/lw5-wheel/smart-home/lights-preview.html');
    await page.waitForFunction(() => document.getElementById('universe').dataset.filmState === 'playing');
    assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
    assert.equal(await page.locator('#universe').getAttribute('data-renderer'), 'film');
    assert.equal(await page.locator('canvas').count(), 0);
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getElementById('count').textContent === '01');
    await page.evaluate(() => window.blackholePreview.setProgress(8));
    await page.waitForFunction(() => document.getElementById('universe').dataset.filmLevel === '8');
    assert.equal(await page.locator('#count').textContent(), '08');
    assert.equal(await page.locator('a', { hasText: '星空 ESO/S. Brunier' }).getAttribute('href'), 'https://www.eso.org/public/images/eso0932a/');
    for (const viewport of [{ width: 390, height: 844 }, { width: 1365, height: 768 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.locator('.lights-film-video').first().evaluate(video => getComputedStyle(video).objectFit), viewport.width === 390 ? 'cover' : 'contain');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight), true);
      if (process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `film-preview-${viewport.width}.png`) });
      }
    }
    assert(requests.some(url => new URL(url).pathname.endsWith('/level-08.mp4')));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

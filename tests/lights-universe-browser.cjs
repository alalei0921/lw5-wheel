// Visual engine tests only. Every browser request is intercepted; no home devices.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser, script, style;
test.before(async () => {
  [script, style] = await Promise.all([
    fs.readFile(path.join(root, 'shared/lights-on-universe.js'), 'utf8'),
    fs.readFile(path.join(root, 'shared/lights-on-universe.css'), 'utf8'),
  ]);
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
test.after(async () => browser?.close());

async function scene({ width = 390, height = 844, reducedMotion = 'no-preference', dialog = false, blockWebGL = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
  const requests = [], errors = [];
  await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#08090e;color:#ddbb7d}main{min-height:100vh}main[hidden]{display:none}#host{width:100vw;height:100vh;aspect-ratio:auto}dialog{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#08090e}</style>' + (dialog ? '<dialog id="modal">' : '') + '<main id="wrapper"><div id="host"></div></main>' + (dialog ? '</dialog>' : ''));
  if (dialog) await page.evaluate(() => document.getElementById('modal').showModal());
  await page.evaluate(blockWebGL => {
    const nativeFrame = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.__frames = { pending, requested: 0, callbacks: 0 };
    window.requestAnimationFrame = callback => {
      window.__frames.requested += 1;
      const id = nativeFrame(time => { pending.delete(id); window.__frames.callbacks += 1; callback(time); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id); };
    window.__gpuDraws = 0;
    if (typeof WebGLRenderingContext === 'function') {
      const nativeDraw = WebGLRenderingContext.prototype.drawArrays;
      WebGLRenderingContext.prototype.drawArrays = function (...args) { window.__gpuDraws += 1; return nativeDraw.apply(this, args); };
    }
    if (blockWebGL) {
      const nativeContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /webgl/i.test(type) ? null : nativeContext.call(this, type, ...args);
      };
    }
  }, blockWebGL);
  await page.addStyleTag({ content: style });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => { window.scene = window.LW5LightsUniverse.create(document.getElementById('host')); });
  assert.equal(await page.locator('#host').getAttribute('data-renderer'), blockWebGL ? 'compatibility' : 'webgl');
  return { page, context, requests, errors };
}
async function update(page, value) { await page.evaluate(value => window.scene.update(value), value); }
async function frameCount(page) { return page.evaluate(() => ({ callbacks: window.__frames.callbacks, pending: window.__frames.pending.size })); }
async function expectStopped(page) {
  await page.waitForTimeout(160);
  const first = await frameCount(page);
  await page.waitForTimeout(160);
  assert.deepEqual(await frameCount(page), first, 'Hidden/static scenes must stop scheduling frames');
  assert.equal(first.pending, 0);
}
function clean(s) { assert.deepEqual(s.requests, []); assert.deepEqual(s.errors, []); }

test('only supplied confirmations advance the nine-light scene, including failure and a fresh attempt', async () => {
  const s = await scene();
  try {
    await update(s.page, { status: 'connecting', completed: 0, total: 9 });
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'connecting');
    await update(s.page, { status: 'running', completed: 3, currentIndex: 4, total: 9 });
    await s.page.waitForTimeout(1300);
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'), '3');
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'running');
    await update(s.page, { status: 'verifying', completed: 9, total: 9 });
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'verifying');
    await update(s.page, { status: 'failed', completed: 8, currentIndex: 4, total: 9 });
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'), '8');
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'failed');
    await update(s.page, { status: 'connecting', completed: 0, total: 9 });
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'), '0');
    await update(s.page, { status: 'succeeded', completed: 9, total: 9 });
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'), 'succeeded');
    assert.equal(await s.page.locator('#host canvas').getAttribute('aria-hidden'), 'true');
    clean(s);
  } finally { await s.context.close(); }
});

test('reduced motion stays static and responds to new confirmation snapshots without a render loop', async () => {
  const s = await scene({ reducedMotion: 'reduce' });
  try {
    await update(s.page, { status: 'running', completed: 2, currentIndex: 3 });
    await expectStopped(s.page);
    const before = await s.page.locator('#host canvas').evaluate(canvas => canvas.toDataURL());
    await update(s.page, { status: 'succeeded', completed: 9 });
    const after = await s.page.locator('#host canvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(before, after, 'Static mode still renders the confirmed completion');
    await expectStopped(s.page);
    await s.page.emulateMedia({ reducedMotion: 'no-preference' });
    await s.page.waitForTimeout(160);
    assert((await frameCount(s.page)).callbacks > 0);
    await s.page.emulateMedia({ reducedMotion: 'reduce' });
    await expectStopped(s.page);
    clean(s);
  } finally { await s.context.close(); }
});

test('hidden ancestors and a closed dialog suspend animation; destroy releases its canvas and callbacks', async () => {
  const s = await scene({ dialog: true });
  try {
    await update(s.page, { status: 'connecting', completed: 0 });
    await s.page.waitForTimeout(100);
    assert((await frameCount(s.page)).callbacks > 0);
    await s.page.evaluate(() => { document.getElementById('wrapper').hidden = true; });
    await expectStopped(s.page);
    const before = (await frameCount(s.page)).callbacks;
    await s.page.evaluate(() => { document.getElementById('wrapper').hidden = false; });
    await s.page.waitForTimeout(160);
    assert((await frameCount(s.page)).callbacks > before);
    await s.page.evaluate(() => document.getElementById('modal').close());
    await expectStopped(s.page);
    await s.page.evaluate(() => document.getElementById('modal').showModal());
    await s.page.waitForTimeout(160);
    const resumed = (await frameCount(s.page)).callbacks;
    assert(resumed > before);
    await s.page.evaluate(() => document.getElementById('modal').close());
    await expectStopped(s.page);
    await s.page.evaluate(() => { window.scene.destroy(); window.scene.update({ status: 'succeeded', completed: 9 }); });
    await expectStopped(s.page);
    assert.equal(await s.page.locator('#host canvas').count(), 0);
    clean(s);
  } finally { await s.context.close(); }
});

test('canvas fits small mobile and desktop layouts at capped resolution', async () => {
  for (const width of [320, 390, 1365]) {
    const s = await scene({ width, height: width === 320 ? 568 : 900 });
    try {
      for (const state of [
        { status: 'connecting', completed: 0 },
        { status: 'running', completed: 3, currentIndex: 4 },
        { status: 'failed', completed: 3, currentIndex: 4 },
        { status: 'succeeded', completed: 9 },
      ]) {
        await update(s.page, state);
        await s.page.waitForTimeout(state.status === 'succeeded' ? 900 : 300);
        const geometry = await s.page.evaluate(() => {
          const canvas = document.querySelector('#host canvas'), host = document.getElementById('host');
          const box = canvas.getBoundingClientRect();
          return { scroll: document.documentElement.scrollWidth, width: innerWidth, left: box.left, right: box.right, top:box.top, bottom:box.bottom, height:innerHeight, backingWidth: canvas.width, hostWidth: host.clientWidth };
        });
        assert(geometry.scroll <= geometry.width);
        assert(geometry.left >= 0 && geometry.right <= width);
        assert.equal(geometry.top,0); assert.equal(geometry.bottom,geometry.height);
        assert(geometry.backingWidth <= geometry.hostWidth * 2 + 2);
        if (process.env.SCREENSHOT_DIR) {
          await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
          await s.page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `universe-${state.status}-${width}.png`) });
        }
      }
      clean(s);
    } finally { await s.context.close(); }
  }
});

test('WebGL unavailable falls back without advancing or losing actual confirmations', async () => {
  const s = await scene({ blockWebGL: true, reducedMotion: 'reduce' });
  try {
    assert.equal(await s.page.locator('#host').getAttribute('data-renderer-reason'),'unavailable');
    await update(s.page,{status:'running',completed:4,currentIndex:5});
    await expectStopped(s.page);
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'),'4');
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'),'running');
    const running=await s.page.locator('#host canvas').evaluate(canvas=>canvas.toDataURL());
    await update(s.page,{status:'verifying',completed:9});
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'),'verifying');
    await update(s.page,{status:'failed',completed:8,currentIndex:5});
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'),'8');
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'),'failed');
    await update(s.page,{status:'succeeded',completed:9});
    const complete=await s.page.locator('#host canvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(running,complete);
    assert.equal(await s.page.evaluate(()=>window.__gpuDraws),0);
    await s.page.evaluate(()=>window.scene.destroy());
    await expectStopped(s.page);
    assert.equal(await s.page.locator('#host canvas').count(),0);
    clean(s);
  } finally {await s.context.close();}
});

test('lost GPU context uses compatibility rendering and recovers the same confirmed state', async () => {
  const s = await scene({reducedMotion:'reduce'});
  try {
    await update(s.page,{status:'running',completed:3,currentIndex:4});
    const supported=await s.page.evaluate(()=>{
      const canvas=document.querySelector('#host canvas[data-layer="space"]');
      window.__loss=canvas.getContext('webgl').getExtension('WEBGL_lose_context');
      return Boolean(window.__loss);
    });
    assert.equal(supported,true,'The SwiftShader test context must support deterministic context loss');
    await s.page.evaluate(()=>window.__loss.loseContext());
    await s.page.waitForFunction(()=>document.getElementById('host').dataset.renderer==='compatibility');
    const before=await s.page.evaluate(()=>window.__gpuDraws);
    await update(s.page,{status:'verifying',completed:9});
    await expectStopped(s.page);
    assert.equal(await s.page.evaluate(()=>window.__gpuDraws),before,'Lost GPU context must stop drawing');
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'),'9');
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'),'verifying');
    await s.page.evaluate(()=>window.__loss.restoreContext());
    await s.page.waitForFunction(()=>document.getElementById('host').dataset.renderer==='webgl');
    assert.equal(await s.page.locator('#host canvas').count(),1);
    assert.equal(await s.page.locator('#host').getAttribute('data-phase'),'verifying');
    assert.equal(await s.page.locator('#host').getAttribute('data-completed'),'9');
    assert((await s.page.evaluate(()=>window.__gpuDraws))>before);
    await expectStopped(s.page);
    await s.page.evaluate(()=>window.scene.destroy());
    await expectStopped(s.page);
    assert.equal(await s.page.locator('#host canvas').count(),0);
    clean(s);
  } finally {await s.context.close();}
});

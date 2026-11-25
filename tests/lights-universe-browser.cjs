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

async function scene({ width = 390, height = 844, deviceScaleFactor = 1, reducedMotion = 'no-preference', dialog = false, blockWebGL = false, timeline = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, reducedMotion, serviceWorkers: 'block' });
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
  await page.evaluate(timeline => { window.scene = window.LW5LightsUniverse.create(document.getElementById('host'), { timeline, renderer: 'webgl' }); }, timeline);
  assert.equal(await page.locator('#host').getAttribute('data-renderer'), blockWebGL ? 'compatibility' : 'webgl');
  return { page, context, requests, errors };
}
async function update(page, value) { await page.evaluate(value => window.scene.update(value), value); }
async function frameCount(page) { return page.evaluate(() => ({ callbacks: window.__frames.callbacks, pending: window.__frames.pending.size })); }
async function expectStopped(page) {
  // Media-query changes and intersection notifications are delivered on the
  // browser's rendering cycle, which can be delayed on a software GPU.
  await page.waitForFunction(() => window.__frames.pending.size === 0, null, { polling: 50, timeout: 4000 });
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

test('each confirmation makes the settled disk visibly brighter on both renderers', async () => {
  for (const blockWebGL of [false, true]) {
    const s = await scene({ width: 240, height: 400, reducedMotion: 'reduce', blockWebGL });
    try {
      let previous = -1;
      for (let completed = 0; completed <= 9; completed++) {
        await update(s.page, { status: 'running', completed });
        const brightness = await s.page.evaluate(() => {
          const canvas = document.querySelector('#host canvas');
          const sample = document.createElement('canvas');
          sample.width = 32;
          sample.height = 48;
          const ctx = sample.getContext('2d');
          ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
          const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            sum += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
          }
          return sum / (sample.width * sample.height);
        });
        assert(brightness > previous + .15, `Confirmation ${completed} should brighten the scene (${previous} → ${brightness})`);
        previous = brightness;
      }
      clean(s);
    } finally { await s.context.close(); }
  }
});

test('the upper shadow rim has fractional pixel coverage while the interior stays dark', async () => {
  const s = await scene({ width: 240, height: 400, reducedMotion: 'reduce' });
  try {
    await update(s.page, { status: 'succeeded', completed: 9 });
    const result = await s.page.evaluate(() => {
      const gl = document.querySelector('#host canvas').getContext('webgl');
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      // Geometry is measured in framebuffer pixels, with a top-left origin.
      // This upper arc is luminous outside the shadow and clear of near gas.
      const cx = .47 * width, cy = .38 * height, radius = Math.min(.38 * height / 2, .22 * width);
      function luminance(x, y) {
        const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
        const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
        // WebGL readPixels rows start at the bottom, unlike the scene geometry.
        const i = ((height - 1 - py) * width + px) * 4;
        return .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
      }
      const transitions = [], interior = [];
      for (let y = Math.floor(cy - radius - 1); y < cy - radius * .78; y++) {
        for (let x = Math.floor(cx - radius * .66); x < cx + radius * .26; x++) {
          const dx = x + .5 - cx, dy = y + .5 - cy, distance = Math.hypot(dx, dy);
          const nx = dx / distance, ny = dy / distance, signedDistance = distance - radius;
          // Pixel centres just inside the circle should contain part of the
          // bright exterior, rather than all being classified as opaque black.
          if (nx < -.65 || nx > .25 || signedDistance < -.40 || signedDistance > -.07) continue;
          const dark = luminance(x + .5 - nx * 2.5, y + .5 - ny * 2.5);
          const bright = Math.max(...[1.2, 2.2, 3.2].map(step =>
            luminance(x + .5 + nx * step, y + .5 + ny * step)));
          if (bright < 40) continue;
          interior.push(dark);
          transitions.push((luminance(x + .5, y + .5) - dark) / Math.max(1, bright - dark));
        }
      }
      const fractional = transitions.filter(value => value > .035 && value < .80);
      return {
        samples: transitions.length,
        fractional: fractional.length,
        coverageBands: [...new Set(fractional.map(value => Math.floor(value / .08)))].length,
        darkestInterior: Math.min(...interior), brightestInterior: Math.max(...interior),
        core: luminance(cx, cy - radius * .45),
      };
    });
    assert(result.samples >= 12, `Need a visible unoccluded arc: ${JSON.stringify(result)}`);
    assert(result.fractional >= Math.ceil(result.samples * .60),
      `The rim must contain fractional coverage, not a binary hard cut: ${JSON.stringify(result)}`);
    assert(result.coverageBands >= 3, `The edge must span several coverage levels: ${JSON.stringify(result)}`);
    assert(result.brightestInterior < 8 && result.core < 4,
      `Antialiasing must preserve the opaque dark interior: ${JSON.stringify(result)}`);
    clean(s);
  } finally { await s.context.close(); }
});

test('overlapping confirmations finish their own warm-up and repeated polls do not launch another wave', async () => {
  const s = await scene({ width: 240, height: 400 });
  try {
    const values = await s.page.evaluate(() => {
      const gl = document.querySelector('#host canvas').getContext('webgl');
      const program = gl.getParameter(gl.CURRENT_PROGRAM);
      const power = gl.getUniformLocation(program, 'uProgress');
      const start = performance.now();
      let elapsed = 0;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => start + elapsed });
      function read(ms, completed, status = 'running') {
        elapsed = ms;
        window.scene.update({ status, completed });
        return gl.getUniform(program, power) * 9;
      }
      try {
        return [read(0, 0, 'connecting'), read(100, 1), read(550, 1), read(550, 2),
          read(1000, 2), read(2000, 2), read(10000, 2), read(10000, 0, 'connecting')];
      } finally {
        delete performance.now;
      }
    });
    const expected = [0, 0, .5, .5, 1.5, 2, 2, 0];
    values.forEach((v, i) => assert(Math.abs(v - expected[i]) < .001, `Unexpected light at snapshot ${i}: ${v}`));
    clean(s);
  } finally { await s.context.close(); }
});

test('a paused preview renders the same cloud, grains and wave after a backward seek', async () => {
  for (const blockWebGL of [false, true]) {
    const s = await scene({ width: 180, height: 300, blockWebGL, timeline: true });
    try {
      const result = await s.page.evaluate(() => {
        const host = document.getElementById('host');
        const canvas = host.querySelector('canvas');
        window.scene.renderAt(4.55);
        const crest = canvas.toDataURL();
        window.scene.renderAt(4.55, 0);
        const unlit = canvas.toDataURL();
        window.scene.renderAt(12.3);
        window.scene.renderAt(4.55);
        return { lit: crest !== unlit, same: crest === canvas.toDataURL(), count: host.dataset.completed };
      });
      assert.deepEqual(result, { lit: true, same: true, count: '4' });
      await expectStopped(s.page);
      clean(s);
    } finally { await s.context.close(); }
  }
});

test('retina grains keep their native resolution while volume samples adapt and recover', async () => {
  const s = await scene({ width: 72, height: 96, deviceScaleFactor: 3, timeline: true });
  try {
    const result = await s.page.evaluate(() => {
      const gl = document.querySelector('#host canvas').getContext('webgl');
      const nativeDraw = gl.drawArrays.bind(gl);
      const start = performance.now();
      let calls = [], elapsed = 0, recordFrame = true;
      gl.drawArrays = (mode, first, count) => {
        // Only submit the frames measured below to the software GPU.
        if (!recordFrame) return;
        calls.push({ points: mode === gl.POINTS, width: gl.getParameter(gl.VIEWPORT)[2],
          offscreen: Boolean(gl.getParameter(gl.FRAMEBUFFER_BINDING)) });
        nativeDraw(mode, first, count);
      };
      Object.defineProperty(performance, 'now', { configurable: true, value: () => start + elapsed });
      try {
        for (let i = 0; i < 15; i++) {
          recordFrame = i === 14;
          elapsed += 88;
          window.scene.renderAt(5 + elapsed / 1000, 5, true);
        }
        const slow = calls;
        calls = [];
        for (let i = 0; i < 105; i++) {
          recordFrame = i === 104;
          elapsed += 40;
          window.scene.renderAt(5 + elapsed / 1000, 5, true);
        }
        return { slow, recovered: calls, width: gl.drawingBufferWidth, error: gl.getError() };
      } finally {
        delete performance.now;
        delete gl.drawArrays;
      }
    });
    assert.equal(result.width, 72 * 3);
    const [volume, resolve, grains] = result.slow;
    assert.equal(result.slow.length, 3);
    assert(volume.offscreen && volume.width < result.width);
    assert.deepEqual(resolve, { points: false, width: result.width, offscreen: false });
    assert.deepEqual(grains, { points: true, width: result.width, offscreen: false });
    assert.deepEqual(result.recovered, [
      { points: false, width: result.width, offscreen: false }, grains,
    ]);
    assert.equal(result.error, 0);
    clean(s);
  } finally { await s.context.close(); }
});

test('the camera loops while the confirmed lighting level stays fixed', async () => {
  const s = await scene({ width: 240, height: 400 });
  try {
    const result = await s.page.evaluate(() => {
      const gl = document.querySelector('#host canvas').getContext('webgl');
      const program = gl.getParameter(gl.CURRENT_PROGRAM);
      const progress = gl.getUniformLocation(program, 'uProgress');
      const start = performance.now();
      let elapsed = 0;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => start + elapsed });
      function snapshot(ms) {
        elapsed = ms;
        window.scene.update({ status: 'running', completed: 6 });
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const data = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return data;
      }
      function rgbDifference(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i += 4) {
          sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        }
        return sum / (a.length * .75);
      }
      try {
        window.scene.update({ status: 'running', completed: 6 });
        const first = snapshot(20000);
        const middle = snapshot(28000);
        const nextLap = snapshot(36000);
        return { loop: rgbDifference(first, nextLap), motion: rgbDifference(first, middle), level: gl.getUniform(program, progress) };
      } finally {
        delete performance.now;
      }
    });
    assert(result.loop < .1, 'The same point on successive laps should render the same scene');
    assert(result.motion > .8, 'The scene should move between these two frames');
    assert(Math.abs(result.level * 9 - 6) < .001);
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

test('WebGL unavailable falls back at native phone resolution and preserves confirmations', async () => {
  const s = await scene({ width: 240, height: 400, deviceScaleFactor: 3, blockWebGL: true, reducedMotion: 'reduce' });
  try {
    assert.equal(await s.page.locator('#host').getAttribute('data-renderer-reason'),'unavailable');
    assert.deepEqual(await s.page.locator('#host canvas').evaluate(canvas => [canvas.width, canvas.height]), [720, 1200]);
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
    // A restored program can draw using the noise texture for both samplers.
    // Verify the volumetric clouds regained their own texture after the reset.
    const distinctTextures = await s.page.locator('#host canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl');
      const program = gl.getParameter(gl.CURRENT_PROGRAM);
      const active = gl.getParameter(gl.ACTIVE_TEXTURE);
      const textures = ['uNoise', 'uCloudVolume'].map(name => {
        const unit = gl.getUniform(program, gl.getUniformLocation(program, name));
        gl.activeTexture(gl.TEXTURE0 + unit);
        return gl.getParameter(gl.TEXTURE_BINDING_2D);
      });
      gl.activeTexture(active);
      return textures.every(texture => gl.isTexture(texture)) && textures[0] !== textures[1];
    });
    assert(distinctTextures, 'Context restoration must rebind both volume and noise textures');
    await expectStopped(s.page);
    await s.page.evaluate(()=>window.scene.destroy());
    await expectStopped(s.page);
    assert.equal(await s.page.locator('#host canvas').count(),0);
    clean(s);
  } finally {await s.context.close();}
});

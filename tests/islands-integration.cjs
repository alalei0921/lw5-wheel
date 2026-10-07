#!/usr/bin/env node
'use strict';
// Targeted formal-shell integration checks, using synthetic storage only.
// --ui: root grants the sole GPU slot via LW5_INTEGRATION_GPU=approved.
// --update: independent loopback server; GPU/WebGL explicitly disabled.
// --plan: preparation only; does not import Playwright or launch a server/browser.
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const PLAN = [
  'Install request/device blockers before any home script; classify prevented home-baseline and new-island attempts separately.',
  'Seed old same-origin v57 IndexedDB and opaque localStorage in a fresh context; shell opens the internal same-origin island iframe.',
  'Dirty inner Home: Stay then Save. Host close: Discard. Browser Back: Stay without iframe reload, then Discard without path jump.',
  'Integrated Save/Cancel retains old dates, notes, subjects and unknown fields. About opens/closes without losing the draft.',
  'Only two integrated pixel captures: 390x844 and 1440x1000, with fixed upper scene and lower form.',
  'Separate disabled-GPU one-click-update simulation: old worker/cache sentinel to actual candidate worker; IDB and localStorage survive.'
];
// The repository's ordinary test glob must never launch a browser implicitly.
if (process.argv.includes('--plan') || !process.argv.some(arg => ['--ui', '--update', '--navigation', '--hosted'].includes(arg))) { console.log(JSON.stringify({ prepared: true, checks: PLAN }, null, 2)); process.exit(0); }
const update = process.argv.includes('--update');
const navigationOnly = process.argv.includes('--navigation');
const hosted = process.argv.includes('--hosted');
if (!update && !navigationOnly && process.env.LW5_INTEGRATION_GPU !== 'approved') throw Error('Wait for root to grant the sole GPU slot and freeze the shell/About implementation.');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.env.LW5_INTEGRATION_OUT || path.join(ROOT, '../evidence/formal-integration-ui'));
const DB = 'lw5-island-journal', KEY = 'state', STORE = 'journal';
const copy = v => structuredClone(v);
const ts = '2024-06-07T08:09:10.000Z';
const seed = { revision: 9, qaUnknownEnvelope: { retained: ['synthetic', null] }, records: [
  { id: 'qa-integrated-a', island: 'QA 贝壳集成岛 A', start: '2024-05-01', end: '2024-05-05', note: 'QA A 旅行原备注', createdAt: ts, updatedAt: ts, qaOpaque: { keep: 'A' }, subjects: [
    { id: 'qa-a-island', kind: 'island', name: '', ratings: [null, 3, 4.5, null, 5, 1, 2.5, null], note: 'QA A 海岛原备注' },
    { id: 'qa-old-hotel-id', kind: 'hotel', name: 'QA 集成酒店甲', ratings: [2.5, null, 3, 4, 4.5, 1.5, 3, .5], note: 'QA 酒店甲原备注', qaUnknownSubject: ['keep'] },
    { id: 'qa-old-hotel-id', kind: 'hotel', name: 'QA 集成酒店乙', ratings: [4.5, 3, null, 2.5, 4, .5, 1, null], note: 'QA 酒店乙原备注' }
  ] },
  { id: 'qa-integrated-b', island: 'QA 贝壳集成岛 B', start: '', end: '', note: 'QA B 旅行原备注', createdAt: ts, updatedAt: ts, qaOpaque: { keep: 'B' }, subjects: [
    { id: 'qa-b-island', kind: 'island', name: '', ratings: [5, null, 2.5, 4, null, 1, 2, 3], note: 'QA B 海岛原备注' },
    { kind: 'hotel', name: 'QA 缺ID酒店丙', ratings: [null, .5, 1, 1.5, 2, 2.5, 3, null], note: 'QA 酒店丙原备注' }
  ] }
] };
const localMarkers = { 'qa-lw5-integration-sentinel': 'synthetic-preserve-me', 'qa-lw5-opaque': JSON.stringify({ nested: ['unchanged', 3] }) };
const report = { mode: hosted ? 'hosted-read-only-smoke' : update ? 'one-click-update' : navigationOnly ? 'guarded-navigation-only' : 'formal-shell-ui', syntheticOnly: !hosted, isolatedFreshContext: true, checks: [], errors: [], baselineErrors: [], expectedWebGLErrors: [],
  blockedAttempts: { BASELINE_HOME: [], ISLAND_NEW: [] }, allowedOffOriginRequests: 0, snapshots: [], navigation: [], browserClosed: false };
const check = (name, detail) => report.checks.push({ name, pass: true, ...(detail ? { detail } : {}) });
const classify = address => String(address).includes('/islands/') ? 'ISLAND_NEW' : 'BASELINE_HOME';
function localURL(input) {
  const u = new URL(input);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || !['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/lw5-wheel/') throw Error('Use a loopback /lw5-wheel/ URL; public/real origins are forbidden.');
  return u;
}
async function waitUntil(page, predicate, message, milliseconds = 10000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { if (await predicate()) return; await page.waitForTimeout(60); }
  throw Error(message);
}
async function readStorage(page) {
  return page.evaluate(async ({ DB, STORE, KEY, markerKeys }) => {
    const db = await new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    try { const state = await new Promise((ok, no) => { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      return { state, markers: Object.fromEntries(markerKeys.map(key => [key, localStorage.getItem(key)])) }; } finally { db.close(); }
  }, { DB, STORE, KEY, markerKeys: Object.keys(localMarkers) });
}
async function installSafety(context, base) {
  await context.exposeBinding('__qaNetworkPrevented', (_, entry) => report.blockedAttempts[entry.scope].push(entry));
  await context.addInitScript(({ allowedOrigin }) => {
    window.__qaDocumentToken = crypto.randomUUID();
    const scope = () => location.pathname.includes('/islands/') ? 'ISLAND_NEW' : 'BASELINE_HOME';
    const address = value => { try { return new URL(value?.url || String(value), location.href); } catch { return null; } };
    const forbidden = value => { const u = address(value); return !u || (u.origin !== allowedOrigin && !['data:', 'blob:', 'about:'].includes(u.protocol)) || /\/api\//.test(u.pathname); };
    const log = (api, value) => { const u = address(value); void window.__qaNetworkPrevented({ scope: scope(), api, endpoint: u?.pathname || '(invalid)', originKind: u?.origin === allowedOrigin ? 'blocked-api-path' : 'off-origin', preventedBeforeNativeCall: true }); };
    const nativeFetch = window.fetch;
    window.fetch = function (resource, init) { if (forbidden(resource)) { log('fetch', resource); return Promise.reject(new TypeError('QA blocked off-origin/device fetch')); } return nativeFetch.call(this, resource, init); };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, resource, ...rest) { if (forbidden(resource)) { log('XMLHttpRequest', resource); throw new DOMException('QA blocked off-origin/device XHR', 'SecurityError'); } return open.call(this, method, resource, ...rest); };
    for (const name of ['WebSocket', 'EventSource']) {
      const Native = window[name]; if (!Native) continue;
      window[name] = class extends Native { constructor(resource, ...args) { const u = address(resource), httpOrigin = u && u.origin.replace(/^ws/, 'http'); if (!u || httpOrigin !== allowedOrigin || /\/api\//.test(u.pathname)) { log(name, resource); throw new DOMException('QA blocked off-origin/device channel', 'SecurityError'); } super(resource, ...args); } };
    }
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) navigator.sendBeacon = (resource, data) => { if (forbidden(resource)) { log('sendBeacon', resource); return false; } return beacon(resource, data); };
    const block = (owner, method, label) => { if (!owner || !(method in owner)) return; try { Object.defineProperty(owner, method, { configurable: true, value: () => { log('device:' + label, 'about:blank'); throw new DOMException('QA blocked device API', 'NotAllowedError'); } }); } catch {} };
    for (const method of ['getUserMedia', 'getDisplayMedia', 'enumerateDevices']) block(navigator.mediaDevices, method, method);
    for (const [key, method] of [['bluetooth', 'requestDevice'], ['usb', 'requestDevice'], ['serial', 'requestPort'], ['hid', 'requestDevice']]) block(navigator[key], method, key);
    for (const method of ['getCurrentPosition', 'watchPosition']) block(navigator.geolocation, method, method);
  }, { allowedOrigin: base.origin });
  await context.route('**/*', route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin === base.origin && u.pathname === '/__qa_integrated_seed__') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic integration seed</title>' });
    if (u.origin === base.origin && !/\/api\//.test(u.pathname) || ['data:', 'blob:', 'about:'].includes(u.protocol)) return route.continue();
    let source = ''; try { source = req.frame().url(); } catch {}
    report.blockedAttempts[classify(source)].push({ scope: classify(source), api: 'route:' + req.resourceType(), endpoint: u.pathname, originKind: 'off-origin-or-api', preventedBeforeNetwork: true });
    return route.abort('blockedbyclient');
  });
}
async function seedStorage(page, base) {
  await page.goto(base.origin + '/__qa_integrated_seed__');
  await page.evaluate(async ({ state, markers }) => {
    const db = await new Promise((ok, no) => { const r = indexedDB.open('lw5-island-journal', 1); r.onupgradeneeded = () => r.result.createObjectStore('journal'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    await new Promise((ok, no) => { const tx = db.transaction('journal', 'readwrite'); tx.objectStore('journal').add(state, 'state'); tx.oncomplete = ok; tx.onabort = () => no(tx.error); }); db.close();
    for (const [key, value] of Object.entries(markers)) localStorage.setItem(key, value);
  }, { state: seed, markers: localMarkers });
}
function collectErrors(page) {
  page.on('dialog', dialog => { report.navigation.push({ nativeDialog: dialog.type(), message: dialog.message() }); void dialog.dismiss(); });
  const collect = (kind, message, source = '') => {
    if ((update || navigationOnly) && /WebGL|webgl|GPU/.test(message)) report.expectedWebGLErrors.push({ kind, message });
    else if (classify(source) === 'BASELINE_HOME') report.baselineErrors.push({ kind, message });
    else report.errors.push({ kind, message });
  };
  page.on('console', entry => { if (entry.type() === 'error') collect('console', entry.text(), entry.location().url); });
  page.on('pageerror', error => collect('pageerror', error.message, error.stack));
}
async function islandFrame(page, base) {
  // Obtain the concrete Frame for assertions and evaluation.
  const handle = await page.locator('#toolFrame').elementHandle(), concrete = await handle.contentFrame();
  assert.ok(concrete, 'Tool iframe missing');
  await concrete.waitForFunction(allowFallback => window.LW5Journal?.getState().ready && (window.LW5Journal.getState().sceneReady || allowFallback && window.LW5Journal.getState().sceneFailed) && !window.LW5Journal.getState().busy, navigationOnly, { timeout: 30000 });
  assert.equal(new URL(concrete.url()).origin, base.origin); assert.equal(new URL(concrete.url()).pathname, '/lw5-wheel/islands/');
  return concrete;
}
async function openShell(page, base) {
  const before = await page.evaluate(() => history.length);
  await page.locator('#islandsOpen').tap();
  await page.locator('#toolOverlay.show').waitFor(); const frame = await islandFrame(page, base);
  assert.equal(new URL(page.url()).pathname, '/lw5-wheel/'); assert.equal(new URL(page.url()).hash, '#islands');
  assert.ok(await page.locator('#toolPanel').evaluate(el => el.classList.contains('islands-fullscreen')));
  const after = await page.evaluate(() => history.length); assert.ok(after <= before + 1, 'Opening shell added duplicate joint-history entries');
  return frame;
}
async function openRecord(frame, id, hotel) {
  await frame.locator('#trip-picker').selectOption(id);
  await frame.waitForFunction(id => window.LW5Journal.getState().recordId === id && !window.LW5Journal.getState().busy, id);
  if (hotel) {
    const key = await frame.locator('#subject-picker option').evaluateAll((options, name) => options.find(o => o.textContent === name)?.value, hotel);
    assert.ok(key); await frame.locator('#subject-picker').selectOption(key);
  }
}
async function closed(page, base) {
  await waitUntil(page, () => page.locator('#toolOverlay').evaluate(el => !el.classList.contains('show')), 'Shell did not close');
  await waitUntil(page, () => page.locator('#toolFrame').evaluate(el => el.contentWindow.location.href === 'about:blank'), 'Closed iframe was not unloaded');
  await waitUntil(page, async () => new URL(page.url()).hash === '', 'Shell hash did not return home');
  assert.equal(new URL(page.url()).pathname, base.pathname); assert.equal(new URL(page.url()).hash, '');
}
async function capture(page, file) { const name = path.join(OUT, file); await page.screenshot({ path: name }); report.snapshots.push(name); }
async function navigationSnapshot(page, label) {
  report.navigation.push(await page.evaluate(label => ({ label, href: location.href, length: history.length, historyState: history.state,
    iframe: (() => { const w = document.querySelector('#toolFrame')?.contentWindow; return { href: w?.location.href, journal: w?.LW5Journal?.getState(), choice: w?.document.querySelector('#journal-choice')?.open }; })() }), label));
}
async function navigationChecks(page, base) {
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  let frame = await openShell(page, base); await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店甲');
  await frame.locator('#subject-note').fill('QA Back guard synthetic draft');
  const token = await frame.evaluate(() => window.__qaDocumentToken);
  await frame.locator('.library-tools').evaluate(el => { el.open = true; });
  const historyBeforeAbout = await page.evaluate(() => history.length);
  await frame.locator('#journal-about-open').tap(); await frame.locator('#journal-about').waitFor({ state: 'visible' });
  const about = await (await frame.locator('#journal-about-frame').elementHandle()).contentFrame();
  await about.waitForURL('**/lw5-wheel/islands/about.html'); await about.locator('body').waitFor();
  await frame.locator('#journal-about-close').tap();
  assert.equal(await page.evaluate(() => history.length), historyBeforeAbout, 'About added a joint-history entry');
  assert.equal(await frame.evaluate(() => window.__qaDocumentToken), token);
  await navigationSnapshot(page, 'before-back'); await page.goBack(); await page.waitForTimeout(200); await navigationSnapshot(page, 'after-back');
  assert.equal(report.navigation.filter(item => item.nativeDialog).length, 0, 'Internal Back must show only the journal guard, not native beforeunload');
  await frame.locator('#choice-stay').tap();
  await waitUntil(page, async () => new URL(page.url()).hash === '#islands', 'Stay did not restore shell hash');
  assert.equal(await frame.evaluate(() => window.__qaDocumentToken), token); assert.equal(await frame.locator('#subject-note').inputValue(), 'QA Back guard synthetic draft');
  await frame.locator('#journal-about-open').tap(); await frame.locator('#journal-about').waitFor({ state: 'visible' });
  const reopenedAbout = await (await frame.locator('#journal-about-frame').elementHandle()).contentFrame();
  await reopenedAbout.waitForURL('**/lw5-wheel/islands/about.html');
  const credits = await reopenedAbout.locator('body').innerText();
  for (const creator of ['Alenzo', 'Violaine', 'DigitalLife3D', 'Optic_idealist']) assert.ok(credits.includes(creator), 'Reopened About missing ' + creator);
  await frame.locator('#journal-about-close').tap();
  assert.equal(await frame.evaluate(() => window.__qaDocumentToken), token); assert.equal(await frame.locator('#subject-note').inputValue(), 'QA Back guard synthetic draft');
  check('About adds no joint history; subsequent internal Back has only the journal guard and Stay preserves document/draft');
  const nativeBefore = report.navigation.filter(item => item.nativeDialog).length;
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  await waitUntil(page, async () => report.navigation.filter(item => item.nativeDialog === 'beforeunload').length > nativeBefore, 'Whole-page reload did not protect the dirty draft');
  assert.equal(await frame.evaluate(() => window.__qaDocumentToken), token); assert.equal(await frame.locator('#subject-note').inputValue(), 'QA Back guard synthetic draft');
  check('Whole-page reload still has native dirty-draft protection; dismiss preserves the draft');
  const afterReload = report.navigation.filter(item => item.nativeDialog).length;
  await page.goBack(); await frame.locator('#choice-discard').tap(); await closed(page, base);
  assert.equal(report.navigation.filter(item => item.nativeDialog).length, afterReload, 'Internal Back added an extra native dialog');
  for (let repeat = 0; repeat < 2; repeat++) {
    frame = await openShell(page, base); await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店甲');
    await frame.locator('#subject-note').fill('QA repeated close ' + repeat);
    await page.goBack(); await frame.locator('#choice-discard').tap(); await closed(page, base);
    assert.equal(report.navigation.filter(item => item.nativeDialog).length, afterReload, 'Reopened internal Back added a native dialog');
  }
  assert.deepEqual((await readStorage(page)).state, seed); assert.deepEqual((await readStorage(page)).markers, localMarkers);
  check('Internal Back Discard and two close/reopen cycles unload cleanly without native dialog or storage changes');
}
async function hostedChecks(page, base) {
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  const worker = await page.evaluate(() => fetch('sw.js', { cache: 'no-store' }).then(response => { if (!response.ok) throw Error('Worker source unavailable'); return response.text(); }));
  assert.match(worker, /lw5-home-v58-island-journal-3d/);
  const frame = await openShell(page, base), token = await frame.evaluate(() => window.__qaDocumentToken);
  assert.equal(await frame.evaluate(() => window.LW5Journal.getState().recordCount), 0, 'Hosted smoke must use empty isolated storage');
  check('Published v58 shell opens the same-origin island with sceneReady in an empty isolated context');
  await capture(page, 'qa-hosted-mobile-390.png');
  await frame.locator('.library-tools').evaluate(el => { el.open = true; }); await frame.locator('#journal-about-open').tap();
  const about = await (await frame.locator('#journal-about-frame').elementHandle()).contentFrame();
  await about.waitForURL('**/lw5-wheel/islands/about.html');
  assert.match(await about.locator('body').innerText(), /CC BY|Creative Commons/); assert.equal(new URL(about.url()).origin, base.origin);
  await frame.locator('#journal-about-close').tap(); assert.equal(await frame.evaluate(() => window.__qaDocumentToken), token);
  check('Published About/credits opens locally and closes to the same island document');
  await frame.locator('#journal-home').tap(); await closed(page, base);
  assert.equal(report.blockedAttempts.ISLAND_NEW.length, 0); assert.equal(report.navigation.filter(item => item.nativeDialog).length, 0);
  check('Read-only hosted island returns home without path jump, external/device attempt, or native leave prompt');
}

async function uiChecks(page, base) {
  await page.goto(base.href, { waitUntil: 'domcontentloaded' }); await page.locator('#islandsOpen').waitFor();
  let frame = await openShell(page, base); await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店甲');
  assert.equal(await frame.locator('#trip-start').inputValue(), '2024-05-01'); assert.equal(await frame.locator('#trip-end').inputValue(), '2024-05-05');
  assert.equal(await frame.locator('#subject-note').inputValue(), 'QA 酒店甲原备注'); assert.equal((await frame.locator('#value-scenery').textContent()).trim(), '2.5');
  assert.deepEqual((await readStorage(page)).state, seed); check('Shell opens one same-origin internal iframe with old v57 values and no history/path jump');
  await frame.locator('#rating-scenery .star-rating-track').scrollIntoViewIfNeeded(); await capture(page, 'qa-formal-mobile-390.png');

  await frame.locator('#subject-note').fill('QA 内页回家保存酒店甲'); await frame.locator('#journal-home').tap(); await frame.locator('#choice-stay').tap();
  assert.equal(await frame.locator('#subject-note').inputValue(), 'QA 内页回家保存酒店甲'); assert.equal(new URL(page.url()).hash, '#islands');
  await frame.locator('#journal-home').tap(); await frame.locator('#choice-save').tap(); await closed(page, base);
  let saved = (await readStorage(page)).state; assert.equal(saved.revision, 10); assert.equal(saved.records.find(r => r.id === 'qa-integrated-a').subjects[1].note, 'QA 内页回家保存酒店甲');
  assert.deepEqual(saved.records.find(r => r.id === 'qa-integrated-b'), seed.records[1]); check('Inner Home Stay preserves draft; Save commits once then unloads iframe on the same shell path');

  frame = await openShell(page, base); await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店乙'); await frame.locator('#subject-note').fill('QA 外壳关闭应放弃');
  // The integrated island intentionally hides the old outer topbar. Invoke its
  // actual button handler to test that host-side close requests remain guarded.
  await page.locator('#toolClose').evaluate(button => button.click()); await frame.locator('#choice-discard').tap(); await closed(page, base);
  assert.deepEqual((await readStorage(page)).state, saved); check('Host close handler requests Discard without saving the other hotel draft');

  frame = await openShell(page, base); await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店甲'); await frame.locator('#subject-note').fill('QA 浏览器返回应停留');
  const token = await frame.evaluate(() => window.__qaDocumentToken);
  await navigationSnapshot(page, 'before-back'); await page.goBack(); await page.waitForTimeout(300); await navigationSnapshot(page, 'after-back'); await frame.locator('#choice-stay').tap();
  assert.equal(await frame.evaluate(() => window.__qaDocumentToken), token); assert.equal(await frame.locator('#subject-note').inputValue(), 'QA 浏览器返回应停留'); assert.equal(new URL(page.url()).hash, '#islands');
  await page.goBack(); await frame.locator('#choice-discard').tap(); await closed(page, base);
  assert.deepEqual((await readStorage(page)).state, saved); check('Browser Back Stay keeps the same live iframe; subsequent Discard closes without duplicate history');

  frame = await openShell(page, base); await openRecord(frame, 'qa-integrated-b', 'QA 缺ID酒店丙');
  assert.equal(await frame.locator('#trip-start').inputValue(), ''); assert.equal(await frame.locator('#trip-end').inputValue(), '');
  await frame.locator('#trip-note').fill('QA 集成取消备注'); await frame.locator('#journal-cancel').tap(); await frame.locator('#choice-discard').tap();
  assert.deepEqual((await readStorage(page)).state, saved); assert.equal(new URL(page.url()).hash, '#islands');
  await openRecord(frame, 'qa-integrated-b', 'QA 缺ID酒店丙'); await frame.locator('#trip-note').fill('QA 集成确认保存备注'); await frame.locator('#journal-save').tap();
  await waitUntil(page, async () => (await readStorage(page)).state.revision === 11, 'Integrated explicit save failed');
  saved = (await readStorage(page)).state; const beta = saved.records.find(r => r.id === 'qa-integrated-b');
  assert.equal(beta.note, 'QA 集成确认保存备注'); assert.deepEqual(beta.subjects, seed.records[1].subjects); assert.equal(beta.start, ''); assert.equal(beta.end, ''); assert.deepEqual(saved.qaUnknownEnvelope, seed.qaUnknownEnvelope);
  check('Integrated Save/Cancel keeps old dates, multiple subjects, missing IDs, scores and opaque fields');

  await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店甲'); await frame.locator('#subject-note').fill('QA About期间暂存草稿');
  await frame.locator('.library-tools').evaluate(el => { el.open = true; }); await frame.locator('#journal-about-open').tap(); await frame.locator('#journal-about').waitFor({ state: 'visible' });
  const aboutHandle = await frame.locator('#journal-about-frame').elementHandle(), about = await aboutHandle.contentFrame();
  await about.waitForLoadState('domcontentloaded'); assert.equal(new URL(about.url()).origin, base.origin); assert.equal(new URL(about.url()).pathname, '/lw5-wheel/islands/about.html');
  assert.match(await about.locator('body').innerText(), /CC BY|Creative Commons/); assert.ok(await about.locator('a[href^="https://"]').count() >= 4);
  const aboutToken = await frame.evaluate(() => window.__qaDocumentToken); await frame.locator('#journal-about-close').tap();
  assert.equal(await frame.evaluate(() => window.__qaDocumentToken), aboutToken); assert.equal(await frame.locator('#subject-note').inputValue(), 'QA About期间暂存草稿'); assert.deepEqual((await readStorage(page)).state, saved);
  check('About and full credits are reachable internally; closing returns to unchanged draft');
  await frame.locator('#journal-cancel').tap(); await frame.locator('#choice-discard').tap(); await openRecord(frame, 'qa-integrated-a', 'QA 集成酒店甲');
  await page.setViewportSize({ width: 1440, height: 1000 }); await frame.locator('#rating-scenery .star-rating-track').scrollIntoViewIfNeeded();
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = await page.locator('#toolFrame').boundingBox(); assert.ok(bounds.width >= 1438 && bounds.height >= 998, 'Desktop island iframe does not fill the shell');
  assert.ok(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await capture(page, 'qa-formal-desktop-1440.png');
  check('390x844 and desktop integrated shell have actual pixel captures without horizontal clipping');
  await frame.locator('#journal-home').click(); await closed(page, base);
  assert.deepEqual((await readStorage(page)).markers, localMarkers); assert.equal(report.blockedAttempts.ISLAND_NEW.length, 0);
  check('All island interactions remain local; no new off-origin/device attempt, and localStorage markers survive');
}

async function updateServer() {
  let serveNew = false;
  const source = await fs.readFile(path.join(ROOT, 'sw.js'), 'utf8'), expected = source.match(/const CACHE\s*=\s*['"]([^'"]+)/)?.[1];
  assert.ok(expected && expected.startsWith('lw5-home-')); assert.ok(!/https?:\/\//.test(source.match(/const ASSETS\s*=\s*\[([\s\S]*?)\]/)?.[1] || ''), 'External precache URL is forbidden in isolated QA');
  const old = 'lw5-home-qa-previous-version';
  const sentinel = `const CACHE=${JSON.stringify(old)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));`;
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (!u.pathname.startsWith('/lw5-wheel/') || /\/api\//.test(u.pathname) || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    if (u.pathname === '/lw5-wheel/sw.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(serveNew ? source : sentinel); return; }
    let name; try { name = decodeURIComponent(u.pathname.slice('/lw5-wheel/'.length)); } catch { res.writeHead(400); res.end(); return; }
    const file = path.resolve(ROOT, name.endsWith('/') ? name + 'index.html' : name || 'index.html');
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404); res.end(); return; }
    try { const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base: localURL(`http://127.0.0.1:${server.address().port}/lw5-wheel/`), expected, old, advance: () => { serveNew = true; } };
}
async function updateChecks(page, setup) {
  const { base, old, expected } = setup;
  await page.goto(base.href, { waitUntil: 'load' });
  await page.waitForFunction(async old => Boolean(navigator.serviceWorker.controller) && (await caches.keys()).includes(old), old, { timeout: 30000 });
  const before = await readStorage(page); assert.deepEqual(before.state, seed); assert.deepEqual(before.markers, localMarkers);
  setup.advance(); await Promise.all([page.waitForURL(u => u.pathname === '/lw5-wheel/' && u.searchParams.has('v')), page.locator('#updateBtn').click()]);
  await page.waitForFunction(async expected => Boolean(navigator.serviceWorker.controller) && (await caches.keys()).includes(expected), expected, { timeout: 45000 });
  const after = await readStorage(page); assert.deepEqual(after, before);
  const cacheNames = await page.evaluate(() => caches.keys()); assert.ok(!cacheNames.includes(old)); assert.ok(cacheNames.includes(expected));
  report.worker = { simulatedPriorCache: old, actualCandidateCache: expected, cachesAfter: cacheNames };
  check('One-click update replaces the simulated previous SW/cache with the actual candidate version');
  check('Same-origin IndexedDB and opaque localStorage are byte-equivalent across the update');
  assert.equal(new URL(page.url()).origin, base.origin); assert.equal(new URL(page.url()).pathname, '/lw5-wheel/');
  check('Update stays on /lw5-wheel/ and never navigates to device or external endpoints');
}

(async () => {
  let setup, browser, context;
  await fs.mkdir(OUT, { recursive: true });
  try {
    setup = update ? await updateServer() : null;
    const base = hosted ? new URL('https://alalei0921.github.io/lw5-wheel/') : setup?.base || localURL(process.env.LW5_INTEGRATION_URL || 'http://127.0.0.1:8767/lw5-wheel/'); report.target = base.href;
    browser = await chromium.launch({ headless: true, args: update || navigationOnly ? ['--disable-gpu', '--disable-webgl', '--disable-webgl2'] : ['--use-angle=metal', '--enable-webgl'] });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: update ? 'allow' : 'block' });
    await installSafety(context, base); const page = await context.newPage(); collectErrors(page); if (!hosted) await seedStorage(page, base);
    if (hosted) await hostedChecks(page, base); else if (update) await updateChecks(page, setup); else if (navigationOnly) await navigationChecks(page, base); else await uiChecks(page, base);
  } catch (e) { report.errors.push({ kind: 'test', message: e.stack || e.message }); }
  finally {
    if (context) await context.close().catch(() => {}); if (browser) { await browser.close(); report.browserClosed = true; }
    if (setup) await new Promise(resolve => setup.server.close(resolve));
    report.passed = report.errors.length === 0 && report.checks.length === (update || navigationOnly || hosted ? 3 : 8) && report.blockedAttempts.ISLAND_NEW.length === 0 && report.browserClosed;
    const destination = path.join(OUT, hosted ? 'hosted-results.json' : update ? 'update-results.json' : navigationOnly ? 'navigation-results.json' : 'integrated-ui-results.json'); await fs.writeFile(destination, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks, errors: report.errors, blockedCounts: Object.fromEntries(Object.entries(report.blockedAttempts).map(([k, v]) => [k, v.length])), browserClosed: report.browserClosed, report: destination }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
})();

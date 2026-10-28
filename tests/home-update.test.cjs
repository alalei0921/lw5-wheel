const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
// Execute the real page handler, without evaluating the home's device code.
const handlers = [...html.matchAll(/\(function\(\)\s*\{\s*const btn = document\.getElementById\('updateBtn'\);[\s\S]*?\n\s*\}\)\(\);/g)];
assert.equal(handlers.length, 1, 'Expected exactly one one-click-update handler');
const handlerSource = handlers[0][0];
const now = Date.parse('2026-10-12T14:16:04Z');

function setup({ online = true, href = 'https://example.test/lw5-wheel/index.html?lang=zh&v=old#home', fetchCheck = async () => ({ ok: true }) } = {}) {
  const calls = { checks: [], notifications: [], unregister: [], cacheDeletes: [], storage: [], navigations: [], registrationReads: 0, cacheReads: 0, forbiddenNetwork: [] };
  const scope = new URL('./', href).href;
  const registrations = [scope, 'https://example.test/another-app/', scope + 'nested/'].map(registrationScope => ({
    scope: registrationScope,
    unregister: async () => { calls.unregister.push(registrationScope); return true; },
  }));
  const cacheNames = ['lw5-home-v58-island-journal-3d', 'lw5-home-v59-light-7of9', 'another-app-v1', 'other-lw5-home-cache'];
  const caches = {
    keys: async () => { calls.cacheReads += 1; return [...cacheNames]; },
    delete: async name => { calls.cacheDeletes.push(name); cacheNames.splice(cacheNames.indexOf(name), 1); return true; },
  };
  let currentHref = href;
  const location = {
    get href() { return currentHref; },
    set href(value) { calls.navigations.push(value); currentHref = value; },
  };
  let click;
  const button = {
    disabled: false,
    textContent: '🧁 一键更新',
    addEventListener(type, listener) { assert.equal(type, 'click'); assert.equal(click, undefined); click = listener; },
  };
  const failNetwork = (...args) => { calls.forbiddenNetwork.push(args); throw new Error('Unmocked network is forbidden'); };
  const window = {
    caches,
    LW5UI: {
      fetch: async (url, options) => { calls.checks.push({ url, options }); return fetchCheck(url, options); },
      notify: message => calls.notifications.push(message),
    },
    fetch: failNetwork,
  };
  const globals = {
    window, caches, location, URL,
    navigator: { onLine: online, serviceWorker: { getRegistrations: async () => { calls.registrationReads += 1; return registrations; } } },
    document: { getElementById: id => { assert.equal(id, 'updateBtn'); return button; } },
    Date: class extends Date { static now() { return now; } },
    fetch: failNetwork,
    XMLHttpRequest: failNetwork,
    WebSocket: failNetwork,
  };
  // Any storage access is a failure, including optional chaining/property reads.
  for (const target of [window, globals]) {
    for (const key of ['indexedDB', 'localStorage', 'sessionStorage']) {
      Object.defineProperty(target, key, { get() { calls.storage.push(key); throw new Error('Update must not access ' + key); } });
    }
  }
  vm.runInNewContext(handlerSource, globals, { filename: 'index.html:update-handler', timeout: 1000 });
  assert.equal(typeof click, 'function');
  return { calls, button, click, location, scope, cacheNames };
}

function assertNoStorageOrNetwork(s) {
  assert.deepEqual(s.calls.storage, []);
  assert.deepEqual(s.calls.forbiddenNetwork, []);
}

function assertNoCleanupOrNavigation(s) {
  assert.equal(s.calls.registrationReads, 0);
  assert.equal(s.calls.cacheReads, 0);
  assert.deepEqual(s.calls.unregister, []);
  assert.deepEqual(s.calls.cacheDeletes, []);
  assert.deepEqual(s.calls.navigations, []);
  assertNoStorageOrNetwork(s);
}

test('successful update removes only the exact-scope worker and LW5 caches, preserving data and URL context', async () => {
  const s = setup();
  await s.click();
  assert.equal(s.calls.checks.length, 1);
  assert.equal(s.calls.checks[0].url, './sw.js?check=' + now);
  assert.equal(s.calls.checks[0].options.cache, 'no-store');
  assert.equal(s.calls.checks[0].options.timeoutMs, 10000);
  assert.equal(s.calls.registrationReads, 1);
  assert.deepEqual(s.calls.unregister, [s.scope]);
  assert.equal(s.calls.cacheReads, 1);
  assert.deepEqual(s.calls.cacheDeletes, ['lw5-home-v58-island-journal-3d', 'lw5-home-v59-light-7of9']);
  assert.deepEqual(s.cacheNames, ['another-app-v1', 'other-lw5-home-cache']);
  assert.deepEqual(s.calls.notifications, []);
  assert.deepEqual(s.calls.navigations, ['https://example.test/lw5-wheel/index.html?lang=zh&v=' + now + '#home']);
  assert.equal(s.button.disabled, true, 'Keep the button locked until navigation replaces this document');
  assertNoStorageOrNetwork(s);
});

test('successful update preserves a directory URL and adds one version parameter', async () => {
  const s = setup({ href: 'https://example.test/lw5-wheel/?from=test#sun' });
  await s.click();
  const next = new URL(s.location.href);
  assert.equal(next.origin, 'https://example.test');
  assert.equal(next.pathname, '/lw5-wheel/');
  assert.equal(next.searchParams.get('from'), 'test');
  assert.deepEqual(next.searchParams.getAll('v'), [String(now)]);
  assert.equal(next.hash, '#sun');
  assert.deepEqual(s.calls.unregister, ['https://example.test/lw5-wheel/']);
  assertNoStorageOrNetwork(s);
});

test('rapid repeated clicks share the first pending update and cannot issue duplicate cleanup or navigation', async () => {
  let resolveCheck;
  const pending = new Promise(resolve => { resolveCheck = resolve; });
  const s = setup({ fetchCheck: () => pending });
  const first = s.click();
  assert.equal(s.button.disabled, true);
  assert.equal(s.button.textContent, '🍬 更新中...');
  await s.click();
  await s.click();
  assert.equal(s.calls.checks.length, 1);
  assertNoCleanupOrNavigation(s);
  resolveCheck({ ok: true });
  await first;
  assert.equal(s.calls.registrationReads, 1);
  assert.equal(s.calls.cacheReads, 1);
  assert.equal(s.calls.navigations.length, 1);
  assertNoStorageOrNetwork(s);
});

test('offline update does not fetch, clear caches, unregister workers, or navigate', async () => {
  const s = setup({ online: false });
  await s.click();
  assert.deepEqual(s.calls.checks, []);
  assert.equal(s.button.disabled, false);
  assert.equal(s.button.textContent, '🧁 一键更新');
  assert.equal(s.calls.notifications.length, 1);
  assert.match(s.calls.notifications[0], /离线/);
  assertNoCleanupOrNavigation(s);
});

test('a rejected worker check leaves caches, workers, and data intact and allows retry', async () => {
  let fail = true;
  const s = setup({ fetchCheck: async () => { if (fail) throw new Error('Synthetic unavailable network'); return { ok: true }; } });
  await s.click();
  assert.equal(s.calls.checks.length, 1);
  assert.equal(s.button.disabled, false);
  assert.equal(s.button.textContent, '🧁 一键更新');
  assert.equal(s.calls.notifications.length, 1);
  assert.match(s.calls.notifications[0], /更新失败/);
  assertNoCleanupOrNavigation(s);
  fail = false;
  await s.click();
  assert.equal(s.calls.checks.length, 2);
  assert.equal(s.calls.navigations.length, 1);
  assertNoStorageOrNetwork(s);
});

test('an HTTP error in the worker check also prevents destructive cleanup and navigation', async () => {
  const s = setup({ fetchCheck: async () => ({ ok: false, status: 503 }) });
  await s.click();
  assert.equal(s.calls.checks.length, 1);
  assert.equal(s.button.disabled, false);
  assert.equal(s.button.textContent, '🧁 一键更新');
  assert.equal(s.calls.notifications.length, 1);
  assertNoCleanupOrNavigation(s);
});

test('the visible fallback link and scripted local handoff target the same 7/9 release', () => {
  const tag = html.match(/<a\b[^>]*\bid=["']nebulaHint["'][^>]*>/)?.[0];
  assert.ok(tag, 'Local fallback link must exist');
  const href = tag.match(/\bhref=["']([^"']+)["']/)?.[1]?.replaceAll('&amp;', '&');
  assert.ok(href, 'Local fallback link must have a destination');
  const constants = html.match(/const LOCAL_ORIGIN\s*=\s*['"][^'"]+['"];\s*const LOCAL_CONTROL_URL\s*=\s*LOCAL_ORIGIN\s*\+\s*['"][^'"]+['"];/)?.[0];
  assert.ok(constants, 'The runtime handoff constants must exist');
  const runtimeUrl = vm.runInNewContext(constants + '\nLOCAL_CONTROL_URL', {}, { timeout: 1000 });
  assert.equal(href, runtimeUrl);
  const destination = new URL(runtimeUrl);
  assert.equal(destination.pathname, '/sun-mode');
  assert.equal(destination.searchParams.get('from'), 'home');
  assert.equal(destination.searchParams.get('ui'), '7of9-v59');
  assert.match(worker, /const CACHE\s*=\s*['"]lw5-home-v62-supplement-notes['"]/);
});

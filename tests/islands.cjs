'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://127.0.0.1:18758'; // Every request is fulfilled in memory; no listener is needed.
const BACKUP_KEY = 'pre-3d-v1-backup';
const timestamp = '2024-05-06T07:08:09.000Z';
const seed = {
  revision: 7,
  legacyEnvelope: { synthetic: true, keep: [null, 'opaque'] },
  records: [{
    id: 'synthetic-legacy-trip', island: '测试海岛', start: '2024-05-01', end: '2024-05-05',
    note: '旧旅行备注', createdAt: timestamp, updatedAt: timestamp,
    legacyField: { unchanged: true },
    subjects: [
      { kind: 'island', name: '', ratings: [null, 3, 4.5, null, 5, 1, 2.5, null], note: '旧海岛备注' },
      { id: 'legacy-shared-id', kind: 'hotel', name: '测试酒店一', ratings: [2, null, 3, 4, 5, .5, 1, 2], note: '旧酒店备注一' },
      { id: 'legacy-shared-id', kind: 'hotel', name: '测试酒店二', ratings: [4, 2, null, 3, 1, 5, 2, .5], note: '旧酒店备注二' }
    ]
  }, {
    id: 'synthetic-unrelated-trip', island: '另一座测试岛', start: '', end: '', note: '不应改变',
    createdAt: timestamp, updatedAt: timestamp,
    subjects: [{ id: 'unrelated-subject', kind: 'island', name: '', ratings: Array(8).fill(null), note: '' }]
  }]
};

async function readDatabase(page) {
  return page.evaluate(async backupKey => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('lw5-island-journal', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('journal', 'readonly'), store = tx.objectStore('journal'), result = {};
        for (const [name, key] of [['state', 'state'], ['backup', backupKey]]) {
          const request = store.get(key); request.onsuccess = () => { result[name] = request.result; };
        }
        tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, BACKUP_KEY);
}

async function openLegacy(page) {
  await page.locator('#trip-picker').selectOption(seed.records[0].id);
  await page.waitForFunction(id => window.LW5Journal.getState().recordId === id && !window.LW5Journal.getState().busy, seed.records[0].id);
}

// Data regression deliberately exercises the real WebGL failure path. The visual
// scene and touch gestures have their own GPU checks; this suite needs no GPU.
test('v58 journal preserves v57 records and explicit save boundaries', { timeout: 60000 }, async t => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl'] });
  const externalRequests = [], pageErrors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) { externalRequests.push(url.origin + url.pathname); return route.abort('blockedbyclient'); }
      if (url.pathname === '/__seed__') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic journal test</title>' });
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(ROOT, relative.endsWith('/') ? relative + 'index.html' : relative);
      if (!file.startsWith(ROOT + path.sep)) return route.fulfill({ status: 403, body: '' });
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary' };
      try { await route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: await fs.readFile(file) }); }
      catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await context.addInitScript(() => {
      window.__journalTransactions = [];
      const txEntries = new WeakMap(), originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = originalTransaction.apply(this, args);
        if (this.name === 'lw5-island-journal' && tx.mode === 'readwrite') {
          const entry = { writes: [], result: 'pending' }; txEntries.set(tx, entry); window.__journalTransactions.push(entry);
          tx.addEventListener('complete', () => { entry.result = 'complete'; });
          tx.addEventListener('abort', () => { entry.result = 'abort'; });
        }
        return tx;
      };
      for (const method of ['add', 'put']) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (value, key) {
          txEntries.get(this.transaction)?.writes.push({ method, key });
          return original.apply(this, arguments);
        };
      }
    });
    const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(ORIGIN + '/__seed__');
    await page.evaluate(async state => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('lw5-island-journal', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('journal');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try { await new Promise((resolve, reject) => {
        const tx = db.transaction('journal', 'readwrite'); tx.objectStore('journal').put(state, 'state');
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      }); } finally { db.close(); }
    }, seed);
    await page.goto(ORIGIN + '/islands/');
    await page.waitForFunction(() => window.LW5Journal?.getState().ready && window.LW5Journal.getState().sceneFailed);

    await t.test('legacy read is unchanged; WebGL fallback keeps notes editable and scores read-only', async () => {
      assert.deepEqual(await readDatabase(page), { state: seed, backup: undefined });
      await openLegacy(page);
      assert.equal(await page.locator('#trip-island').inputValue(), seed.records[0].island);
      assert.equal(await page.locator('#subject-picker option').count(), 3);
      assert.match(await page.locator('#scene-state').innerText(), /文字记录仍可编辑并保存/);
      assert.equal(await page.locator('#value-scenery').innerText(), '未评');
      assert.equal(await page.locator('#value-transport').innerText(), '3');
      assert.equal(await page.locator('#rating-scenery').getAttribute('aria-disabled'), 'true');
      assert.equal(await page.locator('#subject-note').isEditable(), true);
      assert.deepEqual(await page.evaluate(() => window.__journalTransactions), []);
    });

    await t.test('only explicit save commits; first backup and state share one transaction', async () => {
      await page.locator('#subject-note').fill('已确认的测试海岛备注');
      await page.locator('#trip-note').fill('已确认的测试旅行备注');
      assert.deepEqual(await readDatabase(page), { state: seed, backup: undefined });
      await page.locator('#journal-save').click();
      await page.waitForFunction(() => !window.LW5Journal.getState().recordId && !window.LW5Journal.getState().busy);
      const result = await readDatabase(page), saved = result.state.records.find(record => record.id === seed.records[0].id);
      assert.deepEqual(result.backup, seed);
      assert.equal(result.state.revision, seed.revision + 1);
      assert.deepEqual(result.state.legacyEnvelope, seed.legacyEnvelope);
      assert.deepEqual(result.state.records.find(record => record.id === seed.records[1].id), seed.records[1]);
      assert.deepEqual(saved, { ...seed.records[0], note: '已确认的测试旅行备注', updatedAt: saved.updatedAt,
        subjects: seed.records[0].subjects.map((subject, index) => index ? subject : { ...subject, note: '已确认的测试海岛备注' }) });
      assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
      const transactions = await page.evaluate(() => window.__journalTransactions);
      assert.equal(transactions.length, 1);
      assert.deepEqual(transactions[0], { result: 'complete', writes: [{ method: 'add', key: BACKUP_KEY }, { method: 'put', key: 'state' }] });
    });

    await t.test('cancel discards draft without changing persisted state or backup', async () => {
      const before = await readDatabase(page);
      await openLegacy(page); await page.locator('#trip-island').fill('取消的测试名称');
      await page.locator('#journal-cancel').click(); await page.locator('#choice-discard').click();
      await page.waitForFunction(() => window.LW5Journal.getState().recordId === null);
      assert.deepEqual(await readDatabase(page), before);
    });

    await t.test('store keeps zero distinct from null and round-trips v1/v2 backups', async () => {
      const result = await page.evaluate(async legacyRecords => {
        const store = await import('./journal-store.js'), state = await store.read();
        const record = state.records.find(item => item.id === legacyRecords[0].id);
        record.subjects[0].ratings[0] = 0; record.subjects[0].ratings[1] = null;
        const revision = await store.write(state.revision, state.records);
        const current = await store.read(), exported = store.exportBackup(current.records);
        let invalidDateRejected = false;
        try { store.parseBackup(JSON.stringify({ ...exported, records: [{ ...record, start: '2026-02-31' }] })); }
        catch { invalidDateRejected = true; }
        return { revision, current, exported, reparsed: store.parseBackup(JSON.stringify(exported)),
          legacy: store.parseBackup(JSON.stringify({ format: 'lw5-island-journal', version: 1, records: legacyRecords })), invalidDateRejected };
      }, seed.records);
      assert.equal(result.revision, seed.revision + 2);
      assert.equal(result.exported.version, 2);
      assert.deepEqual(result.reparsed, result.current.records);
      assert.deepEqual(result.legacy, seed.records);
      assert.deepEqual(result.current.records.find(record => record.id === seed.records[0].id).subjects[0].ratings.slice(0, 2), [0, null]);
      assert.equal(result.invalidDateRejected, true);
      assert.deepEqual((await readDatabase(page)).backup, seed);
    });

    await t.test('another tab wins revision check; stale UI draft cannot overwrite it', async () => {
      await openLegacy(page); await page.locator('#trip-note').fill('不应覆盖另一窗口的草稿');
      assert.equal(await page.locator('#value-scenery').innerText(), '0');
      assert.equal(await page.locator('#value-transport').innerText(), '未评');
      const other = await context.newPage();
      try {
        await other.goto(ORIGIN + '/__seed__');
        await other.evaluate(async recordId => {
          const store = await import('/islands/journal-store.js'), state = await store.read();
          state.records.find(record => record.id === recordId).note = '来自另一窗口的已保存备注';
          await store.write(state.revision, state.records);
        }, seed.records[0].id);
      } finally { await other.close(); }
      const before = await readDatabase(page);
      await page.locator('#journal-save').click();
      await page.waitForFunction(() => !window.LW5Journal.getState().busy && document.querySelector('#save-status').textContent.includes('另一窗口'));
      assert.equal(await page.locator('#trip-note').inputValue(), '不应覆盖另一窗口的草稿');
      assert.deepEqual(await readDatabase(page), before);
      assert.deepEqual(before.backup, seed);
      const transactions = await page.evaluate(() => window.__journalTransactions);
      assert.equal(transactions.at(-1).result, 'abort');
      assert.deepEqual(transactions.at(-1).writes, []);
    });
    assert.deepEqual(externalRequests, [], 'Journal attempted a request outside its isolated test origin');
    assert.deepEqual(pageErrors, [], 'Journal produced an uncaught browser exception');
  } finally { await browser.close(); }
});

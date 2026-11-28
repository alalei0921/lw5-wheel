'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createFixture, keys} = require('./fixtures/dog-edge-fixture.cjs');
const first = '2020-02-29', second = '2020-03-01';

test('flow needs an existing member and one real nonfuture day; no implicit value or writes', async () => {
  const f = createFixture();
  for (const name of ['lw5_dog_flow_read', 'lw5_dog_flow_save']) {
    for (const key of [null, 'wrong'.repeat(12)]) {
      assert.equal((await f.rpc(name, { p_key: key, p_date: first })).status, 401);
    }
    assert.equal((await f.rpc(name, { p_key: keys[0], p_date: first }, 'https://wrong.invalid')).status, 403);
  }
  for (const day of [undefined, '2021-02-29', '2024-02-30', '../revisions', '0000-01-01', '9999-12-31']) {
    assert.equal((await f.read(day)).status, 400);
  }
  for (const offset of [900, -721, '480', 10.1]) {
    assert.equal((await f.rpc('lw5_dog_flow_read', { p_key: keys[0], p_date: first, p_offset_minutes: offset })).status, 400);
  }
  for (const value of [undefined, '', 'moderate', 'Light', 1, {}, []]) {
    assert.equal((await f.save(first, 0, value)).status, 400);
  }
  for (const version of [-1, 1.5, '2', null, 2147483647]) {
    assert.equal((await f.save(first, version, 'light')).status, 400);
  }
  assert.equal(f.calls.length, 0);
  assert.deepEqual((await f.read(first)).data, { date: first, revision: 0, flow: null });
  assert.deepEqual((await f.save(first, 0, null)).data, { ok: true, date: first, revision: 0, flow: null });
  assert.equal(f.files.size, 0);
});

test('legacy full snapshots and independent per-date writes survive each other and sync across two devices', async () => {
  const f = createFixture();
  const oldState = { version: 2, starts: [first], moods: { [second]: 'good' }, previousExtension: { keep: true } };
  const oldFile = 'revisions/r0000000001.json';
  f.files.set(oldFile, structuredClone(oldState));
  const saveA = f.save(first, 0, 'light');
  const saveB = f.save(second, 0, 'heavy', keys[1]);
  for (const result of await Promise.all([saveA, saveB])) assert.equal(result.data.ok, true);
  assert.equal((await f.read(first, keys[1])).data.flow, 'light');
  assert.equal((await f.read(second)).data.flow, 'heavy');
  assert.deepEqual(f.files.get(oldFile), oldState);
  assert.ok(f.calls.every(call => !call.relative.includes('/revisions/') && call.data?.prefix !== 'revisions/'));
  const old = await f.rpc('lw5_dog_read', { p_key: keys[0] });
  assert.deepEqual(old.data, { state: oldState, revision: 1 });
  const updated = { ...oldState, moods: { [second]: 'best' } }; // Precisely what an old full-document client saves.
  const [legacy, corrected] = await Promise.all([
    f.rpc('lw5_dog_save', { p_key: keys[0], p_revision: 1, p_state: updated }),
    f.save(first, 1, 'medium', keys[1])
  ]);
  assert.equal(legacy.data.ok, true);
  assert.equal(corrected.data.ok, true);
  assert.deepEqual((await f.rpc('lw5_dog_read', { p_key: keys[1] })).data, { state: updated, revision: 2 });
  assert.equal((await f.read(first)).data.flow, 'medium');
  assert.equal((await f.read(second)).data.flow, 'heavy');
});

test('same-day simultaneous changes report exactly one winner; clearing retains a null revision', async () => {
  const f = createFixture();
  const results = await Promise.all([f.save(first, 0, 'light'), f.save(first, 0, 'heavy', keys[1])]);
  assert.deepEqual(results.map(r => r.data.ok).sort(), [false, true]);
  const winner = results.find(r => r.data.ok).data;
  assert.equal(results.find(r => !r.data.ok).data.flow, winner.flow);
  assert.deepEqual((await f.save(first, 1, null)).data, { ok: true, revision: 2, date: first, flow: null });
  assert.deepEqual((await f.save(first, 0, 'heavy', keys[1])).data, { ok: false, revision: 2, date: first, flow: null });
  assert.deepEqual((await f.read(first, keys[1])).data, { revision: 2, date: first, flow: null });
  assert.deepEqual([...f.files.values()], [{ flow: null }]);
});

test('unverified writes, failed readback and a public bucket never return a saved result', async () => {
  const f = createFixture();
  f.controls.publicBucket = true;
  assert.equal((await f.read(first)).status, 503);
  f.controls.publicBucket = false;
  f.controls.insertError = true;
  assert.deepEqual(await f.save(first, 0, 'heavy'), { status: 503, data: { code: 'calendar_unavailable' } });
  f.controls.insertError = false;
  assert.equal((await f.read(first)).data.revision, 0);
  f.controls.failReadbackAfterInsert = true;
  assert.deepEqual(await f.save(first, 0, 'medium'), { status: 503, data: { code: 'calendar_unavailable' } });
  assert.deepEqual((await f.read(first, keys[1])).data, { revision: 1, date: first, flow: 'medium' });
});

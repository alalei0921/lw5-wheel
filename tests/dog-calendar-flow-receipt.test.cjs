const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../shared/dog-calendar-core-v3.js'), 'utf8');
const date = '2020-02-29';
const payload = { p_key: 'fixture-only', p_date: date, p_revision: 4, p_flow: 'heavy' };
const receipt = { ok: true, date, revision: 5, flow: 'heavy' };

// All requests are answered in memory. No calendar service or actual key is used.
function rpcWith(response, status = 200) {
  const window = {};
  vm.runInNewContext(source, { window, fetch: async () => ({
    ok: status >= 200 && status < 300, status, json: async () => response
  }) });
  return window.LW5CalendarCore.rpc;
}

test('a flow save requires confirmation of the exact day, value and next revision', async () => {
  assert.deepEqual(await rpcWith(receipt)('lw5_dog_flow_save', payload), receipt);
  for (const response of [
    null, {}, { ...receipt, ok: undefined }, { ...receipt, date: '2020-03-01' },
    { ...receipt, flow: 'medium' }, { ...receipt, flow: null }, { ...receipt, revision: 4 },
    { ...receipt, revision: 6 }, { ...receipt, revision: -1 }, { ok: true, revision: 5, state: {} }
  ]) {
    await assert.rejects(() => rpcWith(response)('lw5_dog_flow_save', payload), /确认这一天/);
  }
  await assert.rejects(() => rpcWith(receipt, 503)('lw5_dog_flow_save', payload));
});

test('a rejected write may return only a newer checked revision for the same date', async () => {
  const conflict = { ok: false, date, revision: 7, flow: null };
  assert.deepEqual(await rpcWith(conflict)('lw5_dog_flow_save', payload), conflict);
  for (const response of [{ ...conflict, revision: 4 }, { ...conflict, flow: 'unknown' }]) {
    await assert.rejects(() => rpcWith(response)('lw5_dog_flow_save', payload), /确认这一天/);
  }
});

test('initial reads and cleared tombstones are explicit; the existing snapshot contract still works', async () => {
  for (const revision of [0, 12]) {
    const empty = { date, revision, flow: null };
    assert.deepEqual(await rpcWith(empty)('lw5_dog_flow_read', payload), empty);
  }
  await assert.rejects(() => rpcWith({ date, revision: 0, flow: 'light' })('lw5_dog_flow_read', payload));
  const legacy = { revision: 4, state: { version: 2, moods: {} } };
  assert.deepEqual(await rpcWith(legacy)('lw5_dog_read', { p_key: 'fixture-only' }), legacy);
  await assert.rejects(() => rpcWith({ code: '42501' }, 401)('lw5_dog_flow_read', payload), error => error.denied === true);
});

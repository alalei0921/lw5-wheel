'use strict';
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');

const original = readFileSync(join(__dirname, '../../dog-calendar/backend/index.ts'), 'utf8');
const keys = ['synthetic-device-a'.repeat(3), 'synthetic-device-b'.repeat(3)];
const source = stripTypeScriptTypes(keys.reduce((text, key, i) =>
  text.replace('__LW5_DIGEST_' + (i + 1) + '__', createHash('sha256').update(key).digest('hex')), original));
const fakeOrigin = 'https://alalei0921.github.io';
const fakeStorageHost = 'https://fictional-test-only.supabase.co';
const bucket = 'lw5-dog-calendar-v1-private';


function createFixture() {
  const files = new Map();
  const calls = [];
  const controls = { publicBucket: false, insertError: false, nextDownloadError: false, failReadbackAfterInsert: false };
  let handler;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const edge = {
    env: { get: name => ({ SUPABASE_URL: fakeStorageHost, SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' })[name] },
    serve: fn => { handler = fn; }
  };
  // In-memory fake. All storage requests terminate here, even on a test error.
  async function storage(url, { method, body, headers }) {
    const path = new URL(url);
    assert.equal(path.origin, fakeStorageHost);
    const relative = path.pathname.slice('/storage/v1'.length);
    const data = body ? JSON.parse(body) : null;
    calls.push({ method, relative, data });
    if (relative === '/bucket/' + bucket && method === 'GET') return json({ id: bucket, public: controls.publicBucket });
    if (relative === '/object/list/' + bucket && method === 'POST') {
      assert.equal(data.sortBy.column, 'name');
      assert.equal(data.sortBy.order, 'desc');
      const names = [...files.keys()].filter(k => k.startsWith(data.prefix))
        .map(k => k.slice(data.prefix.length)).sort().reverse().slice(0, data.limit);
      return json(names.map(name => ({ name })));
    }
    const object = '/object/' + bucket + '/';
    if (relative.startsWith(object) && method === 'POST') {
      assert.equal(headers['x-upsert'], 'false');
      if (controls.insertError) return json({ code: 'service_unavailable' }, 503);
      const name = relative.slice(object.length);
      if (files.has(name)) return json({ code: 'Duplicate' }, 409);
      files.set(name, data);
      if (controls.failReadbackAfterInsert) controls.nextDownloadError = true;
      return json({});
    }
    const download = '/object/authenticated/' + bucket + '/';
    if (relative.startsWith(download) && method === 'GET') {
      if (controls.nextDownloadError) {
        controls.nextDownloadError = false;
        return json({ code: 'service_unavailable' }, 503);
      }
      const name = relative.slice(download.length);
      return files.has(name) ? json(files.get(name)) : json({ code: 'NoSuchKey' }, 404);
    }
    if (relative === '/object/' + bucket && method === 'DELETE') {
      for (const name of data.prefixes) files.delete(name);
      return json({});
    }
    throw Error('Unexpected simulated Storage operation: ' + method + ' ' + relative);
  }
  vm.runInNewContext(source, {
    Deno: edge, crypto: webcrypto, Request, Response, URL, Date, TextEncoder, TextDecoder,
    Uint8Array, fetch: storage
  });
  const rpc = async (name, data, origin = fakeOrigin) => {
    const response = await handler(new Request('https://fixture.invalid/functions/v1/lw5-dog-calendar/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(data)
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, data: await response.json() };
  };
  return {
    files, calls, controls, rpc,
    read: (date, key = keys[0]) => rpc('lw5_dog_flow_read', { p_key: key, p_date: date }),
    save: (date, rev, value, key = keys[0]) => rpc('lw5_dog_flow_save', {
      p_key: key, p_date: date, p_revision: rev, p_flow: value
    })
  };
}

module.exports = {createFixture, keys};

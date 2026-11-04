const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/local-control-v1.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const valid = () => ({ ok: true, json: async () => ({ ok: true, service: 'lw5-local-control' }) });

function setup(fetchImpl = () => new Promise(() => {})) {
  let now = 0, next = 1;
  const timers = new Map(), calls = [], navigations = [], events = {};
  const element = () => ({
    style: {}, children: [], attrs: {}, textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    append(el) { this.children.push(el); }, insertAdjacentElement(_where, el) { this.help = el; },
    setAttribute(k,v) { this.attrs[k]=v; }, removeAttribute(k) { delete this.attrs[k]; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(k, fn) { this[k] = fn; },
  });
  const setTimeout = (fn, ms) => { const id = next++; timers.set(id, { fn, at: now + ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  const window = { addEventListener: (k, fn) => { events[k] = fn; }, setTimeout, location: { assign: url => navigations.push(url) } };
  const document = { hidden: false, createElement: element, addEventListener: (k, fn) => { events[k] = fn; } };
  const ctx = vm.createContext({ window, document, URL, AbortController, navigator: { onLine: true },
    setTimeout, clearTimeout, Date,
    fetch: (url, options) => {
      assert.equal(new URL(url).pathname, '/api/ping');
      assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
      calls.push({ url, options }); return fetchImpl(url, options);
    },
    location: { href: 'https://example.test/lw5-wheel/' }, nebulaHint: element(),
    toast: null, localStorage: { getItem() { throw Error('Discovery must not use stale storage'); }, setItem() { throw Error('No storage writes'); } },
  });
  vm.runInContext(source, ctx);
  async function tick(ms) {
    const end = now + ms;
    for (;;) {
      const entry = [...timers].filter(([,v]) => v.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await flush();
    }
    now = end; await flush();
  }
  function home() {
    const a = html.indexOf('      const localDiscovery =');
    const b = html.indexOf('      function setNebulaReveal', a);
    vm.runInContext(html.slice(a,b), ctx);
    vm.runInContext("nebulaMode = 'expanded'", ctx);
  }
  return { ctx, api: window.LW5LocalControl, window, document, calls, events, navigations, timers, tick, home, element };
}

test('only the identity-checked current address wins when legacy and mDNS fail', async () => {
  const s = setup(async url => url.includes('.136:') ? valid() : Promise.reject(Error('unreachable')));
  assert.equal(await s.api.discover(), 'http://192.168.1.136:8788');
  assert.equal(s.calls.length, 3); assert(s.calls.every(c => c.options.signal.aborted));
});
test('the stable local name works after a DHCP change', async () => {
  const s = setup(async url => url.includes('.local:') ? valid() : Promise.reject(Error('unreachable')));
  assert.equal(await s.api.discover(), 'http://5damideMac-mini.local:8788');
});
test('legacy address is still supported when Mac switches back', async () => {
  const s = setup(async url => url.includes('.105:') ? valid() : Promise.reject(Error('unreachable')));
  assert.equal(await s.api.discover(), 'http://192.168.1.105:8788');
});
test('wrong service, failed HTTP and invalid JSON never authorize navigation', async () => {
  let i = 0;
  const s = setup(async () => [
    { ok: true, json: async () => ({ok:true,service:'other'}) },
    { ok: false, json: valid().json },
    { ok: true, json: async () => { throw Error('invalid JSON'); } },
  ][i++]);
  assert.equal(await s.api.discover(), null);
});
test('hung fetch and response-body reads are bounded even if abort is ignored', async () => {
  for (const impl of [() => new Promise(() => {}), async () => ({ok:true,json:()=>new Promise(()=>{})})]) {
    const s = setup(impl); const pending = s.api.discover(); await flush();
    await s.tick(3500); assert.equal(await pending, null); assert.equal(s.timers.size, 0);
  }
});
test('cancel settles immediately and late success cannot replace the outcome', async () => {
  const resolvers = []; const s = setup(() => new Promise(r => resolvers.push(r)));
  const controller = new AbortController(); const pending = s.api.discover({signal:controller.signal});
  await flush(); controller.abort(); assert.equal(await pending, null);
  resolvers.forEach(r=>r(valid())); await flush(); assert.equal(s.timers.size, 0);
});
test('offline and pre-cancelled probes make no requests', async () => {
  const s = setup(); s.ctx.navigator.onLine = false; assert.equal(await s.api.discover(), null);
  s.ctx.navigator.onLine = true; const c = new AbortController(); c.abort();
  assert.equal(await s.api.discover({signal:c.signal}), null); assert.equal(s.calls.length, 0);
});
test('home always discovers afresh; unsuccessful navigation recovers a clickable link', async () => {
  const s = setup(async url => url.includes('.136:') ? valid() : Promise.reject(Error())); s.home();
  await vm.runInContext('connectLocalControl()',s.ctx); assert.equal(s.calls.length,3);
  await s.tick(80); assert.match(s.navigations[0], /^http:\/\/192\.168\.1\.136:8788\/sun-mode\?/);
  await s.tick(6000); assert.equal(s.ctx.nebulaHint.attrs['aria-disabled'], 'false');
  assert.match(s.ctx.nebulaHint.attrs.href,/\.136:/); assert.match(s.ctx.nebulaHint.textContent,/尚未完成/);
});
test('navigation exceptions restore the fallback link', async () => {
  const s = setup(async () => valid()); s.home(); s.window.location.assign = () => { throw Error('blocked'); };
  await vm.runInContext('connectLocalControl()',s.ctx); await s.tick(80);
  assert.equal(s.ctx.nebulaHint.attrs['aria-disabled'], 'false'); assert.match(s.ctx.nebulaHint.textContent,/无法自动进入/);
});
test('closing or returning from BFCache invalidates stale navigation and never auto-loops', async () => {
  const s = setup(async () => valid()); s.home();
  await vm.runInContext('connectLocalControl()',s.ctx); s.events.pageshow(); s.events.online(); s.events.visibilitychange();
  await s.tick(7000); assert.equal(s.navigations.length,0);
  assert.equal(s.ctx.nebulaHint.attrs['aria-disabled'],'false'); assert.match(s.ctx.nebulaHint.textContent,/重新查找/);
  vm.runInContext("nebulaMode = 'mini'; resetLocalControlConnection()",s.ctx);
  await s.tick(7000); assert.equal(s.navigations.length,0);
});
test('preview rejects stale success after a network change and keeps direct IP fallback', async () => {
  const resolvers=[]; const s=setup(()=>new Promise(r=>resolvers.push(r)));
  const link=s.element(), status=s.element(); const values=[];
  s.api.bind({link,status,path:'/aurora',onChange:v=>values.push(v)}); await flush();
  s.events.online(); await flush(); resolvers.slice(0,3).forEach(r=>r(valid())); await flush();
  assert(!values.includes(true)); await s.tick(3500);
  assert.equal(link.href,'http://192.168.1.136:8788/aurora'); assert.match(status.textContent,/暂未确认/);
  assert(link.help.children.some(e=>e.href==='http://192.168.1.136:8788/aurora'));
  link.click(); await s.tick(6000); assert.match(status.textContent,/尚未完成/);
});
test('explicit help navigation wins over an in-flight home discovery', async () => {
  const resolvers=[]; const s=setup(()=>new Promise(r=>resolvers.push(r))); s.home();
  const pending=vm.runInContext('connectLocalControl()',s.ctx); await flush();
  const direct=s.ctx.nebulaHint.help.children.find(e=>e.href?.includes('.136:'));
  direct.click(); resolvers.forEach(r=>r(valid())); await pending; await s.tick(7000);
  assert.equal(s.navigations.length,0); assert.equal(s.ctx.nebulaHint.attrs['aria-disabled'],'false');
});
test('backgrounding during expansion or during handoff cannot start a connection/navigation', async () => {
  const s=setup(async()=>valid()); s.home(); s.document.hidden=true;
  assert.equal(await vm.runInContext('connectLocalControl()',s.ctx),false); assert.equal(s.calls.length,0);
  s.document.hidden=false; await vm.runInContext('connectLocalControl()',s.ctx);
  s.document.hidden=true; await s.tick(80); assert.equal(s.navigations.length,0);
  s.document.hidden=false; s.events.visibilitychange(); assert.equal(s.ctx.nebulaHint.attrs['aria-disabled'],'false');
});

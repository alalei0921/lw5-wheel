(() => {
  'use strict';
  const SLOT = 'lw5.calendar.today-icon.v1';
  const REMEMBER = 'lw5.calendar.private-access.v1';
  const moods = new Set(['tired', 'good', 'best', 'grumpy']);
  let generation = 0;
  function localDay() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  }
  function remembered() { try { return localStorage.getItem(REMEMBER) || ''; } catch { return ''; } }
  function clear() {
    generation++;
    try { sessionStorage.removeItem(SLOT); } catch {}
    window.dispatchEvent(new Event('lw5-dog-icon'));
  }
  async function binding(key) {
    const bytes = new TextEncoder().encode('lw5-home-icon-v1:' + key);
    const result = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function publish(day, mood, key) {
    const mine = ++generation;
    if (day !== localDay() || !moods.has(mood) || !key || remembered() !== key) { clear(); return; }
    try {
      const tag = await binding(key);
      if (mine !== generation || day !== localDay() || remembered() !== key) return;
      // Same-tab, same-day summary only; never store a record or duplicate the passphrase.
      sessionStorage.setItem(SLOT, JSON.stringify({version:1,day,mood,binding:tag}));
      window.dispatchEvent(new Event('lw5-dog-icon'));
    } catch { if (mine === generation) clear(); }
  }
  async function read() {
    try {
      const raw = sessionStorage.getItem(SLOT), key = remembered();
      if (!raw || !key) return null;
      const item = JSON.parse(raw);
      if (item.version !== 1 || item.day !== localDay() || !moods.has(item.mood)) return null;
      const tag = await binding(key);
      if (remembered() !== key || sessionStorage.getItem(SLOT) !== raw || item.day !== localDay() || tag !== item.binding) return null;
      return item.mood;
    } catch { return null; }
  }
  window.LW5DogStatus = Object.freeze({localDay,publish,clear,read});
  window.addEventListener('storage', event => { if (event.key === REMEMBER || event.key === null) clear(); });

  const launch = document.getElementById('dogCalendarLaunch');
  if (!launch) return;
  const picture = launch.querySelector('img'), fallback = launch.querySelector('span');
  let renderId = 0;
  function generic() { picture.hidden = true; picture.removeAttribute('src'); fallback.hidden = false; }
  async function refresh() {
    const mine = ++renderId;
    generic();
    if (document.hidden) return;
    const mood = await read();
    if (mine !== renderId || document.hidden || !mood) return;
    picture.src = './dog-calendar/assets/' + mood + '.webp';
    picture.hidden = false; fallback.hidden = true;
  }
  picture.addEventListener('error', generic);
  for (const name of ['pageshow','focus','lw5-dog-icon']) window.addEventListener(name, refresh);
  window.addEventListener('pagehide', ()=>{renderId++;generic();});
  document.addEventListener('visibilitychange', refresh);
  function midnight() {
    const next = new Date(); next.setHours(24,0,1,0);
    setTimeout(()=>{refresh();midnight();},Math.max(1000,next.getTime()-Date.now()));
  }
  midnight(); refresh();
})();

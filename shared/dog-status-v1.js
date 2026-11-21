(() => {
  'use strict';
  const core = window.LW5CalendarCore;
  const REMEMBER = 'lw5.calendar.private-access.v1';
  function remembered() { try { return localStorage.getItem(REMEMBER) || ''; } catch { return ''; } }
  function clear() {
    // Retire v83's tab summary. v84 never persists a status or a calendar response.
    try { sessionStorage.removeItem('lw5.calendar.today-icon.v1'); } catch {}
    window.dispatchEvent(new Event('lw5-dog-clear'));
  }
  window.LW5DogStatus = Object.freeze({localDay:core.localDay,clear});
  clear();
  const launch = document.getElementById('dogCalendarLaunch');
  if (!launch) return;
  const picture = launch.querySelector('img'), fallback = launch.querySelector('span');
  const badge = launch.querySelector('.dog-refresh-badge');
  let flight = null;
  function busy(value) { badge.hidden = !value; launch.setAttribute('aria-busy', String(value)); }
  function generic() { picture.hidden = true; picture.removeAttribute('src'); fallback.hidden = false; }
  function cancel() {
    const old = flight; flight = null;
    if (old) { clearTimeout(old.timer); old.controller.abort(); }
    generic(); busy(false);
  }
  function current(task) {
    return flight === task && !document.hidden && task.key === remembered() && task.day === core.localDay();
  }
  async function refresh() {
    const key = remembered(), day = core.localDay();
    if (document.hidden || !key) { cancel(); return; }
    // pageshow/focus/visibilitychange often arrive together; share the pending read.
    if (flight?.key === key && flight.day === day) return;
    cancel();
    const task = {key,day,controller:new AbortController()}; flight = task; busy(true);
    task.timer = setTimeout(()=>task.controller.abort(),14000);
    try {
      const response = await core.rpc('lw5_dog_read',{p_key:key},task.controller.signal);
      if (!current(task) || task.controller.signal.aborted) return;
      const model = core.parseCloudState(response.state);
      const info = core.status(model,day,day);
      if (info && info.kind !== 'demo') {
        picture.src = './dog-calendar/assets/' + info.mood.id + '.webp';
        picture.hidden = false; fallback.hidden = true;
      }
    } catch (error) {
      if (!current(task)) return;
      generic();
      if (error.denied) { try { localStorage.removeItem(REMEMBER); } catch {} }
    } finally {
      clearTimeout(task.timer);
      if (flight === task) {
        flight = null; busy(false);
        // A clock/date change can overtake a response before the midnight event.
        if (!document.hidden && remembered() && (day !== core.localDay() || key !== remembered())) refresh();
      }
    }
  }
  picture.addEventListener('error',generic);
  window.addEventListener('lw5-dog-clear',cancel);
  window.addEventListener('storage', event => {
    if (event.key === REMEMBER || event.key === null) { cancel(); refresh(); }
  });
  window.addEventListener('pageshow',refresh);
  window.addEventListener('focus',refresh);
  window.addEventListener('pagehide',cancel);
  document.addEventListener('visibilitychange',()=>document.hidden ? cancel() : refresh());
  function midnight() {
    const next = new Date(); next.setHours(24,0,1,0);
    setTimeout(()=>{refresh();midnight();},Math.max(1000,next.getTime()-Date.now()));
  }
  midnight();
  // Defer the first read to pageshow so initial load events share one request.
  if (document.readyState === 'complete') refresh();
})();

(() => {
  'use strict';
  if (window.LW5UI) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = 'button,a[href],[role="button"],input[type="checkbox"],input[type="radio"],summary';
  let pressed, origin, toast, toastTimer, navigation, navigationTimer, lastHaptic = -1000;
  function haptic(ms = 12) {
    if (reduced.matches || document.hidden || performance.now() - lastHaptic < 90) return;
    lastHaptic = performance.now();
    try { navigator.vibrate?.(Math.max(5, Math.min(25, ms))); } catch (_) {}
  }
  function notify(message) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'lw5-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }
  function release() {
    pressed?.classList.remove('lw5-pressed');
    pressed = null;
  }
  document.addEventListener('pointerdown', event => {
    release();
    const control = event.target.closest?.(controls);
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
    pressed = control;
    origin = {x:event.clientX, y:event.clientY};
    control.classList.add('lw5-pressed');
  }, {passive:true});
  document.addEventListener('pointermove', event => {
    if (pressed && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>12) release();
  }, {passive:true});
  for (const name of ['pointerup','pointercancel','blur']) window.addEventListener(name, release, {passive:true});
  document.addEventListener('click', event => {
    const control = event.target.closest?.(controls);
    if (event.isTrusted && control && !control.disabled && control.getAttribute('aria-disabled') !== 'true') haptic();
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || link.target === '_blank') return;
    const url = new URL(link.href, location.href);
    if (!/^https?:$/.test(url.protocol) || (url.pathname === location.pathname && url.origin === location.origin && url.search === location.search)) return;
    if (!navigation) {
      navigation = document.createElement('div');
      navigation.className = 'lw5-navigation';
      navigation.setAttribute('role', 'progressbar');
      navigation.setAttribute('aria-label', '正在打开页面');
      document.body.append(navigation);
    }
    navigation.hidden = false;
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(() => { resetNavigation(); notify('页面加载较慢，请检查网络后重试'); }, 10000);
  });
  function resetNavigation() {
    clearTimeout(navigationTimer);
    if (navigation) navigation.hidden = true;
    release();
  }
  async function request(input, options = {}) {
    const {timeoutMs = 20000, signal, ...init} = options;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(abort, timeoutMs);
    try { return await fetch(input, {...init, signal:controller.signal}); }
    catch (error) {
      if (error.name === 'AbortError') throw new Error('网络请求超时，结果未确认，请刷新查看后再操作');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  window.addEventListener('pageshow', resetNavigation);
  window.addEventListener('pagehide', resetNavigation);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  // Add live announcements only to existing state areas, without interpreting device results.
  for (const el of document.querySelectorAll('#status,#error,.toast')) {
    el.setAttribute('role', el.id === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', el.id === 'error' ? 'assertive' : 'polite');
    el.setAttribute('aria-atomic', 'true');
  }
  window.LW5UI = {haptic, notify, fetch:request};
  if (window.parent !== window) window.parent.postMessage({type:'lw5-tool-ready'}, location.origin);
})();

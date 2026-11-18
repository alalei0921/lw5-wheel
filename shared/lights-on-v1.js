(() => {
  'use strict';
  const launch = document.getElementById('lightsOnLaunch');
  const dialog = document.getElementById('lightsOnDialog');
  const local = window.LW5LocalControl;
  if (!launch || !dialog || !local) return;
  const title = document.getElementById('lightsOnTitle');
  const detail = document.getElementById('lightsOnDetail');
  const progress = document.getElementById('lightsOnProgress');
  const help = document.getElementById('lightsOnHelp');
  const links = document.getElementById('lightsOnLinks');
  const close = document.getElementById('lightsOnClose');
  const freshnessMs = 60000;
  let attempt = null;
  let generation = 0;
  let navigationTimer;
  let handoffTimer;
  let expiryTimer;
  let universe;

  function pendingOff() {
    generation += 1;
    attempt?.controller.abort();
    clearTimeout(navigationTimer);
    clearTimeout(handoffTimer);
  }
  function fresh(value) {
    const age = Date.now() - value.createdAt;
    return age >= 0 && age < freshnessMs;
  }
  function usable(value) {
    return value === attempt && dialog.open && fresh(value);
  }
  function copy(heading, description, connecting = false) {
    title.textContent = heading;
    detail.textContent = description;
    progress.hidden = !connecting;
    dialog.classList.toggle('is-connecting', connecting);
    // This launcher has no confirmed lights. Its idle animation can keep moving
    // while the connection message and manual links stay on screen.
    try { universe?.update({ status: connecting ? 'connecting' : 'idle', completed: 0, total: 9 }); } catch {}
  }
  function expire(value) {
    if (attempt !== value || !dialog.open) return;
    pendingOff();
    copy('连接已过期', '关闭后重试');
    links.querySelectorAll('a').forEach(link => {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
    });
  }
  function showHelp(value) {
    if (attempt !== value || !dialog.open) return;
    if (!fresh(value)) { expire(value); return; }
    copy('连接未完成', '选择连接入口');
    help.hidden = false;
  }
  function prepareHandoff(value) {
    pendingOff();
    value.navigationStarted = true;
    copy('连接中', '正在连接中控', true);
    handoffTimer = setTimeout(() => showHelp(value), local.navigationTimeoutMs);
  }
  function destination(origin, value) {
    return origin + '/lights-on#start=' + encodeURIComponent(value.id);
  }
  function buildLinks(value) {
    links.replaceChildren();
    local.origins.forEach((origin, index) => {
      const link = document.createElement('a');
      link.href = destination(origin, value);
      link.target = '_top';
      link.textContent = index === 0 ? '家庭网络' : '备用入口 ' + index;
      link.addEventListener('click', event => {
        if (!event.isTrusted || !usable(value) || document.hidden || navigator.onLine === false) {
          event.preventDefault();
          if (attempt === value && !fresh(value)) expire(value);
          return;
        }
        // Native same-window navigation preserves user activation. Every link
        // carries this attempt's ID, so choosing another address cannot replay it.
        prepareHandoff(value);
      });
      links.append(link);
    });
  }
  function reset() {
    pendingOff();
    clearTimeout(expiryTimer);
    attempt = null;
    launch.disabled = false;
    help.hidden = true;
    links.replaceChildren();
    try { universe?.destroy(); } catch {}
    universe = null;
  }
  async function begin(event) {
    if (!event.isTrusted || dialog.open || document.hidden ||
        document.querySelector('dialog[open]') ||
        document.body.classList.contains('tool-active') || document.body.classList.contains('nebula-active')) return;
    reset();
    launch.disabled = true;
    copy('连接中', '正在连接中控', true);
    dialog.showModal(); // Native modal makes the rest of the page inert.
    try { universe = window.LW5LightsUniverse?.create(document.getElementById('lightsOnUniverse')); } catch {}
    try { universe?.update({ status: 'connecting', completed: 0, total: 9 }); } catch {}
    close.focus({ preventScroll: true });
    if (navigator.onLine === false) {
      copy('请连接家庭 Wi-Fi', '尚未发送开灯请求');
      return;
    }
    if (typeof crypto.randomUUID !== 'function') {
      copy('暂时无法开始', '请更新浏览器后重试');
      return;
    }
    const createdAt = Date.now();
    const value = { id: createdAt + '-' + crypto.randomUUID(), createdAt,
      controller: new AbortController(), navigationStarted: false };
    attempt = value;
    const ownGeneration = ++generation;
    buildLinks(value);
    expiryTimer = setTimeout(() => expire(value), freshnessMs);
    let origin;
    try { origin = await local.discover({ signal: value.controller.signal }); }
    catch { origin = null; }
    if (!usable(value) || generation !== ownGeneration || value.controller.signal.aborted || document.hidden || navigator.onLine === false) return;
    // HTTPS may block discovery while top-level HTTP navigation remains usable.
    // Neither discovery nor navigation is reported as a successful light action.
    const target = local.origins.includes(origin) ? origin : local.fallbackOrigin;
    navigationTimer = setTimeout(() => {
      if (!usable(value) || generation !== ownGeneration || document.hidden || navigator.onLine === false) return;
      prepareHandoff(value);
      try { window.location.assign(destination(target, value)); }
      catch { clearTimeout(handoffTimer); showHelp(value); }
    }, 180);
  }
  launch.addEventListener('click', begin);
  document.getElementById('lightsOnPreview')?.addEventListener('click', () => {
    pendingOff();
    clearTimeout(expiryTimer);
    dialog.close();
  });
  close.addEventListener('click', () => { pendingOff(); dialog.close(); });
  dialog.addEventListener('cancel', () => pendingOff());
  dialog.addEventListener('close', () => {
    reset();
    if (!document.querySelector('dialog[open]')) launch.focus({ preventScroll: true });
  });
  window.addEventListener('offline', () => {
    if (!dialog.open) return;
    pendingOff();
    help.hidden = true;
    copy('网络已断开', attempt?.navigationStarted
      ? '开灯结果未确认，请返回查看进度'
      : '尚未发送开灯请求');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dialog.open && attempt && !attempt.navigationStarted) {
      pendingOff();
      showHelp(attempt);
    }
  });
  window.addEventListener('pagehide', () => { reset(); if (dialog.open) dialog.close(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { reset(); if (dialog.open) dialog.close(); }
  });
})();

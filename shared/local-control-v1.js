/* Only known LAN addresses; discovery never queries or commands home devices. */
(function () {
  'use strict';
  const origins = Object.freeze([
    'http://5damideMac-mini.local:8788',
    'http://192.168.1.136:8788',
    'http://192.168.1.105:8788',
  ]);
  // Direct entry when HTTPS cannot probe: use the last address verified on this Mac.
  const fallbackOrigin = origins[1];
  const timeoutMs = 3500;
  const navigationTimeoutMs = 6000;
  const unavailable = '暂未确认连接。可直接进入；请确认手机和 Mac 在可互通的家庭 Wi-Fi 中。';

  function discover({ signal } = {}) {
    return new Promise(resolve => {
      const controller = new AbortController();
      let settled = false;
      let remaining = origins.length;
      let timer;
      const finish = origin => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        controller.abort();
        resolve(origin);
      };
      const cancel = () => finish(null);
      if (signal?.aborted || navigator.onLine === false) return finish(null);
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, timeoutMs);
      for (const origin of origins) {
        Promise.resolve().then(async () => {
          if (settled) return;
          const response = await fetch(origin + '/api/ping?ts=' + Date.now(), {
            method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit',
            redirect: 'error', signal: controller.signal,
          });
          const data = await response.json();
          if (response.ok && data.ok === true && data.service === 'lw5-local-control') finish(origin);
        }).catch(() => {}).finally(() => {
          remaining -= 1;
          if (!remaining) finish(null);
        });
      }
    });
  }

  // HTTPS browsers may block the probe. A user-initiated top-level navigation
  // remains available without weakening mixed-content or local-network policy.
  function addHelp(link, path, onNavigate) {
    const details = document.createElement('details');
    details.className = 'local-connection-help';
    details.style.cssText = 'font-size:13px;line-height:1.8;margin:8px 0;position:relative;z-index:2';
    const summary = document.createElement('summary');
    summary.textContent = '连接帮助';
    details.append(summary);
    const note = document.createElement('p');
    note.textContent = '自动检查可能受浏览器限制。家庭网络可互通时，Mac 使用 2.4G 或 5G 均可；也可直接打开以下入口。';
    details.append(note);
    origins.forEach((origin, i) => {
      const a = document.createElement('a');
      a.href = origin + path;
      a.target = '_top';
      if (onNavigate) a.addEventListener('click', onNavigate);
      a.textContent = i === 0 ? 'Mac 局域网名称' : '备用地址 ' + new URL(origin).hostname;
      a.style.cssText = 'display:inline-block;margin:4px 12px 4px 0;color:inherit;text-decoration:underline';
      details.append(a);
    });
    link.insertAdjacentElement('afterend', details);
    return details;
  }

  function bind({ link, status, path, onChange }) {
    let generation = 0;
    let controller;
    let navigationTimer;
    function beginNavigation() {
      generation += 1;
      controller?.abort();
      status.textContent = '正在进入本地控制…';
      clearTimeout(navigationTimer);
      navigationTimer = setTimeout(() => { status.textContent = '进入尚未完成，可重试或展开连接帮助。'; }, navigationTimeoutMs);
    }
    addHelp(link, path, beginNavigation);
    async function probe() {
      const current = ++generation;
      controller?.abort();
      clearTimeout(navigationTimer);
      controller = new AbortController();
      link.href = fallbackOrigin + path;
      onChange(false);
      if (navigator.onLine === false) {
        status.textContent = '请先连接家庭 Wi-Fi';
        return;
      }
      status.textContent = '正在查找本地控制…';
      const origin = await discover({ signal: controller.signal });
      if (current !== generation) return;
      onChange(Boolean(origin));
      link.href = (origin || fallbackOrigin) + path;
      if (!origin) status.textContent = unavailable;
    }
    link.addEventListener('click', beginNavigation);
    const resume = () => { if (!document.hidden) probe(); };
    window.addEventListener('online', resume);
    window.addEventListener('offline', probe);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        generation += 1;
        controller?.abort();
        clearTimeout(navigationTimer);
      } else resume();
    });
    probe();
    return { probe };
  }
  window.LW5LocalControl = Object.freeze({ origins, fallbackOrigin, timeoutMs, navigationTimeoutMs, unavailable, discover, addHelp, bind });
})();

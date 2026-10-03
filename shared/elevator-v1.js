(() => {
  'use strict';
  const launch = document.getElementById('elevatorLaunch');
  const dialog = document.getElementById('elevatorDialog');
  if (!launch || !dialog) return;
  const sheet = dialog.querySelector('.elevator-sheet');
  const title = document.getElementById('elevatorTitle');
  const detail = document.getElementById('elevatorDetail');
  const action = document.getElementById('elevatorAction');
  const receipt = document.getElementById('elevatorReceipt');
  const footnote = document.getElementById('elevatorFootnote');
  const mark = document.getElementById('elevatorMark');
  const config = window.LW5_ELEVATOR_CONFIG || {};
  // Source artwork is 853×1280; the left pocket centre is (366,1116).
  // Match CSS cover, bottom positioning and the existing 1.02 background scale.
  // Small/landscape screens scroll the scene, keeping the pocket below the card.
  function positionPocket() {
    const { width, height } = document.body.getBoundingClientRect();
    const scale = Math.max(width / 853, height / 1280);
    const x = width / 2 + (366 - 853 / 2) * scale * 1.02;
    const y = height / 2 + (height / 2 - (1280 - 1116) * scale) * 1.02;
    launch.style.left = x + 'px';
    launch.style.top = y + 'px';
    launch.style.setProperty('--pocket-badge-size', Math.max(30, Math.min(70, 58 * scale * 1.02)) + 'px');
  }
  positionPocket();
  new ResizeObserver(positionPocket).observe(document.body);
  window.addEventListener('resize', positionPocket, { passive: true });
  const simulation = config.mode === 'simulation';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  let base = null;
  try {
    const candidate = config.apiBase && new URL(config.apiBase, location.href);
    // No address guessing, cross-origin fallback, UI-supplied endpoint or mixed content.
    if (candidate && candidate.origin === location.origin && !candidate.search && !candidate.hash &&
        candidate.pathname.endsWith('/') && (config.mode === 'real' || (simulation && loopback))) base = candidate;
  } catch (_) {}
  const key = 'lw5-elevator-v1:' + (simulation ? 'simulation:' : 'real:') + (base?.pathname || 'disabled');
  const expectedMode = simulation ? 'simulation' : 'real';
  const timeoutMs = 12000;
  const cooldownMs = 30000;
  let busy = false, last = null, cooldownTimer;
  const copy = {
    checking: ['正在连接', '先确认呼梯服务，再发送本次请求。', ''],
    calling: ['正在呼叫', '请求正在处理，等待呼梯服务回执。', ''],
    querying: ['正在查询', '只查询上次结果，不会再次发送呼梯指令。', ''],
    not_configured: ['呼梯通道尚未连接', '口袋机关已准备好，家中中控的呼梯连接仍待接通。本次没有发送呼梯指令。', '·'],
    unavailable: ['暂时无法连接', '未能确认呼梯服务可用。本次没有发送呼梯指令。', '!'],
    panel_disconnected: ['中控暂未连接', '还没有连上家里的中控。本次没有发送呼梯指令。', '!'],
    panel_unverified: ['已连上家里的中控', '还需验证中控呼梯动作和回执，本次没有发送呼梯指令。', '·'],
    unsupported: ['暂时无法呼叫', '当前浏览器无法安全保存和防止重复请求。本次没有发送呼梯指令。', '!'],
    accepted: ['呼叫已受理', '已收到呼梯服务确认，请留意电梯现场状态。', '✓'],
    rejected: ['本次未受理', '呼梯服务明确拒绝了这次请求，请使用现场呼梯按钮。', '×'],
    unknown: ['结果尚未确认', '请求可能已送达。请先查看现场状态，不要重复呼叫。', '?'],
  };

  function render(state, record = last) {
    const text = copy[state] || copy.unknown;
    sheet.dataset.state = state;
    title.textContent = (simulation && ['calling', 'accepted', 'rejected', 'unknown'].includes(state) ? '模拟 · ' : '') + text[0];
    detail.textContent = text[1];
    mark.textContent = text[2];
    document.getElementById('elevatorSimulation').hidden = !simulation;
    receipt.hidden = !record?.requestId;
    receipt.textContent = record?.requestId ? '请求 ' + record.requestId.slice(0, 8) + (record.receiptId ? ' · 回执 ' + record.receiptId : '') : '';
    footnote.textContent = simulation ? '仅供查看界面与反馈 · 未连接任何设备' : state === 'accepted' ? '受理不代表电梯已到达，也不授予楼层权限' : state === 'unknown' ? '关闭或刷新页面都不会自动重发' : '收到真实回执后才会确认受理';
    action.hidden = !['unknown', 'accepted', 'rejected', 'unavailable', 'panel_disconnected'].includes(state);
    action.disabled = busy;
    action.textContent = state === 'unknown' ? '查询上次结果' : ['unavailable', 'panel_disconnected'].includes(state) ? '重新检查连接' : '再次呼叫';
    clearTimeout(cooldownTimer);
    if (state === 'accepted' && record && Date.now() - record.at < cooldownMs) {
      action.disabled = true;
      action.textContent = '已受理，请稍候';
      cooldownTimer = setTimeout(() => { if (sheet.dataset.state === 'accepted') render('accepted'); }, Math.max(1, cooldownMs - (Date.now() - record.at)));
    }
  }

  function readRecord() {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !/^[a-zA-Z0-9-]{16,80}$/.test(value.requestId) || !Number.isFinite(value.at) ||
        !['pending', 'unknown', 'accepted', 'rejected'].includes(value.status)) throw new Error('Invalid pending record');
    // A reload is not evidence that a sent command failed or was cancelled.
    return { ...value, status: value.status === 'pending' ? 'unknown' : value.status };
  }
  function saveRecord(value) {
    localStorage.setItem(key, JSON.stringify(value));
    last = value;
  }

  async function request(path, init = {}) {
    const controller = new AbortController();
    let timer;
    // Cover both headers and body parsing; never retry a write.
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(new URL(path, base), { ...init, signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
          const data = await response.json();
          return { response, data };
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Timeout')); }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  function classify({ response, data }, requestId) {
    if (data?.protocol !== 1 || data.mode !== expectedMode || data.requestId !== requestId) return { status: 'unknown' };
    if ((response.status === 200 || response.status === 202) && data.status === 'accepted' &&
        typeof data.receipt?.id === 'string' && /^[a-zA-Z0-9._:-]{1,80}$/.test(data.receipt.id) &&
        typeof data.receipt.acceptedAt === 'string' && Number.isFinite(Date.parse(data.receipt.acceptedAt))) {
      return { status: 'accepted', receiptId: data.receipt.id };
    }
    if (data.status === 'rejected' && ['ELEVATOR_REJECTED', 'RESIDENT_NOT_AUTHORIZED', 'ELEVATOR_UNAVAILABLE'].includes(data.code)) return { status: 'rejected' };
    return { status: 'unknown' };
  }

  async function run(newCall = false, lookup = false) {
    if (busy) return;
    if (!base) { render('not_configured'); return; }
    if (!navigator.locks?.request || !crypto.randomUUID) { render('unsupported'); return; }
    busy = true;
    action.disabled = true;
    let dispatched = false;
    try {
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        last = readRecord();
        if (!lock) { render(last?.status || 'unknown'); return; }
        if (last && !lookup && (!newCall || last.status === 'unknown' || (last.status === 'accepted' && Date.now() - last.at < cooldownMs))) {
          render(last.status); return;
        }
        if (lookup) {
          if (!last) { render('unknown'); return; }
          render('querying');
          let result;
          try { result = classify(await request('calls/' + last.requestId), last.requestId); }
          catch (_) { result = { status: 'unknown' }; }
          saveRecord({ ...last, ...result });
          render(last.status);
          return;
        }
        render('checking');
        let capability;
        try { capability = await request('capabilities'); }
        catch (_) { render('unavailable'); return; }
        const { response, data } = capability;
        if (data?.protocol === 1 && data.mode === 'unconfigured' && data.canCall === false) {
          if (data.candidateChannel === 'resident_panel_ui') {
            try {
              const observed = await request('panel-status');
              const panel = observed.data;
              if (!observed.response.ok || panel?.protocol !== 1 || panel.mode !== 'unconfigured' || panel.canCall !== false) { render('unavailable'); return; }
              render(panel.code === 'PANEL_NOT_CONNECTED' ? 'panel_disconnected' : panel.panel?.connection === 'device' ? 'panel_unverified' : 'not_configured');
            } catch (_) { render('unavailable'); }
          } else render(data.code === 'PANEL_NOT_CONNECTED' ? 'panel_disconnected' : 'not_configured');
          return;
        }
        if (!response.ok || data?.protocol !== 1 || data.mode !== expectedMode || data.canCall !== true ||
            data.supportsIdempotency !== true || data.supportsResultLookup !== true) { render('unavailable'); return; }
        if (!navigator.onLine) { render('unavailable'); return; }
        const record = { requestId: crypto.randomUUID(), status: 'pending', at: Date.now() };
        // Persist before dispatch. A failed write prevents the command from being sent.
        saveRecord(record);
        render('calling');
        dispatched = true;
        let result;
        try {
          const returned = await request('calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: record.requestId }) });
          result = classify(returned, record.requestId);
          // Only this dispatch's explicit no-command response can establish no dispatch.
          if (returned.data?.protocol === 1 && returned.data.mode === 'unconfigured' && returned.data.commandSent === false && returned.data.code === 'ELEVATOR_NOT_CONFIGURED') result = { status: 'rejected' };
        } catch (_) { result = { status: 'unknown' }; }
        saveRecord({ ...record, ...result });
        render(last.status);
      });
    } catch (_) {
      // Keep the pre-dispatch pending record intact if persistence fails afterwards.
      if (dispatched || lookup || ['pending', 'unknown'].includes(last?.status)) {
        if (last) last = { ...last, status: 'unknown' };
        render('unknown');
      } else render('unsupported');
    } finally {
      busy = false;
      render(sheet.dataset.state);
    }
  }

  launch.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    if (!busy) run();
  });
  document.getElementById('elevatorClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => launch.focus({ preventScroll: true }));
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not([disabled])')].filter(el => el.getClientRects().length);
    const first = controls[0], end = controls[controls.length - 1];
    if ((!event.shiftKey && document.activeElement === end) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); (event.shiftKey ? end : first)?.focus();
    }
  });
  // Deliberately do not cancel or redispatch a pending command when the dialog closes.
  action.addEventListener('click', () => run(true, sheet.dataset.state === 'unknown'));
  window.addEventListener('storage', event => {
    if (event.key !== key || busy) return;
    try { last = readRecord(); render(last?.status || 'unknown'); }
    catch (_) { render('unsupported'); }
  });
})();

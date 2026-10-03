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
  const previewToggle = document.getElementById('elevatorPreviewToggle');
  const connection = document.getElementById('elevatorConnection');
  const reduceMotion = document.getElementById('elevatorReduceMotion');
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
  let busy = false, last = null, cooldownTimer, generation = 0;
  let previewReason = null, networkReturned = false;
  const previewStates = ['not_configured', 'unavailable', 'panel_disconnected', 'panel_unverified', 'unsupported'];
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  try { reduceMotion.checked = localStorage.getItem('lw5-elevator-reduce-motion') === 'true' || motionPreference.matches; }
  catch (_) { reduceMotion.checked = motionPreference.matches; }
  function applyMotionPreference() { sheet.dataset.reducedMotion = String(reduceMotion.checked || motionPreference.matches); }
  applyMotionPreference();
  motionPreference.addEventListener('change', applyMotionPreference);
  reduceMotion.addEventListener('change', () => {
    applyMotionPreference();
    try { localStorage.setItem('lw5-elevator-reduce-motion', String(reduceMotion.checked)); } catch (_) {}
  });
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
    preview: ['电梯动画预览', '风雷展翼，一线凌空。现在只是动画演示，不会呼叫电梯。', ''],
    preview_paused: ['预览已暂停', '这只是动画演示，没有发送任何呼梯指令。', ''],
    ready: ['呼梯通道已确认', '预览没有发送指令。点击下方按钮，才会发起一次真实呼梯。', ''],
  };

  function render(state, record = last) {
    if (previewStates.includes(state)) { previewReason = state; state = 'preview'; }
    const preview = state === 'preview' || state === 'preview_paused';
    const text = copy[state] || copy.unknown;
    sheet.dataset.state = state;
    title.textContent = (simulation && ['calling', 'accepted', 'rejected', 'unknown'].includes(state) ? '模拟 · ' : '') + text[0];
    detail.textContent = text[1];
    mark.textContent = text[2];
    const modeLabel = document.getElementById('elevatorSimulation');
    modeLabel.hidden = !simulation && !preview;
    modeLabel.textContent = preview ? '动画预览 · 不会呼叫真实电梯' : '模拟演示 · 不会呼叫真实电梯';
    receipt.hidden = preview || !record?.requestId;
    receipt.textContent = record?.requestId ? '请求 ' + record.requestId.slice(0, 8) + (record.receiptId ? ' · 回执 ' + record.receiptId : '') : '';
    connection.hidden = !preview;
    connection.textContent = preview ? (networkReturned ? '网络已恢复，当前仍为预览。需检查真实通道，再明确点击呼叫。' : copy[previewReason]?.[0] + '。' + (previewReason === 'panel_unverified' ? '中控在线仍不代表呼梯能力已验证。' : '真实呼梯需连接并验证住户通道。')) : '';
    previewToggle.hidden = !preview;
    previewToggle.textContent = state === 'preview_paused' ? '播放预览' : '暂停预览';
    footnote.textContent = preview ? '连接恢复也不会自动呼叫 · 无真实设备请求' : simulation ? '仅供查看界面与反馈 · 未连接任何设备' : state === 'accepted' ? '受理不代表电梯已到达，也不授予楼层权限' : state === 'unknown' ? '关闭或刷新页面都不会自动重发' : '收到真实回执后才会确认受理';
    action.hidden = !(preview && base) && !['unknown', 'accepted', 'rejected', 'ready'].includes(state);
    action.disabled = busy;
    action.textContent = preview ? '检查真实呼梯连接' : state === 'ready' ? (simulation ? '模拟呼叫电梯' : '真实呼叫电梯') : state === 'unknown' ? '查询上次结果' : '再次呼叫';
    if (state === 'ready' && simulation) detail.textContent = '模拟通道已确认。下方按钮仅用于隔离测试，不连接真实电梯。';
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

  async function run(newCall = false, lookup = false, checkOnly = false) {
    if (busy) return;
    previewReason = null;
    networkReturned = false;
    if (!base) { render('not_configured'); return; }
    if (!navigator.locks?.request || !crypto.randomUUID) { render('unsupported'); return; }
    busy = true;
    action.disabled = true;
    const token = ++generation;
    const abandoned = () => token !== generation || !dialog.open;
    let dispatched = false;
    try {
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        last = readRecord();
        if (abandoned()) return;
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
        if (!navigator.onLine) { render('unavailable'); return; }
        let capability;
        try { capability = await request('capabilities'); }
        catch (_) { if (!abandoned()) render('unavailable'); return; }
        if (abandoned()) return;
        const { response, data } = capability;
        if (data?.protocol === 1 && data.mode === 'unconfigured' && data.canCall === false) {
          if (data.candidateChannel === 'resident_panel_ui') {
            try {
              const observed = await request('panel-status');
              if (abandoned()) return;
              const panel = observed.data;
              if (!observed.response.ok || panel?.protocol !== 1 || panel.mode !== 'unconfigured' || panel.canCall !== false) { render('unavailable'); return; }
              render(panel.code === 'PANEL_NOT_CONNECTED' ? 'panel_disconnected' : panel.panel?.connection === 'device' ? 'panel_unverified' : 'not_configured');
            } catch (_) { if (!abandoned()) render('unavailable'); }
          } else render(data.code === 'PANEL_NOT_CONNECTED' ? 'panel_disconnected' : 'not_configured');
          return;
        }
        if (!response.ok || data?.protocol !== 1 || data.mode !== expectedMode || data.canCall !== true ||
            data.supportsIdempotency !== true || data.supportsResultLookup !== true) { render('unavailable'); return; }
        if (!navigator.onLine) { render('unavailable'); return; }
        // A connection check made from preview can only arm a separate, explicit click.
        if (checkOnly) { render('ready'); return; }
        if (abandoned()) return;
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
      if (abandoned() && !dispatched && !lookup) render('unavailable');
      else render(sheet.dataset.state);
    }
  }

  launch.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal();
    if (!busy) run();
  });
  document.getElementById('elevatorClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { generation++; launch.focus({ preventScroll: true }); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(el => el.getClientRects().length);
    const first = controls[0], end = controls[controls.length - 1];
    if ((!event.shiftKey && document.activeElement === end) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); (event.shiftKey ? end : first)?.focus();
    }
  });
  // Deliberately do not cancel or redispatch a pending command when the dialog closes.
  action.addEventListener('click', () => run(true, sheet.dataset.state === 'unknown', !!previewReason));
  previewToggle.addEventListener('click', () => {
    if (previewReason && !busy) render(sheet.dataset.state === 'preview_paused' ? 'preview' : 'preview_paused');
  });
  window.addEventListener('online', () => {
    if (!previewReason) return;
    networkReturned = true;
    render(sheet.dataset.state);
  });
  window.addEventListener('offline', () => {
    networkReturned = false;
    if (sheet.dataset.state === 'checking') { generation++; render('unavailable'); }
    else if (sheet.dataset.state === 'ready') render('unavailable');
    else if (previewReason) render(sheet.dataset.state);
  });
  window.addEventListener('storage', event => {
    if (event.key !== key || busy || previewReason) return;
    try { last = readRecord(); render(last?.status || 'unknown'); }
    catch (_) { render('unsupported'); }
  });
})();

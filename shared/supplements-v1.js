(() => {
  'use strict';
  const launch = document.getElementById('supplementLaunch');
  const dialog = document.getElementById('supplementDialog');
  if (!launch || !dialog || !window.LW5Supplements) return;
  const api = window.LW5Supplements;
  const $ = id => document.getElementById(id);
  const rows = $('supplementRows'), form = $('supplementForm'), view = $('supplementView');
  const notice = $('supplementNotice'), fields = $('supplementFields');
  let store, state, timer, editing = false, expectedRaw = null, importGeneration = 0;
  const controls = [], inputs = [];
  function message(text = '') { notice.textContent = text; notice.hidden = !text; }
  function failure(error) {
    message('暂时无法保存或读取本机记录。请检查浏览器存储后重试；当前草稿仍保留。' + (error?.message?.includes('另一个窗口') ? ' ' + error.message : ''));
    $('supplementRetry').hidden = false;
  }
  function paint() {
    $('supplementDate').textContent = state.day.replaceAll('-', '.') + ' · 北京时间';
    controls.forEach(({ row, name, description, button, label, knob }, i) => {
      name.textContent = state.items[i].name;
      description.textContent = state.items[i].description;
      button.setAttribute('aria-checked', String(state.checked[i]));
      button.disabled = false;
      row.dataset.checked = String(state.checked[i]);
      label.textContent = state.checked[i] ? '已吃过' : '未打卡';
      knob.textContent = state.checked[i] ? '✓' : '';
    });
    const count = state.checked.filter(Boolean).length;
    $('supplementProgress').textContent = '今天已记录 ' + count + ' 项';
    $('supplementEdit').disabled = false;
  }
  function refresh() {
    try {
      if (!store) store = api.createStore(window.localStorage);
      state = store.snapshot();
      paint();
      $('supplementRetry').hidden = true;
      return true;
    } catch (error) {
      controls.forEach(({ button }) => { button.disabled = true; });
      $('supplementEdit').disabled = !editing;
      failure(error);
      return false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (document.visibilityState === 'hidden') return;
    // Check at midnight, with a bounded periodic check for system-clock changes.
    timer = setTimeout(() => { refresh(); schedule(); }, Math.min(api.untilMidnight() + 40, 60000));
  }
  function finishEdit() {
    importGeneration++;
    editing = false;
    form.hidden = true;
    view.hidden = false;
    $('supplementTitle').textContent = '今天照顾好自己';
    $('supplementScroll').scrollTop = 0;
  }
  function fill(items) {
    items.forEach((item, i) => { inputs[i].name.value = item.name; inputs[i].description.value = item.description; });
  }
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.className = 'supplement-row';
    // Only static markup is inserted here; all personal text uses textContent/value.
    row.innerHTML = `<div class="supplement-copy"><div class="supplement-name" id="supplementName${i}"></div><p class="supplement-description" id="supplementDescription${i}"></p></div><button type="button" class="supplement-switch" role="switch" aria-checked="false" aria-labelledby="supplementName${i}" aria-describedby="supplementDescription${i}" disabled><span class="supplement-switch-track" aria-hidden="true"><span class="supplement-switch-knob"></span></span><span class="supplement-switch-label" aria-hidden="true">未打卡</span></button>`;
    const button = row.querySelector('button');
    const control = { row, button, name: row.querySelector('.supplement-name'), description: row.querySelector('.supplement-description'), label: row.querySelector('.supplement-switch-label'), knob: row.querySelector('.supplement-switch-knob') };
    controls.push(control);
    rows.append(row);
    button.addEventListener('click', () => {
      if (!refresh()) return;
      try { state = store.setChecked(i, !state.checked[i]); paint(); message(); }
      catch (error) { failure(error); }
      schedule();
    });
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'supplement-fieldset';
    fieldset.innerHTML = `<legend>第 ${i + 1} 项</legend><label>名称<input name="name${i}" maxlength="60" required autocomplete="off"></label><label>用量与说明<textarea name="description${i}" rows="2" maxlength="240"></textarea></label>`;
    fields.append(fieldset);
    inputs.push({ name: fieldset.querySelector('input'), description: fieldset.querySelector('textarea') });
  }
  launch.addEventListener('click', () => {
    message();
    refresh();
    if (!dialog.open) dialog.showModal();
    schedule();
  });
  $('supplementClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { finishEdit(); message(); launch.focus({ preventScroll: true }); });
  // Escape cancels an edit first; a second Escape closes the panel.
  dialog.addEventListener('cancel', event => {
    if (editing) { event.preventDefault(); finishEdit(); message(); refresh(); $('supplementEdit').focus(); }
  });
  $('supplementEdit').addEventListener('click', () => {
    if (!refresh()) return;
    editing = true;
    expectedRaw = state.raw;
    fill(state.items);
    message();
    view.hidden = true;
    form.hidden = false;
    $('supplementTitle').textContent = '我的小清单';
    $('supplementScroll').scrollTop = 0;
    inputs[0].name.focus({ preventScroll: true });
  });
  $('supplementCancel').addEventListener('click', () => {
    finishEdit(); message(); refresh(); $('supplementEdit').focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      state = store.saveSettings(inputs.map(input => ({ name: input.name.value, description: input.description.value })), expectedRaw);
      finishEdit(); paint(); message('清单已保存到本机。'); $('supplementEdit').focus();
    } catch (error) {
      message(error.message.includes('另一个窗口') || error.message.includes('每项') ? error.message : '保存没有成功，草稿仍保留。请检查浏览器存储后重试。');
    }
  });
  $('supplementImport').addEventListener('click', () => $('supplementFile').click());
  $('supplementFile').addEventListener('change', async event => {
    const file = event.target.files[0], generation = ++importGeneration;
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 16384) throw Error('清单文件过大，请选择小于 16 KB 的 JSON 文件。');
      const items = api.parseSettings(await file.text());
      if (!editing || generation !== importGeneration) return;
      fill(items);
      message('清单已填入草稿，检查后点「保存」。导入不会改变今天的打卡。');
    } catch (error) { if (editing && generation === importGeneration) message(error.message); }
  });
  $('supplementRetry').addEventListener('click', () => { message(); refresh(); schedule(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); schedule(); });
  window.addEventListener('pageshow', () => { refresh(); schedule(); });
  window.addEventListener('focus', () => { refresh(); schedule(); });
  window.addEventListener('storage', event => { if (event.key === null || event.key.startsWith(api.PREFIX)) refresh(); });
  refresh();
  schedule();
  if (location.hash === '#supplements') {
    history.replaceState(history.state, '', location.pathname + location.search);
    launch.click();
  }
})();

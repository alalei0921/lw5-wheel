(() => {
  'use strict';

  const REMEMBER_KEY = 'lw5.calendar.private-access.v1';
  const {DAY,MOODS,PHASES,COLOR_NAMES,ORDER,DEFAULT_SPANS,autoSpans,pad,dayKey,keyDate,dayAfter,apart,dateAt,validKey,validPeriodEnd,periodRecords,historyEstimate,initial,validSpans,parseCloudState,localDay} = window.LW5CalendarCore;
  const todayKey = localDay;
  function weekday(key) { return '星期' + '日一二三四五六'[keyDate(key).getUTCDay()]; }
  function titleDate(key) {
    const date = keyDate(key);
    return (date.getUTCMonth() + 1) + '月' + date.getUTCDate() + '日';
  }
  // The server is the authority for calendar entries. Only a remembered key is stored locally.
  let model = initial();
  let accessKey = '', revision = -1, epoch = 0, writing = false, readSerial = 0;
  const controllers = new Set();
  function load() { return model; }
  function remembered() {
    try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
  }
  function remember(key) {
    try { if (key) localStorage.setItem(REMEMBER_KEY,key); else localStorage.removeItem(REMEMBER_KEY); }
    catch { /* Saving entries to the server does not depend on browser storage. */ }
  }
  let selected = todayKey();
  let monthKey = selected.slice(0, 7);
  let activeDialog = null;
  let toastTimer;
  const id = name => document.getElementById(name);
  const setText = (name, text) => { if (id(name)) id(name).textContent = text; };
  const M = moodId => MOODS.find(mood => mood.id === moodId);
  function syncLabel(text) { setText('sync-label',text); }
  async function rpc(name, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    controllers.add(controller);
    try {
      return await window.LW5CalendarCore.rpc(name, payload, controller.signal);
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  function applySnapshot(result) {
    if (result.revision < revision) return;
    const parsed = parseCloudState(result.state);
    model = parsed;
    revision = result.revision;
  }
  function reportEditFailure(message) {
    syncLabel(message);
    const error = activeDialog?.querySelector('.dg-error');
    if (error && activeDialog.open) { error.textContent=message; error.hidden=false; }
    else announce(message);
  }
  function lockCalendar(message = '', forget = true) {
    window.LW5DogStatus?.clear();
    epoch++; readSerial++;
    for (const controller of controllers) controller.abort();
    writing = false; accessKey = ''; revision = -1; model = initial();
    selected = todayKey(); monthKey=selected.slice(0,7);
    id('calendar-app').hidden = true; id('calendar-lock').hidden = false;
    if (activeDialog) { activeDialog.close(); activeDialog.remove(); activeDialog=null; }
    clearTimeout(toastTimer); id('dog-toast')?.remove();
    id('calendar-grid').replaceChildren();
    for (const name of ['selected-date','selected-weekday','selected-status','hero-date','sync-label']) setText(name,'');
    id('selected-dog').removeAttribute('src'); id('selected-dog').alt=''; id('selected-dog').hidden=true;
    for(const btn of document.querySelectorAll('#mood-options [data-mood]')) {btn.classList.remove('is-active');btn.setAttribute('aria-pressed','false');}
    id('undo-btn').hidden=true; id('period-history').hidden=true;
    if (id('period-actions')) id('period-actions').hidden=true;
    delete id('selected-status').dataset.mood;
    setText('month-label','月历');id('month-label').setAttribute('aria-label','选择年份和月份');
    setText('period-text','设置我的周期');id('period-btn').setAttribute('aria-label','设置我的周期');
    id('login-key').value=''; id('login-submit').disabled=false; id('remember-key').checked=false;
    setText('login-error',message);
    if (forget) remember('');
  }
  async function unlock(key, persistent) {
    key = key.trim();
    if (!key) { setText('login-error','请输入专属日历口令。'); return; }
    window.LW5DogStatus?.clear();
    const mine = ++epoch;
    id('login-submit').disabled=true; setText('login-error','正在打开日历…');
    try {
      const result=await rpc('lw5_dog_read',{p_key:key});
      if (mine!==epoch) return;
      applySnapshot(result); accessKey=key; remember(persistent ? key : '');
      id('login-key').value='';setText('login-error','');
      id('calendar-lock').hidden=true;id('calendar-app').hidden=false;
      syncLabel('云端已同步');render();
      if (!model.configured) openSettings();
    } catch (error) {
      if (mine!==epoch) return;
      window.LW5DogStatus?.clear();
      if (error.denied) remember('');
      setText('login-error',error.denied ? error.message : '暂时无法打开云端日历，请稍后再试。');
    } finally { if (mine===epoch) id('login-submit').disabled=false; }
  }
  async function refreshCloud(manual=false) {
    if (!accessKey || writing) return;
    const mine=epoch, read=++readSerial;
    if (manual) syncLabel('正在同步…');
    try {
      const fresh=await rpc('lw5_dog_read',{p_key:accessKey});
      if (mine!==epoch || read!==readSerial || writing) return;
      applySnapshot(fresh);render();syncLabel('云端已同步');
      if (manual) announce('已同步最新日历');
    } catch (error) {
      if (mine!==epoch || read!==readSerial || writing) return;
      if (error.denied) return lockCalendar(error.message);
      window.LW5DogStatus?.clear();
      syncLabel('暂未同步，请重试');
      if (manual) announce('同步失败，请检查网络后重试。');
    }
  }
  async function change(edit, expected=revision) {
    if (!accessKey) return false;
    if (writing) {reportEditFailure('上一次修改正在保存，请稍候。');return false;}
    if (expected!==revision) {reportEditFailure('日历已更新。请重新打开后再修改。');return false;}
    const updated=JSON.parse(JSON.stringify(model));
    if (edit(updated)===false) {reportEditFailure('这条记录已更改，操作未执行。');return false;}
    updated.personal=true;
    const mine=epoch;
    writing=true;readSerial++;syncLabel('正在保存…');
    try {
      const result=await rpc('lw5_dog_save',{p_key:accessKey,p_revision:expected,p_state:updated});
      if (mine!==epoch) return false;
      if (typeof result.ok!=='boolean') throw new Error('保存结果未知');
      applySnapshot(result);render();
      if (!result.ok) {reportEditFailure('另一台设备已更新。已取回最新记录，请核对后重试。');return false;}
      syncLabel('云端已同步');return true;
    } catch (error) {
      if (mine!==epoch) return false;
      window.LW5DogStatus?.clear();
      if (error.denied) lockCalendar(error.message);
      else reportEditFailure('未能确认保存。请同步后核对，再决定是否重试。');
      return false;
    } finally { if (mine===epoch) writing=false; }
  }
  const status = (key, today) => window.LW5CalendarCore.status(model, key, today);
  function statusLabel(info) {
    if (!info) return '';
    if (info.kind === 'logged') return '已记 · ' + info.mood.name;
    return (info.kind === 'demo' ? '示例预计' : '预计') + ' · ' + PHASES[ORDER.indexOf(info.mood.id)];
  }
  function render() {
    if (!accessKey) return;
    const today = todayKey();
    const [year, month] = monthKey.split('-').map(Number);
    setText('hero-date', titleDate(today) + ' · ' + weekday(today));
    setText('month-label', year + '年' + month + '月');
    if (id('month-label')) id('month-label').setAttribute('aria-label', year + '年' + month + '月，选择年月');
    if (id('prev-month')) id('prev-month').disabled = monthKey === '1900-01';
    if (id('next-month')) id('next-month').disabled = monthKey === '9999-12';
    const todayRecorded = model.anchor === today;
    const cta = model.configured ? (todayRecorded ? '今日已记' : '月经来了') : '设置我的周期';
    setText('period-text', cta);
    id('period-btn')?.setAttribute('aria-label', todayRecorded ? '今天的月经开始日已记录' : cta);
    if (id('period-history')) id('period-history').hidden = !model.configured;
    const periods = periodRecords(model, today);
    const ends = new Set(periods.map(period => period.end));
    if (id('period-actions')) id('period-actions').hidden = !model.configured;
    if (id('period-end-btn')) id('period-end-btn').disabled = !model.anchor;
    setText('period-end-btn', periods.some(period => period.start === model.anchor) ? '更正经期结束日' : '记经期结束日');
    const note = id('demo-note');
    if (note) {
      note.hidden = model.personal;
      if (!model.personal) {
        note.textContent = '示例预估';
        note.setAttribute('aria-label', '正在查看示例预估，点此设置自己的周期');
      }
    }
    const first = dateAt(year, month, 1);
    const leading = (first.getUTCDay() + 6) % 7;
    const count = dateAt(year, month + 1, 0).getUTCDate();
    const total = Math.ceil((count + leading) / 7) * 7;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const date = dateAt(year, month, i - leading + 1);
      const isOutside = date.getUTCMonth() !== month - 1;
      const day = date.getUTCDate();
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'day';
      const number = document.createElement('span');
      number.className = 'day-number day-num';
      number.textContent = day;
      const marker = document.createElement('span');
      marker.className = 'day-marker day-dot';
      marker.setAttribute('aria-hidden', 'true');
      cell.append(number, marker);
      if (isOutside) cell.classList.add('is-outside', 'is-other');
      if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 9999) {
        cell.disabled = true;
        fragment.append(cell);
        continue;
      }
      const key = dayKey(date);
      cell.dataset.date = key;
      const info = status(key, today);
      if (info) {
        const logged = info.kind === 'logged';
        cell.dataset.tone = info.mood.id;
        cell.dataset.kind = info.kind;
        cell.classList.add(info.mood.id, logged ? 'is-recorded' : 'is-forecast');
        if (logged) cell.classList.add('is-logged');
        if (info.kind === 'demo') cell.classList.add('is-demo');
        cell.style.setProperty('--day-color', info.mood.color);
        cell.style.setProperty('--day-wash', info.wash);
      }
      if (model.anchor === key) cell.classList.add('has-period-start');
      if (ends.has(key)) {
        cell.classList.add('has-period-end');
        const endMarker = document.createElement('span');
        endMarker.className = 'period-end-marker';
        endMarker.textContent = '结束';
        endMarker.setAttribute('aria-hidden', 'true');
        cell.append(endMarker);
      }
      if (key === today) {
        cell.classList.add('is-today');
        cell.setAttribute('aria-current', 'date');
      }
      if (key === selected) cell.classList.add('is-selected');
      cell.setAttribute('aria-pressed', key === selected ? 'true' : 'false');
      cell.setAttribute('aria-label', date.getUTCFullYear() + '年' + titleDate(key) + '，' + weekday(key) +
        (key === today ? '，今天' : '') + (info ? '，' + statusLabel(info) : '') +
        (model.anchor === key ? '，月经第一天' : '') + (ends.has(key) ? '，经期结束日' : ''));
      fragment.append(cell);
    }
    id('calendar-grid').replaceChildren(fragment);
    const detail = status(selected, today);
    setText('selected-date', titleDate(selected));
    setText('selected-weekday', weekday(selected));
    const infoText = detail ? statusLabel(detail) : selected > today ? '暂无预计' : '未记录';
    const hasStart = model.anchor === selected;
    const actualPeriod = periods.find(period => selected >= period.start && selected <= period.end);
    const periodLabel = ends.has(selected) ? '经期结束日' : actualPeriod ? '已记经期' : '';
    setText('selected-status', [hasStart ? '月经第一天' : '', periodLabel,
      actualPeriod && detail?.kind !== 'logged' ? '' : infoText].filter(Boolean).join(' · '));
    const recordHint = document.querySelector('.recorder-head > span');
    if (recordHint) recordHint.textContent = selected > today ? '未来日期可查看预计' : '点一只狗，记下状态';
    const options = [...document.querySelectorAll('#mood-options [data-mood]')];
    for (const option of options) {
      const active = detail?.kind === 'logged' && detail.mood.id === option.dataset.mood;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-pressed', active ? 'true' : 'false');
      option.disabled = selected > today;
      option.setAttribute('aria-label', '记为' + M(option.dataset.mood).name);
    }
    const photo = id('selected-dog');
    if (photo) {
      const src = detail && options.find(option => option.dataset.mood === detail.mood.id)?.querySelector('img')?.getAttribute('src');
      if (src) {
        photo.src = src;
        photo.alt = detail.mood.name + '狗狗';
        photo.hidden = false;
      } else {
        photo.hidden = true;
        photo.removeAttribute('src');
      }
    }
    if (id('undo-btn')) id('undo-btn').hidden = !model.moods[selected];
    const detailHost = id('selected-status');
    if (detailHost) detailHost.dataset.mood = detail?.mood.id || '';
  }
  function select(key) {
    selected = key;
    monthKey = key.slice(0, 7);
    render();
  }
  function viewMonth(year, month) {
    if (year < 1900 || year > 9999) return;
    const day = Math.min(keyDate(selected).getUTCDate(), dateAt(year, month + 1, 0).getUTCDate());
    select(dayKey(dateAt(year, month, day)));
  }
  function moveMonth(step) {
    const [year, month] = monthKey.split('-').map(Number);
    const target = dateAt(year, month + step, 1);
    viewMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
  }
  function announce(message, undo) {
    let bar = id('dog-toast');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dog-toast';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      document.body.append(bar);
    }
    clearTimeout(toastTimer);
    bar.replaceChildren(document.createTextNode(message));
    if (undo) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '撤销';
      button.addEventListener('click', undo, { once: true });
      bar.append(button);
    }
    bar.hidden = false;
    toastTimer = setTimeout(() => { bar.hidden = true; }, undo ? 6500 : 2500);
  }
  async function recordMood(moodId) {
    if (!ORDER.includes(moodId) || selected > todayKey()) return;
    const key=selected, old=model.moods[key];
    if (old===moodId) {announce('这天已经记为「'+M(moodId).name+'」');return;}
    if (!await change(data=>{data.moods[key]=moodId;})) return;
    announce(titleDate(key)+'已记为「'+M(moodId).name+'」',async()=>{
      const ok=await change(data=>{
        if(data.moods[key]!==moodId)return false;
        if(old)data.moods[key]=old;else delete data.moods[key];
      });
      if(ok)announce('已撤销本次记录');
    });
  }
  async function clearMood() {
    const key=selected,old=model.moods[key];
    if(!old || !await change(data=>{delete data.moods[key];}))return;
    announce('已清除'+titleDate(key)+'的记录',async()=>{
      const ok=await change(data=>{if(data.moods[key])return false;data.moods[key]=old;});
      if(ok)announce('已恢复当天记录');
    });
  }

  const modalStyle = document.createElement('style');
  modalStyle.textContent = `
    .dog-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;width:min(400px,calc(100vw - 30px));height:fit-content;max-height:88dvh;overflow:auto;color:#44342e;background:#fffaf3;border:1.5px solid #d7bfae;border-radius:24px;padding:0;box-shadow:0 18px 65px #47312738;font-family:inherit;}
    .dog-dialog::backdrop{background:rgba(58,44,36,.38);}
    .dog-dialog form{padding:23px;display:grid;gap:17px;}
    .dog-dialog header{display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;background:none;margin:0;padding:0;height:auto;}
    .dog-dialog h2{margin:0;font-family:inherit;font-size:23px;font-weight:800;line-height:1.5;color:#4f3a30;}
    .dog-dialog .dg-x{font:inherit;font-size:23px;line-height:1;color:#6e574a;background:#f2e8db;border:0;border-radius:50%;width:38px;height:38px;cursor:pointer;padding:0;display:grid;place-items:center;}
    .dog-dialog label{display:grid;gap:6px;min-width:0;font-family:inherit;font-weight:650;font-size:15px;line-height:1.4;}
    .dog-dialog input,.dog-dialog select{margin:0;min-width:0;box-sizing:border-box;background:#fffefb;width:100%;border:1.3px solid #cdbeb1;border-radius:12px;min-height:43px;padding:8px 11px;font-family:inherit;font-size:16px;font-weight:500;line-height:1.35;color:#42362d;}
    .dog-dialog .dg-pair{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;}
    .dog-dialog .dg-details{border-top:1px dashed #dccdbb;border-bottom:1px dashed #dccdbb;padding:4px 0;}
    .dog-dialog .dg-details summary{cursor:pointer;font-size:15px;line-height:1.5;padding:8px 0;color:#634f43;}
    .dog-dialog .dg-details[open] .dg-spans{margin:8px 0 10px;}
    .dog-dialog .dg-spans{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
    .dog-dialog .dg-spans label{font-size:14px;align-content:start;}
    .dog-dialog .dg-spans label span{display:flex;align-items:center;gap:4px;}
    .dog-dialog .dg-spans i{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--tone);flex-shrink:0;}
    .dog-dialog .dg-answers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .dog-dialog .dg-answers label{font-size:14px}
    .dog-dialog .dg-preview{display:grid;gap:8px}
    .dog-dialog .dg-bar{display:flex;height:9px;border-radius:9px;overflow:hidden;background:#f0e9da}
    .dog-dialog .dg-bar i{min-width:3px}
    .dog-dialog .dg-summary{display:flex;flex-wrap:wrap;gap:5px 10px;color:#645142;font-size:13px}
    .dog-dialog .dg-preview-label{font-size:14px;font-weight:650}
    .dog-dialog .dg-auto{font:inherit;color:#566c41;text-decoration:underline;text-underline-offset:2px;background:none;border:0;padding:3px;font-size:13px}
    .dog-dialog .dg-custom-help{display:flex;justify-content:space-between;gap:7px;align-items:center;padding-bottom:7px}
    .dog-dialog .dg-custom-help small{font-size:12px;color:#766457}
    .dog-dialog .dg-spans input[readonly]{background:#f4eee5;color:#786959}
    .dog-dialog .dg-hint{font:inherit;font-size:14px;font-weight:400;line-height:1.6;color:#715c4d;margin:0;}
    .dog-dialog .dg-error{font-size:14px;line-height:1.5;color:#943e39;margin:0;}
    .dog-dialog .dg-btn{font:inherit;font-weight:700;font-size:16px;line-height:1.5;min-height:45px;border-radius:14px;border:0;color:white;background:#684b3b;cursor:pointer;padding:8px 17px;}
    .dog-dialog .dg-minor{background:none;border:0;padding:0;min-height:32px;color:#9b4a43;font:inherit;font-size:14px;cursor:pointer;}
    .dog-dialog [hidden],#dog-toast[hidden]{display:none!important}
    #dog-toast{position:fixed;bottom:max(18px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:#513e33;color:white;border-radius:18px;padding:11px 17px;font:inherit;font-weight:600;font-size:14px;box-shadow:0 5px 18px #43260f28;z-index:15;max-width:90vw;width:max-content;line-height:1.5;}
    #dog-toast button{font:inherit;font-weight:750;color:#fff2bc;border:0;background:none;padding:0 0 0 15px;cursor:pointer;text-decoration:underline;text-underline-offset:3px;}
    @media(max-width:359px){.dog-dialog form{padding:17px;gap:12px}.dog-dialog .dg-spans{gap:5px}.dog-dialog .dg-spans input{padding:8px 5px;}}
  `;
  document.head.append(modalStyle);

  function dialog(title, fields, confirmText, onSave) {
    if (activeDialog?.open) return null;
    const returnFocus = document.activeElement;
    const el = document.createElement('dialog');
    el.className = 'dog-dialog app-dialog';
    el.setAttribute('aria-labelledby', 'dg-title');
    el.innerHTML = '<form novalidate><header><h2 id="dg-title"></h2><button class="dg-x" type="button" aria-label="关闭">×</button></header>' +
      fields + '<p class="dg-error" role="alert" hidden></p><button class="dg-btn" type="submit"></button></form>';
    el.querySelector('h2').textContent = title;
    el.querySelector('.dg-btn').textContent = confirmText;
    const form = el.querySelector('form'), error = el.querySelector('.dg-error');
    function fail(text) {
      error.textContent = text;
      error.hidden = false;
      return false;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const invalid = form.querySelector('input:invalid,select:invalid');
      if (invalid?.closest('details')) invalid.closest('details').open = true;
      if (!form.reportValidity()) return;
      const submit = form.querySelector('.dg-btn');
      if (submit.disabled) return;
      submit.disabled=true;
      try { if ((await onSave(form, fail)) !== false && el.open) el.close(); }
      finally { submit.disabled=false; }
    });
    el.querySelector('.dg-x').addEventListener('click', () => el.close());
    el.addEventListener('click', event => {
      if (event.target !== el) return;
      const rect = el.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) el.close();
    });
    el.addEventListener('close', () => {
      el.remove();
      if (activeDialog===el) activeDialog = null;
      if (accessKey && returnFocus?.isConnected && !returnFocus.hidden) returnFocus.focus({preventScroll:true});
    }, {once:true});
    document.body.append(el);
    activeDialog = el;
    el.showModal();
    return el;
  }
  function openMonth() {
    const [year, month] = monthKey.split('-').map(Number);
    const monthOptions = Array.from({length:12}, (_, i) =>
      '<option value="' + (i + 1) + '" ' + (i + 1 === month ? 'selected' : '') + '>' + (i + 1) + '月</option>').join('');
    dialog('跳到年月', '<div class="dg-pair"><label>年份<input type="number" inputmode="numeric" name="year" min="1900" max="9999" required value="' +
      year + '"></label><label>月份<select name="month">' + monthOptions + '</select></label></div>', '查看这个月', form => {
      viewMonth(form.elements.year.valueAsNumber, Number(form.elements.month.value));
    });
  }
  function replaceStart(data, newKey) {
    // Archive dates without deleting previous entries. Only anchor is active.
    for (const key of [data.anchor, newKey]) {
      if (validKey(key) && !data.starts.includes(key)) data.starts.push(key);
    }
    data.anchor = newKey;
    data.startSelectionVersion = 1;
  }

  async function saveStart(newKey, baseRevision=revision) {
    if (baseRevision !== revision) return '日历已更新，请重新打开后再修改。';
    const previous = load().anchor;
    if (newKey === previous) {
      if (newKey) select(newKey);
      announce('这次开始日已经记好了');
      return '';
    }
    if (!await change(data => { replaceStart(data, newKey); }, baseRevision)) return null;
    const savedRevision = revision;
    if (newKey) select(newKey);
    announce(newKey ? '已设为' + titleDate(newKey) + '开始' : '已清除当前开始日', async () => {
      if (!await change(data => {
        if (data.anchor !== newKey) return false;
        replaceStart(data, previous);
      }, savedRevision)) return;
      announce('已撤销这次修改');
    });
    return '';
  }

  function primaryPeriod() {
    if (!load().configured) return openSettings();
    return saveStart(todayKey());
  }

  function openPeriodHistory() {
    const current = load(), today = todayKey(), baseRevision=revision;
    const fields = '<label>当前开始日<input type="date" name="date" min="1900-01-01" max="' + today +
      '" value="' + current.anchor + '" required></label>' +
      '<p class="dg-hint">只使用一个当前开始日。更改开始日不会移动已有的起止记录；可在「经期记录」里更正结束日或清除该条起止记录。</p>' +
      '<button type="button" class="dg-minor"' + (current.anchor ? '' : ' hidden') + '>清除当前开始日</button>';
    const el = dialog('设置 / 更正开始日', fields, '保存日期', async (form, fail) => {
      const key = form.elements.date.value;
      if (!validKey(key) || key > todayKey()) return fail('请选择今天或之前的日期。');
      const error = await saveStart(key, baseRevision);
      if (error === null) return false;
      if (error) return fail(error);
    });
    if (!el) return;
    el.querySelector('.dg-minor').addEventListener('click', async () => {
      const error = await saveStart('', baseRevision);
      if (error === null) return;
      if (error) { reportEditFailure(error); return; }
      if (el.open) el.close();
    });
  }

  function openPeriodEnd(start=load().anchor) {
    const current = load(), today = todayKey(), baseRevision = revision;
    if (!validKey(start) || start > today) return;
    const records = periodRecords(current, today);
    const existing = records.find(period => period.start === start);
    if (!existing && current.anchor !== start) return;
    const next = [...records.map(period => period.start), current.anchor]
      .filter(key => validKey(key) && key > start).sort()[0];
    const bounds = [today];
    if (apart(today, start) > 119) bounds.push(dayAfter(start, 119));
    if (next) bounds.push(dayAfter(next, -1));
    const max = bounds.sort()[0];
    const initialDate = existing?.end || (selected >= start && selected <= max ? selected : max);
    const fields = '<p class="dg-hint">开始日：' + start + '。请选择最后一天出血的日期，可以补记。自动配色会参考本次记录，手动配色不变。</p>' +
      '<label>经期结束日<input type="date" name="end" min="' + start + '" max="' +
      max + '" value="' + initialDate + '" required></label>' +
      '<button type="button" class="dg-minor"' + (existing ? '' : ' hidden') + '>清除这条结束日</button>';
    const el = dialog('记经期结束日', fields, '保存结束日', async (form, fail) => {
      const end = form.elements.end.value;
      if (!validPeriodEnd(start, end) || end > max || end > todayKey()) return fail('结束日应在开始日当天或之后，且不能是未来日期。');
      // Each recorded period has one end; do not allow actual periods to overlap.
      if (records.some(p => p.start !== start && start <= p.end && p.start <= end))
        return fail('与已有经期记录重叠，请先核对历史日期。');
      if (existing?.end === end) return;
      if (!await change(data => { data.periodEnds[start] = end; }, baseRevision)) return false;
      select(end);
      announce('已记经期结束日：' + titleDate(end));
    });
    if (!el || !existing) return;
    el.querySelector('.dg-minor').addEventListener('click', async () => {
      if (!await change(data => { delete data.periodEnds[start]; }, baseRevision)) return;
      if (el.open) el.close();
      announce('已清除这条结束日');
    });
  }

  function openPeriodRecords() {
    const today = todayKey(), current = load();
    const records = periodRecords(current, today), estimate = historyEstimate(current, today);
    const guidance = estimate
      ? '近期 ' + estimate.samples + ' 个周期间隔：约 ' + estimate.cycle + ' 天；通常出血约 ' + estimate.bleed +
        ' 天。可在「周期设置」手动套用。'
      : '积累至少四次起止完整、间隔可用的记录后，才能生成历史建议。';
    const entries = records.map(({start,end,days}) => '<li><div>' + start + ' 至 ' + end +
      '（' + days + ' 天）</div><button type="button" class="dg-auto" data-period-start="' + start +
      '">更正或清除结束日</button></li>').join('');
    const el = dialog('经期记录', '<p class="dg-hint">' + guidance +
      '</p>' + (entries ? '<ul class="dg-period-list">' + entries + '</ul>' : '<p class="dg-hint">还没有完整的起止记录。</p>') +
      '<p class="dg-hint">日历颜色只是预计，不能用来确定排卵、黄体期或避孕。</p>', '关闭记录', () => {});
    if (!el) return;
    el.querySelector('.dg-period-list')?.addEventListener('click', event => {
      const start = event.target.closest('button[data-period-start]')?.dataset.periodStart;
      if (!start) return;
      el.addEventListener('close', () => openPeriodEnd(start), {once:true});
      el.close();
    });
  }

  function openSettings() {
    const today = todayKey(), current = load(), original = current.anchor, spans = current.spans, baseRevision=revision;
    const interval = spans.reduce((a,b) => a+b);
    const guess = historyEstimate(current, today);
    const dayInputs = MOODS.map((mood, i) => '<label><span><i style="--tone:' + mood.color + '"></i>' +
      COLOR_NAMES[i] + '</span><input type="number" aria-label="' + COLOR_NAMES[i] + '色天数" name="' + mood.id +
      '" min="1" max="117" step="1" inputmode="numeric" value="' + spans[i] + '"' +
      (i === 0 || i === 3 ? ' readonly' : '') + '></label>').join('');
    const fields = '<label>最近一次月经哪天开始？<input type="date" name="date" min="1900-01-01" max="' +
      today + '" value="' + original + '" required></label>' + '<p class="dg-hint">只使用这个开始日，保存会替换原日期。</p>' +
      '<div class="dg-answers"><label>两次开始相隔几天？<input type="number" name="length" min="4" max="120" inputmode="numeric" step="1" required value="' +
      interval + '"></label><label>月经通常持续几天？<input type="number" name="bleed" min="1" max="117" step="1" inputmode="numeric" required value="' + spans[0] + '"></label></div>' +
      (guess ? '<p class="dg-hint">近期记录建议：周期间隔约 ' + guess.cycle + ' 天，出血约 ' + guess.bleed +
        ' 天。<button type="button" class="dg-auto dg-history-apply">套用历史建议</button></p>' : '') +
      '<div class="dg-preview"><span class="dg-preview-label">四段日历配色</span><div class="dg-bar" aria-hidden="true"></div>' +
      '<div class="dg-summary" aria-live="polite"></div></div>' +
      '<details class="dg-details"><summary>微调配色天数</summary><div class="dg-spans">' + dayInputs +
      '</div><div class="dg-custom-help"><small>黄色随经期天数，红色用剩余天数。</small><button type="button" class="dg-auto">恢复自动</button></div></details>' +
      '<p class="dg-hint">粉色标在周期中间附近。配色不代表实际排卵日，当天状态由你记录。</p>';
    let chosen = spans.slice(), custom = current.customSpans;
    const el = dialog(current.configured ? '周期设置' : '设置我的周期', fields, current.configured ? '保存设置' : '生成我的日历', async (form, fail) => {
      const date = form.elements.date.value, total = form.elements.namedItem('length').valueAsNumber, bleed = form.elements.bleed.valueAsNumber;
      if (!validKey(date) || date > todayKey()) return fail('请选择今天或之前的开始日。');
      if (!autoSpans(total, bleed)) return fail('四段配色需要在经期结束后至少留出三天，请核对两项天数。');
      if (!validSpans(chosen) || chosen[0] !== bleed || chosen.reduce((a,b)=>a+b) !== total) {
        form.querySelector('details').open = true;
        return fail('请为每种颜色至少保留一天，并让总数等于周期间隔。');
      }
      const latest = load();
      if (latest.anchor !== original) return fail('开始日已更改，请重新打开设置。');
      if (!await change(data => {
        data.configured = true;
        data.customSpans = custom;
        data.spans = chosen.slice();
        replaceStart(data, date);
      }, baseRevision)) return false;
      select(todayKey());
      announce('已保存，以后点「月经来了」就能记录');
    });
    if (!el) return;
    if (!current.configured) {
      const close = el.querySelector('.dg-x');
      close.setAttribute('aria-label', '先看日历');
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'dg-minor';
      skip.textContent = '先看日历';
      skip.addEventListener('click', () => el.close());
      el.querySelector('form').append(skip);
    }
    const form = el.querySelector('form'), length = form.elements.namedItem('length'), bleed = form.elements.bleed;
    const inputs = MOODS.map(mood => form.elements[mood.id]);
    const summary = form.querySelector('.dg-summary'), bar = form.querySelector('.dg-bar');
    const label = form.querySelector('.dg-preview-label');
    function preview() {
      bar.replaceChildren();
      label.textContent = custom ? '四段日历配色 · 已微调' : '四段日历配色 · 自动';
      if (!validSpans(chosen)) {
        summary.textContent = '请核对天数，四种颜色都需保留至少一天。';
        return;
      }
      summary.textContent = chosen.map((n,i) => COLOR_NAMES[i] + ' ' + n + ' 天').join('　');
      chosen.forEach((n,i) => {
        const segment = document.createElement('i');
        segment.style.flex = String(n);
        segment.style.background = MOODS[i].color;
        bar.append(segment);
      });
    }
    function refreshAuto() {
      custom = false;
      chosen = autoSpans(length.valueAsNumber, bleed.valueAsNumber);
      inputs.forEach((input, i) => { input.value = chosen ? chosen[i] : ''; });
      preview();
    }
    function adjust() {
      const total = length.valueAsNumber, yellow = bleed.valueAsNumber;
      const green = inputs[1].valueAsNumber, pink = inputs[2].valueAsNumber;
      const red = total - yellow - green - pink;
      chosen = [yellow, green, pink, red];
      inputs[3].value = Number.isFinite(red) ? red : '';
      custom = true;
      preview();
    }
    length.addEventListener('input', refreshAuto);
    bleed.addEventListener('input', refreshAuto);
    inputs[1].addEventListener('input', adjust);
    inputs[2].addEventListener('input', adjust);
    form.querySelector('.dg-custom-help .dg-auto').addEventListener('click', refreshAuto);
    form.querySelector('.dg-history-apply')?.addEventListener('click', () => {
      length.value = guess.cycle; bleed.value = guess.bleed; refreshAuto();
    });
    preview();
  }

  const listen = (name, event, callback) => id(name)?.addEventListener(event, callback);
  listen('prev-month', 'click', () => moveMonth(-1));
  listen('next-month', 'click', () => moveMonth(1));
  listen('today-btn', 'click', () => select(todayKey()));
  listen('month-label', 'click', openMonth);
  listen('settings-btn', 'click', openSettings);
  listen('demo-note', 'click', openSettings);
  listen('period-btn', 'click', primaryPeriod);
  listen('period-history', 'click', openPeriodHistory);
  listen('period-end-btn', 'click', () => openPeriodEnd());
  listen('period-records-btn', 'click', openPeriodRecords);
  listen('undo-btn', 'click', clearMood);
  listen('mood-options', 'click', event => {
    const option = event.target.closest('button[data-mood]');
    if (option) recordMood(option.dataset.mood);
  });
  const grid = id('calendar-grid');
  let touch = null, suppressClick = 0;
  grid.addEventListener('touchstart', event => {
    touch = event.touches.length === 1 ? [event.touches[0].clientX, event.touches[0].clientY] : null;
  }, {passive:true});
  grid.addEventListener('touchcancel', () => { touch = null; }, {passive:true});
  grid.addEventListener('touchend', event => {
    if (!touch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touch[0], dy = event.changedTouches[0].clientY - touch[1];
    touch = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.7) {
      suppressClick = Date.now() + 350;
      moveMonth(dx < 0 ? 1 : -1);
    }
  }, {passive:true});
  grid.addEventListener('click', event => {
    if (Date.now() < suppressClick) return;
    const cell = event.target.closest('button[data-date]');
    if (cell) {
      const key = cell.dataset.date;
      const fromKeyboard = event.detail === 0;
      select(key);
      if (fromKeyboard) grid.querySelector('[data-date="' + key + '"]')?.focus();
    }
  });
  grid.addEventListener('keydown', event => {
    const cell = event.target.closest('button[data-date]');
    const delta = {ArrowRight:1, ArrowLeft:-1, ArrowDown:7, ArrowUp:-7}[event.key];
    if (!cell || !delta) return;
    event.preventDefault();
    const key = dayAfter(cell.dataset.date, delta);
    if (!validKey(key)) return;
    select(key);
    grid.querySelector('[data-date="' + key + '"]')?.focus();
  });
  listen('login-form','submit',event=>{
    event.preventDefault();unlock(id('login-key').value,id('remember-key').checked);
  });
  listen('logout-btn','click',()=>{lockCalendar();id('login-key').focus();});
  listen('sync-btn','click',()=>refreshCloud(true));
  window.addEventListener('storage',event=>{
    if (accessKey && (event.key===null || (event.key===REMEMBER_KEY && event.newValue!==accessKey))) lockCalendar('',false);
  });
  window.addEventListener('focus',()=>refreshCloud());
  window.addEventListener('pageshow',event=>{if(event.persisted) refreshCloud();});
  let lastToday = todayKey();
  function refreshClock() {
    const now = todayKey();
    if (now === lastToday) return;
    if (selected === lastToday) { selected = now; monthKey = now.slice(0,7); }
    lastToday = now;
    render();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) {refreshClock();refreshCloud();} });
  function checkAtMidnight() {
    const next = new Date();
    next.setHours(24,0,1,0);
    setTimeout(() => { refreshClock(); checkAtMidnight(); }, Math.max(1000, next.getTime() - Date.now()));
  }
  checkAtMidnight();
  function resumeRemembered() {
    const key=remembered();
    if(key) unlock(key,true);
  }
  resumeRemembered();
})();

(() => {
  'use strict';

  const REMEMBER_KEY = 'lw5.calendar.private-access.v1';
  const {DAY,MOODS,PHASES,COLOR_NAMES,ORDER,DEFAULT_SPANS,autoSpans,pad,dayKey,keyDate,dayAfter,apart,dateAt,validKey,validPeriodEnd,periodRecords,normalizeEpisodes,episodeRecords,episodeEditProblem,historyEstimate,initial,validSpans,parseCloudState,localDay} = window.LW5CalendarCore;
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
    window.LW5Share?.close();
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
    setText('period-end-text', periods.some(period => period.start === model.anchor) ? '更正经期结束日' : '记经期结束日');
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
  // Old clients use anchor for the one active calendar marker. starts[] is
  // kept as an audit-compatible legacy field, never as episode evidence.
  function replaceAnchor(data, newKey) {
    for (const key of [data.anchor, newKey]) {
      if (validKey(key) && !data.starts.includes(key)) data.starts.push(key);
    }
    data.anchor=newKey; data.startSelectionVersion=1;
    delete data.episodeUnconfirmedAnchor;
  }
  function periodSnapshot(data) {
    return JSON.parse(JSON.stringify({anchor:data.anchor,periodEpisodes:data.periodEpisodes,periodEnds:data.periodEnds,
      episodeUnconfirmedAnchor:data.episodeUnconfirmedAnchor}));
  }
  function restorePeriods(data, before) {
    replaceAnchor(data,before.anchor);
    data.periodEpisodes=before.periodEpisodes; data.periodEnds=before.periodEnds;
    if (before.episodeUnconfirmedAnchor) data.episodeUnconfirmedAnchor=before.episodeUnconfirmedAnchor;
  }
  function modifyStart(data, key, mode, original, today) {
    const rows=normalizeEpisodes(data), row=rows.find(r=>r.start===original);
    if (mode==='clear') {
      if (!original || original !== data.anchor) return '当前开始日已更改，请重新打开。';
      // A completed record remains visible in history when its current marker is cleared.
      if (row && !row.end) rows.splice(rows.indexOf(row),1);
      data.periodEpisodes=rows; replaceAnchor(data,''); return '';
    }
    const correcting=mode==='correct' && row;
    const error=episodeEditProblem(data,correcting ? row.id : '',key,correcting ? row.end : '',today);
    if (error) return error;
    if (correcting) {
      if (row.start !== key && row.end) { delete data.periodEnds[row.start]; data.periodEnds[key]=row.end; }
      row.start=key;
    } else {
      rows.push({id:crypto.randomUUID(),start:key,end:null});
    }
    data.periodEpisodes=rows;
    if ((mode==='correct' && original===data.anchor) || !data.anchor || (mode==='new' && key>data.anchor)) replaceAnchor(data,key);
    else if (!data.starts.includes(key)) data.starts.push(key);
    return '';
  }
  async function saveStart(newKey, baseRevision=revision, mode='correct', original=load().anchor) {
    if (baseRevision !== revision) return '日历已更新，请重新打开后再修改。';
    const before=periodSnapshot(load());
    if (newKey && newKey===original && original===load().anchor && load().episodeUnconfirmedAnchor!==original) {
      select(newKey);announce('这次开始日已经记好了');return '';
    }
    const draft=JSON.parse(JSON.stringify(load())), error=modifyStart(draft,newKey,mode,original,todayKey());
    if (error) return error;
    if (!await change(data=>{Object.assign(data,draft);if(!('episodeUnconfirmedAnchor' in draft))delete data.episodeUnconfirmedAnchor;},baseRevision)) return null;
    const savedRevision=revision;
    if (newKey) select(newKey);
    announce(mode==='clear' ? '已清除当前开始日' : (mode==='new' ? '已新增一次经期：' : '已更正本次开始日：') + titleDate(newKey),async()=>{
      if (!await change(data=>{restorePeriods(data,before);},savedRevision)) return;
      announce('已撤销这次修改');
    });
    return '';
  }
  async function primaryPeriod() {
    if (!load().configured) return openSettings();
    const error=await saveStart(todayKey(),revision,'new');
    if (error) announce(error);
  }
  function openPeriodHistory(original=load().anchor, mode='correct') {
    const current=load(),today=todayKey(),baseRevision=revision,adding=mode==='new',active=original===current.anchor;
    const fields='<label>'+(adding?'另一次开始日':'本次开始日')+'<input type="date" name="date" min="1900-01-01" max="'+today+
      '" value="'+(adding ? '' : original)+'" required></label>'+
      '<p class="dg-hint">'+(adding?'每次只记录一个开始日。上一次忘记填结束也没关系，可随时单独补记。':'这是更正同一次经期，不会新增记录；已填的结束日仍属于这一次。')+'</p>'+
      '<button type="button" class="dg-minor dg-remove"'+(!adding && active && original ? '' : ' hidden')+'>清除当前开始日</button>';
    const el=dialog(adding?'补记另一次经期':(original?'更正这次开始日':'设置开始日'),fields,adding?'新增记录':'保存日期',async(form,fail)=>{
      const error=await saveStart(form.elements.date.value,baseRevision,mode,adding?'':original);
      if (error===null) return false;
      if (error) return fail(error);
    });
    if (!el) return;
    el.querySelector('.dg-minor').addEventListener('click',async()=>{
      const error=await saveStart('',baseRevision,'clear',original);
      if(error===null) return;
      if(error) return reportEditFailure(error);
      if(el.open) el.close();
    });
  }

  function openPeriodEnd(start=load().anchor) {
    const current = load(), today = todayKey(), baseRevision = revision;
    if (!validKey(start) || start > today) return;
    const records = episodeRecords(current, today);
    const existing = records.find(period => period.start === start);
    if (!existing && current.anchor !== start) return;
    const next = [...records.map(period => period.start), current.anchor]
      .filter(key => validKey(key) && key > start).sort()[0];
    const bounds = [today];
    if (apart(today, start) > 119) bounds.push(dayAfter(start, 119));
    if (next) bounds.push(dayAfter(next, -1));
    const max = bounds.sort()[0];
    const initialDate = existing?.end || (selected >= start && selected <= max ? selected : max);
    const fields = '<div class="dg-context"><span>本次经期开始日</span><time datetime="' + start + '">' + start + '</time></div>' +
      '<p class="dg-hint">请选择最后一天出血的日期，可以补记。自动配色会参考本次记录，手动配色不变。</p>' +
      '<label>经期结束日<input type="date" name="end" min="' + start + '" max="' +
      max + '" value="' + initialDate + '" required></label>' +
      '<button type="button" class="dg-minor dg-remove"' + (existing?.end ? '' : ' hidden') + '>清除这条结束日</button>';
    const el = dialog('记经期结束日', fields, '保存结束日', async (form, fail) => {
      const end = form.elements.end.value;
      if (!validPeriodEnd(start, end) || end > max || end > todayKey()) return fail('结束日应在开始日当天或之后，且不能是未来日期。');
      const issue=episodeEditProblem(current,existing?.id || '',start,end,todayKey());
      if (issue) return fail(issue);
      if (existing?.end === end) return;
      if (!await change(data=>{
        const rows=normalizeEpisodes(data,start===data.episodeUnconfirmedAnchor ? '' : data.anchor);
        let row=rows.find(r=>r.start===start);
        if(!row) {row={id:crypto.randomUUID(),start,end:null}; rows.push(row);}
        if(data.episodeUnconfirmedAnchor===start) delete data.episodeUnconfirmedAnchor;
        row.end=end; data.periodEnds[start]=end; data.periodEpisodes=rows;
      },baseRevision)) return false;
      select(end);
      announce('已记经期结束日：' + titleDate(end));
    });
    if (!el || !existing?.end) return;
    el.querySelector('.dg-minor').addEventListener('click', async () => {
      if (!await change(data => {const rows=normalizeEpisodes(data);const row=rows.find(r=>r.start===start);if(!row) return false;row.end=null;delete data.periodEnds[start];data.periodEpisodes=rows;},baseRevision)) return;
      if (el.open) el.close();
      announce('已清除这条结束日');
    });
  }

  function openPeriodRecords() {
    const today = todayKey(), current = load();
    const records=episodeRecords(current,today), estimate=historyEstimate(current,today);
    const guidance=estimate
      ? '近期 '+estimate.samples+' 个周期间隔：约 '+estimate.cycle+' 天；通常出血约 '+estimate.bleed+' 天。可在「周期设置」手动套用。'
      : '逐次保存实际日期。没有填结束日的会留在这里，不会自动补齐。';
    const entries=records.map(({start,end,days})=>'<li><div>'+start+(end?' 至 '+end+'（'+days+' 天）':' 开始 · 结束日待补')+
      '</div><div class="dg-record-actions"><button type="button" class="dg-auto" data-correct-start="'+start+'">更正开始日</button>'+
      '<button type="button" class="dg-auto" data-period-start="'+start+'">'+(end?'更正或清除结束日':'补记这次结束日')+'</button></div></li>').join('');
    const el=dialog('经期记录','<p class="dg-hint">'+guidance+'</p>'+
      (entries?'<ul class="dg-period-list">'+entries+'</ul>':'<p class="dg-hint">还没有经期记录。</p>')+
      '<button type="button" class="dg-auto dg-add-period">＋ 补记另一次开始</button>'+
      '<p class="dg-hint">日历颜色只是预计，不能用来确定排卵、黄体期或避孕。</p>','关闭记录',()=>{});
    if (!el) return;
    el.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b) return;
      let next;
      if(b.dataset.periodStart) next=()=>openPeriodEnd(b.dataset.periodStart);
      else if(b.dataset.correctStart) next=()=>openPeriodHistory(b.dataset.correctStart);
      else if(b.classList.contains('dg-add-period')) next=()=>openPeriodHistory('','new');
      if(next) {el.addEventListener('close',()=>{if(accessKey) next();},{once:true});el.close();}
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
      today + '" value="' + original + '" required></label>' + '<p class="dg-hint">修改日期会更正这次经期；要补记另一次，请去「经期记录」。</p>' +
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
      const draft=JSON.parse(JSON.stringify(latest));
      const issue=modifyStart(draft,date,'correct',original,todayKey());
      if (issue) return fail(issue);
      if (!await change(data => {
        Object.assign(data,draft);if(!('episodeUnconfirmedAnchor' in draft))delete data.episodeUnconfirmedAnchor;
        data.configured = true;
        data.customSpans = custom;
        data.spans = chosen.slice();
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
  listen('period-history', 'click', () => openPeriodHistory());
  listen('share-periods-btn','click',()=>{if(!accessKey) return;const today=todayKey(); window.LW5Share?.open({records:episodeRecords(load(),today).map(({start,end})=>({start,end})),today});});
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

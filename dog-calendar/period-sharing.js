(() => {
  'use strict';
  const RECENT_COUNTS = [3, 4, 6];
  const DEFAULT_COUNT = 4;
  let active = null;
  let opener = null;

  function node(tag, text, attrs = {}) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    return el;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function orderedRecords(records, today) {
    const selected = new Map();
    if (!Array.isArray(records) || !validDate(today)) return [];
    for (const record of records) {
      const start = record?.start, end = record?.end;
      if (!validDate(start) || start > today || selected.has(start)) continue;
      selected.set(start, {start, end: validDate(end) && start <= end && end <= today ? end : ''});
    }
    return [...selected.values()].sort((a, b) => a.start.localeCompare(b.start));
  }

  function dateText(rows) {
    return rows.length ? '经期记录（仅实际记录，未填不补估算）\n' +
      rows.map(p => '开始：' + p.start + '｜结束：' + (p.end || '未记录')).join('\n') : '';
  }

  function close() {
    if (!active) return;
    const current = active, focus = opener;
    active = null;
    opener = null;
    for (const field of current.querySelectorAll('textarea')) field.value = '';
    if (current.open) current.close();
    current.remove();
    if (focus?.isConnected && !focus.closest('[hidden]')) focus.focus();
  }

  function open({records, today} = {}) {
    if (active) return;
    const ordered = orderedRecords(records, today);
    const dialog = node('dialog', '', {class: 'dog-dialog period-share', 'aria-labelledby': 'period-share-title'});
    const form = node('form');
    const header = node('header');
    const title = node('h2', '导出经期日期', {id: 'period-share-title'});
    const dismiss = node('button', '×', {class: 'dg-x', type: 'button', 'aria-label': '关闭'});
    header.append(title, dismiss);
    const hint = node('p', '只复制实际开始日和结束日，不含口令、心情或其他记录。可以一键复制全部，或选择最近几次。复制后由你亲自粘贴发送。', {class: 'dg-hint'});
    const range = node('label', '选择范围');
    const picker = node('select', '', {'aria-label': '选择导出范围'});
    for (const count of RECENT_COUNTS) picker.append(node('option', '最近 ' + count + ' 次记录', {value: count}));
    picker.value = String(DEFAULT_COUNT);
    range.append(picker);
    const previewLabel = node('label', '将要复制的日期');
    const preview = node('textarea', '', {class: 'share-preview', readonly: '', rows: '7', 'aria-label':'经期日期预览', spellcheck:'false'});
    previewLabel.append(preview);

    const agreementLabel = node('label', '', {class: 'share-agreement'});
    const agreement = node('input', '', {type: 'checkbox'});
    agreementLabel.append(agreement, node('span', '我确认记录本人同意分享这些日期。'));

    const feedback = node('p', '', {class:'dg-hint', role:'status', 'aria-live':'polite'});
    const recentFeedback = node('p', '', {class:'dg-hint'});
    const copyAll = node('button', '一键导出全部', {class:'dg-btn', type:'button'});
    const copy = node('button', '复制日期', {class:'dg-auto dg-add-period', type:'button'});
    let fallback = null, attempt = 0;
    function clearFallback() {
      if (!fallback) return;
      fallback.querySelector('textarea').value = '';
      fallback.remove();
      fallback = null;
    }
    function updateCopy() {
      copy.disabled = !agreement.checked || !preview.value;
      copyAll.disabled = !agreement.checked || !ordered.length;
      copy.style.opacity = copy.disabled ? '.61' : '';
      if (!agreement.checked) {
        attempt++;
        clearFallback();
      }
    }
    function render() {
      const count = Number(picker.value);
      const rows = ordered.slice(-(RECENT_COUNTS.includes(count) ? count : DEFAULT_COUNT));
      preview.value = dateText(rows);
      feedback.textContent = ordered.length ? '共 ' + ordered.length + ' 条经期记录。' : '目前还没有可以导出的记录。';
      recentFeedback.textContent = rows.length ? '预览 ' + rows.length + ' 条记录。' : '';
      recentFeedback.hidden = !rows.length;
      agreement.disabled = !rows.length;
      agreement.checked = false;
      updateCopy();
    }
    async function copyDates(all) {
      if (active !== dialog || !agreement.checked) return;
      const payload = all ? dateText(ordered) : preview.value;
      if (!payload) return;
      const requested = ++attempt;
      clearFallback();
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(payload);
        if (active === dialog && attempt === requested) {
          const message = (all ? '已复制全部 ' + ordered.length + ' 条。' : '已复制。') + '可以回到银月对话，再粘贴发送。';
          feedback.textContent = message;
          if (!all) recentFeedback.textContent = message;
        }
      } catch {
        if (active !== dialog || !agreement.checked || attempt !== requested) return;
        let field = preview;
        if (all) {
          fallback = node('label', '全部记录（手动复制）');
          field = node('textarea', '', {class:'share-preview', readonly:'', rows:'7',
            'aria-label':'全部经期日期（手动复制）', spellcheck:'false'});
          field.value = payload;
          fallback.append(field);
          feedback.after(fallback);
        }
        field.focus();
        field.select();
        feedback.textContent = '自动复制不可用。长按预览文字，选择复制即可。';
        if (!all) recentFeedback.textContent = feedback.textContent;
      }
    }
    picker.addEventListener('change', render);
    agreement.addEventListener('change', updateCopy);
    copyAll.addEventListener('click', () => copyDates(true));
    copy.addEventListener('click', () => copyDates(false));
    form.addEventListener('submit', event => event.preventDefault());
    dismiss.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (active === dialog) close(); });
    form.append(header, hint, agreementLabel, copyAll, feedback, range, previewLabel, recentFeedback, copy);
    dialog.append(form);
    opener = document.activeElement;
    active = dialog;
    render();
    document.body.append(dialog);
    dialog.showModal();
    if (agreement.disabled) dismiss.focus();
    else agreement.focus();
  }

  window.LW5Share = Object.freeze({open, close});
})();

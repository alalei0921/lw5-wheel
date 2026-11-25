(() => {
  'use strict';
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

  function selectRecords(records, today, count) {
    const selected = new Map();
    if (!Array.isArray(records) || !validDate(today)) return [];
    for (const record of records) {
      const start = record?.start, end = record?.end;
      if (!validDate(start) || start > today || selected.has(start)) continue;
      selected.set(start, {start, end: validDate(end) && start <= end && end <= today ? end : ''});
    }
    return [...selected.values()].sort((a, b) => b.start.localeCompare(a.start)).slice(0, count).reverse();
  }

  function close() {
    if (!active) return;
    const current = active, focus = opener;
    active = null;
    opener = null;
    const preview = current.querySelector('textarea');
    if (preview) preview.value = '';
    if (current.open) current.close();
    current.remove();
    if (focus?.isConnected && !focus.closest('[hidden]')) focus.focus();
  }

  function open({records, today} = {}) {
    if (active) return;
    const dialog = node('dialog', '', {class: 'dog-dialog period-share', 'aria-labelledby': 'period-share-title'});
    const form = node('form');
    const header = node('header');
    const title = node('h2', '导出经期日期', {id: 'period-share-title'});
    const dismiss = node('button', '×', {class: 'dg-x', type: 'button', 'aria-label': '关闭'});
    header.append(title, dismiss);
    const hint = node('p', '只复制你选的开始日和结束日，不含口令、心情或其他记录。复制后还要由你亲自粘贴发送；关闭不会发送任何内容。', {class: 'dg-hint'});
    const range = node('label', '选择范围');
    const picker = node('select', '', {'aria-label': '选择导出范围'});
    for (const count of [3, 4, 6]) picker.append(node('option', '最近 ' + count + ' 次记录', {value: count}));
    picker.value = '4';
    range.append(picker);
    const previewLabel = node('label', '将要复制的日期');
    const preview = node('textarea', '', {class: 'share-preview', readonly: '', rows: '7', 'aria-label':'经期日期预览', spellcheck:'false'});
    previewLabel.append(preview);

    const agreementLabel = node('label', '', {class: 'share-agreement'});
    const agreement = node('input', '', {type: 'checkbox'});
    agreementLabel.append(agreement, node('span', '我确认记录本人同意分享这些日期。'));

    const feedback = node('p', '', {class:'dg-hint', role:'status', 'aria-live':'polite'});
    const copy = node('button', '复制日期', {class:'dg-btn', type:'button'});
    const updateCopy = () => { copy.disabled = !agreement.checked || !preview.value; };
    function render() {
      const rows = selectRecords(records, today, Number(picker.value));
      preview.value = rows.length ? '经期记录（仅实际记录，未填不补估算）\n' +
        rows.map(p => '开始：' + p.start + '｜结束：' + (p.end || '未记录')).join('\n') : '';
      feedback.textContent = rows.length ? '预览 ' + rows.length + ' 条记录。' : '目前还没有可以导出的记录。';
      agreement.disabled = !rows.length;
      agreement.checked = false;
      updateCopy();
    }
    picker.addEventListener('change', render);
    agreement.addEventListener('change', updateCopy);
    copy.addEventListener('click', async () => {
      if (active !== dialog || !agreement.checked || !preview.value) return;
      const payload = preview.value;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(payload);
        if (active === dialog) feedback.textContent = '已复制。可以回到银月对话，核对后再粘贴发送。';
      } catch {
        if (active !== dialog) return;
        preview.focus();
        preview.select();
        feedback.textContent = '自动复制不可用。长按预览文字，选择复制即可。';
      }
    });
    form.addEventListener('submit', event => event.preventDefault());
    dismiss.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (active === dialog) close(); });
    form.append(header, hint, range, previewLabel, agreementLabel, feedback, copy);
    dialog.append(form);
    opener = document.activeElement;
    active = dialog;
    render();
    document.body.append(dialog);
    dialog.showModal();
    picker.focus();
  }

  window.LW5Share = Object.freeze({open, close});
})();

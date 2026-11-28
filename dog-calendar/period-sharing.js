(() => {
  'use strict';
  const RECENT_COUNTS = [3, 4, 6];
  const DEFAULT_COUNT = 4;
  let active = null;
  let opener = null;
  let cancelManual = null;

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
    cancelManual?.();
    cancelManual = null;
    for (const field of current.querySelectorAll('textarea')) field.value = '';
    if (current.open) current.close();
    current.remove();
    if (focus?.isConnected && !focus.closest('[hidden]')) focus.focus();
  }

  function manualPanel(form, dialog, today, prepareManualExport) {
    const hint = node('p', '导出全部已记的经期起止、每日经量和手选狗狗状态。漏记留空。JSON 在本机生成，复制或保存后由你决定是否分享。', {class:'dg-hint'});
    const rangeLabel = node('label', '经量从哪天查起？');
    const source = node('select', '', {id:'share-flow-source'});
    source.append(node('option', '请选择', {value:''}),
      node('option', '从本人确认的最早可能日期查起', {value:'since'}),
      node('option', '记录本人确认从未填过经量', {value:'none'}));
    rangeLabel.append(source);
    const sinceLabel = node('label', '最早可能填过经量的日期');
    const since = node('input', '', {id:'share-flow-since', type:'date', min:'1900-01-01', max:today});
    sinceLabel.append(since);
    const boundLabel = node('label', '', {class:'share-agreement'});
    const bound = node('input', '', {type:'checkbox', id:'share-flow-bound-confirm'});
    boundLabel.append(bound, node('span', '经记录本人确认，所选日期之前没有填过经量。'));
    const rangeHint = node('p', '', {class:'dg-hint'});
    const consentLabel = node('label', '', {class:'share-agreement'});
    const consent = node('input', '', {type:'checkbox', id:'share-manual-consent'});
    consentLabel.append(consent, node('span', '我已确认，记录本人同意分享她的全部经期起止、按日经量和手选狗狗状态。'));
    const prepare = node('button', '一键导出全部手动记录', {type:'button', class:'dg-btn', id:'share-manual-prepare'});
    const status = node('p', '', {id:'share-manual-status', class:'dg-hint', role:'status', 'aria-live':'polite'});
    const outputLabel = node('label', '可复制或保存的 JSON');
    const output = node('textarea', '', {id:'share-manual-output', class:'share-preview', readonly:'', rows:'6', spellcheck:'false'});
    outputLabel.append(output);
    const actions = node('div', '', {class:'dg-record-actions'});
    const copy = node('button', '复制 JSON', {type:'button', id:'share-manual-copy'});
    const save = node('button', '保存 JSON 文件', {type:'button', id:'share-manual-save'});
    actions.append(copy, save);
    form.append(hint, rangeLabel, sinceLabel, boundLabel, rangeHint, consentLabel, prepare, status, outputLabel, actions);
    let controller = null, fileURL = '';
    function clearOutput() {
      if (controller) controller.abort();
      controller = null;
      output.value = '';
      outputLabel.hidden = actions.hidden = true;
      status.textContent = '';
      if (fileURL) URL.revokeObjectURL(fileURL);
      fileURL = '';
    }
    function setControls() {
      const useRange = source.value === 'since';
      const hasDate = validDate(since.value) && since.value <= today;
      sinceLabel.hidden = boundLabel.hidden = !useRange;
      bound.disabled = !hasDate;
      const canPrepare = source.value === 'none' || (useRange && hasDate && bound.checked);
      consent.disabled = !canPrepare;
      prepare.disabled = !canPrepare || !consent.checked || !!controller;
      if (useRange && hasDate) {
        const total = 1 + Math.round((Date.parse(today) - Date.parse(since.value)) / 86400000);
        rangeHint.textContent = '将通过原日历逐日只读核对 ' + total + ' 天的经量。请保持联网，关闭弹窗可取消。若补记过更早的日期，请把它也算进去。';
      } else if (source.value === 'none') {
        rangeHint.textContent = '经量按本人的确认留空。经期起止和手选狗狗仍覆盖全部历史。';
      } else {
        rangeHint.textContent = '请按经量所属的日期选，包括后来补记的旧日期。记不清时，可选一个她确定更早的日期。';
      }
    }
    function editRange(resetDate) {
      clearOutput();
      if (resetDate) since.value = '';
      bound.checked = consent.checked = false;
      setControls();
    }
    source.addEventListener('change', () => editRange(true));
    since.addEventListener('input', () => editRange(false));
    since.addEventListener('change', () => editRange(false));
    bound.addEventListener('change', () => { clearOutput(); consent.checked = false; setControls(); });
    consent.addEventListener('change', () => { clearOutput(); setControls(); });
    prepare.addEventListener('click', async () => {
      if (active !== dialog || prepare.disabled) return;
      clearOutput();
      const request = new AbortController();
      controller = request;
      let checked = 0;
      setControls();
      status.textContent = '正在准备全部记录…';
      try {
        const data = await prepareManualExport({since:since.value, noFlow:source.value === 'none', signal:request.signal,
          onProgress(done, total) {
            if (controller === request && Number.isSafeInteger(done) && Number.isSafeInteger(total) && done >= checked) {
              checked = done;
              status.textContent = '已核对经量 ' + done + ' / ' + total + ' 天。';
            }
          }});
        if (controller !== request || active !== dialog || !consent.checked) return;
        if (typeof data !== 'string' || !data) throw new Error('Invalid export');
        output.value = data;
        outputLabel.hidden = actions.hidden = false;
        status.textContent = '已生成。可在本机复制或保存 JSON。';
      } catch (error) {
        if (controller !== request) return;
        if (error?.code === 'flow_scope_mismatch') {
          status.textContent = '已知经量与所选范围不一致。请与记录本人核对，再选择包含所有补记的起始日。';
        } else if (error?.code === 'calendar_busy') {
          status.textContent = '日历正在保存或同步。请等操作完成后重试。';
        } else {
          status.textContent = '未能完整核对。请检查网络和日历同步状态后重试，本次没有生成文件。';
        }
      } finally {
        if (controller === request) { controller = null; setControls(); }
      }
    });
    function canShare() { return active === dialog && consent.checked && !!output.value && !actions.hidden; }
    copy.addEventListener('click', async () => {
      if (!canShare()) return;
      const text = output.value;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        if (canShare() && text === output.value) status.textContent = '已复制，可粘贴到你选择的位置。';
      } catch {
        if (!canShare() || text !== output.value) return;
        output.focus(); output.select();
        output.setSelectionRange(0, output.value.length);
        status.textContent = '自动复制不可用。长按预览文字，选择复制即可。';
      }
    });
    save.addEventListener('click', () => {
      if (!canShare()) return;
      try {
        if (fileURL) URL.revokeObjectURL(fileURL);
        fileURL = URL.createObjectURL(new Blob([output.value], {type:'application/json;charset=utf-8'}));
        const link = node('a', '', {href:fileURL, download:'狗狗日历-全部手动记录.json'});
        dialog.append(link);
        link.click();
        link.remove();
        status.textContent = '已发起保存，可在系统提示中选择位置。';
      } catch {
        status.textContent = '此浏览器无法保存文件，可以复制上方 JSON。';
      }
    });
    clearOutput();
    setControls();
    return clearOutput;
  }

  function open({records, today, prepareManualExport} = {}) {
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
    const scopes = node('div', '', {class:'dg-record-actions', role:'group', 'aria-label':'导出内容'});
    const dateMode = node('button', '仅经期日期', {type:'button', id:'share-dates-mode', 'aria-pressed':'true'});
    const manualMode = node('button', '全部手动记录', {type:'button', id:'share-manual-mode', 'aria-pressed':'false'});
    scopes.append(dateMode, manualMode);
    scopes.hidden = typeof prepareManualExport !== 'function';
    function selectScope(manual) {
      cancelManual?.();
      cancelManual = null;
      agreement.checked = false;
      updateCopy();
      form.replaceChildren(header, scopes);
      dateMode.setAttribute('aria-pressed', String(!manual));
      manualMode.setAttribute('aria-pressed', String(manual));
      title.textContent = manual ? '导出全部手动记录' : '导出经期日期';
      if (manual) {
        cancelManual = manualPanel(form, dialog, today, prepareManualExport);
      } else {
        form.append(hint, agreementLabel, copyAll, feedback, range, previewLabel, recentFeedback, copy);
        render();
      }
    }
    dateMode.addEventListener('click', () => { if (cancelManual) { selectScope(false); dateMode.focus(); } });
    manualMode.addEventListener('click', () => {
      if (!cancelManual && typeof prepareManualExport === 'function') { selectScope(true); manualMode.focus(); }
    });
    selectScope(false);
    dialog.append(form);
    opener = document.activeElement;
    active = dialog;
    document.body.append(dialog);
    dialog.showModal();
    if (agreement.disabled) dismiss.focus();
    else agreement.focus();
  }

  window.LW5Share = Object.freeze({open, close});
})();

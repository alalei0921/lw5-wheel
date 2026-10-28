/* Local-only settings and one current-day mark per row. No network or history. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LW5Supplements = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const PREFIX = 'lw5.supplements.v1.';
  const CONFIG_KEY = PREFIX + 'config';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const LABELS = ['镁片', '鱼油', '蛋白粉', '肌酸'];
  const defaults = () => LABELS.map(name => ({ name, description: '' }));
  function displayItems(items, labelsVersion) {
    if (labelsVersion === 2) return items;
    // Recognize the complete legacy four-product layout, not arbitrary substrings.
    // Brand tokens are generic; no personal brand names or dosage are shipped.
    const legacyForms = [
      /^[A-Z][A-Z0-9-]{1,19} 甘氨酸镁$/,
      /^[A-Z][A-Z0-9-]{1,19} 鱼油（可选）$/,
      /^[A-Z][A-Z0-9-]{1,19} 蛋白粉$/,
      /^[A-Z][A-Z0-9-]{1,19} 单方肌酸$/
    ];
    const legacySet = items.every((item, i) => legacyForms[i].test(item.name));
    return items.map((item, i) => {
      const placeholder = new RegExp('^(?:补剂|补给)\\s*(?:' + (i + 1) + '|' + '一二三四'[i] + ')$').test(item.name);
      if (!placeholder && !legacySet) return item;
      return { name: LABELS[i], description: placeholder && item.description === '点「编辑」填写名称和用量' ? '' : item.description };
    });
  }
  function dayKey(time = Date.now()) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function untilMidnight(time = Date.now()) {
    return Math.max(1, Date.parse(dayKey(time) + 'T00:00:00+08:00') + 86400000 - time);
  }
  function validateItems(items) {
    if (!Array.isArray(items) || items.length !== 4) throw Error('清单需要恰好 4 项。');
    return items.map(item => {
      if (!item || typeof item.name !== 'string' || typeof item.description !== 'string' ||
          !item.name.trim() || item.name.length > 60 || item.description.length > 240) {
        throw Error('每项需要名称（最多 60 字），说明最多 240 字。');
      }
      return { name: item.name.trim(), description: item.description.trim() };
    });
  }
  function parseSettings(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { throw Error('清单文件不是有效的 JSON。'); }
    if (data?.format !== 'lw5-supplements' || data.version !== 1) throw Error('请选择 LW5 补剂清单文件。');
    return validateItems(data.items);
  }
  function createStore(storage, now = () => Date.now()) {
    function config() {
      const raw = storage.getItem(CONFIG_KEY);
      // Presentation migration never rewrites old storage, notes, or daily marks.
      return { raw, items: raw === null ? defaults() : displayItems(parseSettings(raw), JSON.parse(raw).labelsVersion) };
    }
    function snapshot() {
      const current = config(), day = dayKey(now());
      return { ...current, day, checked: current.items.map((_, i) => storage.getItem(PREFIX + 'check.' + i) === day) };
    }
    function setChecked(index, value) {
      if (!Number.isInteger(index) || index < 0 || index > 3 || typeof value !== 'boolean') throw Error('无效的打卡项目。');
      storage.setItem(PREFIX + 'check.' + index, value ? dayKey(now()) : '');
      return snapshot();
    }
    function saveSettings(items, expectedRaw) {
      const normalized = validateItems(items);
      if (storage.getItem(CONFIG_KEY) !== expectedRaw) throw Error('另一个窗口已修改清单。草稿仍保留，请取消后重新编辑。');
      storage.setItem(CONFIG_KEY, JSON.stringify({ format: 'lw5-supplements', version: 1, labelsVersion: 2, items: normalized }));
      return snapshot();
    }
    return { snapshot, setChecked, saveSettings };
  }
  return { PREFIX, CONFIG_KEY, dayKey, untilMidnight, validateItems, parseSettings, createStore };
});

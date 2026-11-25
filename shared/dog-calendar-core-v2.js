(() => {
  'use strict';
  const DAY = 86400000;
  const RPC_URL = 'https://lrtglriomkxjxmxpzivj.supabase.co/functions/v1/lw5-dog-calendar/';
  const PUBLIC_KEY = 'sb_publishable_0Lah9n6HEd-KYcJS1D5F1Q_jJsoQBEJ';
  const MOODS = [
    { id: 'tired', name: '疲劳', color: '#c98b0a', wash: '#fff0a6' },
    { id: 'good', name: '好', color: '#5a8948', wash: '#dcebc9' },
    { id: 'best', name: '最好', color: '#bd5e86', wash: '#fbd6e4' },
    { id: 'grumpy', name: '暴躁', color: '#ca6655', wash: '#ffd0c5' }
  ];
  const PHASES = ['经期段', '经后段', '周期中段', '周期后段'];
  const COLOR_NAMES = ['黄', '绿', '粉', '红'];
  function autoSpans(interval, bleed) {
    if (!Number.isInteger(interval) || interval < 4 || interval > 120 ||
        !Number.isInteger(bleed) || bleed < 1 || bleed > interval - 3) return null;
    const middleDays = Math.min(3, interval - bleed - 2);
    const halfway = Math.floor((interval + 1) / 2);
    const middleStart = Math.max(bleed + 2, Math.min(interval - middleDays, halfway - Math.floor(middleDays / 2)));
    const afterBleed = middleStart - bleed - 1;
    return [bleed, afterBleed, middleDays, interval - bleed - afterBleed - middleDays];
  }
  const DEFAULT_SPANS = autoSpans(28, 5);
  const ORDER = MOODS.map(mood => mood.id);
  function pad(value) { return String(value).padStart(2, '0'); }
  function dayKey(date) { return date.toISOString().slice(0, 10); }
  function keyDate(key) { return new Date(key + 'T00:00:00Z'); }
  function dayAfter(key, offset) { return dayKey(new Date(keyDate(key).getTime() + offset * DAY)); }
  function apart(a, b) { return (keyDate(a) - keyDate(b)) / DAY; }
  function dateAt(year, month, day) { return new Date(Date.UTC(year, month - 1, day)); }
  function validKey(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key) || key < '1900-01-01') return false;
    const date = keyDate(key);
    return Number.isFinite(date.getTime()) && dayKey(date) === key;
  }
  function validPeriodEnd(start, end) {
    return validKey(start) && validKey(end) && end >= start && apart(end, start) < 120;
  }
  function periodRecords(model, today) {
    return Object.entries(model.periodEnds || {})
      .filter(([start, end]) => validPeriodEnd(start, end) && end <= today)
      .map(([start, end]) => ({start, end, days: apart(end, start) + 1}))
      .sort((a,b) => b.start.localeCompare(a.start));
  }
  function median(values) {
    const sorted = values.slice().sort((a,b) => a-b), mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function historyEstimate(model, today) {
    // Legacy starts can include replaced or undone dates. Only deliberate
    // start/end pairs qualify, and only consecutive recent records are compared.
    const pairs = periodRecords(model, today).slice(0, 7).reverse();
    const gaps = pairs.slice(1).map((p, i) => apart(p.start, pairs[i].start));
    const plausible = gaps.filter(n => n >= 21 && n <= 45);
    const center = median(plausible);
    const usable = plausible.filter(n => Math.abs(n-center) <= 7);
    if (usable.length < 3) return null;
    const lengths = pairs.map(p => p.days).filter(n => n <= 15);
    if (lengths.length < 3) return null;
    const cycle = Math.round(median(usable)), bleed = Math.round(median(lengths));
    return autoSpans(cycle, bleed) ? {cycle, bleed, samples:usable.length} : null;
  }
  function initial() {
    return { version: 2, personal: false, configured: false, customSpans: false, anchor: '', starts: [], startSelectionVersion: 1, spans: [...DEFAULT_SPANS], moods: {}, periodEnds: {} };
  }
  function validSpans(spans) {
    return Array.isArray(spans) && spans.length === 4 &&
      spans.every(n => Number.isInteger(n) && n >= 1 && n <= 120) &&
      spans.reduce((sum, n) => sum + n, 0) <= 120;
  }
  function parseCloudState(data) {
    if (data === null) return initial();
    if (!data || data.version !== 2 || !validSpans(data.spans) || !Array.isArray(data.starts) ||
        !data.moods || Array.isArray(data.moods) || typeof data.moods !== 'object') {
      throw new Error('云端数据格式异常，已停止写入。');
    }
    // Retain unrelated fields (for example notes) and the original history.
    const result = { ...data, ...initial() };
    result.personal = data.personal === true;
    // starts remains historical data, never the set of active calendar markers.
    result.starts = data.starts.slice();
    const latestHistorical = data.starts.filter(validKey).sort().at(-1) || '';
    result.anchor = validKey(data.anchor) ? data.anchor :
      data.startSelectionVersion === 1 && data.anchor === '' ? '' : latestHistorical;
    result.configured = data.configured === true;
    result.customSpans = data.customSpans === true;
    result.spans = data.spans.slice();
    result.moods = { ...data.moods };
    const ends = data.periodEnds;
    if (ends !== undefined && (!ends || Array.isArray(ends) || typeof ends !== 'object')) {
      throw new Error('云端经期记录格式异常，已停止写入。');
    }
    // Keep the entire existing field on round-trip; invalid dates are
    // ignored for display and suggestions rather than silently removed.
    result.periodEnds = { ...ends };
    return result;
  }
  const M = moodId => MOODS.find(mood => mood.id === moodId);
  function mix(a, b, fraction) {
    const av = parseInt(a.slice(1), 16), bv = parseInt(b.slice(1), 16);
    const channels = [16, 8, 0].map(shift => {
      const left = av >> shift & 255, right = bv >> shift & 255;
      return Math.round(left + (right - left) * fraction);
    });
    return 'rgb(' + channels.join(',') + ')';
  }
  function status(model, key, today) {
    if (ORDER.includes(model.moods[key])) {
      const mood = M(model.moods[key]);
      return { mood, kind: 'logged', wash: mood.wash };
    }
    const demo = !model.personal;
    const distance = apart(key, today);
    if (distance > 30 || (!demo && distance < 0) || (demo && key < today.slice(0, 7) + '-01')) return null;
    const anchor = demo ? dayAfter(today, -9) : model.anchor;
    if (!anchor || (!demo && key < anchor)) return null;
    let spans = demo ? DEFAULT_SPANS : model.spans;
    const length = spans.reduce((a, b) => a + b);
    const offset = apart(key, anchor);
    // An actual end updates only this cycle's automatic colors. The next
    // cycle still uses the configured defaults; manual colors stay intact.
    const end = model.periodEnds?.[anchor];
    if (!demo && !model.customSpans && offset < length && end <= today && validPeriodEnd(anchor, end)) {
      spans = autoSpans(length, apart(end, anchor) + 1) || spans;
    }
    let index = ((offset % length) + length) % length;
    for (let i = 0; i < MOODS.length; i++) {
      const duration = spans[i];
      if (index < duration) {
        const mood = MOODS[i];
        const next = MOODS[(i + 1) % 4], previous = MOODS[(i + 3) % 4];
        let wash = mood.wash;
        if (index === duration - 1) wash = mix(mood.wash, next.wash, 0.32);
        else if (index === 0) wash = mix(mood.wash, previous.wash, 0.32);
        return { mood, kind: demo ? 'demo' : 'forecast', wash };
      }
      index -= duration;
    }
    return null;
  }
  async function rpc(name, payload, signal) {
    const response = await fetch(RPC_URL + name, {
      method:'POST', headers:{'Content-Type':'application/json', 'apikey':PUBLIC_KEY},
      body: JSON.stringify(payload), cache:'no-store', referrerPolicy:'no-referrer', signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const denied = (response.status === 401 || response.status === 403) && body?.code === '42501';
      const error = new Error(denied ? '口令无效，请核对后再试。' : '云端暂时没有响应，请稍后重试。');
      error.denied = denied;
      throw error;
    }
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || !Object.hasOwn(body, 'state'))
      throw new Error('云端返回异常，请重新同步。');
    return body;
  }
  function localDay() {const now=new Date();return [now.getFullYear(),pad(now.getMonth()+1),pad(now.getDate())].join('-');}
  window.LW5CalendarCore = Object.freeze({DAY,MOODS,PHASES,COLOR_NAMES,ORDER,DEFAULT_SPANS,autoSpans,pad,dayKey,keyDate,dayAfter,apart,dateAt,validKey,validPeriodEnd,periodRecords,historyEstimate,initial,validSpans,parseCloudState,status,rpc,localDay});
})();

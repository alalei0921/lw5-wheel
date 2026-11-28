(() => {
  'use strict';

  const flowNames = new Map([['light', '量少'], ['medium', '中等'], ['heavy', '量多']]);

  // records comes from episodeRecords; flows contains only confirmed per-date values.
  function format({records, moods, flows, today}) {
    const {validKey, validPeriodEnd, MOODS} = window.LW5CalendarCore;
    if (!validKey(today) || !Array.isArray(records) || !moods || Array.isArray(moods) ||
        typeof moods !== 'object' || !(flows instanceof Map)) {
      throw new Error('手动记录尚未准备完整。');
    }
    const actualDate = date => validKey(date) && date <= today;
    const periods = [];
    const seen = new Set();
    for (const record of records) {
      const start = record?.start, end = record?.end;
      if (!actualDate(start) || seen.has(start)) continue;
      seen.add(start);
      periods.push({start, end: actualDate(end) && validPeriodEnd(start, end) ? end : null});
    }
    periods.sort((a, b) => a.start.localeCompare(b.start));

    const stateNames = new Map(MOODS.map(mood => [mood.id, mood.name]));
    const dates = [...new Set([...Object.keys(moods), ...flows.keys()])].filter(actualDate).sort();
    const days = [];
    for (const date of dates) {
      const value = flows.has(date) ? flows.get(date) : null;
      if (value !== null && !flowNames.has(value)) throw new Error('经量记录未能核对。');
      const flow = flowNames.get(value) || null;
      const state = Object.hasOwn(moods, date) ? stateNames.get(moods[date]) || null : null;
      if (flow || state) days.push({date, flow, state});
    }
    return JSON.stringify({version: 1, periods, days}, null, 2);
  }

  window.LW5ManualExport = Object.freeze({format});
})();

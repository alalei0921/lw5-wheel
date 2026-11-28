const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
const context = vm.createContext({window, Map});
for (const script of ['shared/dog-calendar-core-v3.js', 'dog-calendar/manual-export.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', script), 'utf8'), context);
}
const core = window.LW5CalendarCore;
const today = '2024-12-31';
function output(input) {
  return JSON.parse(window.LW5ManualExport.format({today, records: [], moods: {}, flows: new Map(), ...input}));
}

test('all confirmed episodes and all daily manual fields use a strict output allowlist', () => {
  const months = Array.from({length: 11}, (_, i) => '2024-' + String(i + 1).padStart(2, '0'));
  const records = months.map(month => ({
    start: month + '-01', end: month + '-04', id: 'synthetic-private-id', note: 'synthetic-note'
  }));
  records[10].end = '';
  const rows = output({
    records: records.reverse(),
    moods: {'2024-02-29': 'tired', '2024-03-01': 'best', '2024-05-13': 'grumpy', '2024-07-07': 'good'},
    flows: new Map([['2021-01-08', 'light'], ['2024-02-29', 'heavy'], ['2024-03-03', 'medium'],
      ['2024-05-13', null], ['2024-06-01', null]]),
    otherTool: 'synthetic-other-tool', settings: {spans: [5, 4, 3, 2]}, account: 'synthetic-member'
  });
  assert.deepEqual(Object.keys(rows), ['version', 'periods', 'days']);
  assert.equal(rows.version, 1);
  assert.deepEqual(rows.periods, months.map((month, i) => ({start: month + '-01', end: i < 10 ? month + '-04' : null})));
  assert.deepEqual(rows.days, [
    {date: '2021-01-08', flow: '量少', state: null},
    {date: '2024-02-29', flow: '量多', state: '疲劳'},
    {date: '2024-03-01', flow: null, state: '最好'},
    {date: '2024-03-03', flow: '中等', state: null},
    {date: '2024-05-13', flow: null, state: '暴躁'},
    {date: '2024-07-07', flow: null, state: '好'}
  ]);
});

test('legacy mapping includes established pairs and the intentional anchor without inventing old starts', () => {
  const data = {version: 2, spans: [5, 12, 3, 8], moods: {}, personal: true,
    starts: ['2021-02-04', '2021-03-11'], periodEnds: {'2021-02-05': '2021-02-10'},
    notes: {'2021-02-05': 'opaque historical metadata'}};
  const ambiguous = core.parseCloudState(data);
  assert.deepEqual(output({records: core.episodeRecords(ambiguous, today)}).periods,
    [{start: '2021-02-05', end: '2021-02-10'}]);
  const confirmed = core.parseCloudState({...data, anchor: '2021-03-12'});
  assert.deepEqual(output({records: core.episodeRecords(confirmed, today)}).periods,
    [{start: '2021-02-05', end: '2021-02-10'}, {start: '2021-03-12', end: null}]);
});

test('empty, cleared, predicted, future, noncalendar and unknown entries contribute no data', () => {
  const initial = core.initial();
  assert.deepEqual(output({records: core.episodeRecords(initial, today), moods: initial.moods}),
    {version: 1, periods: [], days: []});
  const inherited = Object.create({'2024-07-07': 'tired'});
  Object.assign(inherited, {'2025-01-01': 'grumpy', '2024-02-30': 'good', '2024-07-01': 'unknown'});
  const result = output({records: [{start: '2024-02-30'}, {start: '2025-01-01'},
    {start: '2024-12-01', end: '2024-11-30'}], moods: inherited,
    flows: new Map([['2024-07-07', 'light'], ['2024-08-15', null], ['2025-01-01', 'heavy']])});
  assert.deepEqual(result, {version: 1, periods: [{start: '2024-12-01', end: null}],
    days: [{date: '2024-07-07', flow: '量少', state: null}]});
  assert.throws(() => output({flows: undefined}));
  assert.throws(() => output({flows: new Map([['2024-09-01', 'unconfirmed']])}));
});

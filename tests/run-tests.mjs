// Tests for the percent + recap core logic embedded in index.html.
// Run with: node tests/run-tests.mjs
// The harness extracts the section of <script> between the CORE LOGIC
// markers in index.html and evaluates it in an isolated VM context, so the
// tests exercise the exact code that ships to the browser.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, '..', 'index.html');
const html = readFileSync(htmlPath, 'utf8');

// --- extract core logic ---
const BEGIN = 'CORE LOGIC (TESTED BEGIN)';
const END = 'CORE LOGIC (TESTED END)';
const bIdx = html.indexOf(BEGIN);
const eIdx = html.indexOf(END);
if (bIdx < 0 || eIdx < 0 || eIdx < bIdx) {
  throw new Error('CORE LOGIC markers not found in index.html');
}
const coreStart = html.indexOf('\n', bIdx) + 1;              // skip past the BEGIN marker line
const coreEnd = html.lastIndexOf('\n', eIdx);                // start of the END marker line
const coreCode = html.slice(coreStart, coreEnd);

const exportExpr = `({
  pad2, round1, parsePercent, formatPct, isKillPull, bestPctFromPulls,
  killLineVerdict, killMargin, isoWeekKey, weekKeyMonday, weekRangeLabel,
  weekStats, partyWeekSummary, fmtDelta, buildRecap
})`;
const CORE = vm.runInNewContext(coreCode + '\n' + exportExpr, {}, { timeout: 2000 });

// --- full inline script must at least be syntactically valid ---
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('no <script> block found in index.html');
new Function(scriptMatch[1]); // throws on syntax error

// --- tiny test runner ---
let passed = 0;
const failures = [];
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.error('  FAIL - ' + name);
    console.error('    ' + (err && err.message ? err.message.split('\n')[0] : String(err)));
  }
}

// Stats objects come from a VM realm, so compare field by field.
function expectStats(actual, wipes, best, kills) {
  assert.ok(actual && typeof actual === 'object', 'expected a stats object');
  assert.strictEqual(actual.wipes, wipes, 'wipes');
  assert.strictEqual(actual.best, best, 'best');
  assert.strictEqual(actual.kills, kills, 'kills');
}

const noon = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0, 0).getTime();

console.log('parsePercent');
t('plain number string', () => assert.strictEqual(CORE.parsePercent('12.4'), 12.4));
t('with percent sign', () => assert.strictEqual(CORE.parsePercent('12.4%'), 12.4));
t('whitespace tolerated', () => assert.strictEqual(CORE.parsePercent('  8  '), 8));
t('comma decimal, e.g. 3,2', () => assert.strictEqual(CORE.parsePercent('3,2'), 3.2));
t('numeric input', () => assert.strictEqual(CORE.parsePercent(45), 45));
t('zero is valid', () => assert.strictEqual(CORE.parsePercent('0'), 0));
t('100 is valid', () => assert.strictEqual(CORE.parsePercent('100'), 100));
t('integer string', () => assert.strictEqual(CORE.parsePercent('8'), 8));
t('empty string -> null', () => assert.strictEqual(CORE.parsePercent(''), null));
t('whitespace-only -> null', () => assert.strictEqual(CORE.parsePercent('   '), null));
t('garbage -> null', () => assert.strictEqual(CORE.parsePercent('abc'), null));
t('negative -> null', () => assert.strictEqual(CORE.parsePercent('-5'), null));
t('over 100 -> null', () => assert.strictEqual(CORE.parsePercent('101'), null));
t('NaN -> null', () => assert.strictEqual(CORE.parsePercent('NaN'), null));
t('null input -> null', () => assert.strictEqual(CORE.parsePercent(null), null));
t('rounds to one decimal', () => assert.strictEqual(CORE.parsePercent('12.44'), 12.4));
t('rounds up at .46', () => assert.strictEqual(CORE.parsePercent('12.46'), 12.5));

console.log('formatPct');
t('integer drops decimal', () => assert.strictEqual(CORE.formatPct(12), '12%'));
t('one decimal kept', () => assert.strictEqual(CORE.formatPct(3.2), '3.2%'));
t('zero -> 0%', () => assert.strictEqual(CORE.formatPct(0), '0%'));
t('100% ok', () => assert.strictEqual(CORE.formatPct(100), '100%'));
t('float noise cleaned', () => assert.strictEqual(CORE.formatPct(12.3333333333), '12.3%'));
t('null -> em dash', () => assert.strictEqual(CORE.formatPct(null), '—'));
t('NaN -> em dash', () => assert.strictEqual(CORE.formatPct(NaN), '—'));
t('out of range -> em dash', () => assert.strictEqual(CORE.formatPct(470), '—'));

console.log('bestPctFromPulls');
t('empty log -> null', () => assert.strictEqual(CORE.bestPctFromPulls([]), null));
t('null log -> null', () => assert.strictEqual(CORE.bestPctFromPulls(null), null));
t('takes the lowest percent', () =>
  assert.strictEqual(CORE.bestPctFromPulls([{ pct: 12.4 }, { pct: 3.2 }, { pct: 41 }]), 3.2));
t('ignores pulls without a percent', () =>
  assert.strictEqual(CORE.bestPctFromPulls([{ pct: null }, { pct: 5.5 }, {}]), 5.5));
t('a kill (0%) counts as best 0', () =>
  assert.strictEqual(CORE.bestPctFromPulls([{ pct: 9.9 }, { pct: 0, kind: 'kill' }]), 0));

console.log('kill line verdict + margin');
t('under the line passes', () => assert.strictEqual(CORE.killLineVerdict(12.4, 20), 'pass'));
t('exactly on the line passes', () => assert.strictEqual(CORE.killLineVerdict(20, 20), 'pass'));
t('over the line fails', () => assert.strictEqual(CORE.killLineVerdict(25, 20), 'fail'));
t('no line -> null', () => assert.strictEqual(CORE.killLineVerdict(10, null), null));
t('no percent -> null', () => assert.strictEqual(CORE.killLineVerdict(null, 20), null));
t('margin negative = under line', () => assert.strictEqual(CORE.killMargin(12.4, 20), -7.6));
t('margin positive = over line', () => assert.strictEqual(CORE.killMargin(25, 20), 5));
t('margin zero on the line', () => assert.strictEqual(CORE.killMargin(20, 20), 0));
t('margin without line -> null', () => assert.strictEqual(CORE.killMargin(12.4, null), null));

console.log('ISO week keys');
t('Tue Oct 27 2026 -> 2026-W44', () => assert.strictEqual(CORE.isoWeekKey(noon(2026, 10, 27)), '2026-W44'));
t('Mon Dec 29 2025 -> 2026-W01', () => assert.strictEqual(CORE.isoWeekKey(noon(2025, 12, 29)), '2026-W01'));
t('Jan 1 2026 -> 2026-W01', () => assert.strictEqual(CORE.isoWeekKey(noon(2026, 1, 1)), '2026-W01'));
t('Dec 31 2026 -> 2026-W53', () => assert.strictEqual(CORE.isoWeekKey(noon(2026, 12, 31)), '2026-W53'));
t('Mon Jan 5 2027 belongs to 2027-W01', () => assert.strictEqual(CORE.isoWeekKey(noon(2027, 1, 5)), '2027-W01'));
t('same week regardless of weekday', () => {
  const a = new Date(2026, 9, 26, 12, 0).getTime(); // Mon
  const b = new Date(2026, 10, 1, 12, 0).getTime(); // Sun
  assert.strictEqual(CORE.isoWeekKey(a), CORE.isoWeekKey(b));
});

console.log('weekKeyMonday');
t('2026-W44 -> Mon Oct 26 2026', () =>
  assert.strictEqual(CORE.weekKeyMonday('2026-W44'), new Date(2026, 9, 26).getTime()));
t('2027-W01 -> Mon Jan 4 2027', () =>
  assert.strictEqual(CORE.weekKeyMonday('2027-W01'), new Date(2027, 0, 4).getTime()));
t('round trip: monday of key(today) reproduces key', () => {
  const ms = noon(2026, 10, 28);
  const key = CORE.isoWeekKey(ms);
  const mon = new Date(CORE.weekKeyMonday(key));
  assert.strictEqual(CORE.isoWeekKey(mon.getTime()), key);
});
t('bad key -> NaN', () => assert.ok(Number.isNaN(CORE.weekKeyMonday('not-a-key'))));
t('week 54 -> NaN', () => assert.ok(Number.isNaN(CORE.weekKeyMonday('2026-W54'))));

console.log('weekRangeLabel');
t('same month', () => assert.strictEqual(CORE.weekRangeLabel('2026-W43'), 'Oct 19–25, 2026'));
t('cross month', () => assert.strictEqual(CORE.weekRangeLabel('2026-W44'), 'Oct 26–Nov 1, 2026'));
t('cross year', () => assert.strictEqual(CORE.weekRangeLabel('2026-W53'), 'Dec 28, 2026–Jan 3, 2027'));
t('invalid key falls back to the key string', () =>
  assert.strictEqual(CORE.weekRangeLabel('junk'), 'junk'));

console.log('weekStats');
t('counts wipes, kills and weekly best', () => {
  const pulls = [
    { ts: noon(2026, 10, 20), pct: 12.4, kind: 'wipe' }, // last week (W43)
    { ts: noon(2026, 10, 27), pct: 8.1, kind: 'wipe' },  // this week
    { ts: noon(2026, 10, 28), pct: 3.2, kind: 'wipe' },
    { ts: noon(2026, 10, 29), pct: 0, kind: 'kill' },
    { ts: noon(2026, 11, 3), pct: 9.9, kind: 'wipe' }    // next week
  ];
  expectStats(CORE.weekStats(pulls, '2026-W44'), 2, 3.2, 1);
});
t('a wipe with 0% still counts as a kill', () => {
  const pulls = [{ ts: noon(2026, 10, 27), pct: 0, kind: 'wipe' }];
  expectStats(CORE.weekStats(pulls, '2026-W44'), 0, null, 1);
});
t('empty week is all zeros', () =>
  expectStats(CORE.weekStats([], '2026-W44'), 0, null, 0));
t('pull with timestamp outside any known week is ignored', () => {
  const pulls = [{ ts: noon(1950, 6, 1), pct: 1, kind: 'wipe' }];
  expectStats(CORE.weekStats(pulls, '2026-W44'), 0, null, 0);
});

console.log('partyWeekSummary');
t('builds per-encounter stats keyed by encounter id', () => {
  const party = {
    encounters: [
      { id: 'e1', pulls: [{ ts: noon(2026, 10, 27), pct: 5, kind: 'wipe' }] },
      { id: 'e2', pulls: [] }
    ]
  };
  const sum = CORE.partyWeekSummary(party, '2026-W44');
  assert.strictEqual(sum.key, '2026-W44');
  assert.strictEqual(sum.label, 'Oct 26–Nov 1, 2026');
  expectStats(sum.stats.e1, 1, 5, 0);
  expectStats(sum.stats.e2, 0, null, 0);
});

console.log('buildRecap');
const labelW43 = 'Oct 19–25, 2026';
const labelW44 = 'Oct 26–Nov 1, 2026';
t('full recap text matches exactly', () => {
  const party = { name: 'Night Static', encounters: [
    { id: 'e1', name: 'M1S', cleared: false },
    { id: 'e2', name: 'M2S', cleared: false },
    { id: 'e3', name: 'M3S', cleared: false },
    { id: 'e4', name: 'M4S', cleared: true }
  ] };
  const cur = { key: '2026-W44', label: labelW44, stats: {
    e1: { wipes: 12, best: 3.2, kills: 0 },
    e2: { wipes: 5, best: 41, kills: 0 },
    e3: { wipes: 2, best: null, kills: 1 },
    e4: { wipes: 0, best: null, kills: 0 }
  } };
  const prev = { key: '2026-W43', label: labelW43, stats: {
    e1: { wipes: 8, best: 12.4, kills: 0 },
    e2: { wipes: 0, best: null, kills: 0 },
    e3: { wipes: 0, best: null, kills: 0 },
    e4: { wipes: 0, best: null, kills: 0 }
  } };
  const expected = [
    '[Prog] Night Static — Oct 26–Nov 1, 2026',
    'vs Oct 19–25, 2026:',
    '• M1S — 12 wipes (was 8) · best 3.2% (was 12.4%, -9.2)',
    '• M2S — 5 wipes · best 41% (deeper than ever)',
    '• M3S — cleared×1 · 2 wipes',
    '• M4S — on farm'
  ].join('\n');
  assert.strictEqual(CORE.buildRecap(party, cur, prev), expected);
});
t('unchanged week shows equal stats without delta', () => {
  const party = { name: 'P', encounters: [{ id: 'e1', name: 'M1S', cleared: false }] };
  const cur = { key: 'k1', label: 'W this', stats: { e1: { wipes: 3, best: 7.5, kills: 0 } } };
  const prev = { key: 'k2', label: 'W last', stats: { e1: { wipes: 3, best: 7.5, kills: 0 } } };
  const txt = CORE.buildRecap(party, cur, prev);
  assert.ok(txt.includes('• M1S — 3 wipes (was 3) · best 7.5% (was 7.5%)'), txt);
});
t('no activity weeks -> friendly empty line', () => {
  const party = { name: 'Latency Prayer Group', encounters: [{ id: 'e1', name: 'T1S', cleared: false }] };
  const cur = { key: 'k1', label: labelW44, stats: { e1: { wipes: 0, best: null, kills: 0 } } };
  const prev = { key: 'k2', label: labelW43, stats: { e1: { wipes: 0, best: null, kills: 0 } } };
  assert.strictEqual(
    CORE.buildRecap(party, cur, prev),
    '[Prog] Latency Prayer Group — Oct 26–Nov 1, 2026\nvs Oct 19–25, 2026:\nNo pulls logged this week. Good luck on the next one!'
  );
});
t('all lines stay short enough for FC chat', () => {
  const party = { name: 'Snack Break Static', encounters: [{ id: 'e1', name: 'M1S', cleared: false }] };
  const cur = { key: 'k1', label: labelW44, stats: { e1: { wipes: 30, best: 1.1, kills: 0 } } };
  const prev = { key: 'k2', label: labelW43, stats: { e1: { wipes: 28, best: 99.5, kills: 0 } } };
  for (const line of CORE.buildRecap(party, cur, prev).split('\n')) {
    assert.ok(line.length <= 60, 'line too long: ' + line);
  }
});

console.log('safety');
t('core logic never touches browser globals', () => {
  assert.doesNotMatch(coreCode, /\b(document|window|localStorage|navigator)\b/);
});
t('full inline script compiles (syntax check)', () => {
  assert.ok(scriptMatch[1].length > 5000);
});

console.log('');
if (failures.length) {
  console.error(failures.length + ' test(s) failed:');
  failures.forEach(f => console.error(' - ' + f.name));
  process.exitCode = 1;
} else {
  console.log('All ' + passed + ' tests passed.');
}

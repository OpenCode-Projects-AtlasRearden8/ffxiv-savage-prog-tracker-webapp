// Optional UI smoke test: drives the real app in headless Chrome via the
// DevTools protocol. Requires a system Chrome binary; skips gracefully if
// none is found. Run with: node --experimental-websocket tests/smoke-ui.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = 'file://' + path.join(here, '..', 'index.html');
const CHROME_CANDIDATES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

function findChrome() {
  for (const bin of CHROME_CANDIDATES) {
    try {
      spawn(bin, ['--version'], { stdio: 'ignore' }).on('error', () => {});
      return bin;
    } catch { /* keep looking */ }
  }
  return null;
}

const chromeBin = findChrome();
if (!chromeBin) {
  console.log('smoke-ui: no Chrome binary found — skipping UI smoke test.');
  process.exit(0);
}

const wsAvailable = typeof WebSocket !== 'undefined';
if (!wsAvailable) {
  console.log('smoke-ui: this Node lacks global WebSocket — rerun with --experimental-websocket. Skipping.');
  process.exit(0);
}

// The in-page self-test. Runs after the app has fully loaded.
const expr = String.raw`(function () {
  var out = { checks: [], errors: [] };
  window.onerror = function (m) { out.errors.push(String(m)); };
  function chk(name, ok, detail) {
    out.checks.push({ name: name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  }
  try {
    chk('app-exposed', typeof window.App === 'object');
    var sel = document.getElementById('partySelect');
    chk('default-party', sel && sel.options.length > 0 && sel.options[sel.selectedIndex].text === 'My Static');
    var bodyHtml = document.getElementById('encountersBody').innerHTML;
    var m = bodyHtml.match(/App\.logPull\('([^']+)'\)/);
    chk('cards-rendered', !!m);
    var eid = m && m[1];
    if (eid) {
      document.getElementById('pct_' + eid).value = '12.4';
      App.logPull(eid);
      document.getElementById('pct_' + eid).value = '3.2';
      App.logPull(eid);
      document.getElementById('pct_' + eid).value = '3,2';
      App.logPull(eid);
      var st = JSON.parse(localStorage.getItem('savageProgTracker.v1'));
      var enc = st.parties[0].encounters[0];
      chk('pulls-3', enc.pulls.length === 3, enc.pulls.length);
      chk('best-ever-3.2', enc.bestEver === 3.2, enc.bestEver);
      chk('not-cleared-yet', enc.cleared === false, enc.cleared);

      App.setKillLine(eid, '5');
      chk('fail-mark-shown', document.getElementById('encountersBody').innerHTML.indexOf('FAIL') >= 0);
      App.setKillLine(eid, '');

      App.setStratDraft(eid, 'Test strat v1');
      App.saveStratVersion(eid);
      var st2 = JSON.parse(localStorage.getItem('savageProgTracker.v1'));
      chk('strat-version-saved', st2.parties[0].encounters[0].strats.length === 1);

      App.addMember();
      var st3 = JSON.parse(localStorage.getItem('savageProgTracker.v1'));
      chk('member-added', st3.parties[0].members.length === 9, st3.parties[0].members.length);

      var lines = document.getElementById('recapOutput').value.split('\n');
      chk('recap-line', lines[2] === '\u2022 M1S \u2014 3 wipes \u00b7 best 3.2% (deeper than ever)', lines[2]);
      chk('no-runtime-errors', out.errors.length === 0, out.errors.join('; '));
    }
    out.ok = out.checks.every(function (c) { return c.ok; });
  } catch (e) {
    out.ok = false;
    out.error = e && e.message ? e.message : String(e);
  }
  return out;
})()`;

const chrome = spawn(chromeBin, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  '--user-data-dir=' + mkdtempSync(path.join(tmpdir(), 'savageprog-smoke-')),
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

const hardKill = setTimeout(() => {
  console.error('smoke-ui: timed out talking to Chrome.');
  chrome.kill('SIGKILL');
  process.exit(2);
}, 45000);

let devtoolsUrl = null;
chrome.stderr.on('data', (d) => {
  const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/);
  if (m) devtoolsUrl = m[1];
});

async function waitFor(fn, what, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('timeout waiting for ' + what);
}

try {
  const browserWs = await waitFor(() => devtoolsUrl, 'DevTools endpoint', 20000);
  const port = browserWs.match(/ws:\/\/127\.0\.0\.1:(\d+)\//)[1];
  const created = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
  const page = await created.json();
  if (!page.webSocketDebuggerUrl) throw new Error('could not open a page target: ' + JSON.stringify(page));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  function send(method, params) {
    return new Promise((res) => {
      const id = nextId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Runtime.enable');

  await waitFor(async () => {
    const r = await send('Runtime.evaluate', { expression: 'document.readyState === "complete" && !!window.App', returnByValue: true });
    return r.result && r.result.result && r.result.result.value === true;
  }, 'app to finish loading', 15000);

  const resp = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const out = resp.result && resp.result.result && resp.result.result.value;
  if (!out) throw new Error('no result from in-page test: ' + JSON.stringify(resp));

  console.log('smoke-ui results (' + chromeBin + '):');
  let failed = 0;
  for (const c of out.checks) {
    if (c.ok) { console.log('  ok - ' + c.name); } else { failed++; console.log('  FAIL - ' + c.name + (c.detail ? ' [' + c.detail + ']' : '')); }
  }
  if (out.error) { failed++; console.log('  FAIL - in-page error: ' + out.error); }
  console.log(failed ? 'smoke-ui: ' + failed + ' check(s) failed.' : 'smoke-ui: all ' + out.checks.length + ' checks passed.');
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error('smoke-ui: ' + (err && err.message ? err.message : String(err)));
  process.exitCode = 2;
} finally {
  clearTimeout(hardKill);
  chrome.kill('SIGKILL');
}

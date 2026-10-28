# STATUS.md — Savage Prog Tracker

Last updated: 2026-10-28

## What was built

A single-file, zero-dependency, serverless web app for tracking FFXIV
savage-progression raid nights, targeted at small statics who want a
lightweight "prog sheet" without accounts, servers, or spreadsheets.

- `index.html` — the entire app (HTML + CSS + JS inline):
  - Multiple parties (statics) with a roster: name, job, role
    (tank / healer / melee / ranged phys / caster / other), plus a
    one-click 8-slot light-party template.
  - Per-encounter cards: editable name, cleared flag, wipe count,
    pulls-logged count, best-percent record (stored, survives log edits).
  - Pull log: per-pull timestamp, boss HP % left (accepts `12.4`,
    `12.4%`, `3,2`), optional note, kill logging; entries can be removed.
  - DPS-check kill line: line % + note ("by 5:00 add phase"); the pull log
    marks each pull PASS/FAIL against the line with a signed margin
    (negative = under the line, positive = over the line).
  - Phase-by-phase notes per encounter (add / rename / remove phases).
  - Strat scratchpad per encounter with version history (save, restore,
    up to 50 versions).
  - Week-over-week recap: generates short, FC-chat-pasteable plain text
    comparing a chosen ISO week with the previous one (wipes, best %,
    clears, "on farm" lines), derived from pull timestamps — no manual
    archiving needed. Copy button with clipboard fallback.
  - Export/import of all data as JSON; "erase all data" with confirmation.
  - All state in `localStorage` (`savageProgTracker.v1`), debounced saves,
    graceful fallback when storage is blocked.
- `tests/run-tests.mjs` — 65 unit tests over the app's core logic
  (percent parse/format, best percent, kill-line verdict/margin, ISO-8601
  week keys, Monday-of-week, week labels, weekly stats, recap text). The
  harness extracts the marked CORE LOGIC section from `index.html` and
  evaluates it in a VM, so it tests the exact shipped code. It also
  syntax-checks the whole inline script and asserts the core never
  touches browser globals.
- `tests/smoke-ui.mjs` — optional UI smoke test that drives the real page
  in headless Chrome over the DevTools protocol (no packages needed; runs
  with `node --experimental-websocket`). It logs pulls, checks the kill
  line FAIL marking, saves a strat version, adds a member, and asserts the
  generated recap line.
- `README.md` — docs, quick start, test instructions; credits
  Asdale Dynamics, LLC.
- `LICENSE` — MIT, `Copyright (c) 2026 Asdale Dynamics, LLC`.

## How to run

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Verification results

- `node tests/run-tests.mjs` → **All 65 tests passed.**
  Also verified under `TZ=America/New_York` and `TZ=Europe/Berlin`
  (week math is local-time and DST-safe).
- `node --experimental-websocket tests/smoke-ui.mjs` →
  **all 11 checks passed** in headless Google Chrome 156
  (app boots, default party/roster/encounters render, three pull logs
  persist to localStorage with `bestEver = 3.2`, kill-line FAIL marking
  appears, strat version saves, roster member adds, recap line matches
  the expected text, no runtime errors).
- Full inline script is syntax-checked as part of the unit suite.
- Two real bugs were found and fixed during verification:
  1. `weekKeyMonday` drifted by an hour across DST boundaries
     (raw ms arithmetic) — fixed with calendar-day arithmetic.
  2. The week selector had no "previous week" option when all data was in
     the current week, making the recap compare the week with itself —
     fixed by always including one empty week before the earliest activity.

## Known gaps / ideas for the future

- Pull logging is manual (typed boss %). No ACT/FFLogs integration —
  by design (local-only, no accounts), but auto-import would be nice.
- Wipes logged before the first phase (e.g. pull-timer mishaps) have no
  percent and count as wipes without affecting best %.
- No per-pull screenshots or linked images; notes are text only.
- No multi-tab sync: two open tabs can overwrite each other's debounced
  saves (last write wins).
- Recap is plain text only; no markdown/HTML export variant.
- Strat version history caps at 50 versions per encounter.
- No automated accessibility audit beyond semantic markup basics.

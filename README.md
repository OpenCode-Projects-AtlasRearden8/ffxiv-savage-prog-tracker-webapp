# Savage Prog Tracker (FFXIV raid nights)

A storage-free, serverless web app for tracking your Final Fantasy XIV
savage-progression nights: who's in the party, what you tried on each fight,
how many wipes it cost, how close you got, and how far you moved week over
week.

Pure HTML/JS/CSS in a **single file**. Zero dependencies, no build step, no
server, no accounts. Your data lives in your browser's `localStorage` and
nowhere else.

Built by **Asdale Dynamics, LLC** — part of our line of beginner-friendly,
local-first tools. You can read more of Dylan Asdale's plain-English AI
guides (like *The Massive AI Manual*) at
[dylanasdale.github.io](https://dylanasdale.github.io).

## Features

- **Party sheet** — multiple parties (statics), each with a roster of
  members, jobs and roles (tank / healer / melee / ranged phys / caster).
  A one-click 8-slot template matches a standard light-party comp.
- **Encounters** — add any fight by name (e.g. `M1S`), or quick-add a whole
  M1S–M4S tier in one click.
- **Wipe log & best percent** — after each pull, type the boss HP % you left
  it at (`12.4`, `12.4%` or `3,2` all work). Wipe counts and your best
  (deepest) percent are tracked automatically, and kills can be logged too.
- **DPS-check kill line** — set a line like "boss must be at or below 20%
  by the 5:00 add phase". Every logged pull is then marked PASS or FAIL
  against that line. Margin sign: negative = under the line (spare time),
  positive = over the line (you missed the check).
- **Phase-by-phase notes** — per encounter, keep notes for each phase
  (P1, P2, … or your own names) as you learn the fight.
- **Strat scratchpad with versions** — draft your strat, save it as a
  version, and restore or fall back to any earlier version later.
- **Week-over-week recap** — a short, plain-text summary comparing this
  raid week with the previous one, kept short enough to paste straight into
  Free Company chat. Built from pull timestamps, so no manual archiving.
- **Backup & move** — export everything as a JSON file, import it on
  another device or browser.
- **Private by design** — nothing is uploaded, ever. There is no server.

## Quick start

Open `index.html` in any modern browser. That's it.

If you prefer serving it (nicer URLs, same behavior):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tests

Unit tests (percent parsing/formatting, best-percent, kill-line verdicts,
ISO-week math, week-over-week recap text) run on plain Node, no packages:

```bash
node tests/run-tests.mjs
```

Optional UI smoke test that drives the real page in headless Chrome
(skips itself if Chrome is not installed):

```bash
node --experimental-websocket tests/smoke-ui.mjs
```

## How your data is stored

Everything is saved under the localStorage key `savageProgTracker.v1` on
`file://` (or the site you host it on). "Erase all data" removes it from
that browser. Export JSON before clearing your browser data or switching
machines.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Asdale Dynamics, LLC.

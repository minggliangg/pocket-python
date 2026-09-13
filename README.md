# Pocket Python

A phone-friendly Python practice app. Problems run offline in the browser with
[Pyodide](https://pyodide.org) inside a Web Worker. Drafts, progress, and theme
are stored on the device.

## Features

- CodeMirror 6 editor (Python highlighting, Tab / outdent for phones)
- **Core pack** — array & hash-map warm-ups
- **Growth Track** — two pointers, sliding window, stacks, binary search,
  intervals, graphs, DP, greedy, design
- Reference solutions you can reveal (and insert into the editor)
- In-browser CPython via Pyodide — no backend
- Pass/fail results with expected vs got
- Light / dark mode (follows system, toggle in the header)
- Progress FAB → Evangelion A.T. Field 3D core (drag to orbit, pinch/scroll to zoom)
- Installable PWA with offline cache (app shell + packs + Pyodide CDN assets)

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Use it on a phone

Opening `index.html` from a zip (`file://`) will **not** work: the app uses ES
modules, `fetch`, and a service worker, all of which need an HTTP(S) origin.
The same build runs on iOS Safari and Android Chrome.

### Option A — same Wi‑Fi (quick test)

```bash
npm run preview -- --host
# or: npm run dev -- --host
```

Note the LAN URL (e.g. `http://192.168.1.20:4173`) and open it on your phone.
In Safari: Share → Add to Home Screen.

### Option B — GitHub Pages (live URL)

The repo is public. On every push to `main`, GitHub Actions builds with
`BASE_PATH=/pocket-python/` and deploys `dist/` to Pages.

**https://minggliangg.github.io/pocket-python/**

(First run: Settings → Pages → Source = **GitHub Actions**, or the workflow enables it.)

Other free hosts still work — deploy `dist/` with `BASE_PATH=/`.

### Progress storage

Solved marks, drafts, and theme live in **IndexedDB in that browser on that
device**. There is no account and no cloud sync: phone and desktop each keep
their own progress. “Clear completed” / “Clear drafts” only wipe local state.

To move progress between devices: **Export code** → copy the `PP1.…` token →
**Import code** on the other device. The token is offline-only (nothing is
uploaded). Leave “Include saved drafts” checked to carry your typed solutions
too; uncheck for a short marks-only token. Import offers merge or replace.

## Refresh problems / import more

- Edit `public/problems.json` (core) or `public/packs/growth.json`
- Each problem needs: `id`, `title`, `difficulty`, `fnName`, `prompt`,
  `signature`, `starter`, `solution`, `tests` (or `asserts`)
- `scripts/import_mbpp.py` shows how to bulk-convert an external dataset into
  the pack schema (MBPP is beginner-level; the Growth Track is the main
  progression pack)

## Layout

```
index.html            App shell + theme bootstrap
src/main.js           UI, packs, search, solutions, theme
src/editor.js         CodeMirror 6
src/worker.js         Pyodide + harness
src/harness.py        Test runner (cases + assert mode)
src/db.js             IndexedDB drafts + progress
public/problems.json  Core pack
public/packs/growth.json  Growth Track
scripts/import_mbpp.py    Example bulk import
```

## Notes

- CodeMirror is MIT licensed; include its license notice when redistributing.
- The browser worker is not a secure sandbox — use this for your own solutions.
- Runtime limits are intentionally light for a personal practice app.

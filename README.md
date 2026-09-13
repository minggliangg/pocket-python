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

### Option B — free static host (best for offline + install)

Deploy the `dist/` folder to any static host:

| Host | How |
|------|-----|
| Cloudflare Pages | Drag-and-drop `dist/` in the dashboard, or `npx wrangler pages deploy dist` |
| Netlify | Drag-and-drop `dist/` at app.netlify.com/drop |
| GitHub Pages | Push `dist/` to a `gh-pages` branch |
| Vercel | `npx vercel deploy dist --prod` |

HTTPS is required for the service worker and “Add to Home Screen”.

After the first online load, the service worker caches the app, packs, and
Pyodide runtime for offline practice.

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

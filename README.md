# foundit

An offline Progressive Web App (PWA) that runs in a phone's browser and helps you track where you put things. All data is stored locally in IndexedDB — no server, no account required.

## Features

- Offline-first — works fully without a network connection after the first load
- Install-gated — only usable once installed to the home screen (iOS & Android)
- Nestable storage bins (House → Bedroom → Wardrobe → Top Shelf)
- Full item inventory with search and quick-move
- Swipe-to-inventory for auditing bin contents
- Orphaned items management

## Tech Stack

- **TypeScript** — all source code is strictly typed
- **Vite** — build tool and dev server
- **vite-plugin-pwa / Workbox** — service worker generation and precaching
- **IndexedDB** — all persistence, via a thin promise-based wrapper (`src/db.ts`)
- **Vitest + jsdom + fake-indexeddb** — unit test harness
- **GitHub Pages** — deployment target via GitHub Actions

## Getting Started

```bash
npm install
npm run dev        # development server at http://localhost:5173
```

> **Note:** PWA install prompts and service workers require HTTPS or localhost. The "Add to Home Screen" gate only activates when the app is opened in a real browser; standalone mode is not emulated in the dev server.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest unit-test suite |
| `npm run test:watch` | Test suite in watch mode |
| `npm run test:coverage` | Generate a coverage report in `coverage/` |

## Project Structure

```
src/
  main.ts          Entry point — registers service worker, boots app
  app.ts           Navigation, update banner, init()
  db.ts            IndexedDB CRUD layer (bins & items stores)
  install.ts       Standalone detection + install splash gate
  types.ts         Shared TypeScript interfaces (Bin, Item)
  styles/
    main.css       Mobile-first CSS with custom properties
  vite-env.d.ts    Vite + vite-plugin-pwa ambient types

public/
  icons/           SVG icons (192 px, 512 px, apple-touch-icon)

tests/
  setup.ts         Vitest setup — fake-indexeddb, matchMedia stub
  db.test.ts       IndexedDB layer tests (23 cases)
  install.test.ts  Install detection & navigation tests (16 cases)

.github/workflows/
  deploy.yml               CI/CD pipeline (build → test → deploy to GitHub Pages)
```

## Deployment (GitHub Pages)

Deployment is fully automated via GitHub Actions. Every push to `main` triggers the workflow at `.github/workflows/deploy.yml`, which:

1. Installs dependencies (`npm ci`)
2. Runs the test suite (`npm test`)
3. Builds the app (`npm run build`)
4. Publishes the `dist/` directory to GitHub Pages

The workflow can also be triggered manually from the **Actions** tab using the `workflow_dispatch` event.

**Live URL:** https://adarshhbhat.github.io/foundit/

## Milestones

| # | Title | Status |
|---|---|---|
| 1 | Core Shell & Offline Infrastructure | ✅ Done |
| 2 | Storage Bins | ✅ Done |
| 3 | Object Inventory | Pending |
| 4 | Object Lookup & Movement | Pending |
| 5 | Swipe-to-Inventory | Pending |
| 6 | Orphaned Objects Management | Pending |
| 7 | Polish & Hardening | Pending |

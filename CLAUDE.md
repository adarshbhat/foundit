# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (http://localhost:5173) |
| `npm run build` | TypeScript type-check + production build to `dist/` |
| `npm test` | Run full Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm test -- --reporter=verbose db.test.ts` | Run a single test file |
| `npm run test:coverage` | Generate coverage report in `coverage/` |
| `npm run preview` | Serve the production build locally |

## Architecture

### Core Data Model

- **Bin**: A physical storage container, supports infinite nesting (House → Bedroom → Wardrobe → Top Shelf)
  - `id` (UUID), `name`, `parentId` (null if top-level), `createdAt`, `updatedAt`
- **Item**: A physical object tracked in inventory
  - `id` (UUID), `name`, `description`, `binId` (null if orphaned), `createdAt`, `updatedAt`

Both are stored in IndexedDB with indexes on `parentId`/`binId` and `updatedAt` for efficient queries.

### Module Organization

- **`src/db.ts`** — Promise-based IndexedDB CRUD layer (wrapped IDB API)
  - Exports: `openDB()`, `getAll()`, `getById()`, `getByIndex()`, `put()`, `deleteById()`, `clearStore()`
  - Handles null-value queries specially: IndexedDB doesn't index nulls, so we filter in-memory
  - `_resetDB()` used only in tests

- **`src/types.ts`** — Shared TypeScript interfaces (`Bin`, `Item`, `StoreName`, generic `StoreRecord<T>`)
  - Re-exports db types so consumers import from one location

- **`src/app.ts`** — Application shell and navigation
  - Route system: 'home' | 'bins' | 'search' | 'orphans'
  - `navigate(route)` — shows/hides views, updates nav state, moves focus for a11y
  - `init()` — checks install gate, opens DB, sets up nav, initializes bins view
  - `showUpdateBanner()` — PWA update prompt

- **`src/bins.ts`** — Bins feature (Milestone 2)
  - `createBin()`, `renameBin()`, `deleteBin()`, `isDescendantOf()` — business logic
  - `initBins()` — renders the bins tree on app launch
  - `navigateToBin(binId)` — switches to a specific bin's detail view
  - Delete cascades orphaning, not cascade-deleting: child bins get `parentId=null`, child items get `binId=null`
  - Integrates with items module to render item lists in bin detail view

- **`src/items.ts`** — Items feature (Milestone 3)
  - `createItem()`, `updateItem()`, `assignItemToBin()`, `deleteItem()` — business logic
  - `getItemsInBin()`, `getOrphanedItems()` — data retrieval
  - `initItems()` — wires up item modals and event handlers
  - `renderItemsForBin(binId)` — displays items in bin detail view
  - `openItemModal(item)` — public function for opening create/edit modal
  - Item validation: name 1–128 chars (required), description optional, binId optional (orphaned if null)

- **`src/install.ts`** — PWA installation gate
  - Detects standalone mode; shows install splash if browser PWA prompt is available

- **`src/main.ts`** — Entry point
  - Registers service worker, boots app via `init()`

- **`src/styles/main.css`** — Mobile-first CSS with custom properties

### IndexedDB Schema

**Stores:**
- `bins` — keyPath: `id`
  - Index `parentId` (non-unique) — for querying child bins
  - Index `updatedAt` (non-unique) — for sorting
- `items` — keyPath: `id`
  - Index `binId` (non-unique) — for querying items in a bin
  - Index `updatedAt` (non-unique) — for sorting

**Special handling:**
- Null values (e.g., top-level bins with `parentId=null`, orphaned items with `binId=null`) cannot be queried via index; `getByIndex()` falls back to full-store scans + in-memory filter

### Testing Setup

- **Vitest** with **jsdom** environment
- **fake-indexeddb** — in-memory IDB implementation
- `tests/setup.ts` — before each test, replaces IndexedDB with a fresh factory (ensures test isolation)
- `tests/setup.ts` also mocks `window.matchMedia` (not implemented in jsdom)

**Test locations:**
- `tests/db.test.ts` — 23 tests for db layer (no DOM)
- `tests/bins.test.ts` — 28 tests for bins business logic (no DOM)
- `tests/items.test.ts` — 37 tests for items business logic (no DOM)
- `tests/install.test.ts` — 16 tests for install detection and navigation
- **Total: 104 tests** covering all business logic and data layer

## Development Workflow

### Adding a New Feature

1. Add types to `src/types.ts` if needed
2. Add DB queries to `src/db.ts` (test thoroughly; db layer is mission-critical)
3. Implement business logic in a new `src/feature.ts` module or extend an existing one
4. Wire initialization in `src/app.ts` → `init()`
5. Add integration tests in `tests/feature.test.ts`
6. Render UI in `index.html` and style in `src/styles/main.css`

### Key Implementation Notes

- **Offline-first**: All state lives in IndexedDB; no network requests except PWA service worker cache.
- **TypeScript strict mode**: `tsconfig.json` enforces `strict: true`, `noUnusedLocals`, `noUnusedParameters`. All code is strictly typed.
- **Accessibility**: Navigation uses `aria-current`, `aria-hidden`, focus management (`heading.focus()`). Validate a11y when adding UI.
- **Mobile-first CSS**: Custom properties for theme colors; no breakpoints yet (single-column layout).
- **Service worker**: Generated by `vite-plugin-pwa` → `dist/sw.js` and `dist/workbox-*.js`. Precache all assets; `registerType: 'prompt'` lets users opt into updates.

## GitHub Pages Deployment

- **Auto-deploy** on push to `main` via `.github/workflows/deploy.yml`
- Workflow: `npm ci` → `npm test` → `npm run build` → publish `dist/` to GitHub Pages
- **Base URL**: `/foundit/` (configured in `vite.config.ts` and PWA manifest)
- **Live**: https://adarshhbhat.github.io/foundit/

## Milestones Status

- ✅ M1: Core Shell & Offline Infrastructure
- ✅ M2: Storage Bins (completed 2026-04-01)
- ✅ M3: Object Inventory (completed 2026-04-01)
- ⏳ M4: Object Lookup & Movement
- ⏳ M5: Swipe-to-Inventory
- ⏳ M6: Orphaned Objects Management
- ⏳ M7: Polish & Hardening

**M3 recap:** `src/items.ts` module exports CRUD functions for items (create, edit, assign, delete). Items can be assigned to bins or orphaned. Bin detail view shows item list with edit/delete buttons. Two new modals: `#item-modal` (create/edit), `#delete-item-modal` (confirm). 37 comprehensive unit tests covering all item operations.

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, vi } from 'vitest';
import { _resetDB } from '../src/db';

// ── Fake IndexedDB ────────────────────────────────────────────
// Provide a fresh in-memory IDBFactory before each test suite starts.
// afterEach replaces it with a new one so tests never share state.
(globalThis as typeof globalThis & { indexedDB: IDBFactory }).indexedDB =
  new IDBFactory();

afterEach(async () => {
  await _resetDB();
  // Fresh factory so every test starts with a clean database
  (globalThis as typeof globalThis & { indexedDB: IDBFactory }).indexedDB =
    new IDBFactory();
});

// ── matchMedia stub ───────────────────────────────────────────
// jsdom does not implement matchMedia; provide a no-op mock so
// install.ts can call window.matchMedia without throwing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

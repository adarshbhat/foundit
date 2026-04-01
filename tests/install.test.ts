import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { isStandalone, getPlatform, applyInstallGate } from '../src/install';

// ── isStandalone ──────────────────────────────────────────────

describe('isStandalone', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns false when neither iOS standalone nor standalone media query match', () => {
    // navigator.standalone is undefined in jsdom; matchMedia returns false
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => false,
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(isStandalone()).toBe(false);
  });

  it('returns true when navigator.standalone is true (iOS home-screen launch)', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => true,
    });
    expect(isStandalone()).toBe(true);
  });

  it('returns true when display-mode:standalone media query matches (Android / desktop PWA)', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => undefined,
    });
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(display-mode: standalone)',
    }) as MediaQueryList);

    expect(isStandalone()).toBe(true);
  });

  it('returns false when matchMedia throws (graceful degradation)', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => undefined,
    });
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('matchMedia unavailable');
    });

    expect(isStandalone()).toBe(false);
  });
});

// ── getPlatform ───────────────────────────────────────────────

describe('getPlatform', () => {
  const originalUA = Object.getOwnPropertyDescriptor(
    window.navigator,
    'userAgent',
  );

  afterEach(() => {
    if (originalUA) {
      Object.defineProperty(window.navigator, 'userAgent', originalUA);
    }
  });

  function setUA(ua: string): void {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      get: () => ua,
    });
  }

  it('detects iOS (iPhone)', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15');
    expect(getPlatform()).toBe('ios');
  });

  it('detects iOS (iPad)', () => {
    setUA('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15');
    expect(getPlatform()).toBe('ios');
  });

  it('detects Android', () => {
    setUA('Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36');
    expect(getPlatform()).toBe('android');
  });

  it('returns desktop for macOS / Windows user-agents', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    expect(getPlatform()).toBe('desktop');
  });
});

// ── applyInstallGate ──────────────────────────────────────────

/** Build a minimal Document substitute for testing. */
function makeDoc(ids: string[]): Document {
  const elements: Record<string, { hidden: boolean; id: string }> = {};
  for (const id of ids) elements[id] = { hidden: true, id };
  return {
    getElementById: (id: string) => elements[id] ?? null,
  } as unknown as Document;
}

describe('applyInstallGate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the app shell and hides the splash when standalone', () => {
    vi.spyOn(window.navigator, 'standalone' as never, 'get').mockReturnValue(
      true as never,
    );

    const doc = makeDoc(['install-splash', 'app-shell', 'ios-hint', 'android-hint', 'desktop-hint']);
    const el = (id: string) =>
      (doc.getElementById as (id: string) => { hidden: boolean } | null)(id);

    // Pre-condition: splash hidden=true by default, shell hidden=true
    const result = applyInstallGate(doc);

    expect(result).toBe(true);
    expect(el('install-splash')?.hidden).toBe(true);
    expect(el('app-shell')?.hidden).toBe(false);
  });

  it('shows the splash and hides the app shell when not standalone', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => false,
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    const doc = makeDoc(['install-splash', 'app-shell', 'ios-hint', 'android-hint', 'desktop-hint']);
    const el = (id: string) =>
      (doc.getElementById as (id: string) => { hidden: boolean } | null)(id);

    const result = applyInstallGate(doc);

    expect(result).toBe(false);
    expect(el('install-splash')?.hidden).toBe(false);
    expect(el('app-shell')?.hidden).toBe(true);
  });

  it('shows the iOS hint when platform is iOS and not standalone', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)',
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    const doc = makeDoc(['install-splash', 'app-shell', 'ios-hint', 'android-hint', 'desktop-hint']);
    const el = (id: string) =>
      (doc.getElementById as (id: string) => { hidden: boolean } | null)(id);

    applyInstallGate(doc);

    expect(el('ios-hint')?.hidden).toBe(false);
    expect(el('android-hint')?.hidden).toBe(true);
    expect(el('desktop-hint')?.hidden).toBe(true);
  });

  it('shows the Android hint when platform is Android and not standalone', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 12; Pixel 6) Chrome/112',
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    const doc = makeDoc(['install-splash', 'app-shell', 'ios-hint', 'android-hint', 'desktop-hint']);
    const el = (id: string) =>
      (doc.getElementById as (id: string) => { hidden: boolean } | null)(id);

    applyInstallGate(doc);

    expect(el('android-hint')?.hidden).toBe(false);
    expect(el('ios-hint')?.hidden).toBe(true);
    expect(el('desktop-hint')?.hidden).toBe(true);
  });

  it('is a no-op when DOM elements are missing (does not throw)', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      get: () => false,
    });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    // Empty document — getElementById always returns null
    const emptyDoc = {
      getElementById: () => null,
    } as unknown as Document;

    expect(() => applyInstallGate(emptyDoc)).not.toThrow();
  });
});

// ── app — navigate (DOM integration) ─────────────────────────

describe('navigate', () => {
  beforeEach(() => {
    // Build a minimal DOM that mirrors the real HTML structure
    document.body.innerHTML = `
      <div id="app-shell">
        <main>
          <section data-view="home" hidden></section>
          <section data-view="bins" hidden></section>
          <section data-view="search" hidden></section>
          <section data-view="orphans" hidden></section>
        </main>
        <nav>
          <button data-route="home" aria-current="page"></button>
          <button data-route="bins" aria-current="false"></button>
          <button data-route="search" aria-current="false"></button>
          <button data-route="orphans" aria-current="false"></button>
        </nav>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the requested view and hides others', async () => {
    const { navigate } = await import('../src/app');
    navigate('bins');

    expect(document.querySelector('[data-view="bins"]')?.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('[data-view="home"]')?.hasAttribute('hidden')).toBe(true);
    expect(document.querySelector('[data-view="search"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('marks the active nav link with aria-current="page"', async () => {
    const { navigate } = await import('../src/app');
    navigate('search');

    const searchLink = document.querySelector('[data-route="search"]');
    const homeLink = document.querySelector('[data-route="home"]');
    expect(searchLink?.getAttribute('aria-current')).toBe('page');
    expect(homeLink?.getAttribute('aria-current')).toBe('false');
  });

  it('adds nav__link--active class to the active nav link', async () => {
    const { navigate } = await import('../src/app');
    navigate('orphans');

    const orphansLink = document.querySelector('[data-route="orphans"]');
    expect(orphansLink?.classList.contains('nav__link--active')).toBe(true);
  });
});

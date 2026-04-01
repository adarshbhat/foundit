import { applyInstallGate } from './install';
import { openDB } from './db';
import { initBins } from './bins';

export type Route = 'home' | 'bins' | 'search' | 'orphans';

// ─── Update banner ────────────────────────────────────────────────────────────

/** Show the "Update available" banner and wire the Refresh button. */
export function showUpdateBanner(onRefresh: () => void): void {
  const banner = document.getElementById('update-banner');
  const btn = document.getElementById('update-btn');
  if (!banner) return;

  banner.hidden = false;
  btn?.addEventListener('click', onRefresh, { once: true });
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/** Activate a named view and update nav link state. */
export function navigate(route: Route): void {
  // Show/hide views
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((view) => {
    const isActive = view.dataset.view === route;
    view.hidden = !isActive;
    view.setAttribute('aria-hidden', String(!isActive));
  });

  // Update nav links
  document.querySelectorAll<HTMLElement>('[data-route]').forEach((link) => {
    const isActive = link.dataset.route === route;
    link.classList.toggle('nav__link--active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Move focus to the new view's heading for screen-reader users
  const activeView = document.querySelector<HTMLElement>(
    `[data-view="${route}"]`,
  );
  const heading = activeView?.querySelector<HTMLElement>('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

/** Wire bottom-nav click handlers and navigate to the initial route. */
export function setupNavigation(): void {
  document.querySelectorAll<HTMLElement>('[data-route]').forEach((link) => {
    link.addEventListener('click', () => {
      const route = link.dataset.route as Route;
      if (route) navigate(route);
    });
  });

  navigate('home');
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Bootstrap the application.
 *
 * Returns `true` when the app launched in standalone mode and is ready,
 * `false` when the install splash was shown instead.
 */
export async function init(): Promise<boolean> {
  const ready = applyInstallGate(document);
  if (!ready) return false;

  await openDB();
  setupNavigation();
  initBins();
  return true;
}

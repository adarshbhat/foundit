import { applyInstallGate } from './install';
import { openDB } from './db';
import { initBins } from './bins';
import { initSearch, setSearchNavCallbacks, refreshSearch } from './search';
import {
  getRecentItems,
  getLocationPath,
  makeItemCard,
  setItemDetailCloseCallback,
  setNavigateToBinCallback,
  setNavigateCallback,
} from './items';
import { navigateToBin } from './bins';

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

  // Refresh recent items when navigating to home
  if (route === 'home') {
    renderRecentItems().catch(console.error);
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

// ─── Recent items ────────────────────────────────────────────────────────────

async function renderRecentItems(): Promise<void> {
  const section = document.getElementById('recent-items');
  const list = document.getElementById('recent-items-list');
  const emptyEl = document.getElementById('home-empty');
  if (!section || !list) return;

  const items = await getRecentItems();

  list.innerHTML = '';

  if (items.length === 0) {
    section.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  section.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  for (const item of items) {
    const card = makeItemCard(item);
    // Add location path below the name
    const body = card.querySelector('.item-card__body');
    if (body) {
      const path = await getLocationPath(item.binId);
      const locEl = document.createElement('div');
      locEl.className = 'item-card__location text-muted text-sm';
      locEl.textContent = path.length > 0
        ? path.map((p) => p.name).join(' → ')
        : 'Unhoused';
      body.appendChild(locEl);
    }
    list.appendChild(card);
  }
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
  initBins(); // This also initializes items via initItems()
  initSearch();

  // Wire navigation callbacks to avoid circular imports
  setNavigateCallback((route) => navigate(route as Route));
  setNavigateToBinCallback((binId) =>
    navigateToBin(binId).catch(console.error),
  );
  setSearchNavCallbacks(
    (route) => navigate(route as Route),
    (binId) => navigateToBin(binId).catch(console.error),
  );

  // Refresh recent items when item detail is closed (after move/edit/delete)
  setItemDetailCloseCallback(() => {
    renderRecentItems().catch(console.error);
    refreshSearch().catch(console.error);
  });

  // Render recent items on initial load
  await renderRecentItems();

  return true;
}

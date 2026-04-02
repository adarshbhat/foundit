import { applyInstallGate } from './install';
import { openDB } from './db';
import { initBins, refreshBinsView } from './bins';
import { initSearch, refreshSearch, setSearchGoToBin } from './search';
import {
  getRecentItems,
  getLocationPath,
  makeItemCard,
  initItems,
  setNavigateCallback,
  setNavigateToBinCallback,
} from './items';
import { navigateToBin } from './bins';
import { on } from './store';

export type Route = 'home' | 'bins' | 'search' | 'orphans';

let _currentRoute: Route = 'home';

/** Get the currently active route. */
export function currentRoute(): Route {
  return _currentRoute;
}

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

// Dirty flags — when a view is hidden during a data change, mark it dirty
// so it re-renders when it becomes visible.
let _homeDirty = false;
let _binsDirty = false;
let _searchDirty = false;

/** Activate a named view and update nav link state. */
export function navigate(route: Route): void {
  _currentRoute = route;

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

  // Flush dirty views when they become visible
  if (route === 'home' && _homeDirty) {
    _homeDirty = false;
    renderRecentItems().catch(console.error);
  }
  if (route === 'bins' && _binsDirty) {
    _binsDirty = false;
    refreshBinsView().catch(console.error);
  }
  if (route === 'search' && _searchDirty) {
    _searchDirty = false;
    refreshSearch().catch(console.error);
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

// ─── Store subscriptions ─────────────────────────────────────────────────────

function setupStoreSubscriptions(): void {
  // Items changed → refresh visible views or mark dirty
  on('items-changed', () => {
    if (_currentRoute === 'home') {
      renderRecentItems().catch(console.error);
    } else {
      _homeDirty = true;
    }

    if (_currentRoute === 'bins') {
      refreshBinsView().catch(console.error);
    } else {
      _binsDirty = true;
    }

    if (_currentRoute === 'search') {
      refreshSearch().catch(console.error);
    } else {
      _searchDirty = true;
    }
  });

  // Bins changed → refresh visible views or mark dirty
  on('bins-changed', () => {
    if (_currentRoute === 'bins') {
      refreshBinsView().catch(console.error);
    } else {
      _binsDirty = true;
    }

    if (_currentRoute === 'search') {
      refreshSearch().catch(console.error);
    } else {
      _searchDirty = true;
    }
  });
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
  initItems();
  initSearch();

  // Wire navigation callbacks (needed for cross-module navigation without circular imports)
  setNavigateCallback((route) => navigate(route as Route));
  setNavigateToBinCallback((binId) =>
    navigateToBin(binId).catch(console.error),
  );
  setSearchGoToBin((binId) => {
    navigate('bins');
    navigateToBin(binId).catch(console.error);
  });

  setupStoreSubscriptions();

  // Render recent items on initial load
  await renderRecentItems();

  return true;
}

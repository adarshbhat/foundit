import { getAll } from './db';
import type { Bin, Item } from './types';
import {
  getLocationPath,
  makeItemCard,
} from './items';

// ── SVG snippets ──────────────────────────────────────────────

const SVG_BIN = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

const SVG_CHEVRON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

// ── Navigation callbacks (set by app to avoid circular imports) ─

let _navigateToRoute: ((route: string) => void) | null = null;
let _navigateToBin: ((binId: string) => void) | null = null;

export function setSearchNavCallbacks(
  navigateToRoute: (route: string) => void,
  navigateToBin: (binId: string) => void,
): void {
  _navigateToRoute = navigateToRoute;
  _navigateToBin = navigateToBin;
}

// ── Search logic ──────────────────────────────────────────────

export interface SearchResult {
  type: 'item' | 'bin';
  record: Item | Bin;
}

export async function performSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [items, bins] = await Promise.all([getAll('items'), getAll('bins')]);

  const results: SearchResult[] = [];

  for (const item of items) {
    if (item.name.toLowerCase().includes(q)) {
      results.push({ type: 'item', record: item });
    }
  }

  for (const bin of bins) {
    if (bin.name.toLowerCase().includes(q)) {
      results.push({ type: 'bin', record: bin });
    }
  }

  // Sort: exact prefix matches first, then alphabetically
  results.sort((a, b) => {
    const aName = a.record.name.toLowerCase();
    const bName = b.record.name.toLowerCase();
    const aPrefix = aName.startsWith(q) ? 0 : 1;
    const bPrefix = bName.startsWith(q) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return aName.localeCompare(bName);
  });

  return results;
}

// ── Rendering ─────────────────────────────────────────────────

async function renderSearchResults(results: SearchResult[]): Promise<void> {
  const container = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');
  if (!container) return;

  container.innerHTML = '';

  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const hasQuery = (input?.value.trim().length ?? 0) > 0;

  if (emptyEl) emptyEl.hidden = !hasQuery || results.length > 0;

  for (const result of results) {
    if (result.type === 'item') {
      const card = makeItemCard(result.record as Item);
      // Add location path below the item name
      const body = card.querySelector('.item-card__body');
      if (body) {
        const path = await getLocationPath((result.record as Item).binId);
        const locEl = document.createElement('div');
        locEl.className = 'item-card__location text-muted text-sm';
        locEl.textContent = path.length > 0
          ? path.map((p) => p.name).join(' → ')
          : 'Unhoused';
        body.appendChild(locEl);
      }
      card.setAttribute('role', 'listitem');
      container.appendChild(card);
    } else {
      const bin = result.record as Bin;
      const card = makeBinSearchCard(bin);
      card.setAttribute('role', 'listitem');
      container.appendChild(card);
    }
  }
}

function makeBinSearchCard(bin: Bin): HTMLElement {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Go to ${bin.name}`);

  const goToBin = () => {
    _navigateToRoute?.('bins');
    _navigateToBin?.(bin.id);
  };

  card.addEventListener('click', goToBin);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToBin();
    }
  });

  const iconEl = document.createElement('div');
  iconEl.className = 'item-card__icon';
  iconEl.innerHTML = SVG_BIN;

  const body = document.createElement('div');
  body.className = 'item-card__body';

  const nameEl = document.createElement('div');
  nameEl.className = 'item-card__name';
  nameEl.textContent = bin.name;

  const typeEl = document.createElement('div');
  typeEl.className = 'item-card__meta';
  typeEl.textContent = 'Bin';

  body.appendChild(nameEl);
  body.appendChild(typeEl);

  const chevron = document.createElement('span');
  chevron.className = 'item-card__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = SVG_CHEVRON;

  card.appendChild(iconEl);
  card.appendChild(body);
  card.appendChild(chevron);

  return card;
}

// ── Initialisation ────────────────────────────────────────────

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function initSearch(): void {
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  if (!input) return;

  input.addEventListener('input', () => {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(async () => {
      const results = await performSearch(input.value);
      await renderSearchResults(results);
    }, 150);
  });

  // Focus the input when switching to search tab
  document
    .querySelector('[data-route="search"]')
    ?.addEventListener('click', () => {
      requestAnimationFrame(() => input.focus());
    });
}

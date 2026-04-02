import { getById, getByIndex, put, deleteById } from './db';
import type { Bin, Item, LocationHistoryEntry } from './types';
import { emit } from './store';

// ── Business logic ─────────────────────────────────────────────

/**
 * Create a new item with the given name, optional description, and bin assignment.
 * @throws if name is empty or exceeds 128 characters.
 */
export async function createItem(
  name: string,
  description: string = '',
  binId: string | null = null,
): Promise<Item> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Name is required.');
  if (trimmedName.length > 128)
    throw new Error('Name must be 128 characters or fewer.');

  const trimmedDesc = description.trim();

  const now = new Date().toISOString();
  const item: Item = {
    id: crypto.randomUUID(),
    name: trimmedName,
    description: trimmedDesc,
    binId,
    createdAt: now,
    updatedAt: now,
  };
  await put('items', item);
  emit('items-changed');
  return item;
}

/**
 * Update an existing item's name and description.
 * @throws if name is empty, exceeds 128 characters, or item is not found.
 */
export async function updateItem(
  id: string,
  name: string,
  description: string = '',
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Name is required.');
  if (trimmedName.length > 128)
    throw new Error('Name must be 128 characters or fewer.');

  const item = await getById('items', id);
  if (!item) throw new Error('Item not found.');

  const trimmedDesc = description.trim();

  await put('items', {
    ...item,
    name: trimmedName,
    description: trimmedDesc,
    updatedAt: new Date().toISOString(),
  });
  emit('items-changed');
}

/**
 * Assign an item to a bin (or orphan it if binId is null).
 * @throws if item is not found.
 */
export async function assignItemToBin(
  itemId: string,
  binId: string | null,
): Promise<void> {
  const item = await getById('items', itemId);
  if (!item) throw new Error('Item not found.');

  await put('items', {
    ...item,
    binId,
    updatedAt: new Date().toISOString(),
  });
  emit('items-changed');
}

/**
 * Delete an item permanently.
 * @throws if item is not found.
 */
export async function deleteItem(id: string): Promise<void> {
  const item = await getById('items', id);
  if (!item) throw new Error('Item not found.');
  await deleteById('items', id);
  emit('items-changed');
}

/**
 * Get all items in a specific bin.
 */
export async function getItemsInBin(binId: string): Promise<Item[]> {
  const items = await getByIndex('items', 'binId', binId);
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

/**
 * Get all orphaned items (items with no bin assignment).
 */
export async function getOrphanedItems(): Promise<Item[]> {
  const items = await getByIndex('items', 'binId', null);
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

/**
 * Move an item to a new bin (or orphan it). Records a location history entry.
 * @throws if item is not found.
 */
export async function moveItem(
  itemId: string,
  newBinId: string | null,
): Promise<Item> {
  const item = await getById('items', itemId);
  if (!item) throw new Error('Item not found.');

  // Resolve the destination bin name for the history entry
  let binName = 'Unhoused';
  if (newBinId) {
    const bin = await getById('bins', newBinId);
    binName = bin ? bin.name : 'Unknown';
  }

  const entry: LocationHistoryEntry = {
    binId: newBinId,
    binName,
    movedAt: new Date().toISOString(),
  };

  const history = [entry, ...(item.locationHistory ?? [])].slice(0, 10);

  const updated: Item = {
    ...item,
    binId: newBinId,
    locationHistory: history,
    updatedAt: new Date().toISOString(),
  };
  await put('items', updated);
  emit('items-changed');
  return updated;
}

/**
 * Build the full location path for a bin, from root to the given bin.
 * Returns an array of {id, name} from the topmost ancestor down.
 */
export async function getLocationPath(
  binId: string | null,
): Promise<{ id: string; name: string }[]> {
  if (!binId) return [];

  const path: { id: string; name: string }[] = [];
  let current: string | null = binId;

  while (current !== null) {
    const bin: Bin | null = await getById('bins', current);
    if (!bin) break;
    path.unshift({ id: bin.id, name: bin.name });
    current = bin.parentId;
  }

  return path;
}

/**
 * Compute the most likely bins for an item, based on location history frequency.
 * Returns up to 3 bins sorted by frequency (descending), excluding null (orphaned).
 */
export function getMostLikelyBins(
  item: Item,
): { binId: string; binName: string; count: number }[] {
  const history = item.locationHistory ?? [];
  const counts = new Map<string, { binName: string; count: number }>();

  for (const entry of history) {
    if (!entry.binId) continue;
    const existing = counts.get(entry.binId);
    if (existing) {
      existing.count++;
    } else {
      counts.set(entry.binId, { binName: entry.binName, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .map(([binId, { binName, count }]) => ({ binId, binName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

// ── Recently accessed items (localStorage) ────────────────────

const RECENT_KEY = 'foundit_recent_items';
const RECENT_MAX = 5;

/**
 * Record that an item was accessed (viewed or moved).
 * Maintains a list of at most 5 item IDs, newest first.
 */
export function trackRecentAccess(itemId: string): void {
  const ids = getRecentItemIds();
  const filtered = ids.filter((id) => id !== itemId);
  filtered.unshift(itemId);
  const trimmed = filtered.slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/**
 * Get the list of recently accessed item IDs, newest first.
 */
export function getRecentItemIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Corrupt or unavailable — return empty
  }
  return [];
}

/**
 * Get recently accessed items, resolving IDs to full Item records.
 * Skips items that no longer exist.
 */
export async function getRecentItems(): Promise<Item[]> {
  const ids = getRecentItemIds();
  const items: Item[] = [];
  for (const id of ids) {
    const item = await getById('items', id);
    if (item) items.push(item);
  }
  return items;
}

// ── UI Module state ───────────────────────────────────────────

/** The bin ID for which we're currently adding/managing items. */
let _currentBinId: string | null = null;

/** The item being edited in the modal (or null for new item). */
let _editingItem: Item | null = null;

// ── Initialisation ────────────────────────────────────────────

/**
 * Bootstrap the items module. Call once after the DOM is ready.
 * Wires up item modals and handlers.
 */
export function initItems(): void {
  wireItemModals();
}

// ── Item list rendering (called by bins module) ────────────────

/**
 * Render the items for a specific bin in the #item-list container.
 * Called by the bins module when displaying a bin's detail view.
 */
export async function renderItemsForBin(binId: string): Promise<void> {
  _currentBinId = binId;
  const list = document.getElementById('item-list');
  if (!list) return;

  const items = await getItemsInBin(binId);
  list.innerHTML = '';

  for (const item of items) {
    list.appendChild(makeItemCard(item));
  }
}

/**
 * Clear the item list when navigating away from a bin detail view.
 */
export function clearItemList(): void {
  const list = document.getElementById('item-list');
  if (list) list.innerHTML = '';
  _currentBinId = null;
}

// ── Item card rendering ────────────────────────────────────────

export function makeItemCard(item: Item): HTMLElement {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `View ${item.name}`);
  card.dataset.itemId = item.id;

  // Click card to open item detail (unless clicking an action button)
  card.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.bin-card__actions')) {
      openItemDetail(item).catch(console.error);
    }
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openItemDetail(item).catch(console.error);
    }
  });

  // Icon
  const iconEl = document.createElement('div');
  iconEl.className = 'item-card__icon';
  iconEl.innerHTML = SVG_ITEM;

  // Body
  const body = document.createElement('div');
  body.className = 'item-card__body';

  const nameEl = document.createElement('div');
  nameEl.className = 'item-card__name';
  nameEl.textContent = item.name;

  const descEl = document.createElement('div');
  descEl.className = 'item-card__meta';
  descEl.textContent =
    item.description.substring(0, 50) +
    (item.description.length > 50 ? '…' : '');

  body.appendChild(nameEl);
  if (item.description) body.appendChild(descEl);

  // Chevron
  const chevron = document.createElement('span');
  chevron.className = 'item-card__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = SVG_CHEVRON;

  card.appendChild(iconEl);
  card.appendChild(body);
  card.appendChild(chevron);

  return card;
}

// ── Item name/description modal (create / edit) ────────────────

export function openItemModal(item: Item | null): void {
  _editingItem = item;

  const modal = document.getElementById('item-modal');
  const titleEl = document.getElementById('item-modal-title');
  const nameInput = document.getElementById(
    'item-name-input',
  ) as HTMLInputElement | null;
  const descInput = document.getElementById(
    'item-desc-input',
  ) as HTMLTextAreaElement | null;
  const confirmBtn = document.getElementById('item-modal-confirm');
  const errorEl = document.getElementById('item-name-error');

  if (!modal || !titleEl || !nameInput || !descInput || !confirmBtn || !errorEl)
    return;

  titleEl.textContent = item ? 'Edit Item' : 'New Item';
  confirmBtn.textContent = item ? 'Update' : 'Add';
  nameInput.value = item?.name ?? '';
  descInput.value = item?.description ?? '';
  nameInput.classList.remove('is-error');
  errorEl.textContent = '';
  errorEl.hidden = true;

  modal.hidden = false;
  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}

function closeItemModal(): void {
  const modal = document.getElementById('item-modal');
  if (modal) modal.hidden = true;
  _editingItem = null;
}

async function submitItemModal(): Promise<void> {
  const nameInput = document.getElementById(
    'item-name-input',
  ) as HTMLInputElement | null;
  const descInput = document.getElementById(
    'item-desc-input',
  ) as HTMLTextAreaElement | null;
  const errorEl = document.getElementById('item-name-error');

  if (!nameInput || !descInput || !errorEl) return;

  try {
    if (_editingItem) {
      await updateItem(_editingItem.id, nameInput.value, descInput.value);
    } else {
      // New item: assign to current bin
      await createItem(nameInput.value, descInput.value, _currentBinId);
    }
    closeItemModal();
    // Re-render is handled by the store's items-changed event
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Something went wrong.';
    nameInput.classList.add('is-error');
    errorEl.textContent = message;
    errorEl.hidden = false;
    nameInput.focus();
  }
}

// ── Delete item confirmation modal ─────────────────────────────

let _deleteItemTarget: Item | null = null;

async function openDeleteItemModal(item: Item): Promise<void> {
  _deleteItemTarget = item;

  const modal = document.getElementById('delete-item-modal');
  const bodyEl = document.getElementById('delete-item-modal-body');
  if (!modal || !bodyEl) return;

  bodyEl.textContent = `Delete "${item.name}"? This cannot be undone.`;
  modal.hidden = false;
}

function closeDeleteItemModal(): void {
  const modal = document.getElementById('delete-item-modal');
  if (modal) modal.hidden = true;
  _deleteItemTarget = null;
}

async function confirmDeleteItem(): Promise<void> {
  if (!_deleteItemTarget) return;
  const item = _deleteItemTarget;

  await deleteItem(item.id);
  closeDeleteItemModal();
  // Re-render is handled by the store's items-changed event
}

// ── Item detail modal ─────────────────────────────────────────

/** Callback to navigate to a specific bin (set by app to avoid circular import). */
let _navigateToBinCallback: ((binId: string) => void) | null = null;

export function setNavigateToBinCallback(
  cb: (binId: string) => void,
): void {
  _navigateToBinCallback = cb;
}

/** Callback to change the active view/route (set by app to avoid circular import). */
let _navigateCallback: ((route: string) => void) | null = null;

export function setNavigateCallback(cb: (route: string) => void): void {
  _navigateCallback = cb;
}

async function openItemDetail(item: Item): Promise<void> {
  // Track recent access
  trackRecentAccess(item.id);

  const modal = document.getElementById('item-detail-modal');
  const nameEl = document.getElementById('item-detail-name');
  const descEl = document.getElementById('item-detail-desc');
  const locationEl = document.getElementById('item-detail-location');
  const historyEl = document.getElementById('item-detail-history');
  const likelyEl = document.getElementById('item-detail-likely');
  const moveBtn = document.getElementById('item-detail-move');
  const editBtn = document.getElementById('item-detail-edit');
  const deleteBtn = document.getElementById('item-detail-delete');

  if (!modal || !nameEl || !descEl || !locationEl || !historyEl || !likelyEl)
    return;

  nameEl.textContent = item.name;
  descEl.textContent = item.description || 'No description';
  descEl.classList.toggle('text-muted', !item.description);

  // Location breadcrumb
  locationEl.innerHTML = '';
  const path = await getLocationPath(item.binId);
  if (path.length === 0) {
    const span = document.createElement('span');
    span.className = 'text-muted';
    span.textContent = 'Unhoused';
    locationEl.appendChild(span);
  } else {
    for (let i = 0; i < path.length; i++) {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb__sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = ' → ';
        locationEl.appendChild(sep);
      }
      const crumb = document.createElement('button');
      crumb.className = 'breadcrumb__item';
      crumb.setAttribute('type', 'button');
      crumb.textContent = path[i].name;
      const binId = path[i].id;
      crumb.addEventListener('click', () => {
        closeItemDetail();
        _navigateCallback?.('bins');
        _navigateToBinCallback?.(binId);
      });
      locationEl.appendChild(crumb);
    }
  }

  // Location history
  historyEl.innerHTML = '';
  const history = item.locationHistory ?? [];
  if (history.length === 0) {
    historyEl.innerHTML = '<p class="text-muted text-sm">No movement history yet.</p>';
  } else {
    for (const entry of history) {
      const row = document.createElement('div');
      row.className = 'history-entry';
      const name = document.createElement('span');
      name.className = 'history-entry__name';
      name.textContent = entry.binName;
      const date = document.createElement('span');
      date.className = 'history-entry__date text-muted';
      date.textContent = new Date(entry.movedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      row.appendChild(name);
      row.appendChild(date);
      historyEl.appendChild(row);
    }
  }

  // Most likely locations
  likelyEl.innerHTML = '';
  const likely = getMostLikelyBins(item);
  if (likely.length === 0) {
    likelyEl.innerHTML = '<p class="text-muted text-sm">Not enough data yet.</p>';
  } else {
    for (const loc of likely) {
      const chip = document.createElement('span');
      chip.className = 'likely-chip';
      chip.textContent = `${loc.binName} (${loc.count})`;
      likelyEl.appendChild(chip);
    }
  }

  // Wire action buttons
  moveBtn?.replaceWith(moveBtn.cloneNode(true));
  editBtn?.replaceWith(editBtn.cloneNode(true));
  deleteBtn?.replaceWith(deleteBtn.cloneNode(true));

  document.getElementById('item-detail-move')?.addEventListener('click', () => {
    closeItemDetail();
    openBinPicker(async (binId) => {
      const updated = await moveItem(item.id, binId);
      showToast(`Moved to ${updated.binId ? (await getById('bins', updated.binId))?.name ?? 'bin' : 'Unhoused'}`);
      // All view refreshes are handled by the store's items-changed event
    });
  });

  document.getElementById('item-detail-edit')?.addEventListener('click', () => {
    closeItemDetail();
    openItemModal(item);
  });

  document.getElementById('item-detail-delete')?.addEventListener('click', () => {
    closeItemDetail();
    openDeleteItemModal(item).catch(console.error);
  });

  modal.hidden = false;
}

function closeItemDetail(): void {
  const modal = document.getElementById('item-detail-modal');
  if (modal) modal.hidden = true;
}

// ── Bin picker modal ──────────────────────────────────────────

let _binPickerCallback: ((binId: string | null) => void) | null = null;
let _binPickerParentId: string | null = null;

function openBinPicker(
  onSelect: (binId: string | null) => void,
): void {
  _binPickerCallback = onSelect;
  _binPickerParentId = null;

  const modal = document.getElementById('bin-picker-modal');
  if (!modal) return;
  modal.hidden = false;

  renderBinPickerList().catch(console.error);
}

function closeBinPicker(): void {
  const modal = document.getElementById('bin-picker-modal');
  if (modal) modal.hidden = true;
  _binPickerCallback = null;
}

async function renderBinPickerList(): Promise<void> {
  const list = document.getElementById('bin-picker-list');
  const breadcrumb = document.getElementById('bin-picker-breadcrumb');
  const emptyEl = document.getElementById('bin-picker-empty');
  if (!list || !breadcrumb) return;

  // Render breadcrumb
  breadcrumb.innerHTML = '';
  const crumbs: Bin[] = [];
  let id: string | null = _binPickerParentId;
  while (id !== null) {
    const bin = await getById('bins', id);
    if (!bin) break;
    crumbs.unshift(bin);
    id = bin.parentId;
  }

  const rootBtn = document.createElement('button');
  rootBtn.className = 'breadcrumb__item' + (_binPickerParentId === null ? ' breadcrumb__item--active' : '');
  rootBtn.setAttribute('type', 'button');
  rootBtn.textContent = 'Root';
  rootBtn.disabled = _binPickerParentId === null;
  if (_binPickerParentId !== null) {
    rootBtn.addEventListener('click', () => {
      _binPickerParentId = null;
      renderBinPickerList().catch(console.error);
    });
  }
  breadcrumb.appendChild(rootBtn);

  for (const bin of crumbs) {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb__sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '/';
    breadcrumb.appendChild(sep);

    const isActive = bin.id === _binPickerParentId;
    const btn = document.createElement('button');
    btn.className = 'breadcrumb__item' + (isActive ? ' breadcrumb__item--active' : '');
    btn.setAttribute('type', 'button');
    btn.textContent = bin.name;
    btn.disabled = isActive;
    if (!isActive) {
      btn.addEventListener('click', () => {
        _binPickerParentId = bin.id;
        renderBinPickerList().catch(console.error);
      });
    }
    breadcrumb.appendChild(btn);
  }

  breadcrumb.scrollLeft = breadcrumb.scrollWidth;

  // Render bin list
  const bins = await getByIndex('bins', 'parentId', _binPickerParentId);
  bins.sort((a, b) => a.name.localeCompare(b.name));

  list.innerHTML = '';

  if (emptyEl) emptyEl.hidden = bins.length > 0;

  for (const bin of bins) {
    const row = document.createElement('div');
    row.className = 'picker-row';

    const nameBtn = document.createElement('button');
    nameBtn.className = 'picker-row__name';
    nameBtn.setAttribute('type', 'button');
    nameBtn.textContent = bin.name;
    nameBtn.addEventListener('click', () => {
      if (_binPickerCallback) {
        closeBinPicker();
        _binPickerCallback(bin.id);
      }
    });

    const drillBtn = document.createElement('button');
    drillBtn.className = 'picker-row__drill';
    drillBtn.setAttribute('type', 'button');
    drillBtn.setAttribute('aria-label', `Browse ${bin.name}`);
    drillBtn.innerHTML = SVG_CHEVRON;
    drillBtn.addEventListener('click', () => {
      _binPickerParentId = bin.id;
      renderBinPickerList().catch(console.error);
    });

    row.appendChild(nameBtn);
    row.appendChild(drillBtn);
    list.appendChild(row);
  }
}

function selectCurrentPickerLevel(): void {
  if (_binPickerCallback) {
    closeBinPicker();
    _binPickerCallback(_binPickerParentId);
  }
}

// ── Toast ─────────────────────────────────────────────────────

let _toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string): void {
  // Remove any existing toast
  document.getElementById('toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.getElementById('app-shell')?.appendChild(toast);

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.remove();
    _toastTimer = null;
  }, 3000);
}

// ── Modal wiring ──────────────────────────────────────────────

function wireItemModals(): void {
  // Item name/description modal
  document
    .getElementById('item-modal-cancel')
    ?.addEventListener('click', closeItemModal);
  document
    .getElementById('item-modal-close')
    ?.addEventListener('click', closeItemModal);
  document
    .getElementById('item-modal-overlay')
    ?.addEventListener('click', closeItemModal);
  document
    .getElementById('item-modal-confirm')
    ?.addEventListener('click', () => submitItemModal().catch(console.error));
  document
    .getElementById('item-name-input')
    ?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        submitItemModal().catch(console.error);
      }
      if (e.key === 'Escape') closeItemModal();
    });

  // Delete item confirmation modal
  document
    .getElementById('delete-item-modal-cancel')
    ?.addEventListener('click', closeDeleteItemModal);
  document
    .getElementById('delete-item-modal-overlay')
    ?.addEventListener('click', closeDeleteItemModal);
  document
    .getElementById('delete-item-modal-confirm')
    ?.addEventListener('click', () =>
      confirmDeleteItem().catch(console.error),
    );

  // Item detail modal
  document
    .getElementById('item-detail-close')
    ?.addEventListener('click', closeItemDetail);
  document
    .getElementById('item-detail-overlay')
    ?.addEventListener('click', closeItemDetail);

  // Bin picker modal
  document
    .getElementById('bin-picker-close')
    ?.addEventListener('click', closeBinPicker);
  document
    .getElementById('bin-picker-overlay')
    ?.addEventListener('click', closeBinPicker);
  document
    .getElementById('bin-picker-select-current')
    ?.addEventListener('click', selectCurrentPickerLevel);
  document
    .getElementById('bin-picker-orphan')
    ?.addEventListener('click', () => {
      if (_binPickerCallback) {
        closeBinPicker();
        _binPickerCallback(null);
      }
    });
}

// ── Inline SVG snippets ───────────────────────────────────────

const SVG_ITEM = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6-8 6 8"/><path d="M6 9h12v12a2 2 0 01-2 2H8a2 2 0 01-2-2V9z"/></svg>`;

const SVG_CHEVRON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

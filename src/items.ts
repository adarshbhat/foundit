import { getById, getByIndex, put, deleteById } from './db';
import type { Item } from './types';

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
}

/**
 * Delete an item permanently.
 * @throws if item is not found.
 */
export async function deleteItem(id: string): Promise<void> {
  const item = await getById('items', id);
  if (!item) throw new Error('Item not found.');
  await deleteById('items', id);
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

function makeItemCard(item: Item): HTMLElement {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.dataset.itemId = item.id;

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

  // Action buttons (edit, delete)
  const actions = document.createElement('div');
  actions.className = 'bin-card__actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'bin-card__action-btn';
  editBtn.setAttribute('type', 'button');
  editBtn.setAttribute('aria-label', `Edit ${item.name}`);
  editBtn.innerHTML = SVG_PENCIL;
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openItemModal(item);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'bin-card__action-btn bin-card__action-btn--danger';
  deleteBtn.setAttribute('type', 'button');
  deleteBtn.setAttribute('aria-label', `Delete ${item.name}`);
  deleteBtn.innerHTML = SVG_TRASH;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteItemModal(item).catch(console.error);
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(iconEl);
  card.appendChild(body);
  card.appendChild(actions);

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
    if (_currentBinId) {
      await renderItemsForBin(_currentBinId);
    }
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

  if (_currentBinId) {
    await renderItemsForBin(_currentBinId);
  }
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
}

// ── Inline SVG snippets ───────────────────────────────────────

const SVG_ITEM = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6-8 6 8"/><path d="M6 9h12v12a2 2 0 01-2 2H8a2 2 0 01-2-2V9z"/></svg>`;

const SVG_PENCIL = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

const SVG_TRASH = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

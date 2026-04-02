import { getById, getByIndex, put, deleteById } from './db';
import type { Bin } from './types';
import { emit } from './store';
import {
  renderItemsForBin,
  clearItemList,
  openItemModal as openItem,
} from './items';

// ── Module state ──────────────────────────────────────────────

/** The bin currently being browsed, or null for the root level. */
let currentParentId: string | null = null;

// ── Business logic ─────────────────────────────────────────────

/**
 * Create a new bin with the given name under an optional parent.
 * @throws if name is empty or exceeds 64 characters.
 */
export async function createBin(
  name: string,
  parentId: string | null,
): Promise<Bin> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required.');
  if (trimmed.length > 64)
    throw new Error('Name must be 64 characters or fewer.');

  const now = new Date().toISOString();
  const bin: Bin = {
    id: crypto.randomUUID(),
    name: trimmed,
    parentId,
    createdAt: now,
    updatedAt: now,
  };
  await put('bins', bin);
  emit('bins-changed');
  return bin;
}

/**
 * Rename an existing bin.
 * @throws if name is empty, exceeds 64 characters, or bin is not found.
 */
export async function renameBin(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required.');
  if (trimmed.length > 64)
    throw new Error('Name must be 64 characters or fewer.');

  const bin = await getById('bins', id);
  if (!bin) throw new Error('Bin not found.');

  await put('bins', {
    ...bin,
    name: trimmed,
    updatedAt: new Date().toISOString(),
  });
  emit('bins-changed');
}

/**
 * Delete a bin. Direct child bins become top-level (parentId → null).
 * Direct items become orphaned (binId → null). Does not cascade deeper.
 */
export async function deleteBin(id: string): Promise<void> {
  const now = new Date().toISOString();

  // Orphan direct child bins
  const childBins = await getByIndex('bins', 'parentId', id);
  await Promise.all(
    childBins.map((child) =>
      put('bins', { ...child, parentId: null, updatedAt: now }),
    ),
  );

  // Orphan items assigned to this bin
  const childItems = await getByIndex('items', 'binId', id);
  await Promise.all(
    childItems.map((item) =>
      put('items', { ...item, binId: null, updatedAt: now }),
    ),
  );

  // Delete the bin last so a crash before this point leaves orphans rather
  // than dangling references to a deleted parent.
  await deleteById('bins', id);
  emit('bins-changed');
  if (childItems.length > 0) emit('items-changed');
}

/**
 * Returns true if `binId` is the same as or a descendant of `ancestorId`.
 * Use this to prevent moving a bin inside itself or its own descendants.
 */
export async function isDescendantOf(
  binId: string,
  ancestorId: string,
): Promise<boolean> {
  let current: string | null = binId;
  while (current !== null) {
    if (current === ancestorId) return true;
    const bin: Bin | null = await getById('bins', current);
    if (!bin) return false;
    current = bin.parentId;
  }
  return false;
}

// ── Initialisation ─────────────────────────────────────────────

/** Bootstrap the bins view. Call once after the DOM is ready. */
export function initBins(): void {
  document
    .getElementById('add-bin-btn')
    ?.addEventListener('click', openAddChoiceModal);

  wireModals();
  renderBinView().catch(console.error);
}

/** Re-render the current bins view. Called by store subscriptions. */
export async function refreshBinsView(): Promise<void> {
  await navigateToBin(currentParentId);
}

// ── Navigation ─────────────────────────────────────────────────

/** Navigate to a specific bin level (null = root). Re-renders the view. */
export async function navigateToBin(binId: string | null): Promise<void> {
  currentParentId = binId;
  await renderBinView();

  // Show item list if we're inside a bin, hide it at root level
  const binDetail = document.getElementById('bin-detail');
  const binList = document.getElementById('bin-list');
  if (binId) {
    // Show bin detail view with items and child bins
    if (binDetail) binDetail.hidden = false;
    if (binList) binList.hidden = true;

    // Update bin detail title
    const bin = await getById('bins', binId);
    const titleEl = document.getElementById('bin-detail-title');
    if (titleEl && bin) titleEl.textContent = bin.name;

    // Render child bins and items for this bin
    const childBinsContainer = document.getElementById('child-bin-list');
    if (childBinsContainer) {
      const childBins = await getByIndex('bins', 'parentId', binId);
      childBins.sort((a, b) => a.name.localeCompare(b.name));
      childBinsContainer.innerHTML = '';
      for (const childBin of childBins) {
        childBinsContainer.appendChild(await makeBinCard(childBin));
      }
    }

    // Render items for this bin
    await renderItemsForBin(binId);

    // Check if bin has no child bins and no items to show empty state
    const childBins = await getByIndex('bins', 'parentId', binId);
    const items = await getByIndex('items', 'binId', binId);
    const emptyEl = document.getElementById('bin-detail-empty');
    if (emptyEl) {
      emptyEl.hidden = childBins.length > 0 || items.length > 0;
    }

  } else {
    // Show bin list at root level
    if (binDetail) binDetail.hidden = true;
    if (binList) binList.hidden = false;
    clearItemList();

    // Clear child bin list
    const childBinList = document.getElementById('child-bin-list');
    if (childBinList) childBinList.innerHTML = '';
  }
}

// ── Rendering ──────────────────────────────────────────────────

async function renderBinView(): Promise<void> {
  await renderBreadcrumb();
  await renderBinList();
}

async function renderBreadcrumb(): Promise<void> {
  const nav = document.getElementById('bin-breadcrumb');
  if (!nav) return;

  // Build the ancestor chain from currentParentId up to the root
  const crumbs: Bin[] = [];
  let id: string | null = currentParentId;
  while (id !== null) {
    const bin = await getById('bins', id);
    if (!bin) break;
    crumbs.unshift(bin);
    id = bin.parentId;
  }

  nav.innerHTML = '';
  nav.appendChild(makeCrumb('Bins', null));

  for (const bin of crumbs) {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb__sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '/';
    nav.appendChild(sep);
    nav.appendChild(makeCrumb(bin.name, bin.id));
  }

  // Keep the active crumb visible on narrow screens
  nav.scrollLeft = nav.scrollWidth;
}

function makeCrumb(label: string, binId: string | null): HTMLElement {
  const el = document.createElement('button');
  const isActive = binId === currentParentId;
  el.className =
    'breadcrumb__item' + (isActive ? ' breadcrumb__item--active' : '');
  el.setAttribute('type', 'button');
  el.setAttribute('aria-current', isActive ? 'location' : 'false');
  el.disabled = isActive;
  el.textContent = label;
  if (!isActive) {
    el.addEventListener('click', () =>
      navigateToBin(binId).catch(console.error),
    );
  }
  return el;
}

async function renderBinList(): Promise<void> {
  const list = document.getElementById('bin-list');
  const empty = document.getElementById('bins-empty');
  if (!list || !empty) return;

  const bins = await getByIndex('bins', 'parentId', currentParentId);
  bins.sort((a, b) => a.name.localeCompare(b.name));

  list.innerHTML = '';

  if (bins.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  for (const bin of bins) {
    list.appendChild(await makeBinCard(bin));
  }
}

async function makeBinCard(bin: Bin): Promise<HTMLElement> {
  const [childBins, childItems] = await Promise.all([
    getByIndex('bins', 'parentId', bin.id),
    getByIndex('items', 'binId', bin.id),
  ]);

  const card = document.createElement('div');
  card.className = 'item-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${bin.name}`);
  card.dataset.binId = bin.id;

  // Drill into bin on click (unless the click was on an action button)
  card.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.bin-card__actions')) {
      navigateToBin(bin.id).catch(console.error);
    }
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToBin(bin.id).catch(console.error);
    }
  });

  // Icon
  const iconEl = document.createElement('div');
  iconEl.className = 'item-card__icon';
  iconEl.innerHTML = SVG_BIN;

  // Body
  const body = document.createElement('div');
  body.className = 'item-card__body';

  const nameEl = document.createElement('div');
  nameEl.className = 'item-card__name';
  nameEl.textContent = bin.name;

  const metaParts: string[] = [];
  if (childBins.length > 0)
    metaParts.push(
      `${childBins.length} bin${childBins.length !== 1 ? 's' : ''}`,
    );
  if (childItems.length > 0)
    metaParts.push(
      `${childItems.length} item${childItems.length !== 1 ? 's' : ''}`,
    );

  const metaEl = document.createElement('div');
  metaEl.className = 'item-card__meta';
  metaEl.textContent = metaParts.length > 0 ? metaParts.join(', ') : 'Empty';

  body.appendChild(nameEl);
  body.appendChild(metaEl);

  // Action buttons (rename, delete)
  const actions = document.createElement('div');
  actions.className = 'bin-card__actions';

  const renameBtn = document.createElement('button');
  renameBtn.className = 'bin-card__action-btn';
  renameBtn.setAttribute('type', 'button');
  renameBtn.setAttribute('aria-label', `Rename ${bin.name}`);
  renameBtn.innerHTML = SVG_PENCIL;
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openBinModal(bin);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'bin-card__action-btn bin-card__action-btn--danger';
  deleteBtn.setAttribute('type', 'button');
  deleteBtn.setAttribute('aria-label', `Delete ${bin.name}`);
  deleteBtn.innerHTML = SVG_TRASH;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteModal(bin).catch(console.error);
  });

  actions.appendChild(renameBtn);
  actions.appendChild(deleteBtn);

  // Chevron
  const chevron = document.createElement('span');
  chevron.className = 'item-card__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = SVG_CHEVRON;

  card.appendChild(iconEl);
  card.appendChild(body);
  card.appendChild(actions);
  card.appendChild(chevron);

  return card;
}

// ── Bin name modal (create / rename) ──────────────────────────

let _binModalTarget: Bin | null = null;

function openBinModal(bin: Bin | null): void {
  _binModalTarget = bin;

  const modal = document.getElementById('bin-modal');
  const titleEl = document.getElementById('bin-modal-title');
  const input = document.getElementById(
    'bin-name-input',
  ) as HTMLInputElement | null;
  const confirmBtn = document.getElementById('bin-modal-confirm');
  const errorEl = document.getElementById('bin-name-error');

  if (!modal || !titleEl || !input || !confirmBtn || !errorEl) return;

  titleEl.textContent = bin ? 'Rename Bin' : 'New Bin';
  confirmBtn.textContent = bin ? 'Rename' : 'Create';
  input.value = bin?.name ?? '';
  input.classList.remove('is-error');
  errorEl.textContent = '';
  errorEl.hidden = true;

  modal.hidden = false;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function closeBinModal(): void {
  const modal = document.getElementById('bin-modal');
  if (modal) modal.hidden = true;
}

async function submitBinModal(): Promise<void> {
  const input = document.getElementById(
    'bin-name-input',
  ) as HTMLInputElement | null;
  const errorEl = document.getElementById('bin-name-error');
  if (!input || !errorEl) return;

  try {
    if (_binModalTarget) {
      await renameBin(_binModalTarget.id, input.value);
    } else {
      await createBin(input.value, currentParentId);
    }
    closeBinModal();
    // Re-render is handled by the store's bins-changed event
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Something went wrong.';
    input.classList.add('is-error');
    errorEl.textContent = message;
    errorEl.hidden = false;
    input.focus();
  }
}

// ── Delete confirmation modal ──────────────────────────────────

let _deleteTarget: Bin | null = null;

async function openDeleteModal(bin: Bin): Promise<void> {
  _deleteTarget = bin;

  const modal = document.getElementById('delete-modal');
  const bodyEl = document.getElementById('delete-modal-body');
  if (!modal || !bodyEl) return;

  const [childBins, childItems] = await Promise.all([
    getByIndex('bins', 'parentId', bin.id),
    getByIndex('items', 'binId', bin.id),
  ]);

  const parts: string[] = [];
  if (childBins.length > 0)
    parts.push(
      `${childBins.length} nested bin${childBins.length !== 1 ? 's' : ''}`,
    );
  if (childItems.length > 0)
    parts.push(`${childItems.length} item${childItems.length !== 1 ? 's' : ''}`);

  if (parts.length > 0) {
    bodyEl.textContent = `"${bin.name}" contains ${parts.join(' and ')}. They will become unhoused. Delete anyway?`;
  } else {
    bodyEl.textContent = `Delete "${bin.name}"? This cannot be undone.`;
  }

  modal.hidden = false;
}

function closeDeleteModal(): void {
  const modal = document.getElementById('delete-modal');
  if (modal) modal.hidden = true;
  _deleteTarget = null;
}

async function confirmDelete(): Promise<void> {
  if (!_deleteTarget) return;
  const bin = _deleteTarget;

  // If we were browsing inside this bin, navigate up to its former parent
  if (currentParentId === bin.id) {
    currentParentId = bin.parentId;
  }

  await deleteBin(bin.id);
  closeDeleteModal();
  // Re-render is handled by the store's bins-changed event
}

// ── Add choice modal ───────────────────────────────────────────

function openAddChoiceModal(): void {
  const modal = document.getElementById('add-choice-modal');
  if (!modal) return;
  const itemBtn = document.getElementById('add-choice-item');
  if (itemBtn) itemBtn.hidden = currentParentId === null;
  modal.hidden = false;
}

function closeAddChoiceModal(): void {
  const modal = document.getElementById('add-choice-modal');
  if (modal) modal.hidden = true;
}

// ── Modal wiring ───────────────────────────────────────────────

function wireModals(): void {
  // Add choice modal
  document
    .getElementById('add-choice-close')
    ?.addEventListener('click', closeAddChoiceModal);
  document
    .getElementById('add-choice-overlay')
    ?.addEventListener('click', closeAddChoiceModal);
  document
    .getElementById('add-choice-bin')
    ?.addEventListener('click', () => {
      closeAddChoiceModal();
      openBinModal(null);
    });
  document
    .getElementById('add-choice-item')
    ?.addEventListener('click', () => {
      closeAddChoiceModal();
      openItem(null);
    });

  // Bin name modal
  document
    .getElementById('bin-modal-cancel')
    ?.addEventListener('click', closeBinModal);
  document
    .getElementById('bin-modal-close')
    ?.addEventListener('click', closeBinModal);
  document
    .getElementById('bin-modal-overlay')
    ?.addEventListener('click', closeBinModal);
  document
    .getElementById('bin-modal-confirm')
    ?.addEventListener('click', () => submitBinModal().catch(console.error));
  document
    .getElementById('bin-name-input')
    ?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBinModal().catch(console.error);
      if (e.key === 'Escape') closeBinModal();
    });

  // Delete confirmation modal
  document
    .getElementById('delete-modal-cancel')
    ?.addEventListener('click', closeDeleteModal);
  document
    .getElementById('delete-modal-overlay')
    ?.addEventListener('click', closeDeleteModal);
  document
    .getElementById('delete-modal-confirm')
    ?.addEventListener('click', () => confirmDelete().catch(console.error));
}

// ── Inline SVG snippets ────────────────────────────────────────

const SVG_BIN = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

const SVG_PENCIL = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

const SVG_TRASH = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

const SVG_CHEVRON = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

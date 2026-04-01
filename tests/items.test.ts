import { describe, it, expect, beforeEach } from 'vitest';
import { getById, put } from '../src/db';
import type { Item, Bin } from '../src/db';
import {
  createItem,
  updateItem,
  assignItemToBin,
  deleteItem,
  getItemsInBin,
  getOrphanedItems,
  moveItem,
  getLocationPath,
  getMostLikelyBins,
  trackRecentAccess,
  getRecentItemIds,
  getRecentItems,
} from '../src/items';

// ── Helpers ───────────────────────────────────────────────────

async function seedItem(overrides: Partial<Item> = {}): Promise<Item> {
  const item: Item = {
    id: crypto.randomUUID(),
    name: 'Test Item',
    description: 'A test item',
    binId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  await put('items', item);
  return item;
}

async function seedBin(overrides: Partial<Bin> = {}): Promise<Bin> {
  const bin: Bin = {
    id: crypto.randomUUID(),
    name: 'Test Bin',
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  await put('bins', bin);
  return bin;
}

// ── createItem ────────────────────────────────────────────────

describe('createItem', () => {
  it('creates an item with name only', async () => {
    const item = await createItem('Bicycle');
    expect(item.name).toBe('Bicycle');
    expect(item.description).toBe('');
    expect(item.binId).toBeNull();
    expect(item.id).toBeTruthy();
  });

  it('creates an item with name and description', async () => {
    const item = await createItem('Keys', 'Spare car keys');
    expect(item.name).toBe('Keys');
    expect(item.description).toBe('Spare car keys');
  });

  it('creates an item assigned to a bin', async () => {
    const bin = await seedBin();
    const item = await createItem('Book', '', bin.id);
    expect(item.binId).toBe(bin.id);
  });

  it('trims whitespace from name and description', async () => {
    const item = await createItem('  Item  ', '  Description  ');
    expect(item.name).toBe('Item');
    expect(item.description).toBe('Description');
  });

  it('sets createdAt and updatedAt to the same ISO string', async () => {
    const item = await createItem('Test');
    expect(item.createdAt).toBe(item.updatedAt);
    expect(() => new Date(item.createdAt)).not.toThrow();
  });

  it('assigns a unique UUID each time', async () => {
    const a = await createItem('A');
    const b = await createItem('B');
    expect(a.id).not.toBe(b.id);
  });

  it('persists the item to IndexedDB', async () => {
    const item = await createItem('Persistent');
    const stored = await getById('items', item.id);
    expect(stored).toEqual(item);
  });

  it('throws for an empty name', async () => {
    await expect(createItem('')).rejects.toThrow('Name is required.');
  });

  it('throws for a whitespace-only name', async () => {
    await expect(createItem('   ')).rejects.toThrow('Name is required.');
  });

  it('throws when name exceeds 128 characters', async () => {
    await expect(createItem('A'.repeat(129))).rejects.toThrow(
      '128 characters',
    );
  });

  it('accepts a name of exactly 128 characters', async () => {
    const item = await createItem('A'.repeat(128));
    expect(item.name).toHaveLength(128);
  });

  it('allows empty description', async () => {
    const item = await createItem('No Desc', '');
    expect(item.description).toBe('');
  });

  it('allows null binId (orphaned item)', async () => {
    const item = await createItem('Orphan', '', null);
    expect(item.binId).toBeNull();
  });
});

// ── updateItem ────────────────────────────────────────────────

describe('updateItem', () => {
  it('updates item name and description', async () => {
    const item = await seedItem({
      name: 'Old Name',
      description: 'Old description',
    });
    await updateItem(item.id, 'New Name', 'New description');
    const stored = await getById('items', item.id);
    expect(stored?.name).toBe('New Name');
    expect(stored?.description).toBe('New description');
  });

  it('updates name only, preserving description', async () => {
    const item = await seedItem({ description: 'Keep this' });
    await updateItem(item.id, 'New Name', '');
    const stored = await getById('items', item.id);
    expect(stored?.name).toBe('New Name');
    expect(stored?.description).toBe('');
  });

  it('trims whitespace from name and description', async () => {
    const item = await seedItem();
    await updateItem(item.id, '  Trimmed  ', '  Description  ');
    const stored = await getById('items', item.id);
    expect(stored?.name).toBe('Trimmed');
    expect(stored?.description).toBe('Description');
  });

  it('updates updatedAt timestamp', async () => {
    const item = await seedItem({ updatedAt: '2020-01-01T00:00:00Z' });
    await updateItem(item.id, 'New Name');
    const stored = await getById('items', item.id);
    expect(stored?.updatedAt).not.toBe('2020-01-01T00:00:00Z');
    expect(() => new Date(stored?.updatedAt ?? '')).not.toThrow();
  });

  it('throws when item not found', async () => {
    await expect(updateItem('nonexistent', 'Name')).rejects.toThrow(
      'Item not found.',
    );
  });

  it('throws for empty name', async () => {
    const item = await seedItem();
    await expect(updateItem(item.id, '')).rejects.toThrow(
      'Name is required.',
    );
  });

  it('throws when name exceeds 128 characters', async () => {
    const item = await seedItem();
    await expect(updateItem(item.id, 'A'.repeat(129))).rejects.toThrow(
      '128 characters',
    );
  });

  it('accepts a name of exactly 128 characters', async () => {
    const item = await seedItem();
    await updateItem(item.id, 'A'.repeat(128));
    const stored = await getById('items', item.id);
    expect(stored?.name).toHaveLength(128);
  });
});

// ── assignItemToBin ───────────────────────────────────────────

describe('assignItemToBin', () => {
  it('assigns an orphaned item to a bin', async () => {
    const bin = await seedBin();
    const item = await seedItem({ binId: null });
    await assignItemToBin(item.id, bin.id);
    const stored = await getById('items', item.id);
    expect(stored?.binId).toBe(bin.id);
  });

  it('reassigns an item from one bin to another', async () => {
    const bin1 = await seedBin();
    const bin2 = await seedBin();
    const item = await seedItem({ binId: bin1.id });
    await assignItemToBin(item.id, bin2.id);
    const stored = await getById('items', item.id);
    expect(stored?.binId).toBe(bin2.id);
  });

  it('orphans an item by assigning to null', async () => {
    const bin = await seedBin();
    const item = await seedItem({ binId: bin.id });
    await assignItemToBin(item.id, null);
    const stored = await getById('items', item.id);
    expect(stored?.binId).toBeNull();
  });

  it('updates updatedAt timestamp', async () => {
    const bin = await seedBin();
    const item = await seedItem({
      binId: null,
      updatedAt: '2020-01-01T00:00:00Z',
    });
    await assignItemToBin(item.id, bin.id);
    const stored = await getById('items', item.id);
    expect(stored?.updatedAt).not.toBe('2020-01-01T00:00:00Z');
  });

  it('throws when item not found', async () => {
    const bin = await seedBin();
    await expect(assignItemToBin('nonexistent', bin.id)).rejects.toThrow(
      'Item not found.',
    );
  });
});

// ── deleteItem ────────────────────────────────────────────────

describe('deleteItem', () => {
  it('deletes an item from IndexedDB', async () => {
    const item = await seedItem();
    await deleteItem(item.id);
    const stored = await getById('items', item.id);
    expect(stored).toBeNull();
  });

  it('throws when item not found', async () => {
    await expect(deleteItem('nonexistent')).rejects.toThrow(
      'Item not found.',
    );
  });
});

// ── getItemsInBin ─────────────────────────────────────────────

describe('getItemsInBin', () => {
  it('returns items assigned to a bin', async () => {
    const bin = await seedBin();
    const item1 = await seedItem({ name: 'B', binId: bin.id });
    const item2 = await seedItem({ name: 'A', binId: bin.id });
    const items = await getItemsInBin(bin.id);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(item2.id); // Sorted alphabetically
    expect(items[1].id).toBe(item1.id);
  });

  it('returns empty array when bin has no items', async () => {
    const bin = await seedBin();
    const items = await getItemsInBin(bin.id);
    expect(items).toEqual([]);
  });

  it('does not return items in other bins', async () => {
    const bin1 = await seedBin();
    const bin2 = await seedBin();
    await seedItem({ binId: bin1.id });
    await seedItem({ binId: bin2.id });
    const items = await getItemsInBin(bin1.id);
    expect(items).toHaveLength(1);
  });

  it('does not return orphaned items', async () => {
    const bin = await seedBin();
    await seedItem({ binId: bin.id });
    await seedItem({ binId: null });
    const items = await getItemsInBin(bin.id);
    expect(items).toHaveLength(1);
  });

  it('sorts items alphabetically by name', async () => {
    const bin = await seedBin();
    const c = await seedItem({ name: 'Zebra', binId: bin.id });
    const a = await seedItem({ name: 'Apple', binId: bin.id });
    const b = await seedItem({ name: 'Banana', binId: bin.id });
    const items = await getItemsInBin(bin.id);
    expect(items[0].id).toBe(a.id);
    expect(items[1].id).toBe(b.id);
    expect(items[2].id).toBe(c.id);
  });
});

// ── getOrphanedItems ──────────────────────────────────────────

describe('getOrphanedItems', () => {
  it('returns orphaned items', async () => {
    const orphan1 = await seedItem({ name: 'B', binId: null });
    const orphan2 = await seedItem({ name: 'A', binId: null });
    const orphans = await getOrphanedItems();
    expect(orphans).toHaveLength(2);
    expect(orphans[0].id).toBe(orphan2.id); // Sorted alphabetically
    expect(orphans[1].id).toBe(orphan1.id);
  });

  it('returns empty array when no orphaned items', async () => {
    const bin = await seedBin();
    await seedItem({ binId: bin.id });
    const orphans = await getOrphanedItems();
    expect(orphans).toEqual([]);
  });

  it('does not return items in bins', async () => {
    const bin = await seedBin();
    await seedItem({ binId: bin.id });
    await seedItem({ binId: null });
    const orphans = await getOrphanedItems();
    expect(orphans).toHaveLength(1);
  });

  it('sorts orphaned items alphabetically by name', async () => {
    const c = await seedItem({ name: 'Zebra', binId: null });
    const a = await seedItem({ name: 'Apple', binId: null });
    const b = await seedItem({ name: 'Banana', binId: null });
    const orphans = await getOrphanedItems();
    expect(orphans[0].id).toBe(a.id);
    expect(orphans[1].id).toBe(b.id);
    expect(orphans[2].id).toBe(c.id);
  });
});

// ── moveItem ─────────────────────────────────────────────────

describe('moveItem', () => {
  it('moves an item to a new bin', async () => {
    const bin1 = await seedBin({ name: 'Bin A' });
    const bin2 = await seedBin({ name: 'Bin B' });
    const item = await seedItem({ binId: bin1.id });
    const moved = await moveItem(item.id, bin2.id);
    expect(moved.binId).toBe(bin2.id);
    const stored = await getById('items', item.id);
    expect(stored?.binId).toBe(bin2.id);
  });

  it('orphans an item when moving to null', async () => {
    const bin = await seedBin({ name: 'Bin A' });
    const item = await seedItem({ binId: bin.id });
    const moved = await moveItem(item.id, null);
    expect(moved.binId).toBeNull();
  });

  it('records a location history entry', async () => {
    const bin = await seedBin({ name: 'Garage' });
    const item = await seedItem({ binId: null });
    const moved = await moveItem(item.id, bin.id);
    expect(moved.locationHistory).toHaveLength(1);
    expect(moved.locationHistory![0].binId).toBe(bin.id);
    expect(moved.locationHistory![0].binName).toBe('Garage');
    expect(moved.locationHistory![0].movedAt).toBeTruthy();
  });

  it('records "Unhoused" when moving to null', async () => {
    const bin = await seedBin({ name: 'Bin A' });
    const item = await seedItem({ binId: bin.id });
    const moved = await moveItem(item.id, null);
    expect(moved.locationHistory![0].binName).toBe('Unhoused');
    expect(moved.locationHistory![0].binId).toBeNull();
  });

  it('keeps newest entries first in history', async () => {
    const bin1 = await seedBin({ name: 'First' });
    const bin2 = await seedBin({ name: 'Second' });
    const item = await seedItem({ binId: null });
    await moveItem(item.id, bin1.id);
    const final = await moveItem(item.id, bin2.id);
    expect(final.locationHistory).toHaveLength(2);
    expect(final.locationHistory![0].binName).toBe('Second');
    expect(final.locationHistory![1].binName).toBe('First');
  });

  it('limits history to 10 entries', async () => {
    const bins = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        seedBin({ name: `Bin ${i}` }),
      ),
    );
    const item = await seedItem({ binId: null });
    let moved: Item = item;
    for (const bin of bins) {
      moved = await moveItem(item.id, bin.id);
    }
    expect(moved.locationHistory).toHaveLength(10);
    // Oldest entry should be dropped
    expect(moved.locationHistory![9].binName).toBe('Bin 1');
  });

  it('updates updatedAt timestamp', async () => {
    const bin = await seedBin();
    const item = await seedItem({ updatedAt: '2020-01-01T00:00:00Z' });
    const moved = await moveItem(item.id, bin.id);
    expect(moved.updatedAt).not.toBe('2020-01-01T00:00:00Z');
  });

  it('throws when item not found', async () => {
    await expect(moveItem('nonexistent', null)).rejects.toThrow(
      'Item not found.',
    );
  });
});

// ── getLocationPath ──────────────────────────────────────────

describe('getLocationPath', () => {
  it('returns empty array for null binId', async () => {
    const path = await getLocationPath(null);
    expect(path).toEqual([]);
  });

  it('returns single entry for top-level bin', async () => {
    const bin = await seedBin({ name: 'House' });
    const path = await getLocationPath(bin.id);
    expect(path).toHaveLength(1);
    expect(path[0]).toEqual({ id: bin.id, name: 'House' });
  });

  it('returns full path from root to leaf', async () => {
    const house = await seedBin({ name: 'House' });
    const bedroom = await seedBin({ name: 'Bedroom', parentId: house.id });
    const wardrobe = await seedBin({ name: 'Wardrobe', parentId: bedroom.id });
    const path = await getLocationPath(wardrobe.id);
    expect(path).toHaveLength(3);
    expect(path[0].name).toBe('House');
    expect(path[1].name).toBe('Bedroom');
    expect(path[2].name).toBe('Wardrobe');
  });

  it('returns empty for nonexistent bin', async () => {
    const path = await getLocationPath('nonexistent');
    expect(path).toEqual([]);
  });
});

// ── getMostLikelyBins ────────────────────────────────────────

describe('getMostLikelyBins', () => {
  it('returns empty for item with no history', async () => {
    const item = await seedItem();
    const likely = getMostLikelyBins(item);
    expect(likely).toEqual([]);
  });

  it('returns bins sorted by frequency', async () => {
    const item = await seedItem({
      locationHistory: [
        { binId: 'a', binName: 'A', movedAt: '2026-01-01T00:00:00Z' },
        { binId: 'b', binName: 'B', movedAt: '2026-01-02T00:00:00Z' },
        { binId: 'a', binName: 'A', movedAt: '2026-01-03T00:00:00Z' },
        { binId: 'b', binName: 'B', movedAt: '2026-01-04T00:00:00Z' },
        { binId: 'a', binName: 'A', movedAt: '2026-01-05T00:00:00Z' },
      ],
    });
    const likely = getMostLikelyBins(item);
    expect(likely).toHaveLength(2);
    expect(likely[0].binId).toBe('a');
    expect(likely[0].count).toBe(3);
    expect(likely[1].binId).toBe('b');
    expect(likely[1].count).toBe(2);
  });

  it('excludes null binId (unhoused) entries', async () => {
    const item = await seedItem({
      locationHistory: [
        { binId: null, binName: 'Unhoused', movedAt: '2026-01-01T00:00:00Z' },
        { binId: 'a', binName: 'A', movedAt: '2026-01-02T00:00:00Z' },
      ],
    });
    const likely = getMostLikelyBins(item);
    expect(likely).toHaveLength(1);
    expect(likely[0].binId).toBe('a');
  });

  it('limits to 3 results', async () => {
    const item = await seedItem({
      locationHistory: [
        { binId: 'a', binName: 'A', movedAt: '2026-01-01T00:00:00Z' },
        { binId: 'b', binName: 'B', movedAt: '2026-01-02T00:00:00Z' },
        { binId: 'c', binName: 'C', movedAt: '2026-01-03T00:00:00Z' },
        { binId: 'd', binName: 'D', movedAt: '2026-01-04T00:00:00Z' },
      ],
    });
    const likely = getMostLikelyBins(item);
    expect(likely.length).toBeLessThanOrEqual(3);
  });
});

// ── Recent items tracking ────────────────────────────────────

describe('trackRecentAccess / getRecentItemIds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks a single item', () => {
    trackRecentAccess('item-1');
    expect(getRecentItemIds()).toEqual(['item-1']);
  });

  it('keeps newest first', () => {
    trackRecentAccess('item-1');
    trackRecentAccess('item-2');
    expect(getRecentItemIds()).toEqual(['item-2', 'item-1']);
  });

  it('deduplicates, moving to front', () => {
    trackRecentAccess('item-1');
    trackRecentAccess('item-2');
    trackRecentAccess('item-1');
    expect(getRecentItemIds()).toEqual(['item-1', 'item-2']);
  });

  it('limits to 5 items', () => {
    for (let i = 1; i <= 7; i++) {
      trackRecentAccess(`item-${i}`);
    }
    const ids = getRecentItemIds();
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe('item-7');
    expect(ids[4]).toBe('item-3');
  });
});

describe('getRecentItems', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns full item records for tracked IDs', async () => {
    const item1 = await seedItem({ name: 'A' });
    const item2 = await seedItem({ name: 'B' });
    trackRecentAccess(item1.id);
    trackRecentAccess(item2.id);
    const recent = await getRecentItems();
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe(item2.id);
    expect(recent[1].id).toBe(item1.id);
  });

  it('skips deleted items', async () => {
    const item = await seedItem({ name: 'A' });
    trackRecentAccess(item.id);
    trackRecentAccess('deleted-id');
    const recent = await getRecentItems();
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(item.id);
  });
});

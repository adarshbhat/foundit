import { describe, it, expect } from 'vitest';
import {
  openDB,
  getAll,
  getById,
  getByIndex,
  put,
  deleteById,
  clearStore,
} from '../src/db';
import type { Bin, Item } from '../src/db';

// ── Helpers ───────────────────────────────────────────────────

function makeBin(overrides: Partial<Bin> = {}): Bin {
  return {
    id: crypto.randomUUID(),
    name: 'Test Bin',
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    name: 'Test Item',
    description: '',
    binId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── openDB ────────────────────────────────────────────────────

describe('openDB', () => {
  it('opens a database and returns an IDBDatabase', async () => {
    const db = await openDB();
    expect(db).toBeDefined();
    expect(db.name).toBe('foundit');
  });

  it('creates the bins object store', async () => {
    const db = await openDB();
    expect(db.objectStoreNames.contains('bins')).toBe(true);
  });

  it('creates the items object store', async () => {
    const db = await openDB();
    expect(db.objectStoreNames.contains('items')).toBe(true);
  });

  it('returns the same connection on repeated calls', async () => {
    const db1 = await openDB();
    const db2 = await openDB();
    expect(db1).toBe(db2);
  });
});

// ── Bins CRUD ─────────────────────────────────────────────────

describe('bins — put / getById', () => {
  it('stores a bin and retrieves it by id', async () => {
    const bin = makeBin({ name: 'Garage' });
    await put('bins', bin);
    const result = await getById('bins', bin.id);
    expect(result).toEqual(bin);
  });

  it('returns null for a non-existent id', async () => {
    const result = await getById('bins', 'does-not-exist');
    expect(result).toBeNull();
  });

  it('overwrites an existing bin when put is called with the same id', async () => {
    const bin = makeBin({ name: 'Original' });
    await put('bins', bin);
    await put('bins', { ...bin, name: 'Updated' });
    const result = await getById('bins', bin.id);
    expect(result?.name).toBe('Updated');
  });
});

describe('bins — getAll', () => {
  it('returns an empty array when no bins exist', async () => {
    const all = await getAll('bins');
    expect(all).toEqual([]);
  });

  it('returns all stored bins', async () => {
    await put('bins', makeBin({ name: 'Bin A' }));
    await put('bins', makeBin({ name: 'Bin B' }));
    const all = await getAll('bins');
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Bin A', 'Bin B']),
    );
  });
});

describe('bins — deleteById', () => {
  it('removes a bin so getById returns null', async () => {
    const bin = makeBin();
    await put('bins', bin);
    await deleteById('bins', bin.id);
    expect(await getById('bins', bin.id)).toBeNull();
  });

  it('is a no-op when the id does not exist', async () => {
    await expect(deleteById('bins', 'ghost-id')).resolves.toBeUndefined();
  });
});

describe('bins — getByIndex (parentId)', () => {
  it('returns direct children of a parent bin', async () => {
    const parent = makeBin({ name: 'House' });
    const child1 = makeBin({ name: 'Bedroom', parentId: parent.id });
    const child2 = makeBin({ name: 'Kitchen', parentId: parent.id });
    const unrelated = makeBin({ name: 'Car', parentId: null });
    await Promise.all([
      put('bins', parent),
      put('bins', child1),
      put('bins', child2),
      put('bins', unrelated),
    ]);
    const children = await getByIndex('bins', 'parentId', parent.id);
    expect(children).toHaveLength(2);
    expect(children.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Bedroom', 'Kitchen']),
    );
  });

  it('returns top-level bins when queried with null parentId', async () => {
    const top1 = makeBin({ name: 'Car', parentId: null });
    const top2 = makeBin({ name: 'Office', parentId: null });
    const nested = makeBin({ name: 'Glove Compartment', parentId: top1.id });
    await Promise.all([
      put('bins', top1),
      put('bins', top2),
      put('bins', nested),
    ]);
    const roots = await getByIndex('bins', 'parentId', null);
    expect(roots).toHaveLength(2);
    expect(roots.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Car', 'Office']),
    );
  });
});

describe('bins — clearStore', () => {
  it('removes all bins', async () => {
    await put('bins', makeBin());
    await put('bins', makeBin());
    await clearStore('bins');
    expect(await getAll('bins')).toHaveLength(0);
  });
});

// ── Items CRUD ────────────────────────────────────────────────

describe('items — put / getById', () => {
  it('stores an item and retrieves it by id', async () => {
    const item = makeItem({ name: 'Passport', description: 'Blue cover' });
    await put('items', item);
    const result = await getById('items', item.id);
    expect(result).toEqual(item);
  });

  it('returns null for a non-existent id', async () => {
    expect(await getById('items', 'nope')).toBeNull();
  });

  it('overwrites an existing item when put is called with the same id', async () => {
    const item = makeItem({ name: 'Keys' });
    await put('items', item);
    await put('items', { ...item, description: 'Car keys on blue fob' });
    const result = await getById('items', item.id);
    expect(result?.description).toBe('Car keys on blue fob');
  });
});

describe('items — getAll', () => {
  it('returns an empty array when no items exist', async () => {
    expect(await getAll('items')).toEqual([]);
  });

  it('returns all stored items', async () => {
    await put('items', makeItem({ name: 'Keys' }));
    await put('items', makeItem({ name: 'Wallet' }));
    const all = await getAll('items');
    expect(all).toHaveLength(2);
  });
});

describe('items — deleteById', () => {
  it('removes an item', async () => {
    const item = makeItem();
    await put('items', item);
    await deleteById('items', item.id);
    expect(await getById('items', item.id)).toBeNull();
  });
});

describe('items — getByIndex (binId)', () => {
  it('returns items assigned to a specific bin', async () => {
    const binId = crypto.randomUUID();
    const i1 = makeItem({ name: 'Torch', binId });
    const i2 = makeItem({ name: 'Charger', binId });
    const orphan = makeItem({ name: 'Pen', binId: null });
    await Promise.all([put('items', i1), put('items', i2), put('items', orphan)]);
    const binItems = await getByIndex('items', 'binId', binId);
    expect(binItems).toHaveLength(2);
    expect(binItems.map((i) => i.name)).toEqual(
      expect.arrayContaining(['Torch', 'Charger']),
    );
  });

  it('returns orphaned items when queried with null binId', async () => {
    await put('items', makeItem({ binId: null, name: 'Orphan 1' }));
    await put('items', makeItem({ binId: null, name: 'Orphan 2' }));
    await put('items', makeItem({ binId: crypto.randomUUID(), name: 'Housed' }));
    const orphans = await getByIndex('items', 'binId', null);
    expect(orphans).toHaveLength(2);
  });
});

// ── Cross-store isolation ─────────────────────────────────────

describe('store isolation', () => {
  it('bins and items stores do not share data', async () => {
    // Put a bin; items store should still be empty
    await put('bins', makeBin());
    expect(await getAll('items')).toHaveLength(0);

    // Put an item; bins store should still have 1
    await put('items', makeItem());
    expect(await getAll('bins')).toHaveLength(1);
  });
});

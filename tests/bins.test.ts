import { describe, it, expect } from 'vitest';
import { getById, put } from '../src/db';
import type { Bin, Item } from '../src/db';
import { createBin, renameBin, deleteBin, isDescendantOf } from '../src/bins';

// ── Helpers ───────────────────────────────────────────────────

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

async function seedItem(overrides: Partial<Item> = {}): Promise<Item> {
  const item: Item = {
    id: crypto.randomUUID(),
    name: 'Test Item',
    description: '',
    binId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  await put('items', item);
  return item;
}

// ── createBin ─────────────────────────────────────────────────

describe('createBin', () => {
  it('creates a top-level bin and persists it', async () => {
    const bin = await createBin('Garage', null);
    expect(bin.name).toBe('Garage');
    expect(bin.parentId).toBeNull();
    expect(bin.id).toBeTruthy();
    const stored = await getById('bins', bin.id);
    expect(stored).toEqual(bin);
  });

  it('creates a nested bin with the given parentId', async () => {
    const parent = await createBin('House', null);
    const child = await createBin('Bedroom', parent.id);
    expect(child.parentId).toBe(parent.id);
    expect(await getById('bins', child.id)).not.toBeNull();
  });

  it('trims whitespace from the name', async () => {
    const bin = await createBin('  Attic  ', null);
    expect(bin.name).toBe('Attic');
  });

  it('sets createdAt and updatedAt to the same ISO string on creation', async () => {
    const bin = await createBin('Shelf', null);
    expect(bin.createdAt).toBe(bin.updatedAt);
    expect(() => new Date(bin.createdAt)).not.toThrow();
  });

  it('assigns a unique UUID each time', async () => {
    const a = await createBin('A', null);
    const b = await createBin('B', null);
    expect(a.id).not.toBe(b.id);
  });

  it('throws for an empty name', async () => {
    await expect(createBin('', null)).rejects.toThrow('Name is required.');
  });

  it('throws for a whitespace-only name', async () => {
    await expect(createBin('   ', null)).rejects.toThrow('Name is required.');
  });

  it('throws when name exceeds 64 characters', async () => {
    await expect(createBin('A'.repeat(65), null)).rejects.toThrow(
      '64 characters',
    );
  });

  it('accepts a name of exactly 64 characters', async () => {
    const bin = await createBin('A'.repeat(64), null);
    expect(bin.name).toHaveLength(64);
  });
});

// ── renameBin ─────────────────────────────────────────────────

describe('renameBin', () => {
  it('updates the bin name in IndexedDB', async () => {
    const bin = await seedBin({ name: 'Old Name' });
    await renameBin(bin.id, 'New Name');
    const stored = await getById('bins', bin.id);
    expect(stored?.name).toBe('New Name');
  });

  it('preserves id, parentId, and createdAt', async () => {
    const bin = await seedBin({ name: 'A', parentId: null });
    await renameBin(bin.id, 'B');
    const stored = await getById('bins', bin.id);
    expect(stored?.id).toBe(bin.id);
    expect(stored?.parentId).toBeNull();
    expect(stored?.createdAt).toBe(bin.createdAt);
  });

  it('updates updatedAt', async () => {
    const bin = await seedBin();
    const before = bin.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await renameBin(bin.id, 'Updated');
    const stored = await getById('bins', bin.id);
    expect(stored?.updatedAt).not.toBe(before);
  });

  it('trims whitespace from the name', async () => {
    const bin = await seedBin();
    await renameBin(bin.id, '  Shelf  ');
    const stored = await getById('bins', bin.id);
    expect(stored?.name).toBe('Shelf');
  });

  it('throws for an empty name', async () => {
    const bin = await seedBin();
    await expect(renameBin(bin.id, '')).rejects.toThrow('Name is required.');
  });

  it('throws when name exceeds 64 characters', async () => {
    const bin = await seedBin();
    await expect(renameBin(bin.id, 'X'.repeat(65))).rejects.toThrow(
      '64 characters',
    );
  });

  it('throws when bin does not exist', async () => {
    await expect(renameBin('no-such-id', 'Name')).rejects.toThrow(
      'Bin not found.',
    );
  });
});

// ── deleteBin ─────────────────────────────────────────────────

describe('deleteBin', () => {
  it('removes the bin from IndexedDB', async () => {
    const bin = await seedBin();
    await deleteBin(bin.id);
    expect(await getById('bins', bin.id)).toBeNull();
  });

  it('orphans direct child bins (sets parentId to null)', async () => {
    const parent = await seedBin({ name: 'Parent' });
    const child = await seedBin({ name: 'Child', parentId: parent.id });
    await deleteBin(parent.id);
    const updatedChild = await getById('bins', child.id);
    expect(updatedChild).not.toBeNull();
    expect(updatedChild?.parentId).toBeNull();
  });

  it('orphans items assigned to the deleted bin', async () => {
    const bin = await seedBin();
    const item = await seedItem({ binId: bin.id });
    await deleteBin(bin.id);
    const updatedItem = await getById('items', item.id);
    expect(updatedItem).not.toBeNull();
    expect(updatedItem?.binId).toBeNull();
  });

  it('does not cascade to grandchildren', async () => {
    const grandparent = await seedBin({ name: 'GP' });
    const parent = await seedBin({ name: 'P', parentId: grandparent.id });
    const child = await seedBin({ name: 'C', parentId: parent.id });
    await deleteBin(grandparent.id);
    // Direct child is orphaned
    expect((await getById('bins', parent.id))?.parentId).toBeNull();
    // Grandchild still points to its own parent (unchanged)
    expect((await getById('bins', child.id))?.parentId).toBe(parent.id);
  });

  it('does not delete items — only unlinks them', async () => {
    const bin = await seedBin();
    const item = await seedItem({ binId: bin.id });
    await deleteBin(bin.id);
    expect(await getById('items', item.id)).not.toBeNull();
  });

  it('leaves unrelated bins and items untouched', async () => {
    const target = await seedBin({ name: 'Target' });
    const other = await seedBin({ name: 'Other' });
    const otherItem = await seedItem({ binId: other.id });
    await deleteBin(target.id);
    expect(await getById('bins', other.id)).not.toBeNull();
    expect((await getById('items', otherItem.id))?.binId).toBe(other.id);
  });
});

// ── isDescendantOf ────────────────────────────────────────────

describe('isDescendantOf', () => {
  it('returns true when binId equals ancestorId (self)', async () => {
    const bin = await seedBin();
    expect(await isDescendantOf(bin.id, bin.id)).toBe(true);
  });

  it('returns true for a direct child', async () => {
    const parent = await seedBin();
    const child = await seedBin({ parentId: parent.id });
    expect(await isDescendantOf(child.id, parent.id)).toBe(true);
  });

  it('returns true for a grandchild', async () => {
    const grandparent = await seedBin();
    const parent = await seedBin({ parentId: grandparent.id });
    const child = await seedBin({ parentId: parent.id });
    expect(await isDescendantOf(child.id, grandparent.id)).toBe(true);
  });

  it('returns false for an unrelated bin', async () => {
    const a = await seedBin();
    const b = await seedBin();
    expect(await isDescendantOf(a.id, b.id)).toBe(false);
  });

  it('returns false when checking upward (parent is not a descendant of child)', async () => {
    const parent = await seedBin();
    const child = await seedBin({ parentId: parent.id });
    expect(await isDescendantOf(parent.id, child.id)).toBe(false);
  });

  it('returns false for a non-existent bin', async () => {
    const bin = await seedBin();
    expect(await isDescendantOf('ghost-id', bin.id)).toBe(false);
  });
});

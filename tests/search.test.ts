import { describe, it, expect } from 'vitest';
import { put } from '../src/db';
import type { Bin, Item } from '../src/db';
import { performSearch } from '../src/search';

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

// ── performSearch ────────────────────────────────────────────

describe('performSearch', () => {
  it('returns empty for empty query', async () => {
    await seedItem({ name: 'Keys' });
    const results = await performSearch('');
    expect(results).toEqual([]);
  });

  it('returns empty for whitespace-only query', async () => {
    await seedItem({ name: 'Keys' });
    const results = await performSearch('   ');
    expect(results).toEqual([]);
  });

  it('finds items by name', async () => {
    const keys = await seedItem({ name: 'Car Keys' });
    await seedItem({ name: 'Bicycle' });
    const results = await performSearch('keys');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('item');
    expect(results[0].record.id).toBe(keys.id);
  });

  it('finds bins by name', async () => {
    const garage = await seedBin({ name: 'Garage' });
    await seedBin({ name: 'Bedroom' });
    const results = await performSearch('garage');
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('bin');
    expect(results[0].record.id).toBe(garage.id);
  });

  it('returns both items and bins matching the query', async () => {
    await seedItem({ name: 'Kitchen Knife' });
    await seedBin({ name: 'Kitchen' });
    const results = await performSearch('kitchen');
    expect(results).toHaveLength(2);
    const types = results.map((r) => r.type);
    expect(types).toContain('item');
    expect(types).toContain('bin');
  });

  it('is case-insensitive', async () => {
    const item = await seedItem({ name: 'UPPERCASE ITEM' });
    const results = await performSearch('uppercase');
    expect(results).toHaveLength(1);
    expect(results[0].record.id).toBe(item.id);
  });

  it('matches substring anywhere in name', async () => {
    const item = await seedItem({ name: 'My Important Keys' });
    const results = await performSearch('important');
    expect(results).toHaveLength(1);
    expect(results[0].record.id).toBe(item.id);
  });

  it('sorts prefix matches before substring matches', async () => {
    const bookshelf = await seedItem({ name: 'Bookshelf Manual' });
    const cookbook = await seedItem({ name: 'Cookbook' });
    const book = await seedItem({ name: 'Book' });
    const results = await performSearch('book');
    // "Book" and "Bookshelf Manual" start with "book"; "Cookbook" doesn't
    expect(results[0].record.id).toBe(book.id);
    expect(results[1].record.id).toBe(bookshelf.id);
    expect(results[2].record.id).toBe(cookbook.id);
  });

  it('returns empty when nothing matches', async () => {
    await seedItem({ name: 'Keys' });
    await seedBin({ name: 'Garage' });
    const results = await performSearch('zzzzzzz');
    expect(results).toEqual([]);
  });
});

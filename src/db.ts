import type { Bin, Item, StoreName, StoreRecord } from './types';

const DB_NAME = 'foundit';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('bins')) {
        const binsStore = db.createObjectStore('bins', { keyPath: 'id' });
        binsStore.createIndex('parentId', 'parentId', { unique: false });
        binsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('items')) {
        const itemsStore = db.createObjectStore('items', { keyPath: 'id' });
        itemsStore.createIndex('binId', 'binId', { unique: false });
        itemsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getAll<T extends StoreName>(
  storeName: T,
): Promise<StoreRecord<T>[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as StoreRecord<T>[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getById<T extends StoreName>(
  storeName: T,
  id: string,
): Promise<StoreRecord<T> | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as StoreRecord<T>) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIndex<T extends StoreName>(
  storeName: T,
  indexName: string,
  value: IDBValidKey | null,
): Promise<StoreRecord<T>[]> {
  // null is not a valid IDB key, so records with a null field are never stored
  // in the index.  Fall back to a full-store scan and filter in-memory.
  if (value === null) {
    const all = await getAll(storeName);
    return all.filter(
      (r) => (r as unknown as Record<string, unknown>)[indexName] === null,
    ) as StoreRecord<T>[];
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const index = db
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result as StoreRecord<T>[]);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T extends StoreName>(
  storeName: T,
  record: StoreRecord<T>,
): Promise<IDBValidKey> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db
      .transaction(storeName, 'readwrite')
      .objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteById(
  storeName: StoreName,
  id: string,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db
      .transaction(storeName, 'readwrite')
      .objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db
      .transaction(storeName, 'readwrite')
      .objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Close and reset the cached connection. Used in tests between each test. */
export async function _resetDB(): Promise<void> {
  if (_db) {
    _db.close();
    _db = null;
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// Re-export types so consumers can import from a single location
export type { Bin, Item };

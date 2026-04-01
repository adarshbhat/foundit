/** A storage bin / physical container. */
export interface Bin {
  id: string;
  name: string;
  /** UUID of the parent bin, or null if top-level. */
  parentId: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

/** A single entry in an item's location history. */
export interface LocationHistoryEntry {
  binId: string | null;
  binName: string; // name at the time of the move, for historical display
  movedAt: string; // ISO-8601
}

/** A physical item tracked in the inventory. */
export interface Item {
  id: string;
  name: string;
  description: string;
  /** UUID of the bin this item lives in, or null if orphaned. */
  binId: string | null;
  /** Last 10 locations this item has been in, newest first. */
  locationHistory?: LocationHistoryEntry[];
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export type StoreName = 'bins' | 'items';
export type StoreRecord<T extends StoreName> = T extends 'bins' ? Bin : Item;

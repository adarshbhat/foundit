/**
 * Lightweight pub/sub event bus for data change notifications.
 *
 * Every mutation (create, update, delete, move) emits an event so that
 * all subscribed views can re-render, regardless of which view triggered
 * the change.
 */

export type StoreEvent = 'items-changed' | 'bins-changed';

type Listener = () => void;

const _listeners = new Map<StoreEvent, Set<Listener>>();

/** Subscribe to a data-change event. Returns an unsubscribe function. */
export function on(event: StoreEvent, listener: Listener): () => void {
  let set = _listeners.get(event);
  if (!set) {
    set = new Set();
    _listeners.set(event, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

/** Emit a data-change event, notifying all subscribers. */
export function emit(event: StoreEvent): void {
  const set = _listeners.get(event);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}

/** Remove all listeners. Used in tests. */
export function _resetListeners(): void {
  _listeners.clear();
}

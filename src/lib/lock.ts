/**
 * Per-key async mutex. Chains every operation for a key through one promise so
 * concurrent read-modify-write+commit sequences on the same file serialize
 * instead of racing (each sees the previous one's result). Used to keep a
 * meeting's text autosave and its attachment add/remove — which write the same
 * `.md` file from different endpoints — from clobbering each other.
 *
 * Module-level so every route that imports it shares the same lock map.
 */
const locks = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep the chain alive but never let a rejection break the next link.
  locks.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

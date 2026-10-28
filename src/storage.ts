// Persistent storage: asks the browser not to evict IndexedDB when the device runs low on space.

export type StorageState = 'persistent' | 'not-persistent' | 'unsupported';

export async function storageState(): Promise<StorageState> {
  if (!navigator.storage?.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'persistent' : 'not-persistent';
}

/** Requests persistent storage; returns the state afterwards. Safe to call on every start. */
export async function requestPersistentStorage(): Promise<StorageState> {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    return await storageState();
  } catch {
    return 'unsupported';
  }
}

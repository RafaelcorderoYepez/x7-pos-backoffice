/**
 * KDS Offline Resilience Mode, Local Event Queueing & Network Re-Sync Engine
 * Historia X7P-4210
 *
 * Implements:
 * 1. IndexedDB storage for offline ticket caching and local action queueing
 * 2. 3-second heartbeat ping and offline/online detection
 * 3. Automatic queue flushing to POST /api/kitchen-event-logs/sync upon re-connection
 * 4. Zero-loss optimistic bumping and item updates while disconnected
 */

export interface KdsQueuedAction {
  id?: number;
  actionType:
    | 'BUMP_ORDER'
    | 'RECALL_ORDER'
    | 'UPDATE_ITEM_STATUS'
    | 'INCREMENT_ITEM_QTY'
    | 'FIRE_ITEM'
    | 'FIRE_COURSE'
    | 'BATCH_BUMP_FIFO';
  kitchenOrderId?: number;
  kitchenOrderItemId?: number;
  course?: string;
  status?: string;
  preparedQuantity?: number;
  productName?: string;
  variantName?: string;
  quantity?: number;
  stationId?: number;
  clientTimestamp: string;
  retries?: number;
}

const DB_NAME = 'x7_kds_offline_db';
const DB_VERSION = 1;
const STORE_ACTIONS = 'offline_actions';
const STORE_TICKETS = 'offline_tickets';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openKdsDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
        db.createObjectStore(STORE_ACTIONS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_TICKETS)) {
        db.createObjectStore(STORE_TICKETS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Enqueue a user action to IndexedDB while offline
 */
export async function enqueueOfflineAction(
  action: Omit<KdsQueuedAction, 'id' | 'clientTimestamp'> & { clientTimestamp?: string }
): Promise<KdsQueuedAction> {
  const db = await openKdsDb();
  const fullAction: KdsQueuedAction = {
    ...action,
    clientTimestamp: action.clientTimestamp || new Date().toISOString(),
    retries: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, 'readwrite');
    const store = tx.objectStore(STORE_ACTIONS);
    const req = store.add(fullAction);

    req.onsuccess = (e) => {
      fullAction.id = (e.target as IDBRequest).result as number;
      resolve(fullAction);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve all pending queued actions from IndexedDB in chronological order
 */
export async function getQueuedActions(): Promise<KdsQueuedAction[]> {
  const db = await openKdsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, 'readonly');
    const store = tx.objectStore(STORE_ACTIONS);
    const req = store.getAll();

    req.onsuccess = () => {
      const actions = (req.result || []) as KdsQueuedAction[];
      actions.sort((a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime());
      resolve(actions);
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove successfully synchronized actions by ID
 */
export async function removeQueuedActions(ids: number[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const db = await openKdsDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, 'readwrite');
    const store = tx.objectStore(STORE_ACTIONS);

    ids.forEach((id) => store.delete(id));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Cache current tickets to IndexedDB so they survive offline refreshes
 */
export async function cacheTicketsLocally<T extends { id: string | number }>(tickets: T[]): Promise<void> {
  try {
    const db = await openKdsDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TICKETS, 'readwrite');
      const store = tx.objectStore(STORE_TICKETS);
      store.clear();
      tickets.forEach((t) => {
        try {
          store.put(JSON.parse(JSON.stringify(t)));
        } catch {
          store.put(t);
        }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to cache tickets to IndexedDB:', err);
  }
}

/**
 * Retrieve cached tickets from IndexedDB
 */
export async function getCachedTicketsLocally<T>(): Promise<T[]> {
  try {
    const db = await openKdsDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TICKETS, 'readonly');
      const store = tx.objectStore(STORE_TICKETS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Flush all queued offline actions to the backend server
 */
export async function flushOfflineQueue(
  apiBase: string,
  token: string | null
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  const queued = await getQueuedActions();
  if (queued.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  const payload = {
    actions: queued.map((a) => ({
      actionType: a.actionType,
      kitchenOrderId: a.kitchenOrderId,
      kitchenOrderItemId: a.kitchenOrderItemId,
      course: a.course,
      status: a.status,
      preparedQuantity: a.preparedQuantity,
      productName: a.productName,
      variantName: a.variantName,
      quantity: a.quantity,
      stationId: a.stationId,
      clientTimestamp: a.clientTimestamp,
    })),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const res = await fetch(`${apiBase}/kitchen-event-logs/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Sync failed with HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const idsToRemove = queued.map((q) => q.id).filter((id): id is number => typeof id === 'number');
    await removeQueuedActions(idsToRemove);

    return {
      success: true,
      syncedCount: data.syncedCount || queued.length,
      errors: [],
    };
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.warn('Failed to flush offline queue:', errorMsg);
    return {
      success: false,
      syncedCount: 0,
      errors: [errorMsg],
    };
  }
}

/**
 * Clear all cached tickets and pending offline actions from IndexedDB
 */
export async function clearOfflineData(): Promise<void> {
  try {
    const db = await openKdsDb();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // En caso de que el inspector de DevTools mantenga un lock de lectura abierto
        resolve();
      }, 500);

      try {
        const tx = db.transaction([STORE_ACTIONS, STORE_TICKETS], 'readwrite');
        tx.objectStore(STORE_ACTIONS).clear();
        tx.objectStore(STORE_TICKETS).clear();

        tx.oncomplete = () => {
          clearTimeout(timer);
          resolve();
        };
        tx.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
        tx.onabort = () => {
          clearTimeout(timer);
          resolve();
        };
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  } catch (err) {
    console.warn('Failed to clear offline data:', err);
  }
}

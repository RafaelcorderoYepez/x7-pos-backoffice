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
 * Enqueue a user action to IndexedDB while offline with smart coalescing and deduplication.
 * Prevents redundant database sync states (e.g. intermediate prep steps superseded by ready/bumped).
 */
export async function enqueueOfflineAction(
  action: Omit<KdsQueuedAction, 'id' | 'clientTimestamp'> & { clientTimestamp?: string }
): Promise<KdsQueuedAction> {
  const db = await openKdsDb();
  const timestamp = action.clientTimestamp || new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ACTIONS, 'readwrite');
    const store = tx.objectStore(STORE_ACTIONS);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const existing = (getAllReq.result || []) as KdsQueuedAction[];

      // Prevención de doble-clic rápido accidental (debounce < 300ms misma acción y misma comanda/ítem)
      const isRapidDoubleClick = existing.some(
        (a) =>
          a.actionType === action.actionType &&
          a.kitchenOrderId === action.kitchenOrderId &&
          a.kitchenOrderItemId === action.kitchenOrderItemId &&
          a.course === action.course &&
          a.clientTimestamp &&
          Math.abs(new Date(timestamp).getTime() - new Date(a.clientTimestamp).getTime()) < 300
      );
      if (isRapidDoubleClick) {
        console.log('[X7-KDS-SYNC] Debounced rapid duplicate click for:', action.actionType, 'orderId:', action.kitchenOrderId);
        resolve({ ...action, clientTimestamp: timestamp });
        return;
      }

      // 1. Si es BUMP_ORDER:
      // Removemos acciones intermedias de ítems pendientes para esta comanda
      if (action.actionType === 'BUMP_ORDER' && action.kitchenOrderId) {
        existing.forEach((a) => {
          if (
            (a.actionType === 'UPDATE_ITEM_STATUS' || a.actionType === 'FIRE_ITEM') &&
            a.kitchenOrderId === action.kitchenOrderId &&
            typeof a.id === 'number'
          ) {
            store.delete(a.id);
          }
        });
        // IMPORTANTE: NO borramos RECALL_ORDER previos ni cancelamos el BUMP.
        // Toda la secuencia de movimientos (recall -> bump -> recall -> bump) se preserva auditada.
      }

      // 2. Si es UPDATE_ITEM_STATUS:
      if (action.actionType === 'UPDATE_ITEM_STATUS' && action.kitchenOrderItemId) {
        const existingItemAction = existing.find(
          (a) => a.actionType === 'UPDATE_ITEM_STATUS' && a.kitchenOrderItemId === action.kitchenOrderItemId
        );
        if (existingItemAction && typeof existingItemAction.id === 'number') {
          existingItemAction.status = action.status;
          existingItemAction.clientTimestamp = timestamp;
          if (action.kitchenOrderId) existingItemAction.kitchenOrderId = action.kitchenOrderId;
          store.put(existingItemAction);
          resolve(existingItemAction);
          return;
        }
      }

      // 3. Si es FIRE_ITEM:
      if (action.actionType === 'FIRE_ITEM' && action.kitchenOrderItemId) {
        const dupFire = existing.find(
          (a) => a.actionType === 'FIRE_ITEM' && a.kitchenOrderItemId === action.kitchenOrderItemId
        );
        if (dupFire) {
          resolve(dupFire);
          return;
        }
      }

      // 4. Si es FIRE_COURSE:
      if (action.actionType === 'FIRE_COURSE' && action.course) {
        const dupCourse = existing.find(
          (a) => a.actionType === 'FIRE_COURSE' && a.course === action.course && a.stationId === action.stationId
        );
        if (dupCourse) {
          resolve(dupCourse);
          return;
        }
      }

      // Encolar acción preservando orden cronológico completo
      console.log('[X7-KDS-SYNC] Enqueuing action:', action.actionType, 'orderId:', action.kitchenOrderId, 'itemId:', action.kitchenOrderItemId);
      const fullAction: KdsQueuedAction = {
        ...action,
        clientTimestamp: timestamp,
        retries: 0,
      };
      const addReq = store.add(fullAction);
      addReq.onsuccess = (e) => {
        fullAction.id = (e.target as IDBRequest).result as number;
        resolve(fullAction);
      };
      addReq.onerror = () => reject(addReq.error);
    };

    getAllReq.onerror = () => reject(getAllReq.error);
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
  console.log('[X7-KDS-SYNC] flushOfflineQueue called. Queued actions:', queued.length, queued.map(a => `${a.actionType}(orderId=${a.kitchenOrderId})`));
  if (queued.length === 0) {
    console.log('[X7-KDS-SYNC] No pending actions, skipping sync.');
    return { success: true, syncedCount: 0, errors: [] };
  }

  // Filtrar y normalizar el payload para garantizar compatibilidad estricta con OfflineKitchenActionDto
  const actionsPayload = queued.map((a) => {
    const act: Record<string, unknown> = {
      actionType: a.actionType,
      clientTimestamp: a.clientTimestamp || new Date().toISOString(),
    };
    if (typeof a.kitchenOrderId === 'number' && !isNaN(a.kitchenOrderId)) {
      act.kitchenOrderId = a.kitchenOrderId;
    } else if (typeof a.kitchenOrderId === 'string' && !isNaN(Number(a.kitchenOrderId))) {
      act.kitchenOrderId = Number(a.kitchenOrderId);
    }
    if (typeof a.kitchenOrderItemId === 'number' && !isNaN(a.kitchenOrderItemId)) {
      act.kitchenOrderItemId = a.kitchenOrderItemId;
    } else if (typeof a.kitchenOrderItemId === 'string' && !isNaN(Number(a.kitchenOrderItemId))) {
      act.kitchenOrderItemId = Number(a.kitchenOrderItemId);
    }
    if (typeof a.stationId === 'number' && !isNaN(a.stationId)) {
      act.stationId = a.stationId;
    }
    if (typeof a.quantity === 'number') act.quantity = a.quantity;
    if (typeof a.preparedQuantity === 'number') act.preparedQuantity = a.preparedQuantity;
    if (typeof a.status === 'string') act.status = a.status;
    if (typeof a.course === 'string') act.course = a.course;
    if (typeof a.productName === 'string') act.productName = a.productName;
    if (typeof a.variantName === 'string') act.variantName = a.variantName;

    return act;
  });

  const payload = {
    actions: actionsPayload,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    console.log('[X7-KDS-SYNC] Sending sync POST to', `${apiBase}/kitchen-event-logs/sync`, 'payload:', JSON.stringify(payload, null, 2));
    const res = await fetch(`${apiBase}/kitchen-event-logs/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    console.log('[X7-KDS-SYNC] Sync response status:', res.status, res.statusText);

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Sync failed with HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    console.log('[X7-KDS-SYNC] Sync response data:', JSON.stringify(data));
    const idsToRemove = queued.map((q) => q.id).filter((id): id is number => typeof id === 'number');
    await removeQueuedActions(idsToRemove);
    console.log('[X7-KDS-SYNC] Removed', idsToRemove.length, 'actions from queue. Synced count:', data.syncedCount || queued.length);

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

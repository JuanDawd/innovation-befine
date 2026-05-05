/**
 * T079 — IndexedDB mutation queue
 *
 * Stores mutations that fail due to offline connectivity.
 * On reconnect, the queue is flushed in order with idempotency keys so
 * retries are safe. Works in the browser only — guards against SSR.
 *
 * Supported mutation types:
 *   - "markPieceDone"   — clothier marks a craftable piece as done
 *   - "createTicket"    — cashier creates a ticket while offline
 *   - "paidOffline"     — cashier marks checkout as paid_offline
 */

export type MutationType = "markPieceDone" | "createTicket" | "paidOffline";

export type QueuedMutation = {
  id: string; // client-generated UUID (also the idempotency key)
  type: MutationType;
  payload: unknown;
  createdAt: number; // Date.now()
  attempts: number;
  lastError: string | null;
};

const DB_NAME = "befine-offline";
const DB_VERSION = 1;
const STORE = "mutations";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(
  mutation: Omit<QueuedMutation, "attempts" | "lastError">,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  await idbRequest(tx.objectStore(STORE).put({ ...mutation, attempts: 0, lastError: null }));
}

export async function dequeue(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  await idbRequest(tx.objectStore(STORE).delete(id));
}

export async function listQueued(): Promise<QueuedMutation[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  const index = tx.objectStore(STORE).index("createdAt");
  return idbRequest<QueuedMutation[]>(index.getAll() as IDBRequest<QueuedMutation[]>);
}

export async function markAttempted(id: string, error: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const existing = await idbRequest<QueuedMutation>(store.get(id) as IDBRequest<QueuedMutation>);
  if (!existing) return;
  await idbRequest(store.put({ ...existing, attempts: existing.attempts + 1, lastError: error }));
}

export async function clearAll(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  await idbRequest(tx.objectStore(STORE).clear());
}

import {
  OfflineQueueError,
  isQuotaExceededError,
  queueErrorMessage,
} from "./queue-state";

// At-rest protection for queued scan credentials.
//
// The queue holds the raw scan credential until the server revalidates it. A
// device-local AES-GCM key (256-bit, non-extractable) is generated once and
// persisted in a dedicated IndexedDB database. The credential is sealed before
// it is written to the queue and opened only when a batch is assembled or the
// queue panel reads it.
//
// Limits, documented in docs/security/offline-queue-hardening.md:
// - The key lives in the same origin, so script executing in this origin (XSS)
//   can still ask the browser to decrypt. Non-extractable only prevents key
//   exfiltration, not use by an active same-origin attacker.
// - If the key store is cleared while the queue survives, sealed rows become
//   unreadable. They are flagged, never silently dropped.
// - Rows written by schema v1 are plaintext; they are read as-is and re-sealed
//   only when re-enqueued. They are not silently deleted.

const KEY_DATABASE_NAME = "prism-pass-offline-keys";
const KEY_STORE_NAME = "keys";
const QUEUE_KEY_ID = "queue-credential-aes-gcm-v1";
const SEALED_PREFIX = "ppenc:v1:";
const IV_BYTES = 12;
const AAD = new TextEncoder().encode("prism-pass:offline-credential:v1");

type StoredQueueKey = {
  id: string;
  key: CryptoKey;
  createdAt: number;
};

export function isSealedCredential(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SEALED_PREFIX);
}

/** True when this browser can both generate keys and persist them. */
export function atRestAvailable(): boolean {
  return typeof indexedDB !== "undefined" && typeof globalThis.crypto?.subtle !== "undefined";
}

function encryptionUnavailable(): OfflineQueueError {
  return new OfflineQueueError("encryption_unavailable", queueErrorMessage("encryption_unavailable"));
}

function unreadableCredential(): OfflineQueueError {
  return new OfflineQueueError("credential_unreadable", queueErrorMessage("credential_unreadable"));
}

function mapKeyStoreError(error: unknown): OfflineQueueError {
  if (isQuotaExceededError(error)) return new OfflineQueueError("quota", queueErrorMessage("quota"));
  return encryptionUnavailable();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Generate a fresh AES-GCM key. Non-extractable: raw key bytes cannot leave WebCrypto. */
export async function generateQueueKey(): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw encryptionUnavailable();
  try {
    return await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  } catch {
    throw encryptionUnavailable();
  }
}

/** Seal one credential into a self-describing string. */
export async function sealCredential(plain: string, key: CryptoKey): Promise<string> {
  const cryptoApi = globalThis.crypto;
  const subtle = cryptoApi?.subtle;
  if (!subtle || !cryptoApi?.getRandomValues) throw encryptionUnavailable();
  if (isSealedCredential(plain)) throw encryptionUnavailable();
  try {
    const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: AAD },
      key,
      new TextEncoder().encode(plain),
    );
    return `${SEALED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
  } catch {
    throw encryptionUnavailable();
  }
}

/**
 * Open a sealed credential. Plaintext legacy values are returned unchanged so
 * rows written by schema v1 keep working after an upgrade.
 */
export async function openCredential(sealed: string, key: CryptoKey): Promise<string> {
  if (!isSealedCredential(sealed)) return sealed;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw unreadableCredential();
  try {
    const payload = sealed.slice(SEALED_PREFIX.length);
    const separator = payload.indexOf(".");
    if (separator <= 0 || separator === payload.length - 1) throw new Error("malformed sealed credential");
    const iv = base64ToBytes(payload.slice(0, separator));
    const ciphertext = base64ToBytes(payload.slice(separator + 1));
    if (iv.length !== IV_BYTES || ciphertext.length === 0) throw new Error("malformed sealed credential");
    const plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: AAD },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof OfflineQueueError) throw error;
    throw unreadableCredential();
  }
}

let keyDatabasePromise: Promise<IDBDatabase> | null = null;

function openKeyDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(encryptionUnavailable());
  if (keyDatabasePromise) return keyDatabasePromise;

  keyDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(KEY_DATABASE_NAME, 1);
    } catch (error) {
      keyDatabasePromise = null;
      reject(mapKeyStoreError(error));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE_NAME)) {
        database.createObjectStore(KEY_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        keyDatabasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      keyDatabasePromise = null;
      reject(mapKeyStoreError(request.error));
    };
  });
  return keyDatabasePromise;
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Read the existing key without creating one. Returns null when absent. */
export async function loadQueueKey(): Promise<CryptoKey | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const database = await openKeyDatabase();
    const transaction = database.transaction(KEY_STORE_NAME, "readonly");
    const record = await readRequest<StoredQueueKey | undefined>(
      transaction.objectStore(KEY_STORE_NAME).get(QUEUE_KEY_ID),
    );
    return record?.key ?? null;
  } catch (error) {
    if (error instanceof OfflineQueueError) throw error;
    throw mapKeyStoreError(error);
  }
}

/**
 * Load the queue key, creating it once per origin. The read/put runs in one
 * readwrite transaction so two tabs cannot both install a different key and
 * strand each other's queued ciphertext.
 */
export async function loadOrCreateQueueKey(): Promise<CryptoKey> {
  const existing = await loadQueueKey();
  if (existing) return existing;
  // Generate outside the transaction: awaiting WebCrypto inside IndexedDB can
  // let the transaction auto-commit before the conditional put.
  const candidate = await generateQueueKey();
  const database = await openKeyDatabase();

  return new Promise<CryptoKey>((resolve, reject) => {
    let result: CryptoKey | null = null;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof OfflineQueueError ? error : mapKeyStoreError(error));
    };

    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(KEY_STORE_NAME, "readwrite");
    } catch (error) {
      fail(error);
      return;
    }

    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      if (result) resolve(result);
      else reject(encryptionUnavailable());
    };
    transaction.onabort = () => fail(transaction.error);
    transaction.onerror = () => fail(transaction.error);

    const store = transaction.objectStore(KEY_STORE_NAME);
    const get = store.get(QUEUE_KEY_ID);
    get.onerror = () => fail(get.error);
    get.onsuccess = () => {
      const found = get.result as StoredQueueKey | undefined;
      if (found?.key) {
        result = found.key;
        return;
      }
      const put = store.put({ id: QUEUE_KEY_ID, key: candidate, createdAt: Date.now() });
      put.onerror = () => fail(put.error);
      put.onsuccess = () => {
        result = candidate;
      };
    };
  });
}

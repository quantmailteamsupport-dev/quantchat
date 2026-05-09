/**
 * key-store.ts — Secure Local Key Storage (IndexedDB)
 *
 * All private keys and ratchet session states are persisted locally in
 * IndexedDB. The server never sees any private key material.
 *
 * Stores:
 *   identity_keys      — Our long-lived IK pair (1 per device)
 *   signed_pre_keys    — Current + previous SPK pairs
 *   one_time_pre_keys  — Unused OPKs (refilled when running low)
 *   sessions           — Serialized RatchetState per (userId, deviceId)
 */

import type { IdentityKeyPair, SignedPreKey, OneTimePreKey } from "./x3dh";
import type { RatchetState } from "./double-ratchet";

const DB_NAME = "QuantchatKeyStore";
const DB_VERSION = 1;

const STORE_IK = "identity_keys";
const STORE_SPK = "signed_pre_keys";
const STORE_OPK = "one_time_pre_keys";
const STORE_SESSIONS = "sessions";

// ─── Database Lifecycle ─────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IK)) {
        db.createObjectStore(STORE_IK, { keyPath: "keyId" });
      }
      if (!db.objectStoreNames.contains(STORE_SPK)) {
        db.createObjectStore(STORE_SPK, { keyPath: "keyId" });
      }
      if (!db.objectStoreNames.contains(STORE_OPK)) {
        db.createObjectStore(STORE_OPK, { keyPath: "keyId" });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function dbCount(storeName: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ─── Public API ─────────────────────────────────────────────

export class KeyStore {
  // ── Identity Key ──

  static async saveIdentityKey(ik: IdentityKeyPair): Promise<void> {
    await dbPut(STORE_IK, ik);
  }

  static async getIdentityKey(): Promise<IdentityKeyPair | undefined> {
    const all = await dbGetAll<IdentityKeyPair>(STORE_IK);
    return all[0]; // only 1 per device
  }

  // ── Signed Pre-Key ──

  static async saveSignedPreKey(spk: SignedPreKey): Promise<void> {
    await dbPut(STORE_SPK, spk);
  }

  static async getSignedPreKey(keyId: string): Promise<SignedPreKey | undefined> {
    return dbGet<SignedPreKey>(STORE_SPK, keyId);
  }

  static async getCurrentSignedPreKey(): Promise<SignedPreKey | undefined> {
    const all = await dbGetAll<SignedPreKey>(STORE_SPK);
    // Return the most recent one
    return all.sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  static async deleteOldSignedPreKeys(maxAgeMs: number = 30 * 24 * 3600 * 1000): Promise<void> {
    const all = await dbGetAll<SignedPreKey>(STORE_SPK);
    const cutoff = Date.now() - maxAgeMs;
    for (const spk of all) {
      if (spk.createdAt < cutoff) {
        await dbDelete(STORE_SPK, spk.keyId);
      }
    }
  }

  // ── One-Time Pre-Keys ──

  static async saveOneTimePreKeys(opks: OneTimePreKey[]): Promise<void> {
    for (const opk of opks) {
      await dbPut(STORE_OPK, opk);
    }
  }

  static async getOneTimePreKey(keyId: string): Promise<OneTimePreKey | undefined> {
    return dbGet<OneTimePreKey>(STORE_OPK, keyId);
  }

  static async consumeOneTimePreKey(keyId: string): Promise<OneTimePreKey | undefined> {
    const opk = await dbGet<OneTimePreKey>(STORE_OPK, keyId);
    if (opk) {
      await dbDelete(STORE_OPK, keyId);
    }
    return opk;
  }

  static async getOneTimePreKeyCount(): Promise<number> {
    return dbCount(STORE_OPK);
  }

  static async getAllOneTimePreKeys(): Promise<OneTimePreKey[]> {
    return dbGetAll<OneTimePreKey>(STORE_OPK);
  }

  // ── Sessions ──

  static sessionId(myUserId: string, theirUserId: string): string {
    return `session:${myUserId}:${theirUserId}`;
  }

  static async saveSession(
    myUserId: string,
    theirUserId: string,
    state: RatchetState
  ): Promise<void> {
    await dbPut(STORE_SESSIONS, {
      sessionId: this.sessionId(myUserId, theirUserId),
      state,
      updatedAt: Date.now(),
    });
  }

  static async getSession(
    myUserId: string,
    theirUserId: string
  ): Promise<RatchetState | undefined> {
    const record = await dbGet<{ sessionId: string; state: RatchetState }>(
      STORE_SESSIONS,
      this.sessionId(myUserId, theirUserId)
    );
    return record?.state;
  }

  static async deleteSession(myUserId: string, theirUserId: string): Promise<void> {
    await dbDelete(STORE_SESSIONS, this.sessionId(myUserId, theirUserId));
  }

  static async getAllSessions(): Promise<{ sessionId: string; state: RatchetState }[]> {
    return dbGetAll(STORE_SESSIONS);
  }
}

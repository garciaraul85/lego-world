/**
 * P33: the editor's AI key at rest. A key can be
 * - locked: encrypted with a passphrase (PBKDF2-SHA-256, 310 000 rounds, then AES-GCM, through WebCrypto); it is
 *   unlocked into memory for this page only, by typing the passphrase;
 * - session: kept in memory only, gone when the page closes (“don't remember”);
 * - plain: stored as it is in this browser (the old way; Settings recommends locking it).
 *
 * Honest limit: encryption at rest protects backups and other people using this computer, not code running in
 * the page while the key is unlocked. The content security policy (network only to the AI host) and the
 * sandboxed game scripts cover that.
 */
export type KeyMode = 'locked' | 'session' | 'plain';
export type LockedKey = { salt: string; iv: string; data: string; rounds: number };

export const PBKDF2_ROUNDS = 310_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(passphrase: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: rounds, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts a key with a passphrase (at least 8 characters). */
export async function lockKey(key: string, passphrase: string, rounds = PBKDF2_ROUNDS): Promise<LockedKey> {
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await derive(passphrase, salt, rounds);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, new TextEncoder().encode(key)),
  );
  return { salt: b64(salt), iv: b64(iv), data: b64(data), rounds };
}

/** Decrypts a locked key; null when the passphrase is wrong. */
export async function unlockKey(locked: LockedKey, passphrase: string): Promise<string | null> {
  try {
    const k = await derive(passphrase, unb64(locked.salt), locked.rounds);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(locked.iv) as BufferSource },
      k,
      unb64(locked.data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** the key while this page is open (session keys, and locked keys once unlocked) */
let memoryKey = '';
export const sessionKey = () => memoryKey;
export const setSessionKey = (k: string) => {
  memoryKey = k;
};

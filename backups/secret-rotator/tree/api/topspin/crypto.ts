import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

// AES-256-GCM encryption for connector admin credentials at rest.
// Key comes from TOPSPIN_ENC_KEY: either a 64-char hex key or an arbitrary
// passphrase (derived with scrypt). A built-in default keeps demo mode
// explorable — set TOPSPIN_ENC_KEY in any real deployment.

const DEFAULT_PASSPHRASE = "topspin-demo-passphrase";
const SCRYPT_SALT = "topspin-connector-config-v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.TOPSPIN_ENC_KEY || DEFAULT_PASSPHRASE;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, "hex");
  } else {
    cachedKey = scryptSync(raw, SCRYPT_SALT, 32);
  }
  return cachedKey;
}

/** Encrypt a JSON-serializable value -> base64 payload `iv.tag.ciphertext`. */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/** Decrypt a payload produced by encryptJson. Returns null on bad input. */
export function decryptJson<T = Record<string, unknown>>(
  payload: string | null | undefined,
): T | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 3) return null;
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** sha256 hex prefix (16 chars) — the only trace of a secret value we keep. */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

/** Full sha256 hex of arbitrary string input. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Random URL-safe/base62-ish token of given length from crypto bytes. */
export function randomToken(length: number, alphabet?: string): string {
  const chars =
    alphabet ??
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

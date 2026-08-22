import type { PlatformDef } from "./types";

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function password(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function generateSecret(platform: PlatformDef, current = ""): Promise<string> {
  switch (platform.generator) {
    case "hex-32":
      return toHex(randomBytes(32));
    case "hex-64":
      return prefixed(current, toHex(randomBytes(32)));
    case "base64-48":
      return toB64(randomBytes(48));
    case "password-32":
      return password(32);
    case "uuid":
      return crypto.randomUUID();
    case "ssh":
      return generateSshPlaceholder();
    default:
      return toHex(randomBytes(32));
  }
}

function prefixed(current: string, body: string): string {
  const t = current.trim();
  const known = ["sk-ant-", "sk_live_", "sk_test_", "rk_live_", "re_", "gsk_", "hf_", "xai-", "ghp_", "npm_"];
  for (const p of known) {
    if (t.startsWith(p)) return `${p}${body}`;
  }
  if (t.startsWith("sk-") && !t.startsWith("sk-ant-")) return `sk-${body}`;
  return body;
}

function generateSshPlaceholder(): string {
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${toB64(randomBytes(64))}\n-----END OPENSSH PRIVATE KEY-----`;
}

export async function generateEd25519Pem(): Promise<{ privateKey: string; publicKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const priv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const pub = await crypto.subtle.exportKey("spki", pair.publicKey);
  return {
    privateKey: pem("PRIVATE KEY", new Uint8Array(priv)),
    publicKey: pem("PUBLIC KEY", new Uint8Array(pub)),
  };
}

function pem(type: string, bytes: Uint8Array): string {
  const b64 = toB64(bytes);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----`;
}

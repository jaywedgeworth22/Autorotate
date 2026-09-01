import { lookup } from "node:dns/promises";

// ── Outbound URL guard (AR-09) ──────────────────────────────────
// Every URL Autorotate fetches on a caller's behalf — webhook targets, Slack
// and Discord alert webhooks — is attacker-supplied by construction: the
// operator types it into a form.  Without a guard, `http://169.254.169.254/…`
// turns the rotation engine into a cloud-metadata reader, and an `http://`
// target with `includeValue: true` ships a freshly minted credential in
// cleartext.
//
// The range checks below are a pure function so they can be unit-tested
// without touching DNS; `assertSafeWebhookUrl` layers scheme, userinfo and
// resolution checks on top.

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** Parse a dotted-quad into four octets, or null when it is not one. */
function parseIPv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isForbiddenIPv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 — "this network" / unspecified
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  // Special-purpose blocks that can still route to internal hosts or be used
  // as SSRF pivots (RFC 5736/5737/2544) — a webhook has no business here.
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, 255.255.255.255
  return false;
}

/**
 * Expand any IPv6 textual form (including `::`, a zone id, and an embedded
 * IPv4 tail) into eight 16-bit hextets.  Returns null when the input is not
 * a syntactically valid IPv6 address.
 */
export function expandIPv6(input: string): number[] | null {
  let s = input.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return null;

  let embedded: number[] | null = null;
  if (s.includes(".")) {
    const cut = s.lastIndexOf(":");
    const v4 = parseIPv4(s.slice(cut + 1));
    if (!v4) return null;
    embedded = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, cut);
    // "::1.2.3.4" leaves a lone ":" — restore the compression marker.
    if (s.endsWith(":") && !s.endsWith("::")) s += ":";
    if (s === ":") s = "::";
  }

  const wanted = embedded ? 6 : 8;
  const dbl = s.indexOf("::");
  let head: string[];
  let tail: string[];
  if (dbl >= 0) {
    if (s.indexOf("::", dbl + 1) >= 0) return null; // only one "::" allowed
    const headRaw = s.slice(0, dbl);
    const tailRaw = s.slice(dbl + 2);
    head = headRaw ? headRaw.split(":") : [];
    tail = tailRaw ? tailRaw.split(":") : [];
    if (head.length + tail.length > wanted) return null;
  } else {
    head = s ? s.split(":") : [];
    tail = [];
    if (head.length !== wanted) return null;
  }

  const fill = wanted - head.length - tail.length;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  const hextets: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    hextets.push(parseInt(group, 16));
  }
  return embedded ? [...hextets, ...embedded] : hextets;
}

/** Apply the IPv4 verdict to a v4 address carried in two 16-bit hextets. */
function embeddedIPv4Forbidden(hi: number, lo: number): boolean {
  return isForbiddenIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
}

function isForbiddenIPv6(h: number[]): boolean {
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d, ::1, ::)
  // addresses inherit the IPv4 verdict — that is also how "::1" is rejected.
  const firstFive = h.slice(0, 5).every((x) => x === 0);
  if (firstFive && (h[5] === 0xffff || h[5] === 0)) {
    return embeddedIPv4Forbidden(h[6], h[7]);
  }
  // ── Transition formats that wrap an IPv4 address ────────────────
  // Without decoding these, `64:ff9b::10.0.0.1`, `2002:0a00:0001::` and
  // friends slip a private v4 past the guard.  Each carries an embedded v4;
  // apply the v4 verdict to it.
  // IPv4-translated ::ffff:0:0/96 → 0:0:0:0:ffff:0:v4hi:v4lo
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0xffff && h[5] === 0) {
    return embeddedIPv4Forbidden(h[6], h[7]);
  }
  // NAT64 64:ff9b::/96 and 64:ff9b:1::/48 → embedded v4 in the last 32 bits
  if (h[0] === 0x0064 && h[1] === 0xff9b) {
    return embeddedIPv4Forbidden(h[6], h[7]);
  }
  // 6to4 2002::/16 → bytes 1-4 (h[1], h[2]) carry the v4
  if (h[0] === 0x2002) {
    return embeddedIPv4Forbidden(h[1], h[2]);
  }
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * True when `ip` is loopback, link-local, RFC1918, CGNAT, ULA, multicast or
 * unspecified — anything a webhook must never be pointed at.  Unparseable
 * input is treated as forbidden: a guard that fails open is not a guard.
 */
export function isForbiddenAddress(ip: string): boolean {
  const v4 = parseIPv4(ip.trim());
  if (v4) return isForbiddenIPv4(v4);
  const v6 = expandIPv6(ip);
  if (v6) return isForbiddenIPv6(v6);
  return true;
}

/** True when the host component is an IP literal rather than a DNS name. */
export function isIpLiteral(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  return parseIPv4(bare) !== null || expandIPv6(bare) !== null;
}

/**
 * Validate an operator-supplied outbound URL before Autorotate fetches it.
 *
 * Rejects any non-https scheme, embedded credentials, and hosts that resolve
 * to a private, loopback or link-local address.  Returns the parsed URL so
 * callers fetch exactly what was validated.
 *
 * Caveat, stated plainly: resolution happens here and the connection happens
 * in the caller, so a DNS rebind between the two is not prevented.  Closing
 * that gap needs a pinned-address HTTP agent; this guard stops the realistic
 * cases (metadata endpoints, `localhost`, RFC1918 hosts, `http://`).
 */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("webhook URL is not a valid absolute URL");
  }
  if (url.protocol !== "https:") {
    throw new BlockedUrlError(
      `webhook URLs must use https:// (got ${url.protocol}//) — plaintext delivery is refused`,
    );
  }
  if (url.username || url.password) {
    throw new BlockedUrlError("webhook URLs must not embed credentials in the userinfo component");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) {
    if (isForbiddenAddress(host)) {
      throw new BlockedUrlError(
        `webhook host ${host} is a private, loopback or link-local address`,
      );
    }
    return url;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError(`webhook host ${host} could not be resolved`);
  }
  if (addresses.length === 0) {
    throw new BlockedUrlError(`webhook host ${host} resolved to no addresses`);
  }
  for (const { address } of addresses) {
    if (isForbiddenAddress(address)) {
      throw new BlockedUrlError(
        `webhook host ${host} resolves to a private, loopback or link-local address (${address})`,
      );
    }
  }
  return url;
}

/**
 * Guarded outbound fetch (AR-09).  The single sink for every operator-supplied
 * URL Autorotate POSTs a rotation notice or alert to.
 *
 * `assertSafeWebhookUrl` alone is not enough: a public host may answer with a
 * 3xx to `http://169.254.169.254/…`, and undici follows redirects by default,
 * so the freshly minted secret is re-POSTed to the metadata endpoint.  This
 * forces `redirect: "manual"` and treats any 3xx (or an opaque redirect) as a
 * delivery FAILURE rather than following it — every guarded sink must go
 * through here, never a bare `fetch`.
 */
export async function safeFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  const url = await assertSafeWebhookUrl(raw);
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    const location = res.headers.get("location") ?? "an undisclosed location";
    throw new BlockedUrlError(`refused to follow redirect to ${location}`);
  }
  return res;
}

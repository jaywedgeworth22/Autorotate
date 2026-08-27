/**
 * Derive the externally visible base URL of the deployment from the request
 * (AR-20).
 *
 * The QR pairing payload used to hardcode a fleet infrastructure hostname,
 * which both leaked private infrastructure into a public repository and made
 * the payload wrong for every other deployment.  Trust the first hop of
 * x-forwarded-* only — later hops are attacker-controlled — and fall back to
 * Host, then to the request URL's own origin.
 */
export function requestBaseUrl(req: Request): string {
  const forwardedHost = firstHop(req.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? req.headers.get("host");
  const proto =
    firstHop(req.headers.get("x-forwarded-proto")) ??
    (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  if (host) return `${proto}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

function firstHop(header: string | null): string | null {
  if (!header) return null;
  const value = header.split(",")[0].trim();
  return value.length > 0 ? value : null;
}

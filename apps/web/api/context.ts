import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { readSessionCookie, verifySession } from "./auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  /** True when the request carries a valid, unexpired console session. */
  authenticated: boolean;
  /**
   * Best-effort client IP (F3).  Supplied by the Hono handler in boot.ts —
   * x-forwarded-for first hop, else the socket remote address, else "unknown".
   * Used only to key the per-IP login throttle, never for authorization.
   */
  clientIp: string;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
  clientIp = "unknown",
): Promise<TrpcContext> {
  const authenticated = verifySession(readSessionCookie(opts.req.headers.get("cookie")));
  return { req: opts.req, resHeaders: opts.resHeaders, authenticated, clientIp };
}

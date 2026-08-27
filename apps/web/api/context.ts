import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { readSessionCookie, verifySession } from "./auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  /** True when the request carries a valid, unexpired console session. */
  authenticated: boolean;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const authenticated = verifySession(readSessionCookie(opts.req.headers.get("cookie")));
  return { req: opts.req, resHeaders: opts.resHeaders, authenticated };
}

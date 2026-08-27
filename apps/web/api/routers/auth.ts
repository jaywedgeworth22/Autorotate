import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import {
  clearedSessionCookie,
  createSession,
  sessionCookie,
  verifyAdminToken,
} from "../auth";
import { appendAudit } from "../autorotate/engine";

// ── Login attempt throttle ──────────────────────────────────────
// Per-process and deliberately small: it exists to blunt online guessing of
// AUTOROTATE_ADMIN_TOKEN, not to be a distributed rate limiter.  boot.ts adds
// a per-IP limiter in front of the whole API; a multi-replica deployment
// wanting a shared counter needs a shared store.

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;
let loginAttempts: number[] = [];

export function recordLoginAttempt(now: number = Date.now()): boolean {
  loginAttempts = loginAttempts.filter((at) => now - at < LOGIN_WINDOW_MS);
  if (loginAttempts.length >= LOGIN_MAX_ATTEMPTS) return false;
  loginAttempts.push(now);
  return true;
}

export const authRouter = createRouter({
  /** Public by design — the login page asks this before rendering. */
  session: publicQuery.query(({ ctx }) => ({ authenticated: ctx.authenticated })),

  login: publicQuery
    .input(z.object({ token: z.string().min(1).max(512) }))
    .mutation(async ({ input, ctx }) => {
      if (!recordLoginAttempt()) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "too many sign-in attempts — wait a minute and try again",
        });
      }
      if (!verifyAdminToken(input.token)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "invalid admin token" });
      }
      ctx.resHeaders.append("set-cookie", sessionCookie(createSession()));
      try {
        // Successful sign-ins only: an unauthenticated caller must not be able
        // to append to the audit chain by guessing tokens.
        await appendAudit("web-user", "auth.login", null, { method: "admin-token" });
      } catch (err) {
        // A database hiccup must not lock the operator out of the console.
        console.error("[autorotate auth] could not audit login:", (err as Error).message);
      }
      return { ok: true as const };
    }),

  logout: publicQuery.mutation(({ ctx }) => {
    ctx.resHeaders.append("set-cookie", clearedSessionCookie());
    return { ok: true as const };
  }),
});

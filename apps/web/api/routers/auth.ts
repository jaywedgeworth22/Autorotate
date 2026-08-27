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

// ── Login attempt throttle (F3) ─────────────────────────────────
// Per-process and deliberately small: it exists to blunt online guessing of
// AUTOROTATE_ADMIN_TOKEN, not to be a distributed rate limiter.  The bucket is
// keyed by CLIENT IP and counts only FAILED attempts, so a flood of junk
// logins from one address locks out only that address — never the real
// operator signing in from elsewhere.  A successful login clears the bucket.
// A multi-replica deployment wanting a shared counter needs a shared store.
//
// Note (out of scope, see PR body): the IP is derived from x-forwarded-for and
// is therefore spoofable by a client that can set that header directly.  The
// constant-time token compare is the real defence; this throttle is a speed
// bump on top of it.

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 10_000;
const failedByIp = new Map<string, number[]>();

function recentFailures(ip: string, now: number): number[] {
  return (failedByIp.get(ip) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS);
}

/** True when this IP has already used its failed-attempt budget this window. */
export function isLoginRateLimited(ip: string, now: number = Date.now()): boolean {
  const recent = recentFailures(ip, now);
  if (recent.length === 0) failedByIp.delete(ip);
  else failedByIp.set(ip, recent);
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

/** Record one FAILED sign-in for this IP. */
export function recordFailedLogin(ip: string, now: number = Date.now()): void {
  const recent = recentFailures(ip, now);
  recent.push(now);
  failedByIp.set(ip, recent);
  // Bounded cleanup so a spray of unique spoofed IPs cannot grow the map.
  if (failedByIp.size > MAX_TRACKED_IPS) {
    for (const [k, v] of failedByIp) {
      if (v.every((at) => now - at >= LOGIN_WINDOW_MS)) failedByIp.delete(k);
    }
  }
}

/** Clear the bucket for an IP after a successful sign-in. */
export function resetLoginAttempts(ip: string): void {
  failedByIp.delete(ip);
}

export const authRouter = createRouter({
  /** Public by design — the login page asks this before rendering. */
  session: publicQuery.query(({ ctx }) => ({ authenticated: ctx.authenticated })),

  login: publicQuery
    .input(z.object({ token: z.string().min(1).max(512) }))
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.clientIp;
      if (isLoginRateLimited(ip)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "too many failed sign-in attempts — wait a minute and try again",
        });
      }
      if (!verifyAdminToken(input.token)) {
        recordFailedLogin(ip);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "invalid admin token" });
      }
      // Success: clear this IP's failed-attempt budget.
      resetLoginAttempts(ip);
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

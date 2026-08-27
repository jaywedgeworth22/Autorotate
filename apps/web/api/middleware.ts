import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;

/**
 * Unauthenticated surface.  Reserved for `ping` and the auth router — every
 * procedure that reads or writes secret metadata, connectors, targets, runs
 * or the audit chain must use `protectedProcedure` (AR-01).
 */
export const publicQuery = t.procedure;

/**
 * Requires a valid console session cookie (see api/auth.ts for the CSRF
 * stance that makes a cookie sufficient here).
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authenticated) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "sign in to the Autorotate console before using this endpoint",
    });
  }
  return next({ ctx });
});

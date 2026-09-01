import { createRouter, publicQuery } from "./middleware";
import { autorotateRouters } from "./routers/autorotate";
import { authRouter } from "./routers/auth";

export const appRouter = createRouter({
  // Liveness probe for the deployment itself — carries no workspace data.
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  // Sign-in surface (auth.session and auth.login are necessarily public).
  auth: authRouter,

  // Autorotate API surface (architecture.md §8) — all protected (AR-01).
  connectors: autorotateRouters.connectors,
  secrets: autorotateRouters.secrets,
  targets: autorotateRouters.targets,
  policies: autorotateRouters.policies,
  runs: autorotateRouters.runs,
  audit: autorotateRouters.audit,
  stats: autorotateRouters.stats,
  workspace: autorotateRouters.workspace,
  pairing: autorotateRouters.pairing,
});

export type AppRouter = typeof appRouter;

import { createRouter, publicQuery } from "./middleware";
import { topspinRouters } from "./routers/topspin";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  // Autorotate API surface (architecture.md §8) — module path still topspin until full rename
  connectors: topspinRouters.connectors,
  secrets: topspinRouters.secrets,
  targets: topspinRouters.targets,
  policies: topspinRouters.policies,
  runs: topspinRouters.runs,
  audit: topspinRouters.audit,
  stats: topspinRouters.stats,
  workspace: topspinRouters.workspace,
  pairing: topspinRouters.pairing,
});

export type AppRouter = typeof appRouter;

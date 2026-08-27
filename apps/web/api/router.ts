import { createRouter, publicQuery } from "./middleware";
import { autorotateRouters } from "./routers/autorotate";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  // Autorotate API surface (architecture.md §8)
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

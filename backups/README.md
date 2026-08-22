# Backups of both TopSpin implementations

Frozen 2026-08-21 as part of the Grok × GitHub merge. These trees are
**reference copies**, not build targets. Live code lives in `apps/web`,
`apps/agent`, and `apple/`.

| Snapshot | What it is | Source |
|---|---|---|
| `github-web-pre-merge-2026-08-21/` | Web engine (`api/topspin`, contracts, README) before Grok rotators were folded in | `994cc73` / tag `backup/pre-grok-merge-2026-08-21` |
| `grok-web-2026-08-21/` | Grok App Builder PWA: encrypted vault, 40+ platforms, live rotators, `global-api-keys` parser, Mac agent, UI routes | `/workspace` snapshot 2026-08-21 |

See [../MERGE.md](../MERGE.md) for how the live tree borrows from each.

The Kimi Agent dump and the dump's `app/` (Secret Rotator nickname) were
copied on 2026-08-21:

| Snapshot | What it is | Source |
|---|---|---|
| `kimi-agent-topspin/` | Complete Kimi dump: TopSpin-repo, native trees, zips, `app/` | `/Users/jay/Code/Kimi_Agent_TopSpin Secret Rotator` |
| `secret-rotator/` | Dump `app/` only — TopSpin web control center, not a standalone app | same dump `/app` |


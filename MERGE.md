# TopSpin merge — GitHub monorepo × Grok App Builder

**Date:** 2026-08-21  
**Branch:** `grok/merge-best-of-both`

Two complete TopSpin implementations existed. This merge keeps a backup of each
and folds the strongest parts of both into the live tree.

## What each side brought

| | GitHub (`jaywedgeworth22/TopSpin` @ `994cc73`) | Grok App Builder PWA |
|---|---|---|
| Surface | Web control center (React + Vite + Hono/tRPC/Drizzle/MySQL) + native iOS/macOS | Encrypted IndexedDB vault, PWA for iOS/Mac, TanStack Start |
| Pipeline | `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT` | Direct rotate-then-write |
| Audit | Hash-chained, fingerprints only (`sha256(value)[0:16]`) | Last-four + previous/next values in the vault |
| Rotators | AWS IAM, Stripe, OpenAI, Cloudflare, Twilio, SendGrid, npm, Docker Hub, K8s, generic REST | OpenAI, Cloudflare, Resend, SendGrid, Slack `auth.rotate`, Hugging Face, Neon, Vercel, Twilio, GitHub PAT check |
| Catalog | 15 connectors | 40+ platforms (xAI, Groq, Coolify, FMP, ASC, …) |
| Files | Sandboxed `.env` / JSON / YAML / TOML / INI | `global-api-keys` parser (trailing Mac agent token) |
| Mac | Native Swift app + Keychain | Python agent for `mac.jays.services` (token-only auth preferred) |
| Storage | Zero plaintext in DB | AES-GCM device vault (needed without MySQL) |

## What the merged tree does

- **Native Apple apps are unchanged.** TopSpinCore (22/22 tests) remains the iOS/macOS engine.
- **Web control center** keeps the six-step pipeline, hash-chained audit, and zero-plaintext MySQL store, and gains Grok live rotators (Resend, Slack, Hugging Face, Neon, Vercel token create), the `global-api-keys` parser, and the Mac agent.
- **Grok PWA** (this merge's live preview) now runs the same LOCK → AUDIT pipeline and hash-chained audit, while keeping the encrypted vault, 40+ catalog, and Mac agent.
- **Backups of each** live in-repo so nothing is lost:

```
backups/
  github-web-pre-merge-2026-08-21/   # apps/web engine + contracts at 994cc73
  grok-web-2026-08-21/               # Grok PWA vault, rotators, routes, agent
```

Git tag: `backup/pre-grok-merge-2026-08-21` points at the GitHub tree before this merge.

## Invariants (unchanged)

1. Zero plaintext in the web database and audit log — fingerprints only.
2. Audit log is append-only and hash-chained.
3. Pipeline is exactly LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT.
4. The Grok PWA may hold values in an AES-GCM IndexedDB vault on-device; that is a local companion, not a substitute for the control-center rule.

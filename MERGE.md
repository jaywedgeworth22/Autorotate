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

## Kimi dump (2026-08-21)

A third tree existed on disk as `/Users/jay/Code/Kimi_Agent_TopSpin Secret Rotator`
(no git remote, no `.git`).  That dump **is** the origin of this GitHub repo
(first commit `fc50b10` packaged `TopSpin-repo/`).  It is now backed up at
`backups/kimi-agent-topspin/` so the zips and pre-packaged `native/` layout
cannot be lost.  `app/` in the dump is the web control center; it is also
copied to `backups/secret-rotator/` because the dump folder used that nickname.
There is no separate Secret Rotator GitHub repo.

### Feature winners

| Area | Kimi dump / GitHub TopSpin | Grok PWA | Secret Rotator (`app/`) | Live winner |
|---|---|---|---|---|
| License | MIT, placeholder "TopSpin Systems" | (App Builder) | none | Apache-2.0, © Jay |
| Pipeline | LOCK → AUDIT | Direct rotate-then-write | Same as Kimi | Kimi six-step |
| Storage | Zero plaintext MySQL | AES-GCM IndexedDB vault | Same as Kimi | Kimi control center + Grok on-device vault backup |
| Native iOS/macOS | TopSpinCore + XcodeGen | PWA only | n/a | Kimi native (plus later iOS update prompt) |
| Live rotators | AWS, Stripe, OpenAI, CF, Twilio, SendGrid, npm, Docker, K8s | + Resend, Slack, HF, Neon, Vercel token create | Same as Kimi | Union (already in 1.1.0) |
| Catalog | ~15 connectors | 40+ platforms | ~15 | Grok catalog now in live web + TopSpinCore |
| Mac agent / `global-api-keys` | Native Keychain | Python agent + parser | n/a | Grok agent + parser (already in 1.1.0) |
| Marketing landing | Full `Home.tsx` | PWA routes | Same as Kimi | Kimi landing, catalog badges updated |

## Invariants (unchanged)

1. Zero plaintext in the web database and audit log — fingerprints only.
2. Audit log is append-only and hash-chained.
3. Pipeline is exactly LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT.
4. The Grok PWA may hold values in an AES-GCM IndexedDB vault on-device; that is a local companion, not a substitute for the control-center rule.

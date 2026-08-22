# Kimi Agent TopSpin — frozen dump

Complete copy of `/Users/jay/Code/Kimi_Agent_TopSpin Secret Rotator` as of
2026-08-21.  See [ORIGIN.txt](ORIGIN.txt) for path, hashes, and the Git
history that already lives in this repository.

This tree is a **reference snapshot**, not a build target.  Live code is
`apps/web`, `apps/agent`, and `apple/` at the repo root.

## What is in here

| Path | What it is |
|---|---|
| `app/` | Original web control center (React + Vite + Hono/tRPC/Drizzle). Same product as live `apps/web`. Also copied to `backups/secret-rotator/tree/`. |
| `TopSpin/` | Early plan (`plan.md`) plus `native/` Swift sources before they were packaged as `apple/`. |
| `TopSpin-native/` | Duplicate of the native deliverable (same as `TopSpin/native`). |
| `TopSpin-repo/` | Packaged monorepo (web + apple + docs + MIT LICENSE) that was pushed as `jaywedgeworth22/TopSpin`. |
| `TopSpin-native.zip` / `TopSpin-repo.zip` | Original zip artifacts from the dump. |

## What was unique vs the surviving product

Kimi built the **control-center architecture** the live app still uses:

- Rotation state machine `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT`
- Zero-plaintext stores (fingerprints only in DB / audit)
- Hash-chained audit log
- Infisical + file + Keychain + webhook targets
- TopSpinCore Swift package, iOS and macOS companions, XcodeGen spec
- Marketing landing (`Home.tsx`) and shadcn console (secrets, connectors, runs, audit)

Those ideas already landed in `jaywedgeworth22/TopSpin` (first commit
`fc50b10`).  The dump had **no git history**; the surviving repo *is* that
history, plus later Grok rotators/Mac agent and the iOS update prompt.

Do not copy this dump over the live tree.  Live already contains Kimi's
engine plus later winners.

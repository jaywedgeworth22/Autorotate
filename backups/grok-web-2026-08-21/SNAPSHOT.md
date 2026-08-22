# Grok App Builder PWA snapshot

Frozen 2026-08-21 from the App Builder workspace after the LOCK → AUDIT
pipeline and hash-chained audit were ported in.

Includes:

- Encrypted IndexedDB vault (`src/lib/vault.ts`, AES-GCM)
- 40+ platform catalog (`src/lib/platforms.ts`)
- Live rotators + six-step pipeline (`src/lib/rotate.ts`, `src/lib/audit.ts`)
- `global-api-keys` parser (`src/lib/formats.ts`)
- Mac agent (`public/agent/topspin-agent.py`)
- UI routes (vault, spin, destinations, history, devices, settings)

Not a runnable TanStack Start app on its own — platform chrome, auth helpers,
and `node_modules` are omitted. Demo seed values were omitted so this snapshot
stays gitleaks-clean. Live PWA continues in the App Builder workspace.

See [../../MERGE.md](../../MERGE.md).

## Summary

<!-- What does this PR change and why? Link issues with "Fixes #123". -->

## Module

<!-- Which ownership boundary does this touch? See AGENTS.md module map. -->

- [ ] `apps/web` (web control center)
- [ ] `apple/AutorotateCore` (shared engine)
- [ ] `apple/Autorotate-iOS`
- [ ] `apple/Autorotate-macOS`
- [ ] repo tooling / CI / docs

## Checklist

- [ ] Tests pass locally (`npm run test` in `apps/web` and/or `swift test` in
      `apple/AutorotateCore`)
- [ ] **CI green** (web and/or apple jobs as applicable)
- [ ] **No plaintext secrets persisted** — nothing written to DB, disk, logs,
      or git history unencrypted (see SECURITY.md)
- [ ] **Audit-chain integrity preserved** — records remain append-only and
      hash-chained
- [ ] Connector capability matrix in `docs/architecture.md` updated (if
      connector behavior changed)
- [ ] Drizzle FK columns remain `bigint unsigned` (if schema changed)
- [ ] Conventional commit messages used

## Session handoff (agents only)

<!-- If you are an AI agent ending a session, fill in the handoff template
     from AGENTS.md here. Delete this section otherwise. -->

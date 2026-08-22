# Contributing to TopSpin

Thanks for helping make secret rotation safer. This document covers the
day-to-day contribution workflow. If you are an AI coding agent, read
[AGENTS.md](AGENTS.md) instead — it is the authoritative coordination
manifest.

## Branch naming

Create a branch off `main` using one of these prefixes:

- `feat/<short-description>` — new features
- `fix/<short-description>` — bug fixes
- `chore/<short-description>` — tooling, deps, docs, housekeeping

Example: `feat/infisical-v3-client`, `fix/audit-chain-rollback`.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <imperative summary>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`.
Scopes typically map to a module: `web`, `core`, `ios`, `macos`, `repo`.

Example: `fix(core): zero secret buffer after PUSH failure`.

## Pull request checklist

Before opening (or merging) a PR, confirm:

- [ ] Tests pass locally (`npm run test` in `apps/web`; `swift test` in
      `apple/TopSpinCore`) and CI is green.
- [ ] **No plaintext secrets** are persisted, logged, or committed — the
      zero-plaintext rule is a hard invariant (see SECURITY.md).
- [ ] **Audit-chain integrity is preserved** — audit records remain
      append-only and hash-chained; no code mutates or deletes history.
- [ ] The connector capability matrix in `docs/architecture.md` is updated
      if connector behavior changed.
- [ ] New env vars are documented in `apps/web/.env.example` with
      placeholder values only.

## Code review expectations

- Contributions are licensed under Apache License 2.0 (see [LICENSE](LICENSE)
  and [NOTICE](NOTICE)).
- Every PR requires at least one maintainer review (enforced via
  [CODEOWNERS](.github/CODEOWNERS)).
- Reviewers check the security invariants above **before** style or
  architecture nits.
- Keep PRs focused; large cross-module changes should be split per module
  ownership boundaries in AGENTS.md.
- Be respectful — the [Code of Conduct](CODE_OF_CONDUCT.md) applies in all
  project spaces.

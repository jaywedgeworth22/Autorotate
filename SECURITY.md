# Security Policy

Autorotate exists to rotate secrets safely; we hold this repository to the same
standard.

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Email **security@autorotate.dev** (placeholder contact) with:

- a description of the vulnerability and affected module(s)
  (`apps/web`, `apple/AutorotateCore`, `apple/Autorotate-iOS`, `apple/Autorotate-macOS`);
- steps to reproduce or a proof of concept;
- any suggested remediation.

We aim to acknowledge reports within 72 hours and coordinate disclosure with
the reporter. Please give us reasonable time to ship a fix before public
disclosure.

## Hard security invariant: zero-plaintext storage

Secret material must **never** be persisted in plaintext:

- not in the database (credentials are encrypted with `AUTOROTATE_ENC_KEY`
  before storage),
- not on disk (file targets receive secrets only through the rotation
  pipeline, never intermediate dumps),
- not in logs, crash reports, analytics, or error messages,
- not in git history — never commit a real `.env`, key file, or export.

Secret material lives only in memory for the duration of a rotation
(`LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT`) and buffers are cleared
after use. Any PR that weakens this invariant will be rejected regardless of
other merits.

## Credential handling rules

- Use `apps/web/.env.example` placeholders locally; real values go only in
  untracked `.env` files.
- Never hard-code tokens, connection strings, or encryption keys in source.
- On Apple platforms, credentials belong in the Keychain (shared access
  group `com.autorotate.shared`), never in `UserDefaults` or plain files.
- Webhook targets must use HTTPS; never disable certificate validation.
- Rotate any credential immediately if you suspect it entered logs, git
  history, or a ticket.

## Audit chain

Rotation audit records are append-only and hash-chained to make history
tamper-evident. Code must never update or delete existing audit entries;
corrections are new appended records.

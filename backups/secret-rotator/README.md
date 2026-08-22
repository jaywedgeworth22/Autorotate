# Secret Rotator snapshot

Not a standalone product.  This is the Kimi dump's `app/` folder — the
TopSpin web control center under a dump-folder nickname.

Live code: `apps/web/` in this repository.  Full dump: 
`backups/kimi-agent-topspin/`.

Unique ideas already in live TopSpin (do not overwrite live with this
tree):

- Six-step pipeline and zero-plaintext MySQL store
- Connector / secrets / targets / runs / audit console
- Infisical Universal Auth + file-target writers
- Demo seed with fingerprint-only history

Grok later added live rotators, a 40+ platform catalog, the
`global-api-keys` parser, and the Mac agent.  Those live in `apps/web`
and `apps/agent`, not in this snapshot.

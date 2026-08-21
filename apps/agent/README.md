# TopSpin Mac agent

Python agent that writes `~/.secrets/global-api-keys`, a Google Drive copy, and
Apple Keychain history items. Runs on the Mac reachable at
`https://mac.jays.services`.

Auth: bearer token (preferred) or HTTP Basic. The token is the last line /
`TOPSPIN_AGENT_TOKEN` of `global-api-keys`. Username popups are optional —
leave username empty and send the token only.

```bash
export TOPSPIN_AGENT_TOKEN=…    # or put it at the end of ~/.secrets/global-api-keys
python3 topspin-agent.py
```

Endpoints:

- `GET  /topspin/v1/health`
- `POST /topspin/v1/apply` — atomic file writes + `security add-generic-password`

This agent was built in the Grok App Builder TopSpin PWA and merged into the
monorepo on 2026-08-21. Native macOS/iOS apps in `apple/` remain the first-class
Keychain clients.

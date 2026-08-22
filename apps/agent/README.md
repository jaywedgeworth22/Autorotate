# Autorotate Mac Agent

Python helper agent that writes `~/.secrets/global-api-keys` and
Apple Keychain history items. Runs on the Mac reachable at
`https://mac.jays.services`. Synced with the Autorotate Web Control Center at `https://autorotate.codes`.

Auth: bearer token (preferred) or HTTP Basic. The token is the last line /
`AUTOROTATE_AGENT_TOKEN` of `global-api-keys`. Username popups are optional —
leave username empty and send the token only.

```bash
export AUTOROTATE_AGENT_TOKEN=…    # or put it at the end of ~/.secrets/global-api-keys
python3 topspin-agent.py
```

Endpoints:

- `GET  /topspin/v1/health`
- `POST /topspin/v1/apply` — atomic file writes + `security add-generic-password`

Native macOS/iOS apps in `apple/` and Android app in `android/` remain the first-class
zero-plaintext clients.


export const AGENT_PY = `#!/usr/bin/env python3
"""TopSpin Mac agent — writes ~/.secrets/global-api-keys, Google Drive copy, and Apple Keychain history."""
from __future__ import annotations

import base64
import json
import os
import ssl
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOME = Path.home()
TOKEN_ENV = "TOPSPIN_AGENT_TOKEN"
DEFAULT_FILE = HOME / ".secrets" / "global-api-keys"
HISTORY = HOME / ".secrets" / "topspin-history.jsonl"
PORT = int(os.environ.get("TOPSPIN_PORT", "8787"))
BIND = os.environ.get("TOPSPIN_BIND", "127.0.0.1")


def read_token() -> str:
    env = os.environ.get(TOKEN_ENV, "").strip()
    if env:
        return env
    if DEFAULT_FILE.exists():
        lines = DEFAULT_FILE.read_text(encoding="utf-8").splitlines()
        for line in reversed(lines):
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.startswith("TOPSPIN_AGENT_TOKEN=") or s.startswith("MAC_COLLAB_TOKEN="):
                return s.split("=", 1)[1].strip().strip('"').strip("'")
            if "=" not in s:
                return s
    raise SystemExit("No agent token. Put TOPSPIN_AGENT_TOKEN at the end of ~/.secrets/global-api-keys")


TOKEN = read_token()


def expand(path: str) -> Path:
    return Path(os.path.expanduser(path)).resolve()


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".topspin-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def keychain_add(service: str, account: str, password: str, replace: bool) -> str:
    cmd = [
        "/usr/bin/security",
        "add-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
        password,
        "-T",
        "/usr/bin/security",
        "-T",
        "/usr/bin/python3",
    ]
    if replace:
        cmd.insert(2, "-U")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0:
        return "ok"
    return r.stderr.strip() or r.stdout.strip() or f"exit {r.returncode}"


def drive_copy(content: str, filename: str) -> str:
    roots = list((HOME / "Library" / "CloudStorage").glob("GoogleDrive-*"))
    roots.append(HOME / "Google Drive")
    roots.append(HOME / "My Drive")
    written = []
    for root in roots:
        secrets = root / "My Drive" / ".secrets"
        if root.name == ".secrets":
            continue
        candidate = None
        if (root / "My Drive").exists():
            candidate = root / "My Drive" / ".secrets" / filename
        elif (root / ".secrets").exists() or root.exists():
            candidate = root / ".secrets" / filename
        if candidate is None:
            continue
        try:
            atomic_write(candidate, content)
            written.append(str(candidate))
        except OSError:
            continue
    return ", ".join(written) if written else "no Google Drive folder found"


def authorized(handler: BaseHTTPRequestHandler) -> bool:
    header = handler.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.split(" ", 1)[1].strip() == TOKEN
    if header.startswith("Basic "):
        try:
            raw = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        except Exception:
            return False
        if ":" in raw:
            user, pw = raw.split(":", 1)
            if pw == TOKEN:
                return True
            if user == TOKEN and pw == "":
                return True
        return raw == TOKEN
    q = urlparse(handler.path).query
    return f"token={TOKEN}" in q


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        return

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/topspin/v1/health", "/health"):
            if not authorized(self):
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            self._send(200, {"ok": True, "agent": "topspin", "user": os.getlogin() if hasattr(os, "getlogin") else ""})
            return
        self._send(404, {"ok": False})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/topspin/v1/apply":
            self._send(404, {"ok": False})
            return
        if not authorized(self):
            self._send(401, {"ok": False, "error": "unauthorized"})
            return
        length = int(self.headers.get("content-length") or "0")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"ok": False, "error": "invalid json"})
            return
        results = []
        for item in data.get("files") or []:
            p = expand(item.get("path") or str(DEFAULT_FILE))
            content = item.get("content") or ""
            mode = item.get("mode") or "replace"
            try:
                if mode == "append":
                    p.parent.mkdir(parents=True, exist_ok=True)
                    with p.open("a", encoding="utf-8") as f:
                        f.write(content)
                    os.chmod(p, 0o600)
                else:
                    atomic_write(p, content)
                results.append({"path": str(p), "ok": True})
            except Exception as e:
                results.append({"path": str(p), "ok": False, "error": str(e)})
        keychain = []
        for item in data.get("keychain") or []:
            msg = keychain_add(
                item.get("service") or "TopSpin",
                item.get("account") or "secret",
                item.get("password") or "",
                bool(item.get("replace")),
            )
            keychain.append({"account": item.get("account"), "result": msg})
        drive = ""
        file_payload = next((f.get("content") for f in (data.get("files") or []) if f.get("content")), "")
        if file_payload:
            drive = drive_copy(file_payload, data.get("driveFileName") or "global-api-keys")
        self._send(200, {"ok": True, "files": results, "keychain": keychain, "drive": drive})


def main() -> None:
    DEFAULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"TopSpin agent on {BIND}:{PORT}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
`;

export const LAUNCH_AGENT_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>services.jays.topspin-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>AGENT_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/topspin-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/topspin-agent.err</string>
</dict>
</plist>
`;

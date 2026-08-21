import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AGENT_PY, LAUNCH_AGENT_PLIST } from "@/lib/agent-source";
import { downloadText } from "@/lib/download";
import { probeMac } from "@/lib/rotate";
import { uid } from "@/lib/types";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/devices")({ component: DevicesPage });

function DevicesPage() {
  const config = useVault((s) => s.config);
  const setConfig = useVault((s) => s.setConfig);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState("");

  async function test() {
    setBusy(true);
    try {
      const res = await probeMac(config);
      setDetail(res.detail);
      toast(res.detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight">Devices</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Install TopSpin as a home-screen app on iPhone and as a Dock app on Mac. The Mac agent is what actually writes Keychain and ~/.secrets — the browser is not allowed to do that itself.
          </p>
        </header>

        <Card className="space-y-3">
          <h2 className="text-sm font-medium">iPhone</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Open TopSpin in Safari.</li>
            <li>Share → Add to Home Screen.</li>
            <li>The vault stays on-device, encrypted. iOS does not let a web app write the system Keychain — history is kept in the vault and synced to Infisical.</li>
          </ol>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-medium">Mac app</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Safari or Chrome → File → Add to Dock / Install TopSpin.</li>
            <li>Run the agent below so spins can write Keychain and files without copying by hand.</li>
          </ol>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-sm font-medium">Mac agent</h2>
          <p className="text-xs text-muted">
            Listens on localhost:8787 and, if you reverse-proxy it, at mac.jays.services. Auth is the token from the end of global-api-keys. Username is optional — leave it blank so nothing pops a login dialog.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Host</Label>
              <Input
                value={config.mac.host}
                onChange={(e) => void setConfig({ mac: { ...config.mac, host: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Username (optional)</Label>
              <Input
                value={config.mac.username}
                placeholder="leave blank"
                onChange={(e) => void setConfig({ mac: { ...config.mac, username: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Agent token</Label>
              <Input
                type="password"
                value={config.mac.token}
                onChange={(e) => void setConfig({ mac: { ...config.mac, token: e.target.value } })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const token = config.mac.token || uid("tok");
                void setConfig({ mac: { ...config.mac, token } });
                toast("Token set — it will be written to the end of global-api-keys on the next spin");
              }}
            >
              Mint token
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void test()}>
              Test connection
            </Button>
            <Button onClick={() => downloadText("topspin-agent.py", AGENT_PY, "text/x-python")}>
              Download agent
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                downloadText(
                  "services.jays.topspin-agent.plist",
                  LAUNCH_AGENT_PLIST.replace("AGENT_PATH", "~/topspin-agent.py"),
                  "text/xml",
                )
              }
            >
              Download LaunchAgent
            </Button>
          </div>
          {detail ? <p className="text-xs text-muted">{detail}</p> : null}
          <pre className="overflow-x-auto rounded-md bg-card-elevated p-3 font-mono text-[11px] leading-relaxed text-muted">
{`chmod +x ~/topspin-agent.py
python3 ~/topspin-agent.py
# reverse-proxy 127.0.0.1:8787 to https://mac.jays.services
# token-only auth — no username in the browser prompt`}
          </pre>
        </Card>
      </div>
    </AppShell>
  );
}

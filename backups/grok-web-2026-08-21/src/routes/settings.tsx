import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { mergeImported, parseEnvFile } from "@/lib/formats";
import { useVault } from "@/lib/vault";
import { useState } from "react";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const config = useVault((s) => s.config);
  const setConfig = useVault((s) => s.setConfig);
  const secrets = useVault((s) => s.secrets);
  const replaceSecrets = useVault((s) => s.replaceSecrets);
  const resetDemo = useVault((s) => s.resetDemo);
  const wipe = useVault((s) => s.wipe);
  const [paste, setPaste] = useState("");

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Vault data never leaves this device except when you spin to Infisical, the Mac agent, or a downloaded file.
          </p>
        </header>

        <Card className="space-y-3">
          <h2 className="text-sm font-medium">Import global-api-keys</h2>
          <p className="text-xs text-muted">
            Paste the file from the Mac. The last token line becomes the Mac agent token.
          </p>
          <Textarea
            className="font-mono"
            placeholder={"OPENAI_API_KEY=...\nGITHUB_TOKEN=...\nTOPSPIN_AGENT_TOKEN=..."}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <Button
            onClick={async () => {
              const parsed = parseEnvFile(paste);
              if (parsed.secrets.length === 0 && !parsed.agentToken) {
                toast("No keys found");
                return;
              }
              await replaceSecrets(mergeImported(secrets, parsed));
              if (parsed.agentToken) {
                await setConfig({
                  mac: {
                    ...config.mac,
                    token: parsed.agentToken,
                    username: parsed.macUsername || config.mac.username,
                  },
                });
              }
              toast(`Imported ${parsed.secrets.length} keys`);
              setPaste("");
            }}
          >
            Import
          </Button>
        </Card>

        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Revoke old live keys</p>
            <p className="mt-1 text-xs text-muted">
              After a successful live mint, attempt to delete the previous vendor key. Off by default so rollouts can overlap.
            </p>
          </div>
          <Switch checked={config.revokeOld} onCheckedChange={(v) => void setConfig({ revokeOld: v })} />
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-medium">Vault</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void resetDemo()}>
              Reload demo vault
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm("Erase the local vault on this device?")) void wipe();
              }}
            >
              Erase vault
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

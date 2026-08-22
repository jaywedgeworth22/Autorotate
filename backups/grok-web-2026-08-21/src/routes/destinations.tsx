import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { downloadText } from "@/lib/download";
import { mergeImported, parseEnvFile, serializeEnvFile } from "@/lib/formats";
import { infisicalListSecrets, infisicalLogin } from "@/lib/rotate";
import { newSecret, useVault } from "@/lib/vault";

export const Route = createFileRoute("/destinations")({ component: DestinationsPage });

function DestinationsPage() {
  const config = useVault((s) => s.config);
  const setConfig = useVault((s) => s.setConfig);
  const secrets = useVault((s) => s.secrets);
  const replaceSecrets = useVault((s) => s.replaceSecrets);
  const [busy, setBusy] = useState(false);

  async function saveInfisical(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = {
      ...config.infisical,
      site: String(fd.get("site") || config.infisical.site),
      token: String(fd.get("token") || config.infisical.token),
      clientId: String(fd.get("clientId") || ""),
      clientSecret: String(fd.get("clientSecret") || config.infisical.clientSecret),
      projectId: String(fd.get("projectId") || ""),
      projectName: String(fd.get("projectName") || ""),
      environment: String(fd.get("environment") || "prod"),
      secretPath: String(fd.get("secretPath") || "/"),
    };
    await setConfig({ infisical: next });
    setBusy(true);
    try {
      const login = await infisicalLogin({ ...config, infisical: next });
      if (login.ok && login.token) {
        await setConfig({ infisical: { ...next, token: login.token } });
        toast(login.detail);
      } else {
        toast(login.detail);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pullInfisical() {
    setBusy(true);
    try {
      const res = await infisicalListSecrets(config);
      if (!res.ok) {
        toast(res.detail);
        return;
      }
      const parsed = {
        secrets: res.secrets.map((s) => {
          const rec = newSecret(s.secretKey, s.secretValue, false);
          return {
            key: rec.key,
            value: rec.value,
            platformId: rec.platformId,
            destinations: rec.destinations,
            cadenceDays: rec.cadenceDays,
            note: rec.note,
            demo: false,
            originId: rec.originId,
            infisicalName: rec.key,
            fingerprint: rec.fingerprint,
          };
        }),
        agentToken: "",
        macUsername: "",
        headerComments: [],
      };
      await replaceSecrets(mergeImported(secrets, parsed));
      toast(`Imported ${res.secrets.length} from Infisical`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight">Destinations</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            After a spin, TopSpin writes the new value to every store you keep. Infisical is the team source of truth. The file, Drive copy, and Keychain stay in lockstep.
          </p>
        </header>

        <Card>
          <h2 className="text-sm font-medium">Infisical</h2>
          <p className="mt-1 text-xs text-muted">
            Service token or Universal Auth. Writes go to the selected project and environment.
          </p>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void saveInfisical(e)}>
            <Field name="site" label="Site" defaultValue={config.infisical.site} />
            <Field name="environment" label="Environment slug" defaultValue={config.infisical.environment} />
            <Field name="projectId" label="Project ID" defaultValue={config.infisical.projectId} />
            <Field name="projectName" label="Project name" defaultValue={config.infisical.projectName} />
            <Field name="secretPath" label="Secret path" defaultValue={config.infisical.secretPath} />
            <Field name="token" label="Service / identity token" defaultValue={config.infisical.token} secret />
            <Field name="clientId" label="Universal Auth client ID" defaultValue={config.infisical.clientId} />
            <Field name="clientSecret" label="Universal Auth client secret" defaultValue={config.infisical.clientSecret} secret />
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Save and test
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void pullInfisical()}>
                Pull into vault
              </Button>
            </div>
          </form>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-sm font-medium">Files</h2>
          <p className="text-xs text-muted">
            Matches the existing global-api-keys layout. The agent token is always the last assignment.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mac path</Label>
              <Input
                value={config.filePath}
                onChange={(e) => void setConfig({ filePath: e.target.value, mac: { ...config.mac, filePath: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Drive filename</Label>
              <Input
                value={config.driveFileName}
                onChange={(e) => void setConfig({ driveFileName: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => downloadText(config.driveFileName, serializeEnvFile(secrets, config))}
            >
              Download current file
            </Button>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-md px-4 text-sm shadow-[var(--shadow-border)]">
              Import file
              <input
                type="file"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  const parsed = parseEnvFile(text);
                  const merged = mergeImported(secrets, parsed);
                  await replaceSecrets(merged);
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
                }}
              />
            </label>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Apple Keychain</h2>
              <p className="mt-1 text-xs text-muted">
                Current value in service {config.keychainService}. Each spin also writes a dated item to {config.keychainHistoryService} so you can recover the previous secret.
              </p>
            </div>
            <Switch
              checked={config.keychainEnabled}
              onCheckedChange={(v) => void setConfig({ keychainEnabled: v })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Current service</Label>
              <Input
                value={config.keychainService}
                onChange={(e) => void setConfig({ keychainService: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>History service</Label>
              <Input
                value={config.keychainHistoryService}
                onChange={(e) => void setConfig({ keychainHistoryService: e.target.value })}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-medium">GitHub Actions</h2>
          <p className="text-xs text-muted">Uses a GitHub token from the vault to push rotated values into repo Actions secrets.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input
                value={config.github.owner}
                onChange={(e) => void setConfig({ github: { ...config.github, owner: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Repo</Label>
              <Input
                value={config.github.repo}
                onChange={(e) => void setConfig({ github: { ...config.github, repo: e.target.value } })}
              />
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({
  name,
  label,
  defaultValue,
  secret,
}: {
  name: string;
  label: string;
  defaultValue: string;
  secret?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        type={secret ? "password" : "text"}
        autoComplete="off"
        className="font-mono"
      />
    </div>
  );
}

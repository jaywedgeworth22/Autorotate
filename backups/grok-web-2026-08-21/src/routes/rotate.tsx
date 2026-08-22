import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PipelineLog, PipelineStepper } from "@/components/pipeline";
import { AppShell } from "@/components/shell";
import { SecretRow } from "@/components/secret-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { RotationStep } from "@/lib/audit";
import { downloadText } from "@/lib/download";
import { serializeEnvFile } from "@/lib/formats";
import { spinSecret } from "@/lib/rotate";
import {
  type DestinationId,
  type SecretRecord,
  secretStatus,
} from "@/lib/types";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/rotate")({ component: RotatePage });

const DEST_LABEL: Record<DestinationId, string> = {
  infisical: "Infisical",
  file: "global-api-keys file",
  keychain: "Apple Keychain + history",
  mac: "Mac agent",
  drive: "Keychain .secrets",
  "github-actions": "GitHub Actions",
};

function RotatePage() {
  const secrets = useVault((s) => s.secrets);
  const config = useVault((s) => s.config);
  const upsert = useVault((s) => s.upsertSecret);
  const addHistory = useVault((s) => s.addHistory);
  const appendAudit = useVault((s) => s.appendAudit);
  const dueIds = useMemo(
    () =>
      secrets
        .filter((s) => {
          const st = secretStatus(s);
          return st === "due" || st === "overdue";
        })
        .map((s) => s.id),
    [secrets],
  );
  const [selected, setSelected] = useState<string[] | null>(null);
  const chosen = selected ?? dueIds;
  const [dest, setDest] = useState<DestinationId[]>(config.defaultDestinations);
  const [busy, setBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState<RotationStep[]>([]);
  const [log, setLog] = useState<string[]>([]);

  function toggle(id: string) {
    const base = chosen;
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  }

  function toggleDest(id: DestinationId) {
    setDest((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  async function run() {
    const targets = secrets.filter((s) => chosen.includes(s.id));
    if (targets.length === 0) {
      toast("Select at least one secret");
      return;
    }
    setBusy(true);
    setLog([]);
    setLiveSteps([]);
    let working: SecretRecord[] = secrets.slice();
    try {
      for (const secret of targets) {
        setLog((l) => [...l, `LOCK ${secret.key}`]);
        const result = await spinSecret(secret, config, working, dest, setLiveSteps);
        working = working.map((s) => (s.id === result.secret.id ? result.secret : s));
        await upsert(result.secret);
        const audit = await appendAudit(
          "web",
          `rotation.${result.history.runStatus}`,
          result.secret.id,
          {
            runId: result.history.id,
            trigger: "manual",
            status: result.history.runStatus,
            fingerprint: result.history.toFingerprint,
            fromFingerprint: result.history.fromFingerprint,
            failedSteps: result.history.steps
              .filter((s) => s.status === "failed")
              .map((s) => s.step),
          },
        );
        await addHistory({ ...result.history, auditHash: audit.entryHash });
        const fails = result.history.destinations.filter((d) => !d.ok);
        setLog((l) => [
          ...l,
          result.history.originDetail,
          ...result.history.destinations.map((d) => `${d.id}: ${d.detail}`),
          `${secret.key} ${result.history.runStatus}${fails.length ? ` · ${fails.length} destination warning(s)` : ""}.`,
        ]);
      }
      const file = serializeEnvFile(working, config);
      downloadText("global-api-keys", file);
      toast("Spin complete — file downloaded as fallback");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Spin failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Spin</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Every spin runs LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT. Live APIs mint a
              replacement when the vendor allows it. Destinations update together. Previous values
              stay in Keychain history.
            </p>
          </div>
          <Button onClick={() => void run()} disabled={busy || chosen.length === 0} size="lg">
            {busy ? "Spinning…" : `Spin ${chosen.length}`}
          </Button>
        </header>

        <Card className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-muted">Pipeline</p>
          <PipelineStepper steps={liveSteps} />
          {liveSteps.length ? <PipelineLog steps={liveSteps} /> : null}
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-muted">Destinations</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(DEST_LABEL) as DestinationId[]).map((id) => (
              <label key={id} className="flex h-11 items-center justify-between gap-3">
                <span className="text-sm">{DEST_LABEL[id]}</span>
                <Switch checked={dest.includes(id)} onCheckedChange={() => toggleDest(id)} />
              </label>
            ))}
          </div>
        </Card>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSelected(dueIds)}>
            Due only
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(secrets.map((s) => s.id))}>
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            None
          </Button>
        </div>

        <div className="space-y-2">
          {secrets.map((s) => (
            <SecretRow
              key={s.id}
              secret={s}
              selected={chosen.includes(s.id)}
              onToggle={() => toggle(s.id)}
            />
          ))}
        </div>

        {log.length ? (
          <Card className="space-y-1 font-mono text-xs text-muted">
            {log.map((line, i) => (
              <p key={`${i}-${line.slice(0, 12)}`}>{line}</p>
            ))}
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

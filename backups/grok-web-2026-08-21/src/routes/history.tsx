import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { PipelineLog, PipelineStepper } from "@/components/pipeline";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyAuditChain, type ChainVerification } from "@/lib/audit";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  const history = useVault((s) => s.history);
  const auditLog = useVault((s) => s.auditLog);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainVerification | null>(null);

  useEffect(() => {
    let cancelled = false;
    void verifyAuditChain(auditLog).then((v) => {
      if (!cancelled) setChain(v);
    });
    return () => {
      cancelled = true;
    };
  }, [auditLog]);

  const head = auditLog.length ? auditLog[auditLog.length - 1].entryHash : null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-medium tracking-tight">History</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Each spin is hash-chained. Audit records keep fingerprints only. The previous value
            stays in the encrypted vault and as an Apple Keychain history item for rollback.
          </p>
        </header>

        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {chain && !chain.valid ? (
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
            ) : (
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sage" />
            )}
            <div>
              <p className="text-sm font-medium">
                {chain == null
                  ? "Verifying hash chain…"
                  : chain.valid
                    ? "Chain intact"
                    : "Chain broken"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {chain?.valid
                  ? `${chain.checked} audit record${chain.checked === 1 ? "" : "s"} linked. Tampering anywhere breaks the chain.`
                  : chain
                    ? `Broken at ${chain.brokenAt ?? "unknown"} — ${chain.checked} records checked.`
                    : "Checking entryHash = sha256(prevHash + canonical)[0:16]."}
              </p>
            </div>
          </div>
          {head ? (
            <p className="font-mono text-[11px] text-subtle">head {head}</p>
          ) : (
            <p className="text-xs text-subtle">No audit records yet</p>
          )}
        </Card>

        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">No spins yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((h) => {
              const open = openId === h.id;
              return (
                <Card key={h.id} className="rounded-lg p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-sm">{h.key}</p>
                      <p className="mt-1 text-xs text-muted">
                        {new Date(h.at).toLocaleString()} · fp {h.fromFingerprint.slice(0, 8) || "····"}{" "}
                        → {h.toFingerprint.slice(0, 8) || "····"} · ··{h.fromLastFour} → ··{h.toLastFour}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          h.runStatus === "committed" ? "sage" : h.runStatus === "partial" ? "warn" : "danger"
                        }
                      >
                        {h.runStatus}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(open ? null : h.id)}>
                        {open ? "Hide" : "Details"}
                      </Button>
                    </div>
                  </div>
                  {open ? (
                    <div className="mt-4 space-y-3">
                      <PipelineStepper steps={h.steps ?? []} />
                      <PipelineLog steps={h.steps ?? []} />
                      <div className="space-y-2 text-xs text-muted">
                        <p>{h.originDetail}</p>
                        <p className="font-mono text-subtle">Keychain account {h.keychainAccount}</p>
                        {h.auditHash ? (
                          <p className="font-mono text-subtle">audit {h.auditHash}</p>
                        ) : null}
                        {h.destinations.map((d) => (
                          <p key={d.id}>
                            {d.ok ? "Wrote" : "Skipped"} {d.id} — {d.detail}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

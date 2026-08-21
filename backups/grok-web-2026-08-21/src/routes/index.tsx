import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/shell";
import { SecretRow } from "@/components/secret-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { platformOf } from "@/lib/platforms";
import { secretStatus } from "@/lib/types";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const secrets = useVault((s) => s.secrets);
  const config = useVault((s) => s.config);
  const auditLog = useVault((s) => s.auditLog);
  const due = secrets.filter((s) => {
    const st = secretStatus(s);
    return st === "due" || st === "overdue";
  });
  const live = secrets.filter((s) => platformOf(s.platformId).rotateKind === "live-api").length;
  const demo = secrets.some((s) => s.demo);

  return (
    <AppShell>
      <div className="rise-in space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
              Secret rotation
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">
              Keep every key spinning.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Rotate credentials at the source when the vendor allows it, then write
              Infisical, global-api-keys, Apple Keychain history, and the Mac at
              mac.jays.services in one pass. Every spin is LOCK → ROTATE → PUSH →
              VERIFY → COMMIT → AUDIT, hash-chained so history cannot be silently rewritten.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/rotate">
              <RefreshCw className="size-4" />
              Spin {due.length ? `${due.length} due` : "secrets"}
            </Link>
          </Button>
        </header>

        {demo ? (
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Demo vault is loaded. Import <span className="font-mono text-foreground">global-api-keys</span> to replace these values. Nothing here is a real credential.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/settings">Import file</Link>
            </Button>
          </Card>
        ) : null}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="In vault" value={String(secrets.length)} />
          <Stat label="Due" value={String(due.length)} warn={due.length > 0} />
          <Stat label="Live APIs" value={String(live)} />
          <Stat label="Audit" value={String(auditLog.length)} />
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <DestCard
            title="Infisical"
            ok={Boolean(config.infisical.token && config.infisical.projectId)}
            detail={
              config.infisical.projectName ||
              config.infisical.projectId ||
              "Connect a project"
            }
            to="/destinations"
          />
          <DestCard
            title="Mac agent"
            ok={Boolean(config.mac.token)}
            detail={config.mac.host.replace(/^https?:\/\//, "")}
            to="/devices"
          />
          <DestCard
            title="Keychain"
            ok={config.keychainEnabled}
            detail={config.keychainEnabled ? "History items on each spin" : "Disabled"}
            to="/devices"
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Needs a spin</h2>
            <Link to="/vault" className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
              All secrets <ArrowRight className="size-3" />
            </Link>
          </div>
          {due.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">Nothing is due. Cadence still ticks in the vault.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {due.slice(0, 6).map((s) => (
                <SecretRow key={s.id} secret={s} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card className="rounded-lg p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 font-mono text-2xl tabular-nums ${warn ? "text-warn" : ""}`}>{value}</p>
    </Card>
  );
}

function DestCard({
  title,
  ok,
  detail,
  to,
}: {
  title: string;
  ok: boolean;
  detail: string;
  to: "/destinations" | "/devices";
}) {
  return (
    <Link to={to}>
      <Card className="h-full rounded-lg p-4 transition-transform duration-150 hover:-translate-y-0.5">
        <p className="text-xs text-muted">{title}</p>
        <p className="mt-2 text-sm font-medium">{ok ? "Connected" : "Not connected"}</p>
        <p className="mt-1 truncate text-xs text-subtle">{detail}</p>
      </Card>
    </Link>
  );
}

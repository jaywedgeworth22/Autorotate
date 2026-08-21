import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CATEGORY_LABEL, PLATFORMS, rotateKindLabel } from "@/lib/platforms";
import { useVault } from "@/lib/vault";

export const Route = createFileRoute("/platforms")({ component: PlatformsPage });

function PlatformsPage() {
  const secrets = useVault((s) => s.secrets);
  const counts = new Map<string, number>();
  for (const s of secrets) counts.set(s.platformId, (counts.get(s.platformId) ?? 0) + 1);

  const cats = [...new Set(PLATFORMS.map((p) => p.category))];

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-medium tracking-tight">Platforms</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Live API platforms mint a new credential through their own control plane. Generate platforms get a fresh secret here. Console platforms still fan out to Infisical, files, and Keychain after you paste a newly issued value.
          </p>
        </header>
        {cats.map((cat) => (
          <section key={cat} className="space-y-2">
            <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
              {CATEGORY_LABEL[cat]}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLATFORMS.filter((p) => p.category === cat).map((p) => (
                <Card key={p.id} className="rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{p.name}</p>
                    <Badge variant={p.rotateKind === "live-api" ? "sage" : p.rotateKind === "generate" ? "steel" : "default"}>
                      {rotateKindLabel(p.rotateKind)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{p.hint}</p>
                  <p className="mt-2 font-mono text-[11px] text-subtle">
                    {counts.get(p.id) ?? 0} in vault · every {p.cadenceDays}d
                  </p>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

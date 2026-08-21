import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import { SecretRow } from "@/components/secret-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABEL, platformOf } from "@/lib/platforms";
import { newSecret, useVault } from "@/lib/vault";
import { secretStatus } from "@/lib/types";

export const Route = createFileRoute("/vault")({ component: VaultPage });

function VaultPage() {
  const secrets = useVault((s) => s.secrets);
  const upsert = useVault((s) => s.upsertSecret);
  const remove = useVault((s) => s.removeSecret);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [spinId, setSpinId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return secrets.filter((s) => {
      if (!query) return true;
      return (
        s.key.toLowerCase().includes(query) ||
        platformOf(s.platformId).name.toLowerCase().includes(query) ||
        secretStatus(s).includes(query)
      );
    });
  }, [q, secrets]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const cat = platformOf(s.platformId).category;
      const list = map.get(cat) ?? [];
      list.push(s);
      map.set(cat, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Vault</h1>
            <p className="mt-1 text-sm text-muted">
              Encrypted in this browser (and in the iOS/Mac home-screen app). Values never sit in a shared database.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Add secret</Button>
        </header>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name or platform"
        />
        <div className="space-y-8">
          {groups.map(([cat, list]) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
                {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]} · {list.length}
              </h2>
              {list.map((s) => (
                <SecretRow
                  key={s.id}
                  secret={s}
                  onSpin={() => setSpinId(s.id)}
                />
              ))}
            </section>
          ))}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No secrets match.</p>
          ) : null}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Add secret</DialogTitle>
          <DialogDescription>Stored only in the encrypted local vault.</DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!key.trim() || !value.trim()) return;
              void upsert(newSecret(key.trim(), value.trim(), false));
              setKey("");
              setValue("");
              setOpen(false);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="k">Name</Label>
              <Input id="k" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v">Value</Label>
              <Textarea id="v" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
            </div>
            <Button type="submit" className="w-full">
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(spinId)} onOpenChange={() => setSpinId(null)}>
        <DialogContent>
          <DialogTitle>Spin this secret</DialogTitle>
          <DialogDescription>
            Open Spin to rotate at the origin and write every destination, or delete it from the vault.
          </DialogDescription>
          <div className="mt-4 flex flex-col gap-2">
            <Button asChild>
              <a href="/rotate">Go to Spin</a>
            </Button>
            {spinId ? (
              <Button
                variant="danger"
                onClick={() => {
                  void remove(spinId);
                  setSpinId(null);
                }}
              >
                Remove from vault
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

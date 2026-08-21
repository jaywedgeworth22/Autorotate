import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { platformOf } from "@/lib/platforms";
import {
  type SecretRecord,
  lastFour,
  maskValue,
  secretStatus,
} from "@/lib/types";
import { toast } from "sonner";

export function SecretRow({
  secret,
  selected,
  onToggle,
  onSpin,
}: {
  secret: SecretRecord;
  selected?: boolean;
  onToggle?: () => void;
  onSpin?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const platform = platformOf(secret.platformId);
  const status = secretStatus(secret);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      toast("Copied to clipboard");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast("Could not copy");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card-elevated/60 px-3 py-3 shadow-[var(--shadow-border)] sm:flex-row sm:items-center">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex size-11 shrink-0 items-center justify-center"
          aria-pressed={selected}
          aria-label={`Select ${secret.key}`}
        >
          <span
            className={
              selected
                ? "block size-4 rounded-xs bg-steel"
                : "block size-4 rounded-xs shadow-[var(--shadow-border)]"
            }
          />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm font-medium">{secret.key}</p>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 font-mono text-xs text-muted">
          {revealed ? secret.value : maskValue(secret.value)}
          <span className="ml-2 text-subtle">··{lastFour(secret.value)}</span>
        </p>
        <p className="mt-1 text-xs text-subtle">
          {platform.name} · {platform.rotateKind === "live-api" ? "Live API" : platform.rotateKind === "generate" ? "Generate" : "Console"}
          {secret.fingerprint ? ` · fp ${secret.fingerprint.slice(0, 8)}` : ""}
          {secret.demo ? " · demo value" : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void copy()} aria-label="Copy">
          {copied ? <Check /> : <Copy />}
        </Button>
        {onSpin ? (
          <Button variant="secondary" size="sm" onClick={onSpin}>
            Spin
          </Button>
        ) : null}
      </div>
    </div>
  );
}

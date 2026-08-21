import { Badge } from "@/components/ui/badge";
import type { SecretStatus } from "@/lib/types";

const MAP: Record<SecretStatus, { label: string; variant: "sage" | "warn" | "danger" | "steel" | "default" }> = {
  healthy: { label: "Healthy", variant: "sage" },
  due: { label: "Due", variant: "warn" },
  overdue: { label: "Overdue", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
  demo: { label: "Demo", variant: "steel" },
};

export function StatusBadge({ status }: { status: SecretStatus }) {
  const m = MAP[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

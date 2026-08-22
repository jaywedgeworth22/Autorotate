import { useMemo } from "react";
import { motion } from "framer-motion";
import type { RotationRun } from "@contracts/topspin";
import { RUN_STEP_NAMES } from "@contracts/topspin";
import { Sparkline } from "@/components/primitives";
import { formatMs, parseSteps, runDurationMs } from "./run-utils";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/** Bottom stats strip — median / p95 / success / partial / slowest step. */
export default function StatsStrip({ runs }: { runs: RotationRun[] }) {
  const stats = useMemo(() => {
    const finished = runs.filter((r) => r.status !== "running");
    const durations = finished
      .map(runDurationMs)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    const committed = finished.filter((r) => r.status === "committed").length;
    const partial = finished.filter((r) => r.status === "partial").length;
    const successPct = finished.length ? (committed / finished.length) * 100 : 100;

    const byStep = new Map<string, { total: number; n: number }>();
    for (const r of runs) {
      for (const s of parseSteps(r.stepsJson)) {
        const agg = byStep.get(s.step) ?? { total: 0, n: 0 };
        agg.total += s.durationMs || 0;
        agg.n += 1;
        byStep.set(s.step, agg);
      }
    }
    let slowest = { name: "—", avg: 0 };
    for (const name of RUN_STEP_NAMES) {
      const agg = byStep.get(name);
      if (agg && agg.n > 0 && agg.total / agg.n > slowest.avg) {
        slowest = { name: name.toUpperCase(), avg: agg.total / agg.n };
      }
    }

    const sparkDurations = runs
      .filter((r) => r.status !== "running")
      .slice(0, 15)
      .map(runDurationMs)
      .reverse();

    return {
      median: percentile(durations, 50),
      p95: percentile(durations, 95),
      successPct,
      partial,
      slowest,
      sparkDurations,
    };
  }, [runs]);

  const items = [
    { label: "median", value: formatMs(stats.median), spark: stats.sparkDurations },
    { label: "p95", value: formatMs(stats.p95), spark: stats.sparkDurations },
    {
      label: "success",
      value: `${stats.successPct.toFixed(1)}%`,
      spark: stats.sparkDurations,
    },
    { label: "partial", value: String(stats.partial), spark: stats.sparkDurations },
    {
      label: "slowest step",
      value: `${stats.slowest.name} (avg ${formatMs(stats.slowest.avg)})`,
      spark: stats.sparkDurations,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line-subtle pt-5"
    >
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.05 * i, duration: 0.3 }}
          className="group flex items-center gap-2.5"
          title="Computed from the loaded run window"
        >
          <span className="text-mono-s text-ink-muted transition-colors group-hover:text-ink-secondary">
            {item.label}:
          </span>
          <span className="tnum font-mono text-[13px] leading-5 text-ink-secondary transition-colors group-hover:text-ink-primary">
            {item.value}
          </span>
          <Sparkline data={item.spark} width={48} height={16} className="opacity-50 transition-opacity group-hover:opacity-100" />
        </motion.div>
      ))}
    </motion.div>
  );
}

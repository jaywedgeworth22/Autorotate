import { motion } from "framer-motion";
import type { AuditEntry } from "@contracts/topspin";
import { truncateFingerprint } from "@/components/primitives";
import { describeEntry } from "./audit-utils";
import { cn } from "@/lib/utils";

/**
 * Chain integrity strip — interlinked hash blocks (most recent 40),
 * horizontally scrollable; the head block glows. Broken link (if the
 * verifier ever reports one) renders in danger red.
 */
export default function ChainStrip({
  entries,
  brokenAtId,
  secretName,
  onJump,
}: {
  entries: AuditEntry[]; // desc by id (chain head first)
  brokenAtId: number | null;
  secretName: (secretId: number | null) => string | undefined;
  onJump: (id: number) => void;
}) {
  // chronological window of up to 40 blocks
  const windowEntries = entries.slice(0, 40).reverse();
  if (windowEntries.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="panel-light mt-8 rounded-card border border-line-subtle bg-panel p-5"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.015em] text-ink-primary">
          Chain integrity
        </h2>
        <span className="text-mono-s text-ink-muted">
          last {windowEntries.length} of {entries.length} loaded records
        </span>
        <span className="ml-auto flex items-center gap-4 text-mono-s text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-spin" /> verified
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-danger" /> broken
          </span>
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex w-max items-center">
          {windowEntries.map((e, i) => {
            const isHead = i === windowEntries.length - 1;
            const broken = brokenAtId !== null && e.id >= brokenAtId;
            return (
              <div key={e.id} className="flex items-center">
                {i > 0 && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.02, duration: 0.15 }}
                    className={cn("h-px w-4 origin-left", broken ? "bg-danger" : "bg-spin/50")}
                  />
                )}
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.02, duration: 0.2 }}
                  onClick={() => onJump(e.id)}
                  title={`#${e.id} · ${describeEntry(e, secretName(e.secretId))}\n${truncateFingerprint(e.entryHash)} — jump to event`}
                  className={cn(
                    "rounded-[4px] border px-1.5 py-1 font-mono text-[10px] leading-3 tracking-[0.02em] transition-colors",
                    broken
                      ? "border-danger bg-danger/10 text-danger"
                      : "border-spin-dim bg-spin/5 text-spin hover:bg-spin/15",
                    isHead && "animate-tick-pulse shadow-[0_0_12px_rgba(46,230,168,0.35)] ring-1 ring-spin",
                  )}
                >
                  {e.entryHash.slice(0, 4)}
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-mono-s mt-3 text-ink-faint">
        head block pulses · hover any block for its record summary · click to jump to the event
      </p>
    </motion.section>
  );
}

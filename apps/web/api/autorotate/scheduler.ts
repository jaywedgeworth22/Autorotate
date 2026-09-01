import {
  rotateSecret,
  refreshDueStatuses,
  findDueSecrets,
  countOverdueSecrets,
} from "./engine";
import { notifyOverdue } from "./alerts";

// Internal scheduler: every tick, refresh due_soon/overdue statuses and
// rotate all secrets that are autoRotate && nextDueAt <= now && not rotating.

let ticking = false;
let interval: NodeJS.Timeout | null = null;

export async function tick(): Promise<{ rotated: number; errors: number }> {
  if (ticking) return { rotated: 0, errors: 0 };
  ticking = true;
  let rotated = 0;
  let errors = 0;
  try {
    await refreshDueStatuses();
    // AR-16: at most one overdue digest per process per 6h (throttled inside
    // notifyOverdue, which also never throws).
    await notifyOverdue(await countOverdueSecrets());
    const due = await findDueSecrets();
    for (const secret of due) {
      try {
        await rotateSecret(secret.id, "scheduled", "scheduler");
        rotated++;
      } catch (err) {
        errors++;
        console.error(
          `[autorotate scheduler] rotation failed for secret ${secret.id}:`,
          (err as Error).message,
        );
      }
    }
  } catch (err) {
    // DB unreachable etc. — log and try again next tick.
    console.error("[autorotate scheduler] tick error:", (err as Error).message);
  } finally {
    ticking = false;
  }
  return { rotated, errors };
}

/** Start the 60s interval. Non-blocking; safe to call once at server boot. */
export function startScheduler(intervalMs = 60_000): void {
  if (interval) return;
  console.log(`[autorotate scheduler] started (interval ${intervalMs}ms)`);
  interval = setInterval(() => {
    void tick();
  }, intervalMs);
  interval.unref?.();
  // Kick off an initial tick shortly after boot (non-blocking).
  const boot = setTimeout(() => {
    void tick();
  }, 2_000);
  boot.unref?.();
}

export function stopScheduler(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

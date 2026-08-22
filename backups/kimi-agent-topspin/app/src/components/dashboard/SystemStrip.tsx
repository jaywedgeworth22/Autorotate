import { motion } from 'framer-motion'
import type { AuditEntry, StatsOverview } from '@contracts/topspin'
import { relTime } from './lib'

/**
 * Bottom system status strip — hairline-separated inline mono stats.
 */
export function SystemStrip({
  overview,
  activity,
}: {
  overview: StatsOverview
  activity: AuditEntry[]
}) {
  const pending = overview.dueSoonCount + overview.overdueCount
  const lastSync = activity.length > 0 ? activity[0].ts : null

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6, duration: 0.2 }}
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-subtle pt-4"
    >
      <span className="text-mono-s flex items-center gap-1.5 text-ink-muted">
        scheduler: healthy <span className="size-1.5 rounded-full bg-spin" />
      </span>
      <span className="text-mono-s text-ink-muted">queue: {pending} pending</span>
      <span className="text-mono-s text-ink-muted">
        last sync: {lastSync ? relTime(lastSync) : '—'}
      </span>
      <span className="text-mono-s flex items-center gap-1.5 text-ink-muted">
        companions: macOS linked <span className="size-1.5 rounded-full bg-spin" /> · iOS linked{' '}
        <span className="size-1.5 rounded-full bg-spin" />
      </span>
      <a
        href="/#status"
        className="text-mono-s ml-auto text-ink-muted transition-colors hover:text-spin"
      >
        Status page →
      </a>
    </motion.footer>
  )
}

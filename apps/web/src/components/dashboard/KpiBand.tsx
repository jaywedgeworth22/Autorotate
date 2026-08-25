import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { RotationRun, StatsOverview } from '@contracts/autorotate'
import { HealthRing, Sparkline } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { countWithinDays, dailyBuckets, halfDelta, median, runDurationMs } from './lib'

/* ------------------------------------------------------------------ */
/* Count-up hook (tabular-nums, 800ms, respects target changes)        */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (target - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

/* ------------------------------------------------------------------ */
/* KPI card shell                                                      */
/* ------------------------------------------------------------------ */

function DeltaChip({ delta, invert = false, suffix = '%' }: { delta: number | null; invert?: boolean; suffix?: string }) {
  if (delta == null) return <span className="text-mono-s text-ink-faint">—</span>
  const good = invert ? delta <= 0 : delta >= 0
  return (
    <span className={cn('text-mono-s rounded-chip border px-1.5 py-0.5', good ? 'border-spin-dim/60 bg-spin/10 text-spin' : 'border-danger/40 bg-danger/10 text-danger')}>
      {delta >= 0 ? '+' : '−'}
      {Math.abs(delta)}
      {suffix}
    </span>
  )
}

function KpiCard({
  title,
  index,
  children,
}: {
  title: string
  index: number
  children: ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="panel-light group flex min-h-[132px] flex-col justify-between rounded-card border border-line-subtle bg-panel p-5 transition-colors duration-200 hover:border-line-strong"
    >
      <div className="text-label text-ink-muted">{title}</div>
      {children}
    </motion.section>
  )
}

function BigNumber({ value, decimals = 0, danger = false }: { value: number; decimals?: number; danger?: boolean }) {
  const v = useCountUp(value)
  return (
    <span className={cn('tnum font-mono text-xl font-medium leading-7 tracking-[-0.01em]', danger && value > 0 ? 'text-danger' : 'text-ink-primary')}>
      {v.toFixed(decimals)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* KPI band — health ring + 4 metric cards                             */
/* ------------------------------------------------------------------ */

export function KpiBand({ overview, runs, days }: { overview: StatsOverview; runs: RotationRun[]; days: number }) {
  const rotationBuckets = dailyBuckets(runs.map((r) => r.startedAt), days)
  const rotationCount = days === 30 ? overview.rotationsLast30d : rotationBuckets.reduce((a, b) => a + b, 0)
  const durations = runs.map(runDurationMs).filter((v): v is number => v != null)
  const medianMs = median(durations)
  const medianAnimated = useCountUp(medianMs ?? 0)
  const failedRuns = runs.filter((r) => r.status === 'failed')
  const failedBuckets = dailyBuckets(failedRuns.map((r) => r.startedAt), Math.min(days, 7))
  const failed7d = countWithinDays(failedRuns.map((r) => r.startedAt), 7)

  const connected = overview.coverageByConnector.filter((c) => c.status === 'connected').length
  const totalConnectors = overview.coverageByConnector.length

  const healthyCount = overview.totalSecrets - overview.dueSoonCount - overview.overdueCount - overview.pausedCount - overview.failedCount

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {/* Health ring card */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="panel-light flex flex-col items-center justify-between gap-3 rounded-card border border-line-subtle bg-panel p-5 transition-colors duration-200 hover:border-line-strong sm:col-span-2 xl:col-span-1"
      >
        <div className="text-label self-start text-ink-muted">Rotation health</div>
        <HealthRing value={overview.healthPct} size="lg" label="HEALTHY" />
        <p className="text-mono-s text-center text-ink-muted">
          <span className="text-spin">{Math.max(0, healthyCount)} ok</span>
          {' · '}
          <span className="text-warn">{overview.dueSoonCount} due soon</span>
          {' · '}
          <span className="text-danger">{overview.overdueCount} overdue</span>
        </p>
      </motion.section>

      {/* Rotations (window) */}
      <KpiCard title={`Rotations (${days}d)`} index={1}>
        <div className="flex items-end justify-between gap-3">
          <BigNumber value={rotationCount} />
          <DeltaChip delta={halfDelta(rotationBuckets)} />
        </div>
        <Sparkline data={rotationBuckets} width={180} height={28} className="w-full opacity-80 transition-opacity group-hover:opacity-100" />
      </KpiCard>

      {/* Median rotation time */}
      <KpiCard title="Median rotation time" index={2}>
        <div className="flex items-end justify-between gap-3">
          <span className="tnum font-mono text-xl font-medium leading-7 tracking-[-0.01em] text-ink-primary">
            {medianMs == null ? '—' : `${(medianAnimated / 1000).toFixed(1)}s`}
          </span>
          <span className="text-mono-s text-ink-muted">{durations.length} runs</span>
        </div>
        <Sparkline data={durations.slice(0, 30).reverse()} width={180} height={28} stroke="#5EA8FF" className="w-full opacity-80" />
      </KpiCard>

      {/* Failed runs (7d) */}
      <KpiCard title="Failed runs (7d)" index={3}>
        <div className="flex items-end justify-between gap-3">
          <BigNumber value={failed7d} danger />
          <Link to="/runs" className="text-mono-s text-ink-muted transition-colors hover:text-spin">
            view failed runs →
          </Link>
        </div>
        <Sparkline data={failedBuckets} width={180} height={28} stroke="#F4586B" className="w-full opacity-80" />
      </KpiCard>

      {/* Coverage */}
      <KpiCard title="Coverage" index={4}>
        <div className="flex items-end justify-between gap-3">
          <span className="tnum font-mono text-xl font-medium leading-7 tracking-[-0.01em] text-ink-primary">
            {connected}/{totalConnectors}
          </span>
          <span className="text-mono-s text-ink-muted">connectors verified</span>
        </div>
        <div className="flex items-end gap-1 pt-1">
          {overview.coverageByConnector.map((c) => (
            <span
              key={c.connectorId}
              title={`${c.displayName}: ${c.status}`}
              className={cn(
                'h-3 w-px rounded-full',
                c.status === 'connected' ? 'bg-spin' : c.status === 'error' ? 'bg-danger' : 'bg-ink-faint',
              )}
            />
          ))}
          {totalConnectors === 0 && <span className="text-mono-s text-ink-faint">no connectors</span>}
        </div>
      </KpiCard>
    </div>
  )
}

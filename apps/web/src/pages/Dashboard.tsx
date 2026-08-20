import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FileDown, RotateCw } from 'lucide-react'
import type { RotationRun, SecretWithRelations } from '@contracts/topspin'
import { trpc } from '@/providers/trpc'
import {
  ConfirmRotationModal,
  DetailDrawer,
  EmptyState,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
} from '@/components/primitives'
import type { RotationSummary } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { CoveragePanel } from '@/components/dashboard/CoveragePanel'
import { DueQueue } from '@/components/dashboard/DueQueue'
import { DashboardSkeleton, ErrorPanel } from '@/components/dashboard/Feedback'
import { KpiBand } from '@/components/dashboard/KpiBand'
import { RecentRuns } from '@/components/dashboard/RecentRuns'
import { SecretDrawerContent } from '@/components/dashboard/SecretDrawer'
import { SystemStrip } from '@/components/dashboard/SystemStrip'
import { parsePolicy, policyLabel } from '@/components/dashboard/lib'

const REFETCH_MS = 20_000
const RANGE_OPTIONS = [7, 30, 90] as const

/** Tick "updated Xs ago" against the last successful overview fetch */
function useUpdatedAgo(dataUpdatedAt: number): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(t)
  }, [])
  if (!dataUpdatedAt) return '—'
  const s = Math.max(0, Math.round((now - dataUpdatedAt) / 1000))
  return s < 5 ? 'just now' : `${s}s ago`
}

function targetLabel(t: SecretWithRelations['targets'][number]): string {
  const cfg = (t.configJson ?? {}) as Record<string, unknown>
  if (t.kind === 'file' && typeof cfg.path === 'string') return cfg.path
  if (t.kind === 'infisical') return `infisical/${typeof cfg.environment === 'string' ? cfg.environment : 'prod'}`
  if (t.kind === 'webhook' && typeof cfg.url === 'string') return cfg.url.replace(/^https?:\/\//, '').slice(0, 32)
  if (t.kind === 'keychain') return 'Apple Keychain'
  return t.kind
}

export default function Dashboard() {
  const utils = trpc.useUtils()
  const overview = trpc.stats.overview.useQuery(undefined, { refetchInterval: REFETCH_MS })
  const secretsQuery = trpc.secrets.list.useQuery(undefined, { refetchInterval: REFETCH_MS })
  const runsQuery = trpc.runs.list.useQuery({ limit: 100 }, { refetchInterval: REFETCH_MS })

  const [days, setDays] = useState<number>(30)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rotatingIds, setRotatingIds] = useState<Set<number>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<SecretWithRelations | null>(null)
  const [drawerSecret, setDrawerSecret] = useState<SecretWithRelations | null>(null)

  const secrets = useMemo(() => secretsQuery.data ?? [], [secretsQuery.data])
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data])
  const updatedAgo = useUpdatedAgo(overview.dataUpdatedAt)

  const dueSecrets = useMemo(
    () => secrets.filter((s) => s.status === 'due_soon' || s.status === 'overdue'),
    [secrets],
  )

  // Keep the drawer pinned to fresh query data after refetches.
  const activeDrawerSecret = drawerSecret
    ? (secrets.find((s) => s.id === drawerSecret.id) ?? drawerSecret)
    : null

  const invalidateAll = () => {
    void utils.stats.overview.invalidate()
    void utils.secrets.list.invalidate()
    void utils.runs.list.invalidate()
  }

  const rotate = trpc.secrets.rotateNow.useMutation({
    onSuccess: (run) => {
      invalidateAll()
      if (!run) return
      const r = run as RotationRun
      if (r.status === 'committed') {
        toastSuccess('Rotation committed', `run_${r.id} · new fingerprint ${r.newFingerprint ?? '—'}`)
      } else if (r.status === 'partial') {
        toastWarning('Rotation partially delivered', `run_${r.id} · some targets failed — flagged for retry`)
      } else {
        toastError('Rotation failed', r.error ?? `run_${r.id}`)
      }
    },
    onError: (err) => toastError('Rotation failed', err.message),
    onSettled: (_d, _e, vars) => {
      setRotatingIds((prev) => {
        const next = new Set(prev)
        next.delete(vars.secretId)
        return next
      })
    },
  })

  const requestRotate = (secret: SecretWithRelations) => {
    setConfirmTarget(secret)
    setPickerOpen(false)
  }

  const confirmRotation = () => {
    if (!confirmTarget) return
    setRotatingIds((prev) => new Set(prev).add(confirmTarget.id))
    rotate.mutate({ secretId: confirmTarget.id })
  }

  const rotationSummary: RotationSummary | null = confirmTarget
    ? {
        secretName: confirmTarget.name,
        connector: confirmTarget.connector?.displayName ?? '—',
        targets: confirmTarget.targets.length
          ? confirmTarget.targets.map(targetLabel)
          : ['no targets attached'],
        currentFingerprint: confirmTarget.fingerprint ?? 'not yet rotated',
        policy: policyLabel(parsePolicy(confirmTarget.policyJson)),
      }
    : null

  const downloadReport = () => {
    const o = overview.data
    if (!o) return
    const report = {
      generatedAt: new Date().toISOString(),
      workspace: 'Acme Corp · production',
      windowDays: days,
      stats: {
        totalSecrets: o.totalSecrets,
        healthPct: o.healthPct,
        dueSoon: o.dueSoonCount,
        overdue: o.overdueCount,
        paused: o.pausedCount,
        failed: o.failedCount,
        rotationsLast30d: o.rotationsLast30d,
        failedRunsLast30d: o.failedRunsLast30d,
      },
      coverage: o.coverageByConnector,
      recentRuns: runs.slice(0, 20).map((r) => ({
        id: r.id,
        secretId: r.secretId,
        status: r.status,
        trigger: r.trigger,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      })),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `topspin-rotation-report-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toastInfo('Report downloaded', 'rotation-report JSON saved')
  }

  /* ------------------------------ states ------------------------------ */

  if (overview.isLoading && !overview.data) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-8">
        <DashboardSkeleton />
      </div>
    )
  }

  if (overview.isError && !overview.data) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-8">
        <ErrorPanel
          title="Couldn't reach the rotation engine"
          error={overview.error}
          onRetry={() => void overview.refetch()}
        />
      </div>
    )
  }

  const o = overview.data
  if (!o) return null

  if (o.totalSecrets === 0 && !secretsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1440px] px-8 py-8">
        <EmptyState
          title="No secrets tracked yet"
          body="Connect a platform and TopSpin will start rotating credentials on schedule — fingerprints only, never plaintext."
          action={
            <Link
              to="/connectors"
              className="rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.03]"
            >
              Connect your first platform
            </Link>
          }
        />
      </div>
    )
  }

  /* ------------------------------ render ------------------------------ */

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-[1440px] space-y-4 px-8 py-8"
    >
      {/* Section 1 — header */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-center gap-3"
      >
        <div className="mr-auto">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
              Rotation health
            </h1>
            {o.demoMode && (
              <span className="text-mono-s rounded-chip border border-warn/40 bg-warn/10 px-2 py-0.5 uppercase text-warn">
                demo mode
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-2 text-[13px] leading-5 text-ink-secondary">
            <span className="size-1.5 animate-tick-pulse rounded-full bg-spin" />
            Live view across {o.totalSecrets} secrets
            <span className="text-ink-faint">·</span>
            <span className="text-mono-s text-ink-muted">updated {updatedAgo}</span>
          </p>
        </div>

        {/* date-range pill */}
        <div className="relative">
          <button
            onClick={() => {
              setRangeOpen((v) => !v)
              setPickerOpen(false)
            }}
            className="text-mono-s flex items-center gap-1.5 rounded-chip border border-line-subtle bg-panel px-3 py-2 uppercase text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            Last {days} days
            <ChevronDown className={cn('size-3.5 transition-transform duration-200', rangeOpen && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {rangeOpen && (
              <motion.ul
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="absolute right-0 z-40 mt-2 w-36 rounded-control border border-line-subtle bg-raised p-1 shadow-pop"
              >
                {RANGE_OPTIONS.map((d) => (
                  <li key={d}>
                    <button
                      onClick={() => {
                        setDays(d)
                        setRangeOpen(false)
                      }}
                      className={cn(
                        'w-full rounded-chip px-3 py-1.5 text-left font-mono text-[12px] transition-colors',
                        d === days ? 'bg-panel text-spin' : 'text-ink-secondary hover:bg-panel hover:text-ink-primary',
                      )}
                    >
                      Last {d} days
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={downloadReport}
          className="flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
        >
          <FileDown className="size-4" />
          Run report
        </button>

        {/* Rotate now… picker */}
        <div className="relative">
          <button
            onClick={() => {
              if (dueSecrets.length === 0) {
                toastInfo('Nothing due', 'Every secret is inside its rotation window.')
                return
              }
              setPickerOpen((v) => !v)
              setRangeOpen(false)
            }}
            className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.03] active:scale-[0.97]"
          >
            <RotateCw className="size-4" />
            Rotate now…
          </button>
          <AnimatePresence>
            {pickerOpen && dueSecrets.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="absolute right-0 z-40 mt-2 w-72 rounded-control border border-line-subtle bg-raised p-1 shadow-pop"
              >
                <li className="text-label px-3 py-2 text-ink-muted">Due secrets</li>
                {dueSecrets.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => requestRotate(s)}
                      className="flex w-full items-center gap-2 rounded-chip px-3 py-2 text-left transition-colors hover:bg-panel"
                    >
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          s.status === 'overdue' ? 'bg-danger animate-tick-pulse' : 'bg-warn',
                        )}
                      />
                      <span className="truncate font-mono text-[12px] text-ink-primary">{s.name}</span>
                      <span className="text-mono-s ml-auto shrink-0 text-ink-muted">
                        {s.status === 'overdue' ? 'overdue' : 'due soon'}
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* Section 2 — KPI band */}
      <KpiBand overview={o} runs={runs} days={days} />

      {/* Section 3 — due queue + activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <motion.div
          className="xl:col-span-7"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {secretsQuery.isError ? (
            <ErrorPanel title="Due queue unavailable" error={secretsQuery.error} onRetry={() => void secretsQuery.refetch()} />
          ) : (
            <DueQueue
              secrets={secrets}
              rotatingIds={rotatingIds}
              onRotate={requestRotate}
              onOpenSecret={setDrawerSecret}
            />
          )}
        </motion.div>
        <motion.div
          className="xl:col-span-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <ActivityFeed activity={o.recentActivity} secrets={secrets} />
        </motion.div>
      </div>

      {/* Section 4 — coverage + recent runs */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <motion.div
          className="xl:col-span-7"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <CoveragePanel coverage={o.coverageByConnector} secrets={secrets} />
        </motion.div>
        <motion.div
          className="xl:col-span-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {runsQuery.isError ? (
            <ErrorPanel title="Runs unavailable" error={runsQuery.error} onRetry={() => void runsQuery.refetch()} />
          ) : (
            <RecentRuns runs={runs} secrets={secrets} />
          )}
        </motion.div>
      </div>

      {/* Section 5 — system status strip */}
      <SystemStrip overview={o} activity={o.recentActivity} />

      {/* Confirm rotation modal (shared, hold-to-confirm) */}
      {rotationSummary && (
        <ConfirmRotationModal
          open={confirmTarget != null}
          onClose={() => setConfirmTarget(null)}
          rotation={rotationSummary}
          onConfirm={confirmRotation}
        />
      )}

      {/* Secret detail drawer */}
      <DetailDrawer
        open={activeDrawerSecret != null}
        onClose={() => setDrawerSecret(null)}
        title={activeDrawerSecret ? <span className="font-mono">{activeDrawerSecret.name}</span> : undefined}
      >
        {activeDrawerSecret && (
          <SecretDrawerContent
            secret={activeDrawerSecret}
            rotating={rotatingIds.has(activeDrawerSecret.id)}
            onRotate={requestRotate}
          />
        )}
      </DetailDrawer>
    </motion.div>
  )
}

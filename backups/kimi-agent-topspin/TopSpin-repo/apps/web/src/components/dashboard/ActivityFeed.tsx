import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  FileKey2,
  Plug,
  RefreshCw,
  Send,
  Settings2,
  Target,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AuditEntry, SecretWithRelations } from '@contracts/topspin'
import { cn } from '@/lib/utils'
import { relTime } from './lib'

/* ------------------------------------------------------------------ */
/* Map audit actions onto feed presentation                            */
/* ------------------------------------------------------------------ */

interface FeedStyle {
  icon: LucideIcon
  dot: string
  verb: string
  tone: 'ok' | 'info' | 'danger' | 'muted' | 'warn'
}

const ACTION_STYLES: Record<string, FeedStyle> = {
  'rotation.committed': { icon: CheckCircle2, dot: 'bg-spin', verb: 'rotated · committed', tone: 'ok' },
  'rotation.partial': { icon: Send, dot: 'bg-warn', verb: 'partially delivered', tone: 'warn' },
  'rotation.failed': { icon: XCircle, dot: 'bg-danger', verb: 'rotation failed', tone: 'danger' },
  'policy.updated': { icon: Settings2, dot: 'bg-ink-muted', verb: 'policy updated', tone: 'muted' },
  'secret.created': { icon: FileKey2, dot: 'bg-info', verb: 'secret added', tone: 'info' },
  'secret.updated': { icon: FileKey2, dot: 'bg-info', verb: 'secret updated', tone: 'info' },
  'secret.deleted': { icon: FileKey2, dot: 'bg-ink-muted', verb: 'secret removed', tone: 'muted' },
  'connector.created': { icon: Plug, dot: 'bg-info', verb: 'connector added', tone: 'info' },
  'connector.updated': { icon: Plug, dot: 'bg-ink-muted', verb: 'connector updated', tone: 'muted' },
  'connector.deleted': { icon: Plug, dot: 'bg-ink-muted', verb: 'connector removed', tone: 'muted' },
  'connector.tested': { icon: Plug, dot: 'bg-info', verb: 'connector tested', tone: 'info' },
  'target.created': { icon: Target, dot: 'bg-info', verb: 'target added', tone: 'info' },
  'target.updated': { icon: Target, dot: 'bg-ink-muted', verb: 'target updated', tone: 'muted' },
  'target.removed': { icon: Target, dot: 'bg-ink-muted', verb: 'target removed', tone: 'muted' },
  'target.tested': { icon: Target, dot: 'bg-info', verb: 'target delivery tested', tone: 'info' },
}

const FALLBACK: FeedStyle = { icon: RefreshCw, dot: 'bg-ink-muted', verb: 'event', tone: 'muted' }

function detail(entry: AuditEntry): Record<string, unknown> {
  return (entry.detailJson ?? {}) as Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* Live activity feed                                                  */
/* ------------------------------------------------------------------ */

export function ActivityFeed({
  activity,
  secrets,
}: {
  activity: AuditEntry[]
  secrets: SecretWithRelations[]
}) {
  const [autoScroll, setAutoScroll] = useState(true)

  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of secrets) m.set(s.id, s.name)
    return m
  }, [secrets])

  const rows = autoScroll ? activity : activity.slice(0, 5)

  return (
    <section className="panel-light flex flex-col rounded-card border border-line-subtle bg-panel">
      <header className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
        <h2 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.015em] text-ink-primary">
          Activity
        </h2>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={cn(
            'text-mono-s ml-auto inline-flex items-center gap-2 rounded-chip border px-2.5 py-1 uppercase transition-colors',
            autoScroll ? 'border-spin-dim bg-spin/10 text-spin' : 'border-line-subtle text-ink-muted hover:text-ink-secondary',
          )}
          aria-pressed={autoScroll}
        >
          <span className={cn('size-1.5 rounded-full', autoScroll ? 'bg-spin animate-tick-pulse' : 'bg-ink-faint')} />
          live
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
          No activity yet — the scheduler writes here as rotations run.
        </p>
      ) : (
        <ol className="relative flex-1 overflow-y-auto px-5 py-4">
          {/* timeline rail */}
          <span className="absolute bottom-4 left-[27px] top-4 w-px bg-line-subtle" aria-hidden />
          <AnimatePresence initial={false}>
            {rows.map((entry) => {
              const style = ACTION_STYLES[entry.action] ?? FALLBACK
              const d = detail(entry)
              const name = entry.secretId != null ? nameById.get(entry.secretId) : undefined
              const failedSteps = Array.isArray(d.failedSteps) ? (d.failedSteps as string[]) : []
              const Icon = style.icon
              const inner = (
                <>
                  <span className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-subtle bg-panel">
                    <span className={cn('size-2 rounded-full', style.dot, style.tone === 'danger' && 'animate-tick-pulse')} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-5 text-ink-secondary">
                      <span className={cn('text-mono-s mr-1.5 uppercase', style.tone === 'ok' ? 'text-spin' : style.tone === 'danger' ? 'text-danger' : style.tone === 'warn' ? 'text-warn' : style.tone === 'info' ? 'text-info' : 'text-ink-muted')}>
                        {entry.action.split('.')[1] ?? entry.action}
                      </span>
                      {name && <span className="font-mono text-ink-primary">{name}</span>}{' '}
                      {style.verb}
                      {typeof d.version === 'number' && entry.action === 'rotation.committed' && (
                        <span className="text-ink-muted"> · v{d.version}</span>
                      )}
                      {failedSteps.length > 0 && (
                        <span className="text-danger"> · failed at {failedSteps.join(', ').toUpperCase()}</span>
                      )}
                      {entry.actor && <span className="text-ink-muted"> · by {entry.actor}</span>}
                    </p>
                    <p className="text-mono-s mt-0.5 flex items-center gap-2 text-ink-muted">
                      <Icon className="size-3" />
                      {relTime(entry.ts)}
                      {typeof d.runId === 'number' && <span className="text-ink-faint">run_{d.runId}</span>}
                    </p>
                  </div>
                </>
              )
              const isFailedRun = entry.action === 'rotation.failed' && typeof d.runId === 'number'
              return (
                <motion.li
                  key={entry.id}
                  layout="position"
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="relative flex items-start gap-3 py-2.5"
                >
                  {isFailedRun ? (
                    <Link to={`/runs?run=${d.runId}`} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-90">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  )
}

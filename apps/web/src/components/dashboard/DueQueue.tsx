import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCw } from 'lucide-react'
import type { SecretWithRelations } from '@contracts/autorotate'
import { EmptyState, StatusDot } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { dueLabel, parsePolicy, platformInitials, policyLabel } from './lib'

type Filter = 'all' | 'due_soon' | 'overdue'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'overdue', label: 'Overdue' },
]

export function ConnectorTile({ platform, size = 24 }: { platform: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md border border-line-subtle bg-raised font-mono text-[10px] font-medium uppercase text-ink-secondary"
      style={{ width: size, height: size }}
    >
      {platformInitials(platform)}
    </span>
  )
}

export function DueQueue({
  secrets,
  rotatingIds,
  onRotate,
  onOpenSecret,
}: {
  secrets: SecretWithRelations[]
  rotatingIds: Set<number>
  onRotate: (secret: SecretWithRelations) => void
  onOpenSecret: (secret: SecretWithRelations) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const due = useMemo(() => {
    const rows = secrets.filter((s) => s.status === 'due_soon' || s.status === 'overdue')
    rows.sort((a, b) => {
      // overdue first, then nearest due date
      const rank = (s: SecretWithRelations) => (s.status === 'overdue' ? 0 : 1)
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      const ta = a.nextDueAt ? new Date(a.nextDueAt).getTime() : 0
      const tb = b.nextDueAt ? new Date(b.nextDueAt).getTime() : 0
      return ta - tb
    })
    return rows
  }, [secrets])

  const filtered = due.filter((s) => filter === 'all' || s.status === filter)

  return (
    <section className="panel-light flex flex-col rounded-card border border-line-subtle bg-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-line-subtle px-5 py-4">
        <h2 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.015em] text-ink-primary">
          Due for rotation
        </h2>
        <div className="ml-2 flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-chip px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
                filter === f.key
                  ? 'bg-raised text-ink-primary'
                  : 'text-ink-muted hover:text-ink-secondary',
              )}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className="text-mono-s ml-1.5 text-ink-muted">
                  {f.key === 'due_soon' ? due.filter((s) => s.status === 'due_soon').length : due.filter((s) => s.status === 'overdue').length}
                </span>
              )}
            </button>
          ))}
        </div>
        <Link
          to="/secrets?filter=due"
          className="text-mono-s ml-auto text-ink-muted transition-colors hover:text-spin"
        >
          view all →
        </Link>
      </header>

      {filtered.length === 0 ? (
        <EmptyState
          className="py-12"
          title="Nothing due"
          body={
            filter === 'all'
              ? 'Every secret is inside its rotation window. The scheduler keeps it that way.'
              : `No secrets are currently ${filter === 'due_soon' ? 'due soon' : 'overdue'}.`
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line-subtle">
                {['Status', 'Secret', 'Connector', 'Policy', 'Due', ''].map((h) => (
                  <th key={h} className="px-5 py-3">
                    <span className="text-label text-ink-muted">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((s, i) => {
                  const dueState = dueLabel(s)
                  const rotating = rotatingIds.has(s.id) || s.status === 'rotating'
                  return (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.15 }}
                      onClick={() => onOpenSecret(s)}
                      className="h-11 cursor-pointer border-b border-line-subtle/60 text-[13px] leading-5 text-ink-secondary transition-colors last:border-0 hover:bg-raised"
                    >
                      <td className="px-5 py-2">
                        {rotating ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="spin-loader inline-block size-2.5" />
                            <span className="text-[13px] text-info">rotating</span>
                          </span>
                        ) : (
                          <StatusDot
                            state={s.status === 'overdue' ? 'overdue' : 'due-soon'}
                            label={s.status === 'overdue' ? 'overdue' : 'due soon'}
                          />
                        )}
                      </td>
                      <td className="px-5 py-2">
                        <span className="font-mono text-[13px] text-ink-primary">{s.name}</span>
                      </td>
                      <td className="px-5 py-2">
                        <span className="flex items-center gap-2">
                          <ConnectorTile platform={s.connector?.platform ?? '?'} />
                          {s.connector?.displayName ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-2">
                        <span className="text-mono-s text-ink-muted">{policyLabel(parsePolicy(s.policyJson))}</span>
                      </td>
                      <td className="px-5 py-2">
                        <span
                          className={cn(
                            'font-mono text-[12px]',
                            dueState.tone === 'danger' ? 'text-danger' : dueState.tone === 'warn' ? 'text-warn' : 'text-ink-muted',
                          )}
                        >
                          {dueState.text}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onRotate(s)
                          }}
                          disabled={rotating}
                          className="inline-flex items-center gap-1.5 rounded-control border border-spin-dim px-2.5 py-1 text-[12px] font-medium text-spin transition-colors duration-150 hover:bg-spin/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <RotateCw className="size-3" />
                          Rotate
                        </button>
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

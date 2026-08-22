import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { MoreHorizontal, Pause, Play, Pencil, RotateCw, ScrollText, ShieldAlert, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CapabilityBadge,
  DataTable,
  FingerprintChip,
  StatusDot,
} from '@/components/primitives'
import type { Column } from '@/components/primitives'
import type { SecretWithRelations } from '@contracts/topspin'
import {
  ConnectorTile,
  TargetKindChip,
  dueMeta,
  policySummary,
  relTime,
  statusDotState,
  toCapability,
} from './shared'

/* ------------------------------------------------------------------ */
/* Overflow menu (⋯)                                                   */
/* ------------------------------------------------------------------ */

function RowMenu({
  secret,
  onOpen,
  onTogglePause,
  onUntrack,
}: {
  secret: SecretWithRelations
  onOpen: () => void
  onTogglePause: () => void
  onUntrack: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const paused = secret.status === 'paused'

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const item =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-secondary hover:bg-panel hover:text-ink-primary'

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="More actions"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-panel hover:text-ink-primary"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-control border border-line-subtle bg-raised py-1 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                onTogglePause()
              }}
            >
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? 'Resume policy' : 'Pause policy'}
            </button>
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                onOpen()
              }}
            >
              <Pencil className="size-3.5" />
              Edit details
            </button>
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                navigate('/runs')
              }}
            >
              <ScrollText className="size-3.5" />
              View runs
            </button>
            <button
              className={cn(item, 'text-danger hover:text-danger')}
              onClick={() => {
                setOpen(false)
                onUntrack()
              }}
            >
              <Trash2 className="size-3.5" />
              Untrack secret
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SecretsTable                                                        */
/* ------------------------------------------------------------------ */

export function SecretsTable({
  rows,
  rotatingId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
  onRotate,
  onInspectDrift,
  onTogglePause,
  onUntrack,
  empty,
}: {
  rows: SecretWithRelations[]
  rotatingId?: number | null
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onToggleSelectAll?: () => void
  onOpen: (s: SecretWithRelations) => void
  onRotate: (s: SecretWithRelations) => void
  onInspectDrift?: (s: SecretWithRelations) => void
  onTogglePause: (s: SecretWithRelations) => void
  onUntrack: (s: SecretWithRelations) => void
  empty?: React.ReactNode
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds?.has(r.id))
  const someSelected = rows.some((r) => selectedIds?.has(r.id))

  const columns = useMemo<Column<SecretWithRelations>[]>(
    () => [
      {
        key: 'select',
        title: (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected
            }}
            onChange={onToggleSelectAll}
            className="size-3.5 accent-emerald-400"
          />
        ),
        width: '32px',
        render: (s) => (
          <input
            type="checkbox"
            checked={selectedIds?.has(s.id) ?? false}
            onChange={(e) => {
              e.stopPropagation()
              onToggleSelect?.(s.id)
            }}
            onClick={(e) => e.stopPropagation()}
            className="size-3.5 accent-emerald-400"
          />
        ),
      },
      {
        key: 'status',
        title: 'Status',
        sortable: true,
        sortValue: (s) => s.status,
        render: (s) => {
          const d = statusDotState(s.status)
          return <StatusDot state={d.state} label={d.label} />
        },
      },
      {
        key: 'name',
        title: 'Name',
        sortable: true,
        sortValue: (s) => s.name,
        render: (s) => (
          <span className="flex items-center gap-2.5">
            <ConnectorTile
              platform={s.connector?.platform ?? '?'}
              displayName={s.connector?.displayName}
              size={20}
            />
            <span className="min-w-0">
              <span className="block truncate font-mono text-[13px] leading-5 text-ink-primary">
                {s.name}
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <span className="text-mono-s text-ink-muted">
                  {s.connector?.displayName ?? '—'} · {s.environment}
                </span>
                {s.connector && <CapabilityBadge capability={toCapability(s.connector.capability)} />}
              </span>
            </span>
          </span>
        ),
      },
      {
        key: 'fingerprint',
        title: 'Fingerprint',
        render: (s) =>
          s.fingerprint ? (
            <FingerprintChip fingerprint={`sha256:${s.fingerprint}`} />
          ) : (
            <span className="text-mono-s text-ink-muted">not rotated yet</span>
          ),
      },
      {
        key: 'version',
        title: 'Ver',
        sortable: true,
        sortValue: (s) => s.version,
        render: (s) => <span className="tnum font-mono text-[13px] text-ink-secondary">v{s.version}</span>,
      },
      {
        key: 'policy',
        title: 'Policy',
        render: (s) => (
          <span className="text-mono-s text-ink-secondary">
            {policySummary(s.policyJson as never)}
          </span>
        ),
      },
      {
        key: 'targets',
        title: 'Targets',
        render: (s) => {
          const shown = s.targets.slice(0, 3)
          const extra = s.targets.length - shown.length
          if (s.targets.length === 0)
            return <span className="text-mono-s text-ink-muted">none</span>
          return (
            <span className="flex items-center gap-1">
              {shown.map((t) => (
                <TargetKindChip key={t.id} kind={t.kind} />
              ))}
              {extra > 0 && <span className="text-mono-s text-ink-muted">+{extra}</span>}
            </span>
          )
        },
      },
      {
        key: 'lastRotatedAt',
        title: 'Last rotated',
        sortable: true,
        sortValue: (s) => (s.lastRotatedAt ? new Date(s.lastRotatedAt).getTime() : 0),
        render: (s) => <span className="text-mono-s text-ink-secondary">{relTime(s.lastRotatedAt)}</span>,
      },
      {
        key: 'nextDueAt',
        title: 'Next due',
        sortable: true,
        sortValue: (s) => (s.nextDueAt ? new Date(s.nextDueAt).getTime() : Number.MAX_SAFE_INTEGER),
        render: (s) => {
          const d = dueMeta(s.nextDueAt, s.status)
          return <span className={cn('text-mono-s', d.cls)}>{d.text}</span>
        },
      },
      {
        key: 'actions',
        title: '',
        width: '1%',
        render: (s) => (
          <span className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {onInspectDrift && (
              <button
                type="button"
                onClick={() => onInspectDrift(s)}
                title="Verify target delivery & check drift"
                className="rounded-control border border-line-subtle p-1.5 text-ink-muted transition-colors hover:border-spin-dim hover:text-spin"
              >
                <ShieldAlert className="size-3.5" />
              </button>
            )}
            <button
              onClick={() => onRotate(s)}
              disabled={rotatingId === s.id || s.status === 'rotating'}
              className="flex items-center gap-1.5 rounded-control border border-spin-dim px-2.5 py-1.5 text-[12px] font-medium text-spin transition-colors hover:bg-spin/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rotatingId === s.id || s.status === 'rotating' ? (
                <span className="spin-loader inline-block size-3" />
              ) : (
                <RotateCw className="size-3.5" />
              )}
              Rotate now
            </button>
            <RowMenu
              secret={s}
              onOpen={() => onOpen(s)}
              onTogglePause={() => onTogglePause(s)}
              onUntrack={() => onUntrack(s)}
            />
          </span>
        ),
      },
    ],
    [rotatingId, selectedIds, allSelected, someSelected, onToggleSelect, onToggleSelectAll, onOpen, onRotate, onInspectDrift, onTogglePause, onUntrack],
  )

  return <DataTable columns={columns} rows={rows} onRowClick={onOpen} empty={empty} />
}

/* ------------------------------------------------------------------ */
/* SecretsCards — card grid view                                       */
/* ------------------------------------------------------------------ */

export function SecretsCards({
  rows,
  rotatingId,
  onOpen,
  onRotate,
}: {
  rows: SecretWithRelations[]
  rotatingId?: number | null
  onOpen: (s: SecretWithRelations) => void
  onRotate: (s: SecretWithRelations) => void
}) {
  if (rows.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((s, i) => {
        const d = statusDotState(s.status)
        const due = dueMeta(s.nextDueAt, s.status)
        return (
          <motion.button
            key={s.id}
            onClick={() => onOpen(s)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="panel-light rounded-card border border-line-subtle bg-panel p-4 text-left transition-colors hover:border-line-strong"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <ConnectorTile platform={s.connector?.platform ?? '?'} displayName={s.connector?.displayName} size={28} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[13px] text-ink-primary">{s.name}</span>
                  <span className="text-mono-s text-ink-muted">{s.connector?.displayName ?? '—'}</span>
                </span>
              </span>
              <StatusDot state={d.state} label={d.label} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              {s.fingerprint ? (
                <FingerprintChip fingerprint={`sha256:${s.fingerprint}`} />
              ) : (
                <span className="text-mono-s text-ink-muted">not rotated yet</span>
              )}
              <span className="tnum text-mono-s text-ink-muted">v{s.version}</span>
            </div>
            <div className="text-mono-s mt-3 flex items-center justify-between border-t border-line-subtle pt-3 text-ink-muted">
              <span>{policySummary(s.policyJson as never)}</span>
              <span className={due.cls}>{due.text}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="flex gap-1">
                {s.targets.slice(0, 3).map((t) => (
                  <TargetKindChip key={t.id} kind={t.kind} />
                ))}
                {s.targets.length > 3 && (
                  <span className="text-mono-s self-center text-ink-muted">+{s.targets.length - 3}</span>
                )}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onRotate(s)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    onRotate(s)
                  }
                }}
                className="flex items-center gap-1.5 rounded-control border border-spin-dim px-2.5 py-1.5 text-[12px] font-medium text-spin hover:bg-spin/10"
              >
                {rotatingId === s.id || s.status === 'rotating' ? (
                  <span className="spin-loader inline-block size-3" />
                ) : (
                  <RotateCw className="size-3.5" />
                )}
                Rotate now
              </span>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

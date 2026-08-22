import { useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, History, Pencil, Send, Trash2 } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { EmptyState, StatusDot, toastError, toastSuccess } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/components/connectors/data'
import { FORMAT_LABEL, fileCfg, infisicalCfg, webhookCfg, type BoundTarget, type TargetGroup } from './data'

/* ------------------------------------------------------------------ */
/* Shared bits                                                          */
/* ------------------------------------------------------------------ */

function dotState(status: 'ok' | 'failed' | 'pending', enabled: boolean) {
  if (!enabled) return { state: 'paused' as const, label: 'disabled' }
  if (status === 'failed') return { state: 'overdue' as const, label: 'failing' }
  if (status === 'pending') return { state: 'due-soon' as const, label: 'pending' }
  return { state: 'healthy' as const, label: 'healthy' }
}

export function FormatBadge({ format }: { format: keyof typeof FORMAT_LABEL }) {
  return (
    <span className="text-mono-s inline-flex items-center rounded-chip border border-violet/50 px-2 py-0.5 uppercase text-violet">
      {FORMAT_LABEL[format]}
    </span>
  )
}

function IconAction({
  label,
  onClick,
  busy,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  busy?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={busy}
      className={cn(
        'rounded-control p-1.5 text-ink-muted transition-colors hover:bg-inset',
        danger ? 'hover:text-danger' : 'hover:text-spin',
        busy && 'opacity-60',
      )}
    >
      {busy ? <span className="spin-loader inline-block size-4" /> : children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Group table                                                          */
/* ------------------------------------------------------------------ */

export interface GroupTableProps {
  groups: TargetGroup[]
  kind: 'infisical' | 'file' | 'webhook'
  onEdit: (target: BoundTarget) => void
  onHistory: (group: TargetGroup) => void
  emptyTitle: string
  emptyBody: string
}

export function GroupTable({ groups, kind, onEdit, onHistory, emptyTitle, emptyBody }: GroupTableProps) {
  const utils = trpc.useUtils()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)

  const testMut = trpc.targets.test.useMutation()
  const removeMut = trpc.targets.remove.useMutation({
    onSuccess: () => {
      toastSuccess('Target removed')
      utils.secrets.list.invalidate()
    },
    onError: (err) => toastError('Remove failed', err.message),
  })

  const setBusy = (id: number, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const sendCanary = async (targets: BoundTarget[]) => {
    targets.forEach((t) => setBusy(t.id, true))
    const results = await Promise.allSettled(targets.map((t) => testMut.mutateAsync({ id: t.id })))
    targets.forEach((t) => setBusy(t.id, false))
    const okCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    const first = results.find((r) => r.status === 'fulfilled')
    const detail = first && first.status === 'fulfilled' ? first.value.message : undefined
    if (okCount === targets.length)
      toastSuccess(
        `Canary delivered to ${okCount} binding${okCount === 1 ? '' : 's'}`,
        detail,
      )
    else
      toastError(
        `${targets.length - okCount} of ${targets.length} canaries failed`,
        detail,
      )
    utils.secrets.list.invalidate()
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-card border border-line-subtle bg-panel">
        <EmptyState title={emptyTitle} body={emptyBody} />
      </div>
    )
  }

  const cols =
    kind === 'file'
      ? ['Path', 'Format', 'Key', 'Bound', 'Last write', 'Status', '']
      : kind === 'infisical'
        ? ['Workspace', 'Env / path', 'Bound', 'Last push', 'Status', '']
        : ['Endpoint', 'Method', 'Bound', 'Last delivery', 'Status', '']

  return (
    <div className="overflow-hidden rounded-card border border-line-subtle bg-panel">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line-subtle">
            {cols.map((c, i) => (
              <th key={i} className="px-4 py-3">
                <span className="text-label text-ink-muted">{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => {
            const dot = dotState(g.status, g.anyEnabled)
            const isOpen = expanded === g.key
            const rep = g.targets[0]
            return (
              <motion.tr
                key={g.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: gi * 0.04, duration: 0.2 }}
                className="group/row border-b border-line-subtle/60 align-top last:border-0 hover:bg-raised"
              >
                {kind === 'file' ? (
                  <>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[13px] text-ink-primary">{g.title}</div>
                    </td>
                    <td className="px-4 py-3">{g.format && <FormatBadge format={g.format} />}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12px] text-ink-secondary">{g.subtitle}</span>
                    </td>
                  </>
                ) : kind === 'infisical' ? (
                  <>
                    <td className="px-4 py-3">
                      <div className="font-sans text-[13px] font-semibold text-ink-primary">{g.title}</div>
                      <div className="text-mono-s text-ink-muted">{infisicalCfg(rep).baseUrl ?? 'https://app.infisical.com'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12px] text-ink-secondary">{g.subtitle}</span>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="max-w-[280px] px-4 py-3">
                      <div className="truncate font-mono text-[13px] text-ink-primary">{g.title}</div>
                      <div className="text-mono-s text-ink-muted">
                        {webhookCfg(rep).includeValue ? 'payload includes value ref' : 'metadata-only payload'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-mono-s rounded-chip border border-line-subtle px-2 py-0.5 text-ink-secondary">
                        {webhookCfg(rep).method ?? 'POST'}
                      </span>
                    </td>
                  </>
                )}
                <td className="px-4 py-3">
                  <span className="tnum font-mono text-[13px] text-ink-secondary">{g.targets.length}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-mono-s text-ink-muted">{timeAgo(g.lastDeliveredAt)}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusDot state={dot.state} label={dot.label} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconAction
                      label="Send canary"
                      busy={g.targets.some((t) => busyIds.has(t.id))}
                      onClick={() => sendCanary(g.targets)}
                    >
                      <Send className="size-4" />
                    </IconAction>
                    <IconAction label="Edit" onClick={() => onEdit(rep)}>
                      <Pencil className="size-4" />
                    </IconAction>
                    <IconAction label="Delivery history" onClick={() => onHistory(g)}>
                      <History className="size-4" />
                    </IconAction>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpanded(isOpen ? null : g.key)
                      }}
                      aria-label="Expand bindings"
                      className="rounded-control p-1.5 text-ink-muted hover:bg-inset hover:text-ink-primary"
                    >
                      <ChevronDown
                        className={cn('size-4 transition-transform duration-200', isOpen && 'rotate-180')}
                      />
                    </button>
                  </div>
                </td>
              </motion.tr>
            )
          })}
        </tbody>
      </table>

      {/* expanded bindings rendered as a strip below the table (single open group) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key={expanded}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-line-subtle bg-inset"
          >
            <div className="space-y-1.5 px-4 py-3">
              <div className="text-label text-ink-muted">Bound secrets</div>
              {groups
                .find((g) => g.key === expanded)
                ?.targets.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-control border border-line-subtle/60 bg-panel px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-secondary">
                      {t.secretName}
                      {t.kind === 'file' && (
                        <span className="text-ink-muted"> → {fileCfg(t).key}</span>
                      )}
                    </span>
                    <span className="text-mono-s text-ink-muted">{t.environment}</span>
                    <StatusDot
                      state={
                        !t.enabled
                          ? 'paused'
                          : t.lastStatus === 'failed'
                            ? 'overdue'
                            : t.lastStatus === 'pending'
                              ? 'due-soon'
                              : 'healthy'
                      }
                      label={t.lastStatus}
                    />
                    <span className="text-mono-s w-24 text-right text-ink-muted">
                      {timeAgo(t.lastDeliveredAt)}
                    </span>
                    <IconAction
                      label="Send canary to this binding"
                      busy={busyIds.has(t.id)}
                      onClick={() => sendCanary([t])}
                    >
                      <Send className="size-3.5" />
                    </IconAction>
                    {confirmRemove === t.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          className="text-[12px] font-medium text-danger hover:underline"
                          onClick={() => {
                            removeMut.mutate({ id: t.id })
                            setConfirmRemove(null)
                          }}
                        >
                          confirm
                        </button>
                        <button
                          className="text-[12px] text-ink-muted hover:text-ink-primary"
                          onClick={() => setConfirmRemove(null)}
                        >
                          cancel
                        </button>
                      </span>
                    ) : (
                      <IconAction label="Remove binding" danger onClick={() => setConfirmRemove(t.id)}>
                        <Trash2 className="size-3.5" />
                      </IconAction>
                    )}
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, RotateCw } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { DetailDrawer, FingerprintChip, StatusDot, toastError, toastSuccess } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/components/connectors/data'
import { GhostButton } from '@/components/connectors/ui'
import type { TargetGroup } from './data'

interface TestedDetail {
  targetId?: number
  kind?: string
  ok?: boolean
  canaryFingerprint?: string
}

export function DeliveryDrawer({
  group,
  onClose,
}: {
  group: TargetGroup | null
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [filter, setFilter] = useState<'all' | 'ok' | 'failed'>('all')
  const auditQuery = trpc.audit.list.useQuery(
    { action: 'target.tested', limit: 200 },
    { enabled: !!group },
  )
  const testMut = trpc.targets.test.useMutation()

  const lines = useMemo(() => {
    if (!group) return []
    const ids = new Set(group.targets.map((t) => t.id))
    return (auditQuery.data ?? [])
      .map((e) => ({ entry: e, detail: (e.detailJson ?? {}) as TestedDetail }))
      .filter((l) => l.detail.targetId !== undefined && ids.has(l.detail.targetId))
      .filter((l) => (filter === 'all' ? true : filter === 'ok' ? l.detail.ok : !l.detail.ok))
  }, [group, auditQuery.data, filter])

  const redeliver = async (targetId: number) => {
    try {
      const res = await testMut.mutateAsync({ id: targetId })
      if (res.ok) toastSuccess('Redelivery succeeded', res.message)
      else toastError('Redelivery failed', res.message)
      utils.secrets.list.invalidate()
      utils.audit.list.invalidate()
    } catch (err) {
      toastError('Redelivery failed', (err as Error).message)
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(lines.map((l) => ({ ...l.entry, ...l.detail })), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `autorotate-deliveries-${group?.kind ?? 'target'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DetailDrawer
      open={!!group}
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          Delivery history
          {group && <span className="text-mono-s font-normal text-ink-muted">{group.title}</span>}
        </span>
      }
    >
      {group && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            {(['all', 'ok', 'failed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-chip border px-2.5 py-1 text-[12px] font-medium capitalize transition-colors',
                  filter === f
                    ? 'border-spin-dim bg-spin/10 text-spin'
                    : 'border-line-subtle text-ink-muted hover:text-ink-secondary',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {auditQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-inset" />
              ))}
            </div>
          ) : lines.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-muted">
              No deliveries recorded for this target yet — send a canary to verify the path.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lines.map((l, i) => (
                <motion.li
                  key={l.entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-2.5 rounded-control border border-line-subtle/60 bg-inset px-3 py-2"
                >
                  <StatusDot
                    state={l.detail.ok ? 'healthy' : 'overdue'}
                    label={l.detail.ok ? 'PUSH ok' : 'PUSH failed'}
                  />
                  <span className="text-mono-s text-ink-muted">{timeAgo(l.entry.ts)}</span>
                  {l.detail.canaryFingerprint && (
                    <FingerprintChip fingerprint={l.detail.canaryFingerprint} />
                  )}
                  {!l.detail.ok && l.detail.targetId !== undefined && (
                    <button
                      onClick={() => redeliver(l.detail.targetId!)}
                      disabled={testMut.isPending}
                      className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-info hover:underline disabled:opacity-50"
                    >
                      <RotateCw className="size-3" />
                      redeliver
                    </button>
                  )}
                </motion.li>
              ))}
            </ul>
          )}

          <div className="border-t border-line-subtle pt-4">
            <GhostButton onClick={exportJson} disabled={lines.length === 0}>
              <Download className="size-4" />
              Export JSON
            </GhostButton>
          </div>
        </div>
      )}
    </DetailDrawer>
  )
}

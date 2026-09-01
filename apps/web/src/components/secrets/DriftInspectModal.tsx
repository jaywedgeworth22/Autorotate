import {
  AlertTriangle,
  CheckCircle2,
  FolderGit2,
  KeyRound,
  RefreshCw,
  RotateCw,
  Server,
  ShieldAlert,
  Webhook,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { Modal, toastError, toastSuccess } from '@/components/primitives'
import { cn } from '@/lib/utils'

export function DriftInspectModal({
  secretId,
  open,
  onClose,
  onRotated,
}: {
  secretId: number | null
  open: boolean
  onClose: () => void
  onRotated?: () => void
}) {
  if (!secretId) return null

  const driftQuery = trpc.secrets.checkDrift.useQuery(
    { secretId },
    { enabled: open && !!secretId, refetchOnWindowFocus: false },
  )

  const rotateMut = trpc.secrets.rotateNow.useMutation({
    onSuccess: () => {
      toastSuccess('Rotation completed', 'Secret rotated and synced to all targets')
      driftQuery.refetch()
      onRotated?.()
    },
    onError: (err) => toastError('Rotation failed', err.message),
  })

  const dryRunMut = trpc.secrets.dryRun.useMutation({
    onSuccess: () => {
      toastSuccess('Dry-run completed', 'Simulated rotation succeeded across all targets')
      driftQuery.refetch()
    },
    onError: (err) => toastError('Dry-run failed', err.message),
  })

  const data = driftQuery.data
  const isLoading = driftQuery.isLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-spin" />
          <span className="font-display text-lg font-semibold text-ink-primary">
            Target Verification & Drift Detection
          </span>
        </div>
      }
      size="lg"
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-ink-muted">
            <RefreshCw className="size-6 animate-spin text-spin" />
            <p className="mt-2 text-xs">Querying targets and verifying fingerprints…</p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Status summary banner */}
            <div
              className={cn(
                'flex items-start gap-3 rounded-card border p-3.5',
                data.hasDrift
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-spin-dim/30 bg-spin-dim/10 text-spin',
              )}
            >
              {data.hasDrift ? (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-spin" />
              )}
              <div className="text-xs">
                <p className="font-medium text-ink-primary">
                  {data.hasDrift
                    ? 'Target Drift Detected'
                    : 'All Monitored Targets In Sync'}
                </p>
                <p className="mt-0.5 text-ink-secondary">
                  {data.hasDrift
                    ? 'One or more targets have diverged from the Autorotate canonical fingerprint or could not be verified.'
                    : 'Target read-back verification confirmed hash fingerprints match canonical secrets.'}
                </p>
              </div>
            </div>

            {/* Target table */}
            <div className="overflow-hidden rounded-card border border-line-subtle bg-panel">
              <div className="border-b border-line-subtle px-3.5 py-2 text-label text-ink-muted">
                Target Verification Status ({data.targets.length})
              </div>
              <div className="divide-y divide-line-subtle/50 font-mono text-[12px]">
                {data.targets.length === 0 ? (
                  <div className="p-4 text-center text-xs text-ink-muted">
                    No active targets configured for this secret.
                  </div>
                ) : (
                  data.targets.map((t) => (
                    <div key={t.targetId} className="flex items-center justify-between p-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {t.kind === 'infisical' && <Server className="size-3.5 text-emerald-400" />}
                          {t.kind === 'file' && <FolderGit2 className="size-3.5 text-blue-400" />}
                          {t.kind === 'webhook' && <Webhook className="size-3.5 text-amber-400" />}
                          {t.kind === 'keychain' && <KeyRound className="size-3.5 text-purple-400" />}
                          <span className="font-semibold capitalize text-ink-primary">
                            {t.kind} Target #{t.targetId}
                          </span>
                          <span
                            className={cn(
                              'text-mono-s rounded-chip px-1.5 py-0.5',
                              t.status === 'in_sync' && 'bg-emerald-500/10 text-emerald-400',
                              t.status === 'drifted' && 'bg-amber-500/10 text-amber-400',
                              t.status === 'error' && 'bg-rose-500/10 text-rose-400',
                              t.status === 'unsupported' && 'bg-ink-muted/10 text-ink-muted',
                            )}
                          >
                            {t.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-secondary">{t.detail}</p>
                      </div>

                      <div className="text-right text-[11px]">
                        <div className="text-ink-muted">Expected: {t.expectedFingerprint ?? '—'}</div>
                        <div className="text-ink-secondary">Actual: {t.actualFingerprint ?? '—'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-line-subtle pt-3">
              <button
                type="button"
                onClick={() => driftQuery.refetch()}
                className="flex items-center gap-1.5 rounded-control border border-line-subtle px-3 py-1.5 text-xs text-ink-secondary hover:text-ink-primary"
              >
                <RefreshCw className="size-3.5" />
                Re-check Drift
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => dryRunMut.mutate({ secretId })}
                  disabled={dryRunMut.isPending}
                  className="rounded-control border border-line-subtle px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-raised disabled:opacity-50"
                >
                  {dryRunMut.isPending ? 'Simulating…' : 'Canary Dry-Run'}
                </button>
                <button
                  type="button"
                  onClick={() => rotateMut.mutate({ secretId })}
                  disabled={rotateMut.isPending}
                  className="flex items-center gap-1.5 rounded-control bg-spin px-3.5 py-1.5 text-xs font-semibold text-[#06231A] hover:brightness-110 disabled:opacity-50"
                >
                  <RotateCw className={cn('size-3.5', rotateMut.isPending && 'animate-spin')} />
                  {rotateMut.isPending ? 'Rotating…' : 'Rotate & Sync Now'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-ink-muted">
            Could not fetch drift information.
          </div>
        )}
      </div>
    </Modal>
  )
}

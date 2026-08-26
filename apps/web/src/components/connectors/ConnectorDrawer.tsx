import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Minus, RotateCw, X } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import {
  CapabilityBadge,
  DetailDrawer,
  MaskedValue,
  StatusDot,
  toastError,
  toastSuccess,
} from '@/components/primitives'
import { cn } from '@/lib/utils'
import { capabilityMatrix, platformMeta, statusToDot, timeAgo, type MatrixRowState, type PrimitiveCapability } from './data'
import { BrandTile, GhostButton, ModalShell, PrimaryButton } from './ui'

export interface ConnectorEntry {
  platform: string
  displayName: string
  capability: PrimitiveCapability
  instance?: {
    id: number
    status: string
    hasConfig: boolean
    secretCount: number
    lastCheckedAt: string | Date | null
  }
}

const MATRIX_ICON: Record<MatrixRowState, ReactNode> = {
  ok: <Check className="size-4 text-spin" />,
  warn: <AlertTriangle className="size-4 text-warn" />,
  off: <X className="size-4 text-danger" />,
  muted: <Minus className="size-4 text-ink-muted" />,
}

export function ConnectorDrawer({
  entry,
  onClose,
  onConfigure,
}: {
  entry: ConnectorEntry | null
  onClose: () => void
  onConfigure: (entry: ConnectorEntry) => void
}) {
  const utils = trpc.useUtils()
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const testMut = trpc.connectors.test.useMutation({
    onSuccess: (res) => {
      if (res.ok) toastSuccess('Connection verified', res.message)
      else toastError('Verification failed', res.message)
      utils.connectors.list.invalidate()
    },
    onError: (err) => toastError('Verification failed', err.message),
  })

  const deleteMut = trpc.connectors.delete.useMutation({
    onSuccess: () => {
      toastSuccess('Connector disconnected')
      setConfirming(false)
      utils.connectors.list.invalidate()
      onClose()
    },
    onError: (err) => setDeleteError(err.message),
  })

  const rotateMut = trpc.secrets.rotateNow.useMutation()

  const secretsQuery = trpc.secrets.list.useQuery(
    { connectorId: entry?.instance?.id ?? 0 },
    { enabled: !!entry?.instance },
  )
  const secrets = secretsQuery.data ?? []
  const dueSecrets = secrets.filter((s) => s.status === 'due_soon' || s.status === 'overdue')
  const [rotating, setRotating] = useState(false)

  const rotateAllDue = async () => {
    setRotating(true)
    const results = await Promise.allSettled(
      dueSecrets.map((s) => rotateMut.mutateAsync({ secretId: s.id })),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed === 0) toastSuccess(`Rotated ${results.length} secret(s)`)
    else toastError(`${failed} of ${results.length} rotations failed`)
    setRotating(false)
    utils.secrets.list.invalidate()
    utils.connectors.list.invalidate()
  }

  const meta = entry ? platformMeta(entry.platform) : null
  const dot = entry?.instance ? statusToDot(entry.instance.status) : null

  return (
    <>
      <DetailDrawer
        open={!!entry}
        onClose={onClose}
        title={
          entry && meta ? (
            <span className="flex items-center gap-3">
              <BrandTile glyph={meta.tile} size={36} />
              {entry.displayName}
              <CapabilityBadge capability={entry.capability} />
            </span>
          ) : undefined
        }
      >
        {entry && meta && (
          <div className="space-y-6">
            {/* status line */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between"
            >
              {entry.instance && dot ? (
                <StatusDot
                  state={dot.state}
                  label={`${dot.label} · verified ${timeAgo(entry.instance.lastCheckedAt)}`}
                />
              ) : (
                <StatusDot state="paused" label="not connected" />
              )}
              <span className="text-mono-s text-ink-muted">
                {entry.instance ? `${entry.instance.secretCount} secrets tracked` : meta.tagline}
              </span>
            </motion.div>

            {/* capability matrix */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="panel-light rounded-card border border-line-subtle bg-panel p-4"
            >
              <h3 className="text-label mb-3 text-ink-muted">Capability matrix</h3>
              <ul className="space-y-2.5">
                {capabilityMatrix(entry.capability, entry.platform).map((row, i) => (
                  <motion.li
                    key={row.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <motion.span
                      className="mt-0.5 flex size-5 items-center justify-center"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 + i * 0.05, type: 'spring', stiffness: 500, damping: 22 }}
                    >
                      {MATRIX_ICON[row.state]}
                    </motion.span>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          'text-[13px] leading-5',
                          row.state === 'muted' ? 'text-ink-muted' : 'text-ink-primary',
                        )}
                      >
                        {row.label}
                      </div>
                      <div className="text-mono-s text-ink-muted">{row.caption}</div>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </motion.section>

            {/* auth card */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="panel-light rounded-card border border-line-subtle bg-panel p-4"
            >
              <h3 className="text-label mb-3 text-ink-muted">Authentication</h3>
              {entry.instance ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <MaskedValue />
                    <span
                      className={cn(
                        'text-mono-s rounded-chip border px-2 py-0.5',
                        entry.instance.hasConfig
                          ? 'border-spin-dim text-spin'
                          : 'border-line-subtle text-ink-muted',
                      )}
                    >
                      {entry.instance.hasConfig ? 'configured ●' : 'no credentials'}
                    </span>
                  </div>
                  <p className="text-mono-s text-ink-muted">
                    encrypted server-side · never readable back · last verified{' '}
                    {timeAgo(entry.instance.lastCheckedAt)}
                  </p>
                  <div className="flex gap-2">
                    <GhostButton
                      busy={testMut.isPending}
                      onClick={() => testMut.mutate({ id: entry.instance!.id })}
                    >
                      Re-verify
                    </GhostButton>
                    <GhostButton onClick={() => onConfigure(entry)}>Edit credentials</GhostButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] leading-5 text-ink-secondary">
                    No credentials on file. Connect to let Autorotate verify, rotate, and audit{' '}
                    {entry.displayName} credentials.
                  </p>
                  <PrimaryButton onClick={() => onConfigure(entry)}>Connect</PrimaryButton>
                </div>
              )}
            </motion.section>

            {/* secrets using this connector */}
            {entry.instance && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="panel-light rounded-card border border-line-subtle bg-panel p-4"
              >
                <h3 className="text-label mb-3 text-ink-muted">Secrets using this connector</h3>
                {secretsQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-6 animate-pulse rounded bg-inset" />
                    ))}
                  </div>
                ) : secrets.length === 0 ? (
                  <p className="text-[13px] text-ink-muted">No secrets tracked yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {secrets.slice(0, 5).map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3">
                        <span className="truncate font-mono text-[13px] text-ink-secondary">{s.name}</span>
                        <StatusDot
                          state={
                            s.status === 'healthy'
                              ? 'healthy'
                              : s.status === 'due_soon' || s.status === 'rotating'
                                ? 'due-soon'
                                : s.status === 'paused'
                                  ? 'paused'
                                  : 'overdue'
                          }
                        />
                      </li>
                    ))}
                    {secrets.length > 5 && (
                      <li>
                        <Link to="/secrets" className="text-[13px] text-spin hover:underline">
                          view all {secrets.length} in Secrets →
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </motion.section>
            )}

            {/* footer actions */}
            {entry.instance && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24 }}
                className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4"
              >
                {dueSecrets.length > 0 && (
                  <PrimaryButton busy={rotating} onClick={rotateAllDue}>
                    <RotateCw className="size-4" />
                    Rotate all due ({dueSecrets.length})
                  </PrimaryButton>
                )}
                <GhostButton onClick={() => onConfigure(entry)}>Edit scopes</GhostButton>
                <button
                  onClick={() => {
                    setDeleteError(null)
                    setConfirming(true)
                  }}
                  className="ml-auto text-sm font-medium text-danger hover:underline"
                >
                  Disconnect
                </button>
              </motion.div>
            )}
          </div>
        )}
      </DetailDrawer>

      {/* double-confirm disconnect modal */}
      <ModalShell
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Disconnect ${entry?.displayName}?`}
        width={440}
      >
        {entry?.instance && (
          <div className="space-y-4">
            <p className="text-[13px] leading-5 text-ink-secondary">
              This removes the connector and its encrypted credentials.
              {entry.instance.secretCount > 0 && (
                <>
                  {' '}
                  <span className="text-warn">
                    {entry.instance.secretCount} secret(s) still reference it:
                  </span>
                </>
              )}
            </p>
            {secrets.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-card border border-line-subtle bg-inset p-3">
                {secrets.map((s) => (
                  <li key={s.id} className="font-mono text-[12px] text-ink-secondary">
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
            {deleteError && (
              <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[13px] leading-5 text-danger">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <GhostButton onClick={() => setConfirming(false)}>Keep connector</GhostButton>
              <button
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate({ id: entry.instance!.id })}
                className="inline-flex items-center gap-2 rounded-control bg-danger px-4 py-2 text-sm font-semibold text-[#2A060C] transition-all hover:brightness-110 disabled:opacity-60"
              >
                {deleteMut.isPending && <span className="spin-loader inline-block size-4" />}
                Disconnect permanently
              </button>
            </div>
          </div>
        )}
      </ModalShell>
    </>
  )
}

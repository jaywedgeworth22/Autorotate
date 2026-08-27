import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, RotateCw, Send, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import {
  CapabilityBadge,
  DetailDrawer,
  FingerprintChip,
  MaskedValue,
  PipelineStepper,
  StatusDot,
  toastError,
  toastInfo,
  toastSuccess,
} from '@/components/primitives'
import type { StepState } from '@/components/primitives'
import {
  RUN_STEP_NAMES,
  type RotationRun,
  type RotationStep,
  type SecretWithRelations,
} from '@contracts/autorotate'
import {
  ConnectorTile,
  Field,
  Toggle,
  durationMs,
  inputCls,
  parsePolicy,
  policySummary,
  relTime,
  statusDotState,
  toCapability,
} from './shared'

/* ------------------------------------------------------------------ */
/* Mini pipeline from a run's stepsJson                                */
/* ------------------------------------------------------------------ */

function runStepStates(run: RotationRun): StepState[] {
  const steps = (run.stepsJson ?? []) as unknown as RotationStep[]
  return RUN_STEP_NAMES.map((name) => {
    const list = steps.filter((s) => s.step === name)
    if (list.length === 0) {
      if (run.status === 'running') return 'pending'
      return 'pending'
    }
    if (list.some((s) => s.status === 'failed')) return 'failed'
    if (list.some((s) => s.status === 'running')) return 'running'
    if (list.every((s) => s.status === 'ok')) return 'ok'
    return 'warn' // skipped
  })
}

/* ------------------------------------------------------------------ */
/* Double-confirm untrack modal                                        */
/* ------------------------------------------------------------------ */

export function UntrackConfirm({
  open,
  secret,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean
  secret: SecretWithRelations
  onClose: () => void
  onConfirm: () => void
  busy: boolean
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[120] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[130] w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-modal border border-line-subtle bg-raised p-6 shadow-pop"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="font-display text-lg font-semibold text-ink-primary">
              Untrack <span className="font-mono text-[15px]">{secret.name}</span>?
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-ink-secondary">
              This permanently removes the secret, its {secret.targets.length} target binding
              {secret.targets.length === 1 ? '' : 's'}, and its rotation history from Autorotate. The
              current credential at the provider is left untouched.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary hover:border-line-strong hover:text-ink-primary"
              >
                Keep tracking
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="flex items-center gap-2 rounded-control bg-danger px-4 py-2 text-sm font-semibold text-[#2A0A0F] transition-opacity disabled:opacity-60"
              >
                {busy ? <span className="spin-loader inline-block size-3.5" /> : <Trash2 className="size-4" />}
                Untrack permanently
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* SecretDetailDrawer                                                  */
/* ------------------------------------------------------------------ */

export function SecretDetailDrawer({
  secretId,
  onClose,
  onRotate,
}: {
  secretId: number | null
  onClose: () => void
  onRotate: (s: SecretWithRelations) => void
}) {
  const utils = trpc.useUtils()
  const open = secretId != null

  const detailQuery = trpc.secrets.get.useQuery(
    { id: secretId ?? 0 },
    { enabled: open, refetchInterval: open ? 30000 : false },
  )
  const runsQuery = trpc.runs.list.useQuery(
    { secretId: secretId ?? 0, limit: 5 },
    { enabled: open },
  )

  const secret = detailQuery.data

  /* ----- policy editor state ----- */
  const [intervalHours, setIntervalHours] = useState(24 * 30)
  const [autoRotate, setAutoRotate] = useState(true)
  const [verifyAfterWrite, setVerifyAfterWrite] = useState(true)
  const [notes, setNotes] = useState('')
  const [untrackOpen, setUntrackOpen] = useState(false)

  // Sync local editor state from the fetched secret — "adjust state during
  // render" pattern (avoids setState-in-effect cascading renders).
  const [syncedKey, setSyncedKey] = useState<string | null>(null)
  const syncKey = secret
    ? `${secret.id}:${JSON.stringify(secret.policyJson)}:${secret.notes ?? ''}`
    : null
  if (secret && syncKey !== syncedKey) {
    setSyncedKey(syncKey)
    const p = parsePolicy(secret.policyJson)
    setIntervalHours(p.intervalHours)
    setAutoRotate(p.autoRotate)
    setVerifyAfterWrite(p.verifyAfterWrite)
    setNotes(secret.notes ?? '')
  }
  if (!secret && syncedKey !== null) {
    setSyncedKey(null)
  }

  const policyDirty = useMemo(() => {
    if (!secret) return false
    const p = parsePolicy(secret.policyJson)
    return (
      p.intervalHours !== intervalHours ||
      p.autoRotate !== autoRotate ||
      p.verifyAfterWrite !== verifyAfterWrite
    )
  }, [secret, intervalHours, autoRotate, verifyAfterWrite])

  const notesDirty = secret ? notes !== (secret.notes ?? '') : false

  /* ----- mutations ----- */
  const invalidate = () => {
    utils.secrets.list.invalidate()
    utils.secrets.get.invalidate({ id: secretId ?? 0 })
    utils.runs.list.invalidate()
  }

  const policyMut = trpc.policies.set.useMutation({
    onSuccess: () => {
      toastSuccess('Policy updated')
      invalidate()
    },
    onError: (err) => toastError('Policy update failed', err.message),
  })

  const updateMut = trpc.secrets.update.useMutation({
    onSuccess: (_d, vars) => {
      invalidate()
      if (vars.notes !== undefined) toastSuccess('Notes saved')
      if (vars.status === 'paused') toastInfo('Policy paused')
      if (vars.status === 'healthy') toastInfo('Policy resumed')
    },
    onError: (err) => toastError('Update failed', err.message),
  })

  const deleteMut = trpc.secrets.delete.useMutation({
    onSuccess: () => {
      toastSuccess('Secret untracked')
      utils.secrets.list.invalidate()
      utils.runs.list.invalidate()
      setUntrackOpen(false)
      onClose()
    },
    onError: (err) => toastError('Delete failed', err.message),
  })

  const testMut = trpc.targets.test.useMutation({
    onSuccess: (res) => {
      if (res.ok) toastSuccess('Delivery test passed', res.message)
      else toastError('Delivery test failed', res.message)
      invalidate()
    },
    onError: (err) => toastError('Delivery test failed', err.message),
  })

  const intervalDays = Math.floor(intervalHours / 24)
  const intervalRemHours = intervalHours % 24

  const sectionAnim = (i: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.06 * i, duration: 0.25 },
  })

  return (
    <>
      <DetailDrawer
        open={open}
        onClose={onClose}
        title={
          secret ? (
            <span className="flex items-center gap-2.5">
              <ConnectorTile
                platform={secret.connector?.platform ?? '?'}
                displayName={secret.connector?.displayName}
                size={24}
              />
              <span className="font-mono text-[15px]">{secret.name}</span>
            </span>
          ) : (
            'Secret'
          )
        }
      >
        {detailQuery.isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-card border border-line-subtle bg-raised/40" />
            ))}
          </div>
        )}

        {detailQuery.isError && (
          <div className="rounded-card border border-danger/40 bg-danger/5 p-4 text-[13px] text-danger">
            Failed to load secret — {detailQuery.error.message}
            <button
              onClick={() => detailQuery.refetch()}
              className="mt-2 block text-spin underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {secret && (
          <div className="space-y-5">
            {/* Header meta */}
            <motion.div {...sectionAnim(0)}>
              <div className="flex flex-wrap items-center gap-3">
                <StatusDot {...statusDotState(secret.status)} />
                {secret.connector && (
                  <CapabilityBadge capability={toCapability(secret.connector.capability)} />
                )}
              </div>
              <p className="text-mono-s mt-2 text-ink-muted">
                created {relTime(secret.createdAt)} · v{secret.version} · {secret.environment}
              </p>
            </motion.div>

            {/* Identity card */}
            <motion.section {...sectionAnim(1)} className="panel-light rounded-card border border-line-subtle bg-raised/40 p-4">
              <div className="text-label mb-3 text-ink-muted">Identity</div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-mono-s text-ink-muted">value</span>
                <MaskedValue />
              </div>
              <p className="mt-1 text-[11px] leading-4 text-ink-muted">
                Plaintext is never stored by Autorotate — fingerprints only.
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-mono-s text-ink-muted">fingerprint</span>
                {secret.fingerprint ? (
                  <FingerprintChip fingerprint={`sha256:${secret.fingerprint}`} className="px-2.5" />
                ) : (
                  <span className="text-mono-s text-ink-muted">pending first rotation</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-mono-s text-ink-muted">connector</span>
                <span className="text-[13px] text-ink-secondary">{secret.connector?.displayName ?? '—'}</span>
              </div>
            </motion.section>

            {/* Policy editor */}
            <motion.section {...sectionAnim(2)} className="panel-light rounded-card border border-line-subtle bg-raised/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold leading-[22px] tracking-[-0.01em] text-ink-primary">
                  Rotation policy
                </h3>
                <span className="text-mono-s text-ink-muted">{policySummary({ intervalHours, autoRotate, verifyAfterWrite })}</span>
              </div>
              <div className="flex items-end gap-3">
                <Field label="Every (days)" className="flex-1">
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={intervalDays}
                    onChange={(e) => {
                      const d = Math.max(0, Math.min(365, Number(e.target.value) || 0))
                      setIntervalHours(Math.max(1, d * 24 + intervalRemHours))
                    }}
                    className={inputCls}
                  />
                </Field>
                <Field label="Plus (hours)" className="flex-1">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={intervalRemHours}
                    onChange={(e) => {
                      const h = Math.max(0, Math.min(23, Number(e.target.value) || 0))
                      setIntervalHours(Math.max(1, intervalDays * 24 + h))
                    }}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="mt-3 divide-y divide-line-subtle/60">
                <Toggle
                  checked={autoRotate}
                  onChange={setAutoRotate}
                  label="Auto-rotate"
                  description="Rotate automatically when due"
                />
                <Toggle
                  checked={verifyAfterWrite}
                  onChange={setVerifyAfterWrite}
                  label="Verify after write"
                  description="Read back the target value before commit"
                />
              </div>
              <AnimatePresence>
                {policyDirty && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 flex justify-end"
                  >
                    <button
                      onClick={() =>
                        policyMut.mutate({
                          secretId: secret.id,
                          intervalHours,
                          autoRotate,
                          verifyAfterWrite,
                        })
                      }
                      disabled={policyMut.isPending}
                      className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-[13px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-60"
                    >
                      {policyMut.isPending && <span className="spin-loader inline-block size-3.5" />}
                      Save policy
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            {/* Targets */}
            <motion.section {...sectionAnim(3)} className="panel-light rounded-card border border-line-subtle bg-raised/40 p-4">
              <div className="text-label mb-3 text-ink-muted">
                Targets · {secret.targets.length}
              </div>
              {secret.targets.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  No delivery targets bound. Add targets from the track-a-secret wizard or the Targets page.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {secret.targets.map((t) => {
                    const cfg = (t.configJson ?? {}) as Record<string, unknown>
                    const summary =
                      t.kind === 'file'
                        ? String(cfg.path ?? '')
                        : t.kind === 'webhook'
                          ? String(cfg.url ?? '')
                          : t.kind === 'keychain'
                            ? `${cfg.service ?? ''}/${cfg.account ?? ''}`
                            : `${cfg.environment ?? 'prod'}:${cfg.secretPath ?? '/'}`
                    return (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 rounded-control border border-line-subtle bg-inset px-3 py-2.5"
                      >
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            t.lastStatus === 'ok'
                              ? 'bg-spin'
                              : t.lastStatus === 'failed'
                                ? 'bg-danger animate-tick-pulse'
                                : 'bg-ink-muted',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-mono-s block uppercase text-ink-primary">{t.kind}</span>
                          <span className="block truncate font-mono text-[11px] text-ink-muted">{summary}</span>
                        </span>
                        <span className="text-mono-s shrink-0 text-ink-muted">
                          {t.lastDeliveredAt ? relTime(t.lastDeliveredAt) : 'never'}
                        </span>
                        <button
                          aria-label="Test delivery"
                          title="Test delivery (writes a canary)"
                          onClick={() => testMut.mutate({ id: t.id })}
                          disabled={testMut.isPending && testMut.variables?.id === t.id}
                          className="rounded-control border border-line-subtle p-1.5 text-ink-muted transition-colors hover:border-line-strong hover:text-spin disabled:opacity-60"
                        >
                          {testMut.isPending && testMut.variables?.id === t.id ? (
                            <span className="spin-loader inline-block size-3.5" />
                          ) : (
                            <Send className="size-3.5" />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </motion.section>

            {/* History */}
            <motion.section {...sectionAnim(4)} className="panel-light rounded-card border border-line-subtle bg-raised/40 p-4">
              <div className="text-label mb-3 text-ink-muted">Recent rotations</div>
              {runsQuery.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-control bg-inset" />
                  ))}
                </div>
              )}
              {runsQuery.data && runsQuery.data.length === 0 && (
                <p className="text-[13px] text-ink-muted">No rotations yet.</p>
              )}
              <ul className="space-y-2">
                {runsQuery.data?.map((run) => (
                  <li key={run.id}>
                    <Link
                      to="/runs"
                      className="block rounded-control border border-line-subtle bg-inset px-3 py-2.5 transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[12px] text-ink-primary">
                          run_{run.id.toString(36).toUpperCase()}
                        </span>
                        <span
                          className={cn(
                            'text-mono-s uppercase',
                            run.status === 'committed'
                              ? 'text-spin'
                              : run.status === 'failed'
                                ? 'text-danger'
                                : run.status === 'partial'
                                  ? 'text-warn'
                                  : 'text-info animate-tick-pulse',
                          )}
                        >
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <PipelineStepper steps={runStepStates(run)} nodeSize={14} className="[&_span]:hidden" />
                        <span className="text-mono-s shrink-0 text-ink-muted">
                          {durationMs(run.startedAt, run.finishedAt)} · {relTime(run.startedAt)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.section>

            {/* Notes */}
            <motion.section {...sectionAnim(5)} className="panel-light rounded-card border border-line-subtle bg-raised/40 p-4">
              <div className="text-label mb-2 text-ink-muted">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Owner, runbook link, rotation caveats…"
                className={cn(inputCls, 'resize-none font-sans')}
              />
              {notesDirty && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => updateMut.mutate({ id: secret.id, notes: notes || null })}
                    disabled={updateMut.isPending}
                    className="rounded-control border border-spin-dim px-3 py-1.5 text-[12px] font-medium text-spin hover:bg-spin/10 disabled:opacity-60"
                  >
                    Save notes
                  </button>
                </div>
              )}
            </motion.section>

            {/* Footer actions */}
            <motion.div {...sectionAnim(6)} className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
              <button
                onClick={() => onRotate(secret)}
                disabled={secret.status === 'rotating'}
                className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-[13px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-60"
              >
                <RotateCw className="size-4" />
                Rotate now
              </button>
              <button
                onClick={() =>
                  updateMut.mutate({
                    id: secret.id,
                    status: secret.status === 'paused' ? 'healthy' : 'paused',
                  })
                }
                disabled={updateMut.isPending}
                className="flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2 text-[13px] font-medium text-ink-secondary hover:border-line-strong hover:text-ink-primary disabled:opacity-60"
              >
                {secret.status === 'paused' ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {secret.status === 'paused' ? 'Resume policy' : 'Pause policy'}
              </button>
              <button
                onClick={() => setUntrackOpen(true)}
                className="ml-auto flex items-center gap-2 px-2 py-2 text-[13px] font-medium text-danger hover:underline"
              >
                <X className="size-3.5" />
                Untrack secret
              </button>
            </motion.div>
          </div>
        )}
      </DetailDrawer>

      {secret && (
        <UntrackConfirm
          open={untrackOpen}
          secret={secret}
          onClose={() => setUntrackOpen(false)}
          onConfirm={() => deleteMut.mutate({ id: secret.id })}
          busy={deleteMut.isPending}
        />
      )}
    </>
  )
}

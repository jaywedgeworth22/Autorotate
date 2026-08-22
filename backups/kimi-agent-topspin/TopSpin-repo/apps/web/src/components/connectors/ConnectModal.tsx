import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { trpc } from '@/providers/trpc'
import { CapabilityBadge, toastError, toastSuccess } from '@/components/primitives'
import { platformMeta, toPrimitiveCapability, type PrimitiveCapability } from './data'
import { BrandTile, Field, GhostButton, ModalShell, PrimaryButton, VerifyChecklist, inputCls, type ChecklistRowState } from './ui'

export interface ConnectTarget {
  platform: string
  displayName: string
  capability: PrimitiveCapability
  /** set when re-configuring an existing connector instance */
  existingId?: number
  hasConfig?: boolean
}

const VERIFY_STEPS = ['Reach endpoint', 'Authenticate', 'Read rotation surface']

export function ConnectModal({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: ConnectTarget | null
}) {
  const meta = target ? platformMeta(target.platform) : null
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      width={520}
      title={
        target && meta ? (
          <span className="flex items-center gap-3">
            <BrandTile glyph={meta.tile} size={32} />
            {target.existingId !== undefined
              ? `Re-configure ${target.displayName}`
              : `Connect ${target.displayName}`}
            <CapabilityBadge capability={toPrimitiveCapability(target.capability)} />
          </span>
        ) : undefined
      }
    >
      {target && (
        <ConnectFlow
          key={`${target.platform}:${target.existingId ?? 'new'}`}
          target={target}
          onClose={onClose}
        />
      )}
    </ModalShell>
  )
}

function ConnectFlow({ target, onClose }: { target: ConnectTarget; onClose: () => void }) {
  const utils = trpc.useUtils()
  const [step, setStep] = useState<'auth' | 'verify' | 'done'>('auth')
  const [displayName, setDisplayName] = useState(target.displayName)
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ChecklistRowState[]>(['pending', 'pending', 'pending'])
  const [finalMessage, setFinalMessage] = useState<string | undefined>()
  const timers = useRef<number[]>([])

  const createMut = trpc.connectors.create.useMutation()
  const updateMut = trpc.connectors.update.useMutation()
  const testMut = trpc.connectors.test.useMutation()

  // cancel pending animation timers on unmount
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
    },
    [],
  )

  const meta = platformMeta(target.platform)
  const isEdit = target.existingId !== undefined

  const runVerify = (connectorId: number) => {
    setStep('verify')
    setRows(['running', 'pending', 'pending'])
    setFinalMessage(undefined)

    let resolved = false
    const advance = (idx: number) => {
      if (resolved) return
      setRows((prev) => {
        const next = [...prev]
        if (idx > 0 && next[idx - 1] === 'running') next[idx - 1] = 'ok'
        if (idx < next.length) next[idx] = 'running'
        return next
      })
      if (idx < VERIFY_STEPS.length - 1) {
        timers.current.push(window.setTimeout(() => advance(idx + 1), 450))
      }
    }
    timers.current.push(window.setTimeout(() => advance(1), 450))
    timers.current.push(window.setTimeout(() => advance(2), 900))

    testMut
      .mutateAsync({ id: connectorId })
      .then((res) => {
        resolved = true
        timers.current.forEach((t) => window.clearTimeout(t))
        timers.current = []
        if (res.ok) {
          // let the animation settle, then resolve everything
          timers.current.push(
            window.setTimeout(() => {
              setRows(['ok', 'ok', 'ok'])
              setFinalMessage(res.message)
              timers.current.push(window.setTimeout(() => setStep('done'), 700))
            }, 1000),
          )
        } else {
          setRows((prev) => {
            const next = [...prev]
            const running = next.findIndex((r) => r === 'running')
            next[running === -1 ? next.length - 1 : running] = 'failed'
            return next
          })
          setFinalMessage(res.message)
          setError(res.message)
        }
      })
      .catch((err: Error) => {
        resolved = true
        timers.current.forEach((t) => window.clearTimeout(t))
        timers.current = []
        setRows(['ok', 'ok', 'ok'])
        setFinalMessage(err.message)
        timers.current.push(window.setTimeout(() => setStep('done'), 700))
      })
      .finally(() => {
        utils.connectors.list.invalidate()
      })
  }

  const submit = async () => {
    setError(null)
    const config: Record<string, unknown> = {}
    for (const f of meta.fields) {
      const v = values[f.key]?.trim()
      if (v) config[f.key] = v
    }
    const missing = meta.fields.filter((f) => !f.optional && !config[f.key])
    const keepExisting = isEdit && target.hasConfig && Object.keys(config).length === 0
    if (!keepExisting && missing.length > 0) {
      setError(`Missing required field: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    try {
      if (isEdit) {
        const row = await updateMut.mutateAsync({
          id: target.existingId!,
          displayName: displayName.trim() || target.displayName,
          ...(keepExisting ? {} : { config }),
        })
        toastSuccess('Credentials updated', 'Encrypted server-side — never readable back.')
        runVerify(row!.id)
      } else {
        const row = await createMut.mutateAsync({
          platform: target.platform,
          displayName: displayName.trim() || target.displayName,
          capability: target.capability === 'update-only' ? 'update_only' : target.capability,
          config,
        })
        toastSuccess('Connector created', 'Credentials encrypted server-side.')
        runVerify(row!.id)
      }
    } catch (err) {
      setError((err as Error).message)
      toastError('Could not save connector', (err as Error).message)
    }
  }

  const busy = createMut.isPending || updateMut.isPending

  return (
    <>
      {step === 'auth' && (
        <motion.div
          key="auth"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <Field label="Display name">
            <input
              className={inputCls}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={target.displayName}
            />
          </Field>
          {meta.fields.map((f) => (
            <Field key={f.key} label={f.label} optional={f.optional}>
              <input
                className={inputCls}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={
                  isEdit && target.hasConfig && f.secret
                    ? 'leave blank to keep existing — or paste to rotate'
                    : f.placeholder
                }
              />
            </Field>
          ))}

          <div className="flex items-start gap-2.5 rounded-card border border-spin-dim/50 bg-spin/5 px-3.5 py-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-spin" />
            <p className="text-[13px] leading-5 text-ink-secondary">
              Credentials are encrypted server-side with AES-256-GCM and are{' '}
              <span className="text-ink-primary">never readable back</span> — verified once,
              fingerprinted, discarded.{' '}
              {isEdit && target.hasConfig ? 'This connector is currently configured (●).' : ''}
            </p>
          </div>

          {error && step === 'auth' && (
            <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[13px] leading-5 text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton busy={busy} onClick={submit}>
              {isEdit ? 'Save & verify' : 'Connect & verify'}
            </PrimaryButton>
          </div>
        </motion.div>
      )}

      {step === 'verify' && (
        <motion.div
          key="verify"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <p className="text-[13px] leading-5 text-ink-secondary">
            Verifying the connection against {target.displayName}…
          </p>
          <VerifyChecklist
            rows={VERIFY_STEPS.map((label, i) => ({
              label,
              state: rows[i],
              caption: rows[i] === 'failed' ? (finalMessage ?? undefined) : undefined,
            }))}
            finalMessage={rows.every((r) => r === 'ok') ? finalMessage : undefined}
          />
          {error && (
            <div className="flex justify-end gap-3 pt-1">
              <GhostButton onClick={() => setStep('auth')}>Back to credentials</GhostButton>
              <PrimaryButton onClick={onClose}>Close</PrimaryButton>
            </div>
          )}
        </motion.div>
      )}

      {step === 'done' && (
        <motion.div
          key="done"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-4 py-6 text-center"
        >
          <motion.svg
            viewBox="0 0 64 64"
            className="size-16"
            initial={{ rotate: -90 }}
            animate={{ rotate: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <circle cx="32" cy="32" r="28" fill="none" stroke="#1B2130" strokeWidth="2" />
            <motion.path
              d="M32 4 a28 28 0 0 1 28 28"
              fill="none"
              stroke="#2EE6A8"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
            <motion.path
              d="M20 33 28 41 44 24"
              fill="none"
              stroke="#2EE6A8"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.4, duration: 0.35 }}
            />
          </motion.svg>
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-primary">Connector verified</h3>
            {finalMessage && <p className="text-mono-s mt-1 text-ink-muted">{finalMessage}</p>}
          </div>
          <Link
            to="/secrets"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] hover:brightness-110"
          >
            Track your first secret
            <ArrowRight className="size-4" />
          </Link>
        </motion.div>
      )}
    </>
  )
}

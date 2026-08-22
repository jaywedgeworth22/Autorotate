import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Laptop, Search, Smartphone } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { StatusDot, toastError, toastSuccess } from '@/components/primitives'
import type { TargetKind } from '@contracts/topspin'
import { cn } from '@/lib/utils'
import { BrandTile, Field, GhostButton, ModalShell, PrimaryButton, VerifyChecklist, inputCls, type ChecklistRowState } from '@/components/connectors/ui'
import { platformMeta } from '@/components/connectors/data'
import {
  detectFormat,
  fileCfg,
  infisicalCfg,
  keychainCfg,
  webhookCfg,
  type BoundTarget,
} from './data'
import { FormatBadge } from './GroupTable'

type Cfg = Record<string, string | boolean>

const TEST_STEPS = ['Encrypt', 'Transmit', 'Acknowledge', 'Fingerprint match']

export interface WizardRequest {
  mode: 'add' | 'edit'
  kind: TargetKind
  target?: BoundTarget
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-control border border-line-subtle bg-inset px-3.5 py-2.5"
    >
      <span className="text-[13px] text-ink-secondary">{label}</span>
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors duration-200',
          checked ? 'bg-spin' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-4 rounded-full bg-abyss transition-transform duration-200',
            checked && 'translate-x-[18px]',
          )}
        />
      </span>
    </button>
  )
}

function initialCfg(request: WizardRequest): Cfg {
  if (request.mode === 'edit' && request.target) {
    const t = request.target
    if (request.kind === 'file') return { ...fileCfg(t) }
    if (request.kind === 'infisical')
      // never display the stored client secret — show "configured ●" instead
      return { ...(infisicalCfg(t) as unknown as Cfg), clientSecret: '' }
    if (request.kind === 'webhook') return { ...(webhookCfg(t) as unknown as Cfg) }
    return { ...(keychainCfg(t) as unknown as Cfg) }
  }
  if (request.kind === 'infisical')
    return { baseUrl: 'https://app.infisical.com', environment: 'prod', secretPath: '/' }
  if (request.kind === 'webhook') return { method: 'POST', includeValue: false }
  if (request.kind === 'keychain') return { synchronizable: false }
  return {}
}

const STEP_TITLES: Record<TargetKind, string> = {
  infisical: 'Infisical workspace',
  file: 'File target',
  webhook: 'Webhook',
  keychain: 'Apple Keychain',
}

export function TargetWizard({
  request,
  onClose,
}: {
  request: WizardRequest | null
  onClose: () => void
}) {
  return (
    <ModalShell
      open={!!request}
      onClose={onClose}
      width={560}
      title={
        request ? (
          <span className="flex items-center gap-3">
            {request.mode === 'edit' ? 'Edit' : 'Add'} {STEP_TITLES[request.kind]}
          </span>
        ) : undefined
      }
    >
      {request && (
        <WizardFlow
          key={`${request.mode}:${request.kind}:${request.target?.id ?? 'new'}`}
          request={request}
          onClose={onClose}
        />
      )}
    </ModalShell>
  )
}

function WizardFlow({ request, onClose }: { request: WizardRequest; onClose: () => void }) {
  const utils = trpc.useUtils()
  const [step, setStep] = useState(0)
  const [cfg, setCfg] = useState<Cfg>(() => initialCfg(request))
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bindSearch, setBindSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<ChecklistRowState[]>(TEST_STEPS.map(() => 'pending'))
  const [finalMessage, setFinalMessage] = useState<string | undefined>()
  const timers = useRef<number[]>([])

  const upsertMut = trpc.targets.upsert.useMutation()
  const testMut = trpc.targets.test.useMutation()
  const secretsQuery = trpc.secrets.list.useQuery()

  // cancel pending checklist timers on unmount
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
    },
    [],
  )

  const secrets = useMemo(() => secretsQuery.data ?? [], [secretsQuery.data])
  const filteredSecrets = useMemo(() => {
    const q = bindSearch.trim().toLowerCase()
    if (!q) return secrets
    return secrets.filter((s) => s.name.toLowerCase().includes(q))
  }, [secrets, bindSearch])

  const kind = request.kind
  const isEdit = request.mode === 'edit'

  const set = (k: string, v: string | boolean) => setCfg((c) => ({ ...c, [k]: v }))
  const str = (k: string) => String(cfg[k] ?? '')

  const buildConfig = (): Record<string, unknown> => {
    if (kind === 'file') {
      return { path: str('path').trim(), format: detectFormat(str('path')), key: str('key').trim() }
    }
    if (kind === 'infisical') {
      const out: Record<string, unknown> = {
        baseUrl: str('baseUrl').trim() || undefined,
        clientId: str('clientId').trim() || undefined,
        workspaceId: str('workspaceId').trim() || undefined,
        environment: str('environment').trim() || 'prod',
        secretPath: str('secretPath').trim() || '/',
      }
      const secret = str('clientSecret').trim()
      if (secret) out.clientSecret = secret
      return out
    }
    if (kind === 'webhook') {
      return {
        url: str('url').trim(),
        method: str('method') === 'PUT' ? 'PUT' : 'POST',
        includeValue: cfg.includeValue === true,
      }
    }
    return {
      service: str('service').trim(),
      account: str('account').trim(),
      synchronizable: cfg.synchronizable === true,
    }
  }

  const validate = (): string | null => {
    if (kind === 'file') {
      if (!str('path').trim()) return 'Path is required'
      if (!str('key').trim()) return 'Key path is required'
    } else if (kind === 'infisical') {
      if (!str('workspaceId').trim()) return 'Workspace ID is required'
      if (!isEdit && !str('clientId').trim()) return 'Client ID is required'
      if (!isEdit && !str('clientSecret').trim()) return 'Client secret is required'
    } else if (kind === 'webhook') {
      if (!/^https?:\/\/.+/.test(str('url').trim())) return 'A valid https:// URL is required'
    } else {
      if (!str('service').trim()) return 'Service is required'
      if (!str('account').trim()) return 'Account is required'
    }
    return null
  }

  const runChecklist = (firstTargetId: number, createdCount: number) => {
    setRows(['running', 'pending', 'pending', 'pending'])
    setFinalMessage(undefined)
    let resolved = false
    for (let i = 1; i < TEST_STEPS.length; i++) {
      timers.current.push(
        window.setTimeout(() => {
          if (resolved) return
          setRows((prev) => {
            const next = [...prev]
            next[i - 1] = 'ok'
            next[i] = 'running'
            return next
          })
        }, i * 380),
      )
    }
    testMut
      .mutateAsync({ id: firstTargetId })
      .then((res) => {
        resolved = true
        timers.current.forEach((t) => window.clearTimeout(t))
        timers.current = []
        if (res.ok) {
          timers.current.push(
            window.setTimeout(() => {
              setRows(TEST_STEPS.map(() => 'ok'))
              setFinalMessage(res.message)
              toastSuccess(`Target live — ${createdCount} secret${createdCount === 1 ? '' : 's'} bound`)
            }, 1300),
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
        setRows(TEST_STEPS.map(() => 'ok'))
        setFinalMessage(err.message)
      })
      .finally(() => utils.secrets.list.invalidate())
  }

  const createAndTest = async () => {
    if (selected.size === 0) {
      setError('Select at least one secret to bind')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const config = buildConfig()
      let firstId: number | null = null
      for (const secretId of selected) {
        const row = await upsertMut.mutateAsync({ secretId, kind, config, enabled: true })
        if (firstId === null && row) firstId = row.id
      }
      setStep(2)
      if (firstId !== null) runChecklist(firstId, selected.size)
    } catch (err) {
      setError((err as Error).message)
      toastError('Could not create target', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await upsertMut.mutateAsync({
        id: request.target!.id,
        secretId: request.target!.secretId,
        kind,
        config: buildConfig(),
        enabled: request.target!.enabled,
      })
      toastSuccess('Target updated')
      utils.secrets.list.invalidate()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const detected = kind === 'file' && str('path').trim() ? detectFormat(str('path')) : null

  return (
    <>
      {!isEdit && (
        <p className="text-mono-s mb-4 text-ink-muted">
          {STEP_TITLES[kind]} · step {Math.min(step + 1, 3)} of 3
        </p>
      )}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="configure"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {kind === 'file' && (
              <>
                <Field label="Path">
                  <div className="relative">
                    <input
                      className={cn(inputCls, 'pr-16')}
                      value={str('path')}
                      onChange={(e) => set('path', e.target.value)}
                      placeholder="~/.aws/credentials"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <AnimatePresence mode="wait">
                        {detected && (
                          <motion.span
                            key={detected}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                          >
                            <FormatBadge format={detected} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </div>
                </Field>
                <Field label="Key path">
                  <input
                    className={inputCls}
                    value={str('key')}
                    onChange={(e) => set('key', e.target.value)}
                    placeholder="[default] aws_secret_access_key"
                  />
                </Field>
                <p className="rounded-card border border-info/40 bg-info/5 px-3.5 py-2.5 text-[13px] leading-5 text-ink-secondary">
                  File targets are written by the TopSpin agent or companion on that machine —
                  values travel encrypted end-to-end; the web console never sees file contents.
                </p>
              </>
            )}

            {kind === 'infisical' && (
              <>
                <Field label="Workspace URL">
                  <input className={inputCls} value={str('baseUrl')} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://app.infisical.com" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Workspace ID">
                    <input className={inputCls} value={str('workspaceId')} onChange={(e) => set('workspaceId', e.target.value)} placeholder="acme-prod" />
                  </Field>
                  <Field label="Environment">
                    <input className={inputCls} value={str('environment')} onChange={(e) => set('environment', e.target.value)} placeholder="prod" />
                  </Field>
                </div>
                <Field label="Secret path">
                  <input className={inputCls} value={str('secretPath')} onChange={(e) => set('secretPath', e.target.value)} placeholder="/" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Client ID">
                    <input className={inputCls} value={str('clientId')} onChange={(e) => set('clientId', e.target.value)} />
                  </Field>
                  <Field label="Client secret">
                    <input
                      className={inputCls}
                      type="password"
                      autoComplete="off"
                      value={str('clientSecret')}
                      onChange={(e) => set('clientSecret', e.target.value)}
                      placeholder={isEdit ? 'configured ● — paste to replace' : ''}
                    />
                  </Field>
                </div>
                <p className="text-mono-s text-ink-muted">
                  Verified once, fingerprinted, discarded — the client secret is never displayed.
                </p>
              </>
            )}

            {kind === 'webhook' && (
              <>
                <Field label="Endpoint URL">
                  <input className={inputCls} value={str('url')} onChange={(e) => set('url', e.target.value)} placeholder="https://ci.acme.dev/hooks/secrets" />
                </Field>
                <Field label="Method">
                  <div className="flex gap-1.5">
                    {(['POST', 'PUT'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set('method', m)}
                        className={cn(
                          'text-mono-s rounded-chip border px-3 py-1.5 transition-colors',
                          str('method') === m
                            ? 'border-spin-dim bg-spin/10 text-spin'
                            : 'border-line-subtle text-ink-muted hover:text-ink-secondary',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Field>
                <Toggle
                  checked={cfg.includeValue === true}
                  onChange={(v) => set('includeValue', v)}
                  label="Include value reference in payload"
                />
                <p className="text-mono-s text-ink-muted">
                  Signing secret is generated server-side — shown once as a fingerprint; the full
                  secret is delivered to your endpoint config.
                </p>
              </>
            )}

            {kind === 'keychain' && (
              <>
                <Field label="Companion device">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'mac', label: 'MacBook Pro (this Mac)', icon: Laptop },
                      { id: 'ios', label: 'iPhone 16 Pro', icon: Smartphone },
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => set('device', d.id)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-[13px] transition-colors',
                          str('device') === d.id || (!str('device') && d.id === 'mac')
                            ? 'border-violet/60 bg-violet/10 text-ink-primary'
                            : 'border-line-subtle text-ink-secondary hover:border-line-strong',
                        )}
                      >
                        <d.icon className="size-4 text-violet" />
                        {d.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Service">
                  <input className={inputCls} value={str('service')} onChange={(e) => set('service', e.target.value)} placeholder="com.topspin.production" />
                </Field>
                <Field label="Account (item name)">
                  <input className={inputCls} value={str('account')} onChange={(e) => set('account', e.target.value)} placeholder="prod-stripe-live" />
                </Field>
                <Toggle
                  checked={cfg.synchronizable === true}
                  onChange={(v) => set('synchronizable', v)}
                  label="Synchronizable via iCloud Keychain"
                />
              </>
            )}

            {error && (
              <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[13px] leading-5 text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <GhostButton onClick={onClose}>Cancel</GhostButton>
              {isEdit ? (
                <PrimaryButton busy={busy} onClick={saveEdit}>
                  Save target
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  onClick={() => {
                    const v = validate()
                    if (v) setError(v)
                    else {
                      setError(null)
                      setStep(1)
                    }
                  }}
                >
                  Next — bind secrets
                </PrimaryButton>
              )}
            </div>
          </motion.div>
        )}

        {step === 1 && !isEdit && (
          <motion.div
            key="bind"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                className={cn(inputCls, 'pl-9')}
                value={bindSearch}
                onChange={(e) => setBindSearch(e.target.value)}
                placeholder="search secrets…"
              />
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {secretsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-control bg-inset" />
                ))
              ) : filteredSecrets.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ink-muted">No secrets found.</p>
              ) : (
                filteredSecrets.map((s) => {
                  const on = selected.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (on) next.delete(s.id)
                          else next.add(s.id)
                          return next
                        })
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors',
                        on ? 'border-spin-dim bg-spin/5' : 'border-line-subtle hover:border-line-strong',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-4 items-center justify-center rounded border',
                          on ? 'border-spin bg-spin text-[#06231A]' : 'border-line-strong',
                        )}
                      >
                        {on && (
                          <svg viewBox="0 0 12 12" className="size-3">
                            <path d="M2.5 6.5 5 9 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <BrandTile glyph={platformMeta(s.connector?.platform ?? '').tile} size={22} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-primary">
                        {s.name}
                      </span>
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
                    </button>
                  )
                })
              )}
            </div>
            {error && (
              <p className="rounded-card border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[13px] leading-5 text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-between gap-3 pt-1">
              <GhostButton onClick={() => setStep(0)}>Back</GhostButton>
              <PrimaryButton busy={busy} onClick={createAndTest}>
                Create target &amp; bind ({selected.size})
              </PrimaryButton>
            </div>
          </motion.div>
        )}

        {step === 2 && !isEdit && (
          <motion.div
            key="test"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <p className="text-[13px] leading-5 text-ink-secondary">
              Sending a <span className="font-mono text-ink-primary">topspin-canary-*</span> value
              through the new target…
            </p>
            <VerifyChecklist
              rows={TEST_STEPS.map((label, i) => ({
                label,
                state: rows[i],
                caption: rows[i] === 'failed' ? (finalMessage ?? undefined) : undefined,
              }))}
              finalMessage={rows.every((r) => r === 'ok') || rows.some((r) => r === 'failed') ? finalMessage : undefined}
            />
            <div className="flex justify-end gap-3 pt-1">
              <PrimaryButton onClick={onClose} disabled={!rows.every((r) => r === 'ok') && !rows.some((r) => r === 'failed')}>
                Done
              </PrimaryButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Plus, RotateCw, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import { CapabilityBadge, toastError, toastSuccess } from '@/components/primitives'
import {
  FILE_FORMATS,
  type RotationPolicy,
  type TargetKind,
} from '@contracts/autorotate'
import {
  ConnectorTile,
  Field,
  TARGET_KIND_META,
  TargetKindChip,
  Toggle,
  inputCls,
  selectCls,
  toCapability,
} from './shared'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TargetDraft {
  kind: TargetKind
  config: Record<string, unknown>
  label: string
}

type WizardConnector = {
  id: number
  platform: string
  displayName: string
  capability: string
  secretCount?: number
}

/* ------------------------------------------------------------------ */
/* Target draft form (per-kind config)                                 */
/* ------------------------------------------------------------------ */

function emptyConfig(kind: TargetKind): Record<string, unknown> {
  switch (kind) {
    case 'file':
      return { path: '', format: 'env', key: '' }
    case 'infisical':
      return { baseUrl: '', workspaceId: '', environment: 'prod', secretPath: '/', secretName: '' }
    case 'webhook':
      return { url: '', method: 'POST', includeValue: false }
    case 'keychain':
      return { service: '', account: '', synchronizable: false }
  }
}

function configValid(kind: TargetKind, cfg: Record<string, unknown>): boolean {
  switch (kind) {
    case 'file':
      return Boolean(cfg.path) && Boolean(cfg.key)
    case 'infisical':
      return true
    case 'webhook':
      return Boolean(cfg.url)
    case 'keychain':
      return Boolean(cfg.service) && Boolean(cfg.account)
  }
}

function configLabel(kind: TargetKind, cfg: Record<string, unknown>): string {
  switch (kind) {
    case 'file':
      return `${cfg.path || '?'} (${cfg.format})`
    case 'infisical':
      return `${cfg.environment || 'prod'}:${cfg.secretPath || '/'}${cfg.secretName || ''}`
    case 'webhook':
      return String(cfg.url || '?')
    case 'keychain':
      return `${cfg.service || '?'}/${cfg.account || '?'}`
  }
}

function TargetDraftForm({ onAdd }: { onAdd: (d: TargetDraft) => void }) {
  const [kind, setKind] = useState<TargetKind>('file')
  const [cfg, setCfg] = useState<Record<string, unknown>>(emptyConfig('file'))

  const switchKind = (k: TargetKind) => {
    setKind(k)
    setCfg(emptyConfig(k))
  }

  const set = (key: string, value: unknown) => setCfg((c) => ({ ...c, [key]: value }))

  return (
    <div className="rounded-card border border-line-subtle bg-inset p-4">
      <div className="mb-3 flex gap-1.5">
        {(Object.keys(TARGET_KIND_META) as TargetKind[]).map((k) => (
          <button
            key={k}
            onClick={() => switchKind(k)}
            className={cn(
              'text-mono-s rounded-chip border px-2.5 py-1 uppercase transition-colors',
              kind === k
                ? TARGET_KIND_META[k].chip + ' bg-raised'
                : 'border-line-subtle text-ink-muted hover:border-line-strong hover:text-ink-secondary',
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {kind === 'file' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Path" className="col-span-2">
            <input
              value={String(cfg.path)}
              onChange={(e) => set('path', e.target.value)}
              placeholder=".env.production"
              className={inputCls}
            />
          </Field>
          <Field label="Format">
            <select
              value={String(cfg.format)}
              onChange={(e) => set('format', e.target.value)}
              className={cn(selectCls, 'w-full')}
            >
              {FILE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Key">
            <input
              value={String(cfg.key)}
              onChange={(e) => set('key', e.target.value)}
              placeholder="STRIPE_SECRET_KEY"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {kind === 'infisical' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base URL (optional)">
            <input
              value={String(cfg.baseUrl)}
              onChange={(e) => set('baseUrl', e.target.value)}
              placeholder="https://app.infisical.com"
              className={inputCls}
            />
          </Field>
          <Field label="Workspace ID">
            <input
              value={String(cfg.workspaceId)}
              onChange={(e) => set('workspaceId', e.target.value)}
              placeholder="wksp_…"
              className={inputCls}
            />
          </Field>
          <Field label="Environment">
            <input
              value={String(cfg.environment)}
              onChange={(e) => set('environment', e.target.value)}
              placeholder="prod"
              className={inputCls}
            />
          </Field>
          <Field label="Secret path">
            <input
              value={String(cfg.secretPath)}
              onChange={(e) => set('secretPath', e.target.value)}
              placeholder="/"
              className={inputCls}
            />
          </Field>
          <Field label="Secret name" className="col-span-2">
            <input
              value={String(cfg.secretName)}
              onChange={(e) => set('secretName', e.target.value)}
              placeholder="STRIPE_SECRET_KEY"
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {kind === 'webhook' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="URL" className="col-span-2">
            <input
              value={String(cfg.url)}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://ops.example.com/hooks/rotate"
              className={inputCls}
            />
          </Field>
          <Field label="Method">
            <select
              value={String(cfg.method)}
              onChange={(e) => set('method', e.target.value)}
              className={cn(selectCls, 'w-full')}
            >
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </select>
          </Field>
          <div className="flex items-end pb-1">
            <Toggle
              checked={Boolean(cfg.includeValue)}
              onChange={(v) => set('includeValue', v)}
              label="Include value"
            />
          </div>
        </div>
      )}

      {kind === 'keychain' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service">
            <input
              value={String(cfg.service)}
              onChange={(e) => set('service', e.target.value)}
              placeholder="com.acme.api"
              className={inputCls}
            />
          </Field>
          <Field label="Account">
            <input
              value={String(cfg.account)}
              onChange={(e) => set('account', e.target.value)}
              placeholder="prod-stripe"
              className={inputCls}
            />
          </Field>
          <div className="col-span-2">
            <Toggle
              checked={Boolean(cfg.synchronizable)}
              onChange={(v) => set('synchronizable', v)}
              label="Synchronizable (iCloud Keychain)"
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          onClick={() => {
            if (!configValid(kind, cfg)) return
            onAdd({ kind, config: cfg, label: configLabel(kind, cfg) })
            setCfg(emptyConfig(kind))
          }}
          disabled={!configValid(kind, cfg)}
          className="flex items-center gap-1.5 rounded-control border border-spin-dim px-3 py-1.5 text-[12px] font-medium text-spin transition-colors hover:bg-spin/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Add target
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Wizard                                                              */
/* ------------------------------------------------------------------ */

const STEP_TITLES = ['Connector', 'Details & policy', 'Targets']

export function TrackSecretWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (secretId: number) => void
}) {
  const utils = trpc.useUtils()

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  /* step 1 — connector */
  const [connSearch, setConnSearch] = useState('')
  const [connector, setConnector] = useState<WizardConnector | null>(null)

  /* step 2 — details + policy */
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState('production')
  const [intervalDays, setIntervalDays] = useState(30)
  const [autoRotate, setAutoRotate] = useState(true)
  const [verifyAfterWrite, setVerifyAfterWrite] = useState(true)

  /* step 3 — targets */
  const [drafts, setDrafts] = useState<TargetDraft[]>([])

  /* finish */
  const [creating, setCreating] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [createdName, setCreatedName] = useState('')

  const connectorsQuery = trpc.connectors.list.useQuery(undefined, { enabled: open })
  const registryQuery = trpc.connectors.registry.useQuery(undefined, { enabled: open })

  const createConnectorMut = trpc.connectors.create.useMutation()
  const createSecretMut = trpc.secrets.create.useMutation()
  const upsertTargetMut = trpc.targets.upsert.useMutation()
  const rotateMut = trpc.secrets.rotateNow.useMutation({
    onSuccess: (run) => {
      toastSuccess('First rotation committed', `new fingerprint sha256:${run.newFingerprint ?? '—'}`)
      utils.secrets.list.invalidate()
      utils.runs.list.invalidate()
    },
    onError: (err) => toastError('Rotation failed', err.message),
  })

  /* ----- derived connector groups ----- */
  const existing = useMemo(() => {
    const rows = (connectorsQuery.data ?? []) as unknown as WizardConnector[]
    const q = connSearch.trim().toLowerCase()
    const filtered = q
      ? rows.filter(
          (c) =>
            c.displayName.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q),
        )
      : rows
    const groups: Record<string, WizardConnector[]> = {
      programmatic: [],
      partial: [],
      update_only: [],
    }
    for (const c of filtered) (groups[c.capability] ?? groups.programmatic).push(c)
    return groups
  }, [connectorsQuery.data, connSearch])

  const missingRegistry = useMemo(() => {
    const have = new Set((connectorsQuery.data ?? []).map((c) => c.platform))
    return (registryQuery.data ?? []).filter((r) => !have.has(r.platform))
  }, [connectorsQuery.data, registryQuery.data])

  const goTo = (next: number) => {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  const reset = () => {
    setStep(0)
    setDir(1)
    setConnSearch('')
    setConnector(null)
    setName('')
    setEnvironment('production')
    setIntervalDays(30)
    setAutoRotate(true)
    setVerifyAfterWrite(true)
    setDrafts([])
    setCreating(false)
    setCreatedId(null)
    setCreatedName('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const pickRegistry = async (r: { platform: string; displayName: string; capability: string }) => {
    try {
      const created = await createConnectorMut.mutateAsync({
        platform: r.platform,
        displayName: r.displayName,
        capability: r.capability as never,
      })
      await utils.connectors.list.invalidate()
      if (created) {
        setConnector({
          id: Number(created.id),
          platform: created.platform,
          displayName: created.displayName,
          capability: created.capability,
        })
      }
      toastSuccess(`Connector added: ${r.displayName}`)
    } catch (err) {
      toastError('Could not add connector', (err as Error).message)
    }
  }

  const finish = async () => {
    if (!connector || !name.trim()) return
    setCreating(true)
    const policy: RotationPolicy = {
      intervalHours: Math.max(1, intervalDays * 24),
      autoRotate,
      verifyAfterWrite,
    }
    try {
      const secret = await createSecretMut.mutateAsync({
        name: name.trim(),
        connectorId: connector.id,
        environment,
        policy,
      })
      if (secret) {
        for (const d of drafts) {
          await upsertTargetMut.mutateAsync({
            secretId: Number(secret.id),
            kind: d.kind,
            config: d.config,
            enabled: true,
          })
        }
        setCreatedId(Number(secret.id))
        setCreatedName(secret.name)
      }
      utils.secrets.list.invalidate()
      setDir(1)
      setStep(3)
    } catch (err) {
      toastError('Could not track secret', (err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const canContinue =
    step === 0 ? connector != null : step === 1 ? name.trim().length > 0 && intervalDays >= 1 : true

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !creating && close()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="panel-light fixed left-1/2 top-1/2 z-[110] flex max-h-[86dvh] w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-modal border border-line-subtle bg-raised shadow-pop"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-[-0.015em] text-ink-primary">
                  Track a secret
                </h2>
                {step < 3 && (
                  <p className="text-mono-s mt-0.5 text-ink-muted">
                    step {step + 1} of 3 · {STEP_TITLES[step]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                {step < 3 && (
                  <div className="flex items-center gap-1.5">
                    {STEP_TITLES.map((t, i) => (
                      <span
                        key={t}
                        className={cn(
                          'size-1.5 rounded-full transition-colors duration-200',
                          i <= step ? 'bg-spin' : 'bg-line-strong',
                        )}
                      />
                    ))}
                  </div>
                )}
                <button
                  onClick={() => !creating && close()}
                  aria-label="Close"
                  className="rounded-control p-1.5 text-ink-muted hover:bg-panel hover:text-ink-primary"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 40 * dir }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 * dir }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* ---------------- Step 1: connector ---------------- */}
                  {step === 0 && (
                    <div>
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                        <input
                          value={connSearch}
                          onChange={(e) => setConnSearch(e.target.value)}
                          placeholder="search connectors…"
                          className={cn(inputCls, 'pl-9')}
                        />
                      </div>

                      {connectorsQuery.isLoading && (
                        <div className="grid grid-cols-2 gap-2.5">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-14 animate-pulse rounded-control bg-inset" />
                          ))}
                        </div>
                      )}

                      {(['programmatic', 'partial', 'update_only'] as const).map((cap) => {
                        const rows = existing[cap]
                        if (!rows || rows.length === 0) return null
                        return (
                          <div key={cap} className="mb-4">
                            <div className="text-label mb-2 text-ink-muted">
                              {cap === 'update_only' ? 'Update-only' : cap}
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              {rows.map((c) => {
                                const selected = connector?.id === c.id
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => setConnector(c)}
                                    className={cn(
                                      'relative flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-left transition-colors',
                                      selected
                                        ? 'border-spin bg-spin/5'
                                        : 'border-line-subtle bg-inset hover:border-line-strong',
                                    )}
                                  >
                                    <ConnectorTile platform={c.platform} displayName={c.displayName} size={24} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[13px] text-ink-primary">
                                        {c.displayName}
                                      </span>
                                      <span className="text-mono-s text-ink-muted">
                                        {c.secretCount ?? 0} secret{c.secretCount === 1 ? '' : 's'}
                                      </span>
                                    </span>
                                    {selected && (
                                      <span className="flex size-4 items-center justify-center rounded-full bg-spin text-[#06231A]">
                                        <Check className="size-3" />
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      {missingRegistry.length > 0 && (
                        <div>
                          <div className="text-label mb-2 text-ink-muted">Add a connector</div>
                          <div className="flex flex-wrap gap-1.5">
                            {missingRegistry.map((r) => (
                              <button
                                key={r.platform}
                                onClick={() => pickRegistry(r)}
                                disabled={createConnectorMut.isPending}
                                className="flex items-center gap-1.5 rounded-chip border border-dashed border-line-strong px-2.5 py-1.5 text-[12px] text-ink-secondary transition-colors hover:border-spin-dim hover:text-spin disabled:opacity-50"
                              >
                                <Plus className="size-3" />
                                {r.displayName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---------------- Step 2: details + policy ---------------- */}
                  {step === 1 && (
                    <div className="space-y-4">
                      {connector && (
                        <div className="flex items-center gap-2.5 rounded-control border border-line-subtle bg-inset px-3 py-2.5">
                          <ConnectorTile platform={connector.platform} displayName={connector.displayName} size={22} />
                          <span className="text-[13px] text-ink-primary">{connector.displayName}</span>
                          <CapabilityBadge capability={toCapability(connector.capability)} className="ml-auto" />
                        </div>
                      )}
                      <Field label="Secret name">
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="prod-stripe-live-key"
                          className={inputCls}
                          autoFocus
                        />
                      </Field>
                      <Field label="Environment">
                        <select
                          value={environment}
                          onChange={(e) => setEnvironment(e.target.value)}
                          className={cn(selectCls, 'w-full')}
                        >
                          {['production', 'staging', 'development', 'preview'].map((env) => (
                            <option key={env} value={env}>
                              {env}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="rounded-card border border-line-subtle bg-inset p-4">
                        <div className="text-label mb-3 text-ink-muted">Rotation policy</div>
                        <Field label={`Rotate every ${intervalDays} day${intervalDays === 1 ? '' : 's'}`}>
                          <input
                            type="range"
                            min={1}
                            max={90}
                            value={intervalDays}
                            onChange={(e) => setIntervalDays(Number(e.target.value))}
                            className="w-full accent-[#2EE6A8]"
                          />
                        </Field>
                        <div className="mt-3 divide-y divide-line-subtle/60">
                          <Toggle checked={autoRotate} onChange={setAutoRotate} label="Auto-rotate" />
                          <Toggle
                            checked={verifyAfterWrite}
                            onChange={setVerifyAfterWrite}
                            label="Verify after write"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] leading-4 text-ink-muted">
                        Autorotate rotates through the connector API — plaintext is never stored, only a
                        sha256 fingerprint of each version.
                      </p>
                    </div>
                  )}

                  {/* ---------------- Step 3: targets ---------------- */}
                  {step === 2 && (
                    <div className="space-y-4">
                      <p className="text-[13px] leading-5 text-ink-secondary">
                        Where should the rotated value be delivered? Targets are optional — you can
                        bind them later from the drawer or the Targets page.
                      </p>
                      {drafts.length > 0 && (
                        <ul className="space-y-2">
                          {drafts.map((d, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-3 rounded-control border border-line-subtle bg-inset px-3 py-2"
                            >
                              <TargetKindChip kind={d.kind} />
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-secondary">
                                {d.label}
                              </span>
                              <button
                                aria-label="Remove target"
                                onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                                className="rounded-control p-1 text-ink-muted hover:text-danger"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <TargetDraftForm
                        onAdd={(d) => setDrafts((ds) => [...ds, d])}
                      />
                    </div>
                  )}

                  {/* ---------------- Success ---------------- */}
                  {step === 3 && (
                    <div className="flex flex-col items-center py-8 text-center">
                      <span className="relative flex size-16 items-center justify-center">
                        <span className="dial-conic absolute inset-0 rounded-full opacity-30 [mask:radial-gradient(farthest-side,transparent_calc(100%-3px),#000_calc(100%-3px))]" />
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          className="flex size-10 items-center justify-center rounded-full bg-spin text-[#06231A]"
                        >
                          <Check className="size-5" />
                        </motion.span>
                      </span>
                      <h3 className="mt-4 font-display text-xl font-semibold text-ink-primary">
                        Now tracking <span className="font-mono text-lg">{createdName}</span>
                      </h3>
                      <p className="mt-1 max-w-sm text-[13px] leading-5 text-ink-secondary">
                        Policy: every {intervalDays}d{autoRotate ? ' · auto-rotate' : ' · manual'}
                        {drafts.length > 0
                          ? ` · ${drafts.length} target${drafts.length === 1 ? '' : 's'} bound`
                          : ' · no targets yet'}
                      </p>
                      <div className="mt-6 flex gap-3">
                        {createdId != null && (
                          <button
                            onClick={() => {
                              rotateMut.mutate({ secretId: createdId })
                              close()
                            }}
                            disabled={rotateMut.isPending}
                            className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-[13px] font-semibold text-[#06231A] disabled:opacity-60"
                          >
                            {rotateMut.isPending ? (
                              <span className="spin-loader inline-block size-3.5" />
                            ) : (
                              <RotateCw className="size-4" />
                            )}
                            Run first rotation now
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (createdId != null) onCreated?.(createdId)
                            close()
                          }}
                          className="rounded-control border border-line-subtle px-4 py-2 text-[13px] font-medium text-ink-secondary hover:border-line-strong hover:text-ink-primary"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* footer */}
            {step < 3 && (
              <div className="flex items-center justify-between border-t border-line-subtle px-6 py-4">
                <button
                  onClick={() => (step === 0 ? close() : goTo(step - 1))}
                  disabled={creating}
                  className="flex items-center gap-1.5 rounded-control border border-line-subtle px-4 py-2 text-[13px] font-medium text-ink-secondary hover:border-line-strong hover:text-ink-primary disabled:opacity-50"
                >
                  <ArrowLeft className="size-3.5" />
                  {step === 0 ? 'Cancel' : 'Back'}
                </button>
                {step < 2 ? (
                  <button
                    onClick={() => canContinue && goTo(step + 1)}
                    disabled={!canContinue}
                    className="flex items-center gap-1.5 rounded-control bg-spin px-4 py-2 text-[13px] font-semibold text-[#06231A] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue
                    <ArrowRight className="size-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={finish}
                    disabled={creating}
                    className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-[13px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-60"
                  >
                    {creating && <span className="spin-loader inline-block size-3.5" />}
                    {creating ? 'Tracking…' : 'Start tracking'}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

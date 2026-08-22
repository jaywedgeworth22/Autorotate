import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Download,
  LayoutGrid,
  Plus,
  Rows3,
  ScanSearch,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import {
  ConfirmRotationModal,
  EmptyState,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
} from '@/components/primitives'
import type { RotationSummary } from '@/components/primitives'
import { SECRET_STATUSES, type SecretStatus, type SecretWithRelations } from '@contracts/topspin'
import { SecretDetailDrawer, UntrackConfirm } from '@/components/secrets/SecretDetailDrawer'
import { SecretsCards, SecretsTable } from '@/components/secrets/SecretsTable'
import { TrackSecretWizard } from '@/components/secrets/TrackSecretWizard'
import { policySummary, selectCls } from '@/components/secrets/shared'

const PAGE_SIZE = 12

const STATUS_LABELS: Record<SecretStatus, string> = {
  healthy: 'Healthy',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  paused: 'Paused',
  rotating: 'Rotating',
  failed: 'Failed',
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function Toolbar({
  search,
  onSearch,
  status,
  onStatus,
  connectorId,
  onConnectorId,
  environment,
  onEnvironment,
  environments,
  connectors,
  view,
  onView,
  onExport,
  hasFilters,
  onClear,
}: {
  search: string
  onSearch: (v: string) => void
  status: SecretStatus | undefined
  onStatus: (v: SecretStatus | undefined) => void
  connectorId: number | undefined
  onConnectorId: (v: number | undefined) => void
  environment: string | undefined
  onEnvironment: (v: string | undefined) => void
  environments: string[]
  connectors: { id: number; displayName: string }[]
  view: 'table' | 'cards'
  onView: (v: 'table' | 'cards') => void
  onExport: () => void
  hasFilters: boolean
  onClear: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-16 z-20 -mx-2 flex flex-wrap items-center gap-2.5 bg-abyss/90 px-2 py-3 backdrop-blur"
    >
      <div className="relative w-full sm:w-[320px]">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="search name, fingerprint, connector…"
          className="w-full rounded-control border border-line-subtle bg-inset py-2 pl-9 pr-8 font-mono text-[13px] leading-5 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-spin-dim focus:shadow-[0_0_0_2px_rgba(46,230,168,0.16)]"
        />
        {search && (
          <button
            aria-label="Clear search"
            onClick={() => onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink-primary"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <select
        value={status ?? ''}
        onChange={(e) => onStatus((e.target.value || undefined) as SecretStatus | undefined)}
        className={selectCls}
      >
        <option value="">All statuses</option>
        {SECRET_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        value={connectorId ?? ''}
        onChange={(e) => onConnectorId(e.target.value ? Number(e.target.value) : undefined)}
        className={selectCls}
      >
        <option value="">All connectors</option>
        {connectors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName}
          </option>
        ))}
      </select>

      <select
        value={environment ?? ''}
        onChange={(e) => onEnvironment(e.target.value || undefined)}
        className={selectCls}
      >
        <option value="">All environments</option>
        {environments.map((env) => (
          <option key={env} value={env}>
            {env}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          onClick={onClear}
          className="text-mono-s rounded-chip border border-line-subtle px-2.5 py-1.5 text-ink-muted transition-colors hover:border-line-strong hover:text-spin"
        >
          clear filters
        </button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <div className="flex rounded-control border border-line-subtle bg-inset p-0.5">
          <button
            aria-label="Table view"
            onClick={() => onView('table')}
            className={cn(
              'rounded-[8px] p-1.5 transition-colors',
              view === 'table' ? 'bg-raised text-spin' : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            <Rows3 className="size-4" />
          </button>
          <button
            aria-label="Cards view"
            onClick={() => onView('cards')}
            className={cn(
              'rounded-[8px] p-1.5 transition-colors',
              view === 'cards' ? 'bg-raised text-spin' : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
        <button
          aria-label="Export CSV"
          title="Export CSV"
          onClick={onExport}
          className="rounded-control border border-line-subtle p-2 text-ink-muted transition-colors hover:border-line-strong hover:text-ink-primary"
        >
          <Download className="size-4" />
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Secrets() {
  const utils = trpc.useUtils()

  /* filters */
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<SecretStatus | undefined>()
  const [connectorId, setConnectorId] = useState<number | undefined>()
  const [environment, setEnvironment] = useState<string | undefined>()
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(t)
  }, [search])

  const resetPage = () => setVisible(PAGE_SIZE)

  const filters = useMemo(() => {
    const f: { status?: SecretStatus; connectorId?: number; environment?: string; search?: string } = {}
    if (status) f.status = status
    if (connectorId) f.connectorId = connectorId
    if (environment) f.environment = environment
    if (debouncedSearch) f.search = debouncedSearch
    return Object.keys(f).length ? f : undefined
  }, [status, connectorId, environment, debouncedSearch])

  const hasFilters = Boolean(filters)

  /* queries */
  const listQuery = trpc.secrets.list.useQuery(filters, { refetchInterval: 30_000 })
  const allQuery = trpc.secrets.list.useQuery(undefined, { refetchInterval: 60_000 })
  const connectorsQuery = trpc.connectors.list.useQuery()

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const shown = rows.slice(0, visible)

  const environments = useMemo(() => {
    const set = new Set((allQuery.data ?? []).map((s) => s.environment))
    return [...set].sort()
  }, [allQuery.data])

  /* overlays */
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [rotationTarget, setRotationTarget] = useState<SecretWithRelations | null>(null)
  const [untrackTarget, setUntrackTarget] = useState<SecretWithRelations | null>(null)
  const [rotatingId, setRotatingId] = useState<number | null>(null)

  /* mutations */
  const invalidateAll = () => {
    utils.secrets.list.invalidate()
    utils.secrets.get.invalidate()
    utils.runs.list.invalidate()
  }

  const rotateMut = trpc.secrets.rotateNow.useMutation({
    onMutate: (vars) => setRotatingId(vars.secretId),
    onSuccess: (run, vars) => {
      const name = rows.find((r) => r.id === vars.secretId)?.name ?? `secret #${vars.secretId}`
      const fp = run.newFingerprint ? `sha256:${run.newFingerprint}` : undefined
      if (run.status === 'committed') {
        toastSuccess('Rotation committed', fp ? `${name} → new fingerprint ${fp}` : name)
      } else if (run.status === 'partial') {
        toastWarning('Rotation partially committed', run.error ?? name)
      } else {
        toastError('Rotation failed', run.error ?? name)
      }
      invalidateAll()
    },
    onError: (err) => {
      const code = (err.data as { code?: string } | undefined)?.code
      if (code === 'CONFLICT') {
        toastWarning('Already rotating', 'This secret already has a rotation in flight.')
      } else {
        toastError('Rotation failed', err.message)
      }
      invalidateAll()
    },
    onSettled: () => setRotatingId(null),
  })

  const pauseMut = trpc.secrets.update.useMutation({
    onSuccess: (_d, vars) => {
      toastInfo(vars.status === 'paused' ? 'Policy paused' : 'Policy resumed')
      invalidateAll()
    },
    onError: (err) => toastError('Update failed', err.message),
  })

  const deleteMut = trpc.secrets.delete.useMutation({
    onSuccess: () => {
      toastSuccess('Secret untracked')
      setUntrackTarget(null)
      invalidateAll()
    },
    onError: (err) => toastError('Delete failed', err.message),
  })

  /* helpers */
  const openRotation = (s: SecretWithRelations) => setRotationTarget(s)

  const rotationSummary: RotationSummary | null = rotationTarget
    ? {
        secretName: rotationTarget.name,
        connector: rotationTarget.connector?.displayName ?? '—',
        targets: rotationTarget.targets.length
          ? rotationTarget.targets.map((t) => t.kind)
          : ['no targets bound'],
        currentFingerprint: rotationTarget.fingerprint
          ? `sha256:${rotationTarget.fingerprint}`
          : 'not rotated yet',
        policy: policySummary(rotationTarget.policyJson as never),
      }
    : null

  const exportCsv = () => {
    if (rows.length === 0) return
    const header = ['name', 'connector', 'environment', 'status', 'version', 'fingerprint', 'lastRotatedAt', 'nextDueAt', 'targets']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      header.join(','),
      ...rows.map((s) =>
        [
          esc(s.name),
          esc(s.connector?.displayName),
          esc(s.environment),
          esc(s.status),
          s.version,
          esc(s.fingerprint ? `sha256:${s.fingerprint}` : ''),
          esc(s.lastRotatedAt ? new Date(s.lastRotatedAt).toISOString() : ''),
          esc(s.nextDueAt ? new Date(s.nextDueAt).toISOString() : ''),
          esc(s.targets.map((t) => t.kind).join('|')),
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'topspin-secrets.csv'
    a.click()
    URL.revokeObjectURL(url)
    toastInfo('CSV exported', `${rows.length} secrets`)
  }

  const clearFilters = () => {
    setSearch('')
    setStatus(undefined)
    setConnectorId(undefined)
    setEnvironment(undefined)
    resetPage()
  }

  const totalTracked = allQuery.data?.length

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
            Secrets
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            {totalTracked != null ? `${totalTracked} tracked` : '…'} · plaintext is never stored —
            fingerprints only
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => toastInfo('Connector scan import', 'Scanning connectors for unmanaged credentials is not available in this build.')}
            className="flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
          >
            <ScanSearch className="size-4" />
            Import…
          </button>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.03] active:scale-[0.97]"
          >
            <Plus className="size-4" />
            Track a secret
          </button>
        </div>
      </div>

      {/* toolbar */}
      <Toolbar
        search={search}
        onSearch={(v) => {
          setSearch(v)
          resetPage()
        }}
        status={status}
        onStatus={(v) => {
          setStatus(v)
          resetPage()
        }}
        connectorId={connectorId}
        onConnectorId={(v) => {
          setConnectorId(v)
          resetPage()
        }}
        environment={environment}
        onEnvironment={(v) => {
          setEnvironment(v)
          resetPage()
        }}
        environments={environments}
        connectors={(connectorsQuery.data ?? []).map((c) => ({ id: Number(c.id), displayName: c.displayName }))}
        view={view}
        onView={setView}
        onExport={exportCsv}
        hasFilters={hasFilters}
        onClear={clearFilters}
      />

      {/* content */}
      <div className="mt-4">
        {listQuery.isLoading && (
          <div className="overflow-hidden rounded-card border border-line-subtle bg-panel">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex h-11 items-center gap-4 border-b border-line-subtle/60 px-4 last:border-0"
              >
                <div className="size-2 animate-pulse rounded-full bg-line-strong" />
                <div className="h-3 w-40 animate-pulse rounded bg-line-strong/60" />
                <div className="h-3 w-24 animate-pulse rounded bg-line-strong/40" />
                <div className="ml-auto h-3 w-16 animate-pulse rounded bg-line-strong/40" />
              </div>
            ))}
          </div>
        )}

        {listQuery.isError && (
          <div className="rounded-card border border-danger/40 bg-danger/5 p-6 text-[13px] text-danger">
            Failed to load secrets — {listQuery.error.message}
            <button
              onClick={() => listQuery.refetch()}
              className="mt-2 block text-spin underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {listQuery.isSuccess && rows.length === 0 && (
          <div className="rounded-card border border-line-subtle bg-panel">
            {hasFilters ? (
              <EmptyState
                title="No secrets match"
                body="Try a different search or clear the active filters."
                action={
                  <button
                    onClick={clearFilters}
                    className="text-[13px] font-medium text-spin underline underline-offset-4"
                  >
                    clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                title="No secrets tracked yet"
                body="Connect a platform and track your first secret — TopSpin rotates it on schedule and only stores its fingerprint."
                action={
                  <button
                    onClick={() => setWizardOpen(true)}
                    className="flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A]"
                  >
                    <Plus className="size-4" />
                    Track a secret
                  </button>
                }
              />
            )}
          </div>
        )}

        {listQuery.isSuccess && rows.length > 0 && (
          <>
            {view === 'table' ? (
              <SecretsTable
                rows={shown}
                rotatingId={rotatingId}
                onOpen={(s) => setSelectedId(s.id)}
                onRotate={openRotation}
                onTogglePause={(s) =>
                  pauseMut.mutate({ id: s.id, status: s.status === 'paused' ? 'healthy' : 'paused' })
                }
                onUntrack={setUntrackTarget}
                empty={
                  <EmptyState
                    title="No secrets match"
                    action={
                      <button
                        onClick={clearFilters}
                        className="text-[13px] font-medium text-spin underline underline-offset-4"
                      >
                        clear filters
                      </button>
                    }
                  />
                }
              />
            ) : (
              <SecretsCards
                rows={shown}
                rotatingId={rotatingId}
                onOpen={(s) => setSelectedId(s.id)}
                onRotate={openRotation}
              />
            )}

            {/* footer / load more */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-mono-s text-ink-muted">
                {shown.length === 0 ? 0 : 1}–{shown.length} of {rows.length}
                {hasFilters && totalTracked != null ? ` (filtered from ${totalTracked})` : ''}
              </span>
              {visible < rows.length && (
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="rounded-control border border-line-subtle px-4 py-2 text-[13px] font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
                >
                  Load more
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* overlays */}
      <SecretDetailDrawer
        secretId={selectedId}
        onClose={() => setSelectedId(null)}
        onRotate={(s) => setRotationTarget(s)}
      />

      {rotationSummary && rotationTarget && (
        <ConfirmRotationModal
          open={rotationTarget != null}
          onClose={() => setRotationTarget(null)}
          rotation={rotationSummary}
          onConfirm={() => rotateMut.mutate({ secretId: rotationTarget.id })}
        />
      )}

      {untrackTarget && (
        <UntrackConfirm
          open={untrackTarget != null}
          secret={untrackTarget}
          onClose={() => setUntrackTarget(null)}
          onConfirm={() => deleteMut.mutate({ id: untrackTarget.id })}
          busy={deleteMut.isPending}
        />
      )}

      <TrackSecretWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  )
}

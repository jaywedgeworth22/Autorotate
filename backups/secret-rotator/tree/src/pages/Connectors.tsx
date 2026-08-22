import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Search } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { CapabilityBadge, EmptyState } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { toPrimitiveCapability, type PrimitiveCapability } from '@/components/connectors/data'
import { ConnectorCard, ConnectorCardSkeleton } from '@/components/connectors/ConnectorCard'
import { ConnectorDrawer, type ConnectorEntry } from '@/components/connectors/ConnectorDrawer'
import { ConnectModal, type ConnectTarget } from '@/components/connectors/ConnectModal'
import { RequestConnectorModal } from '@/components/connectors/RequestConnectorModal'

const LEGEND: { cap: PrimitiveCapability; text: string }[] = [
  {
    cap: 'programmatic',
    text: 'TopSpin mints, verifies, and revokes credentials via the provider API. Fully hands-off.',
  },
  {
    cap: 'partial',
    text: 'Creation is automated; revocation or scoping needs a follow-up step TopSpin schedules for you.',
  },
  {
    cap: 'update-only',
    text: "The provider can't mint keys via API. You supply the new value; TopSpin drives delivery, verification, and audit.",
  },
]

type Filter = 'all' | 'connected' | 'not-connected' | PrimitiveCapability

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'connected', label: 'Connected' },
  { key: 'not-connected', label: 'Not connected' },
  { key: 'programmatic', label: 'Programmatic' },
  { key: 'partial', label: 'Partial' },
  { key: 'update-only', label: 'Update-only' },
]

export default function Connectors() {
  const registryQuery = trpc.connectors.registry.useQuery()
  const listQuery = trpc.connectors.list.useQuery()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [drawerPlatform, setDrawerPlatform] = useState<string | null>(null)
  const [connectTarget, setConnectTarget] = useState<ConnectTarget | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)

  const entries: ConnectorEntry[] = useMemo(() => {
    const registry = registryQuery.data ?? []
    const instances = listQuery.data ?? []
    const byPlatform = new Map(instances.map((c) => [c.platform, c]))
    return registry.map((r) => {
      const inst = byPlatform.get(r.platform)
      return {
        platform: r.platform,
        displayName: inst?.displayName ?? r.displayName,
        capability: toPrimitiveCapability(r.capability),
        instance: inst
          ? {
              id: inst.id,
              status: inst.status,
              hasConfig: inst.hasConfig,
              secretCount: inst.secretCount,
              lastCheckedAt: inst.lastCheckedAt,
            }
          : undefined,
      }
    })
  }, [registryQuery.data, listQuery.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (q && !e.displayName.toLowerCase().includes(q) && !e.platform.includes(q)) return false
      switch (filter) {
        case 'all':
          return true
        case 'connected':
          return !!e.instance && e.instance.status === 'connected'
        case 'not-connected':
          return !e.instance || e.instance.status !== 'connected'
        default:
          return e.capability === filter
      }
    })
  }, [entries, search, filter])

  const connectedCount = entries.filter((e) => e.instance?.status === 'connected').length
  const isLoading = registryQuery.isLoading || listQuery.isLoading
  const loadError = registryQuery.error ?? listQuery.error
  const drawerEntry = entries.find((e) => e.platform === drawerPlatform) ?? null

  const openConnect = (entry: ConnectorEntry) => {
    setConnectTarget({
      platform: entry.platform,
      displayName: entry.displayName,
      capability: entry.capability,
      existingId: entry.instance?.id,
      hasConfig: entry.instance?.hasConfig,
    })
  }

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-8">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
          Connectors
        </h1>
        <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
          {entries.length} platforms · {connectedCount} connected · capability ranges from full
          programmatic rotation to guided update-only.
        </p>
      </motion.div>

      {/* capability legend */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.08 }}
        className="mt-5 grid gap-3 md:grid-cols-3"
      >
        {LEGEND.map((l, i) => (
          <motion.div
            key={l.cap}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 300, damping: 24 }}
            className="rounded-card border border-line-subtle bg-panel p-3.5"
          >
            <CapabilityBadge capability={l.cap} />
            <p className="mt-2 text-[13px] leading-5 text-ink-secondary">{l.text}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.14 }}
        className="mt-6 flex flex-wrap items-center gap-3"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search connectors…"
            className="h-9 w-64 rounded-control border border-line-subtle bg-inset pl-9 pr-3 font-mono text-[13px] text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-spin-dim focus:ring-2 focus:ring-spin-glow"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-chip border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
                filter === f.key
                  ? 'border-spin-dim bg-spin/10 text-spin'
                  : 'border-line-subtle text-ink-muted hover:border-line-strong hover:text-ink-secondary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* grid */}
      <div className="mt-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ConnectorCardSkeleton key={i} />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-card border border-danger/40 bg-danger/5 p-8 text-center">
            <p className="text-sm text-danger">Failed to load connectors: {loadError.message}</p>
            <button
              onClick={() => {
                registryQuery.refetch()
                listQuery.refetch()
              }}
              className="mt-3 rounded-control border border-line-subtle px-4 py-2 text-sm text-ink-secondary hover:border-line-strong hover:text-ink-primary"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-card border border-line-subtle bg-panel">
            <EmptyState
              title="No connectors match"
              body="Try clearing the search or switching the capability filter."
              action={
                <button
                  onClick={() => {
                    setSearch('')
                    setFilter('all')
                  }}
                  className="rounded-control border border-line-subtle px-4 py-2 text-sm text-ink-secondary hover:border-line-strong hover:text-ink-primary"
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((entry) => (
                <ConnectorCard
                  key={entry.platform}
                  entry={entry}
                  onOpen={() => setDrawerPlatform(entry.platform)}
                  onConnect={() => openConnect(entry)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* bottom band */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.3 }}
        className="mt-10 flex flex-wrap items-center gap-4 border-t border-line-subtle pt-6"
      >
        <p className="text-[13px] text-ink-secondary">Don't see your platform?</p>
        <button
          onClick={() => setRequestOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-control border border-line-subtle px-3.5 py-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
        >
          Request a connector <ArrowRight className="size-3.5" />
        </button>
        <span className="text-mono-s ml-auto text-ink-muted">
          generic REST covers any HTTPS API today
        </span>
      </motion.div>

      {/* overlays */}
      <ConnectorDrawer
        entry={drawerEntry}
        onClose={() => setDrawerPlatform(null)}
        onConfigure={(entry) => {
          setDrawerPlatform(null)
          openConnect(entry)
        }}
      />
      <ConnectModal
        open={!!connectTarget}
        onClose={() => setConnectTarget(null)}
        target={connectTarget}
      />
      <RequestConnectorModal open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  )
}

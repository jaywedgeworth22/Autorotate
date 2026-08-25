import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Cloud, FileKey2, KeyRound, Plus, Webhook } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { StatusDot } from '@/components/primitives'
import { cn } from '@/lib/utils'
import type { TargetKind } from '@contracts/autorotate'
import { flattenTargets, groupTargets, KIND_LABEL, type BoundTarget, type TargetGroup } from '@/components/targets/data'
import { GroupTable } from '@/components/targets/GroupTable'
import { KeychainTab } from '@/components/targets/KeychainTab'
import { TargetWizard, type WizardRequest } from '@/components/targets/TargetWizard'
import { DeliveryDrawer } from '@/components/targets/DeliveryDrawer'
import { AlertSettingsModal } from '@/components/targets/AlertSettingsModal'

const TABS: { kind: TargetKind; icon: typeof Cloud }[] = [
  { kind: 'infisical', icon: Cloud },
  { kind: 'file', icon: FileKey2 },
  { kind: 'webhook', icon: Webhook },
  { kind: 'keychain', icon: KeyRound },
]

const EMPTY_COPY: Record<'infisical' | 'file' | 'webhook', { title: string; body: string }> = {
  infisical: {
    title: 'No Infisical workspaces bound',
    body: 'Add an Infisical workspace target to push rotated values into your workspace.',
  },
  file: {
    title: 'No file targets bound',
    body: 'Deliver rotated values into .env, JSON, YAML, TOML, or INI files via the Autorotate agent.',
  },
  webhook: {
    title: 'No webhooks bound',
    body: 'POST rotation events (and optional value references) to any HTTPS endpoint.',
  },
}

function TableSkeleton() {
  return (
    <div className="rounded-card border border-line-subtle bg-panel p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mb-2 h-11 animate-pulse rounded bg-raised last:mb-0" />
      ))}
    </div>
  )
}

export default function Targets() {
  const secretsQuery = trpc.secrets.list.useQuery()
  const [tab, setTab] = useState<TargetKind>('infisical')
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  const [wizard, setWizard] = useState<WizardRequest | null>(null)
  const [historyGroup, setHistoryGroup] = useState<TargetGroup | null>(null)

  const allTargets = useMemo(() => flattenTargets(secretsQuery.data ?? []), [secretsQuery.data])
  const groups = useMemo(
    () => ({
      infisical: groupTargets('infisical', allTargets),
      file: groupTargets('file', allTargets),
      webhook: groupTargets('webhook', allTargets),
      keychain: groupTargets('keychain', allTargets),
    }),
    [allTargets],
  )

  const counts: Record<TargetKind, number> = {
    infisical: groups.infisical.length,
    file: groups.file.length,
    webhook: groups.webhook.length,
    keychain: allTargets.filter((t) => t.kind === 'keychain').length,
  }
  const totalTargets = allTargets.length

  const kindStatus = (kind: TargetKind): { state: 'healthy' | 'due-soon' | 'overdue' | 'paused'; label: string } => {
    if (kind === 'keychain') {
      return counts.keychain > 0
        ? { state: 'healthy', label: 'delegated to companions' }
        : { state: 'paused', label: 'no items' }
    }
    const gs = groups[kind as 'infisical' | 'file' | 'webhook']
    if (gs.length === 0) return { state: 'paused', label: 'none configured' }
    const failing = gs.filter((g) => g.status === 'failed').length
    if (failing > 0) return { state: 'overdue', label: `${failing} failing` }
    if (gs.some((g) => g.status === 'pending')) return { state: 'due-soon', label: 'pending verification' }
    return { state: 'healthy', label: 'healthy' }
  }

  const openEdit = (target: BoundTarget) =>
    setWizard({ mode: 'edit', kind: target.kind, target })

  const isLoading = secretsQuery.isLoading

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-8">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
            Targets
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            {totalTargets} delivery target{totalTargets === 1 ? '' : 's'} · every rotation is only
            done when every target confirms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAlertModalOpen(true)}
            className="flex items-center gap-2 rounded-control border border-line-subtle px-3.5 py-2 text-xs font-medium text-ink-secondary hover:border-line-strong hover:text-ink-primary"
          >
            <Bell className="size-3.5 text-spin" />
            Alert Webhooks
          </button>
          <div className="relative" ref={addRef}>
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <Plus className="size-4" />
              Add target
            </button>
          <AnimatePresence>
            {addOpen && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setAddOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 z-[70] mt-2 w-56 rounded-card border border-line-subtle bg-raised p-1.5 shadow-pop"
                >
                  {TABS.map((t) => (
                    <button
                      key={t.kind}
                      onClick={() => {
                        setAddOpen(false)
                        setWizard({ mode: 'add', kind: t.kind })
                      }}
                      className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[13px] text-ink-secondary transition-colors hover:bg-panel hover:text-ink-primary"
                    >
                      <t.icon className="size-4 text-ink-muted" />
                      {KIND_LABEL[t.kind]}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* summary strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TABS.map((t, i) => {
          const s = kindStatus(t.kind)
          const label =
            t.kind === 'infisical'
              ? `${counts.infisical} workspace${counts.infisical === 1 ? '' : 's'}`
              : t.kind === 'file'
                ? `${counts.file} path${counts.file === 1 ? '' : 's'}`
                : t.kind === 'webhook'
                  ? `${counts.webhook} endpoint${counts.webhook === 1 ? '' : 's'}`
                  : `${counts.keychain} item${counts.keychain === 1 ? '' : 's'}`
          return (
            <motion.button
              key={t.kind}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.2 }}
              onClick={() => setTab(t.kind)}
              className={cn(
                'panel-light rounded-xl border bg-panel p-4 text-left transition-colors',
                tab === t.kind
                  ? 'border-spin-dim'
                  : 'border-line-subtle hover:border-line-strong',
              )}
            >
              <div className="flex items-center gap-2">
                <t.icon className="size-4 text-ink-muted" />
                <span className="text-label text-ink-muted">{KIND_LABEL[t.kind]}</span>
              </div>
              <div className="tnum mt-2 font-mono text-xl font-medium leading-7 text-ink-primary">
                {label}
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.07 + 0.2 }}
                className="mt-1"
              >
                <StatusDot state={s.state} label={s.label} />
              </motion.div>
            </motion.button>
          )
        })}
      </div>

      {/* tabs */}
      <div className="mt-8 border-b border-line-subtle">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.kind}
              onClick={() => setTab(t.kind)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors',
                tab === t.kind ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary',
              )}
            >
              {KIND_LABEL[t.kind]}
              <span
                className={cn(
                  'text-mono-s rounded-chip border px-1.5 py-0.5',
                  tab === t.kind
                    ? 'border-spin-dim text-spin'
                    : 'border-line-subtle text-ink-muted',
                )}
              >
                {counts[t.kind]}
              </span>
              {tab === t.kind && (
                <motion.span
                  layoutId="targets-tab-underline"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-spin"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* tab content */}
      <div className="mt-5">
        {isLoading ? (
          <TableSkeleton />
        ) : secretsQuery.error ? (
          <div className="rounded-card border border-danger/40 bg-danger/5 p-8 text-center">
            <p className="text-sm text-danger">Failed to load targets: {secretsQuery.error.message}</p>
            <button
              onClick={() => secretsQuery.refetch()}
              className="mt-3 rounded-control border border-line-subtle px-4 py-2 text-sm text-ink-secondary hover:border-line-strong hover:text-ink-primary"
            >
              Retry
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {tab === 'keychain' ? (
                <KeychainTab targets={allTargets.filter((t) => t.kind === 'keychain')} />
              ) : (
                <div className="space-y-4">
                  {tab === 'file' && groups.file.length > 0 && (
                    <p className="rounded-card border border-info/40 bg-info/5 px-4 py-3 text-[13px] leading-5 text-ink-secondary" style={{ borderLeftWidth: 3, borderLeftColor: '#5EA8FF' }}>
                      File targets are written by the Autorotate agent or companion on that machine —
                      values travel encrypted end-to-end; the web console never sees file contents.
                    </p>
                  )}
                  <GroupTable
                    groups={groups[tab]}
                    kind={tab}
                    onEdit={openEdit}
                    onHistory={setHistoryGroup}
                    emptyTitle={EMPTY_COPY[tab].title}
                    emptyBody={EMPTY_COPY[tab].body}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* overlays */}
      <TargetWizard request={wizard} onClose={() => setWizard(null)} />
      <DeliveryDrawer group={historyGroup} onClose={() => setHistoryGroup(null)} />
      <AlertSettingsModal open={alertModalOpen} onClose={() => setAlertModalOpen(false)} />
    </div>
  )
}

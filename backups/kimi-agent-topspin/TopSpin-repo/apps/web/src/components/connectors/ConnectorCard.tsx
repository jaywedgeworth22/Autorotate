import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { CapabilityBadge, StatusDot } from '@/components/primitives'
import { platformMeta, statusToDot, timeAgo } from './data'
import { BrandTile, PrimaryButton } from './ui'
import type { ConnectorEntry } from './ConnectorDrawer'

export function ConnectorCard({
  entry,
  onOpen,
  onConnect,
}: {
  entry: ConnectorEntry
  onOpen: () => void
  onConnect: () => void
}) {
  const meta = platformMeta(entry.platform)
  const inst = entry.instance
  const dot = inst ? statusToDot(inst.status) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className="panel-light group flex min-h-[200px] cursor-pointer flex-col rounded-card border border-line-subtle bg-panel p-5 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong"
    >
      <div className="flex items-start justify-between">
        <BrandTile
          glyph={meta.tile}
          size={40}
          className="transition-colors duration-200 group-hover:border-spin-dim group-hover:text-spin"
        />
        <span className="transition-[filter] duration-200 group-hover:drop-shadow-[0_0_8px_rgba(46,230,168,0.35)]">
          <CapabilityBadge capability={entry.capability} />
        </span>
      </div>

      <h3 className="mt-3 font-sans text-base font-semibold leading-[22px] tracking-[-0.01em] text-ink-primary">
        {entry.displayName}
      </h3>
      <p className="mt-0.5 truncate text-[13px] leading-5 text-ink-secondary">{meta.tagline}</p>

      <p className="text-mono-s mt-3 text-ink-muted">
        {inst
          ? `${inst.secretCount} secret${inst.secretCount === 1 ? '' : 's'} tracked · verified ${timeAgo(inst.lastCheckedAt)}`
          : 'not connected'}
      </p>

      <div className="mt-auto flex items-center justify-between pt-4">
        {inst && dot ? (
          <>
            <StatusDot state={dot.state} label={dot.label} />
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-secondary transition-colors group-hover:text-spin">
              Configure <ArrowRight className="size-3.5" />
            </span>
          </>
        ) : (
          <PrimaryButton
            className="px-3 py-1.5 text-[13px]"
            onClick={(e) => {
              e.stopPropagation()
              onConnect()
            }}
          >
            Connect
          </PrimaryButton>
        )}
      </div>
    </motion.div>
  )
}

export function ConnectorCardSkeleton() {
  return (
    <div className="flex min-h-[200px] flex-col rounded-card border border-line-subtle bg-panel p-5">
      <div className="flex items-start justify-between">
        <div className="size-10 animate-pulse rounded-[10px] bg-raised" />
        <div className="h-5 w-24 animate-pulse rounded-chip bg-raised" />
      </div>
      <div className="mt-3 h-5 w-32 animate-pulse rounded bg-raised" />
      <div className="mt-2 h-4 w-44 animate-pulse rounded bg-raised" />
      <div className="mt-auto pt-4">
        <div className="h-4 w-28 animate-pulse rounded bg-raised" />
      </div>
    </div>
  )
}

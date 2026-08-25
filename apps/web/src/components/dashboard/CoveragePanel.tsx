import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { SecretWithRelations, StatsOverview } from '@contracts/autorotate'
import { cn } from '@/lib/utils'
import { ConnectorTile } from './DueQueue'

interface CoverageRow {
  connectorId: number
  platform: string
  displayName: string
  total: number
  healthy: number
  dueSoon: number
  overdue: number
  failed: number
  status: string
}

export function CoveragePanel({
  coverage,
  secrets,
}: {
  coverage: StatsOverview['coverageByConnector']
  secrets: SecretWithRelations[]
}) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  const rows = useMemo<CoverageRow[]>(() => {
    const byConnector = new Map<number, { healthy: number; dueSoon: number; overdue: number; failed: number }>()
    for (const s of secrets) {
      const agg = byConnector.get(s.connectorId) ?? { healthy: 0, dueSoon: 0, overdue: 0, failed: 0 }
      if (s.status === 'healthy') agg.healthy += 1
      else if (s.status === 'due_soon') agg.dueSoon += 1
      else if (s.status === 'overdue') agg.overdue += 1
      else if (s.status === 'failed') agg.failed += 1
      else agg.healthy += 1 // paused/rotating don't count against coverage
      byConnector.set(s.connectorId, agg)
    }
    return coverage
      .map((c) => {
        const agg = byConnector.get(c.connectorId) ?? { healthy: 0, dueSoon: 0, overdue: 0, failed: 0 }
        return {
          connectorId: c.connectorId,
          platform: c.platform,
          displayName: c.displayName,
          total: c.secretCount,
          ...agg,
          status: c.status,
        }
      })
      .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName))
  }, [coverage, secrets])

  const visible = expanded ? rows : rows.slice(0, 5)

  return (
    <section className="panel-light flex flex-col rounded-card border border-line-subtle bg-panel">
      <header className="flex items-center border-b border-line-subtle px-5 py-4">
        <h2 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.015em] text-ink-primary">
          Coverage
        </h2>
        <span className="text-mono-s ml-3 text-ink-muted">{rows.length} connectors</span>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
          No connectors yet — add one to start tracking secrets.
        </p>
      ) : (
        <ul className="flex-1 px-5 py-3">
          {visible.map((row, i) => {
            const pct = row.total === 0 ? 100 : Math.round((row.healthy / row.total) * 100)
            const tone =
              row.overdue > 0 || row.failed > 0 || row.status === 'error'
                ? 'bg-danger'
                : row.dueSoon > 0
                  ? 'bg-warn'
                  : 'bg-spin'
            const caption =
              row.overdue > 0
                ? `${row.overdue} overdue`
                : row.failed > 0
                  ? `${row.failed} failed`
                  : row.dueSoon > 0
                    ? `${row.dueSoon} due`
                    : null
            return (
              <motion.li
                key={row.connectorId}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: Math.min(i * 0.06, 0.6), duration: 0.25 }}
              >
                <button
                  onClick={() => navigate(`/connectors#${row.platform}`)}
                  title={
                    caption
                      ? `${row.displayName}: ${row.healthy}/${row.total} healthy · ${caption}`
                      : `${row.displayName}: ${row.healthy}/${row.total} healthy`
                  }
                  className="group flex w-full items-center gap-3 rounded-control px-1 py-2 text-left transition-colors hover:bg-raised"
                >
                  <ConnectorTile platform={row.platform} size={32} />
                  <span className="w-32 shrink-0 truncate text-[13px] text-ink-primary">{row.displayName}</span>
                  <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-inset">
                    <motion.span
                      className={cn('absolute inset-y-0 left-0 rounded-full', tone, 'transition-colors group-hover:brightness-125')}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1], delay: Math.min(i * 0.06, 0.6) }}
                    />
                  </span>
                  <span className="text-mono-s w-20 shrink-0 text-right text-ink-muted">
                    {row.healthy}/{row.total} healthy
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
      )}

      {rows.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-mono-s flex items-center justify-center gap-1.5 border-t border-line-subtle px-5 py-3 uppercase text-ink-muted transition-colors hover:text-spin"
        >
          {expanded ? 'show fewer' : `show all ${rows.length}`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
        </button>
      )}
    </section>
  )
}

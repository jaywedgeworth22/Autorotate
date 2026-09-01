import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Link } from 'react-router'
import type { RotationRun, SecretWithRelations } from '@contracts/autorotate'
import { PipelineStepper } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { formatDuration, parseSteps, relTime, runDurationMs, toStepStates } from './lib'

const RUN_STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  committed: { text: 'committed', cls: 'text-spin' },
  running: { text: 'running', cls: 'text-info' },
  partial: { text: 'partial', cls: 'text-warn' },
  failed: { text: 'failed', cls: 'text-danger' },
}

export function RecentRuns({ runs, secrets }: { runs: RotationRun[]; secrets: SecretWithRelations[] }) {
  const navigate = useNavigate()
  const nameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of secrets) m.set(s.id, s.name)
    return m
  }, [secrets])

  const shown = runs.slice(0, 5)

  return (
    <section className="panel-light flex flex-col rounded-card border border-line-subtle bg-panel">
      <header className="flex items-center border-b border-line-subtle px-5 py-4">
        <h2 className="font-display text-[22px] font-semibold leading-7 tracking-[-0.015em] text-ink-primary">
          Recent runs
        </h2>
        <Link to="/runs" className="text-mono-s ml-auto text-ink-muted transition-colors hover:text-spin">
          view all →
        </Link>
      </header>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
          No rotation runs yet — trigger one from the due queue.
        </p>
      ) : (
        <ul className="flex-1 space-y-2 px-4 py-4">
          {shown.map((run, i) => {
            const steps = toStepStates(parseSteps(run.stepsJson))
            const status = RUN_STATUS_LABEL[run.status] ?? RUN_STATUS_LABEL.running
            return (
              <motion.li
                key={run.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  onClick={() => navigate(`/runs?run=${run.id}`)}
                  className="w-full rounded-card border border-line-subtle bg-inset px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-line-strong"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-ink-primary">run_{run.id}</span>
                    <span className={cn('text-mono-s uppercase', status.cls)}>{status.text}</span>
                    <span className="text-mono-s ml-auto text-ink-muted">{relTime(run.startedAt)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[12px] text-ink-secondary">
                      {nameById.get(run.secretId) ?? `secret #${run.secretId}`}
                    </span>
                    <span className="text-mono-s shrink-0 text-ink-muted">{formatDuration(runDurationMs(run))}</span>
                  </div>
                  <motion.div
                    className="mt-3 overflow-x-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.06, duration: 0.3 }}
                  >
                    <PipelineStepper steps={steps} nodeSize={16} />
                  </motion.div>
                </button>
              </motion.li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

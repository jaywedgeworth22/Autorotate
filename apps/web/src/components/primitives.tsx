/* eslint-disable react-refresh/only-export-components -- shared data primitives intentionally export helpers + constants alongside components */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Copy,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  CheckCircle2,
  ScrollText,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* StatusDot — 8px dot + label                                         */
/* ------------------------------------------------------------------ */

export type StatusState = 'healthy' | 'due-soon' | 'overdue' | 'paused' | 'running'

const STATUS_STYLE: Record<StatusState, { dot: string; text: string; pulse?: boolean }> = {
  healthy: { dot: 'bg-spin', text: 'text-spin' },
  'due-soon': { dot: 'bg-warn', text: 'text-warn', pulse: true },
  overdue: { dot: 'bg-danger', text: 'text-danger', pulse: true },
  paused: { dot: 'bg-ink-muted', text: 'text-ink-muted' },
  running: { dot: 'bg-info', text: 'text-info' },
}

export function StatusDot({ state, label }: { state: StatusState; label?: string }) {
  const s = STATUS_STYLE[state]
  return (
    <span className="inline-flex items-center gap-2">
      {state === 'running' ? (
        <span className="spin-loader inline-block size-2" style={{ background: 'conic-gradient(from 0deg, #5EA8FF, transparent 70%)' }} />
      ) : (
        <span
          className={cn('inline-block size-2 rounded-full', s.dot, s.pulse && 'animate-tick-pulse')}
        />
      )}
      {label && <span className={cn('text-[13px] leading-5', s.text)}>{label}</span>}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* CapabilityBadge — pill, 6px radius, Mono S uppercase                */
/* ------------------------------------------------------------------ */

export type Capability = 'programmatic' | 'partial' | 'update-only'

const CAP_STYLE: Record<Capability, string> = {
  programmatic: 'border-spin-dim text-spin',
  partial: 'border-warn/50 text-warn',
  'update-only': 'border-info/50 text-info',
}

export function CapabilityBadge({ capability, className }: { capability: Capability; className?: string }) {
  const label = capability === 'update-only' ? 'UPDATE-ONLY' : capability.toUpperCase()
  return (
    <span
      className={cn(
        'text-mono-s inline-flex items-center rounded-chip border bg-transparent px-2 py-0.5 uppercase',
        CAP_STYLE[capability],
        className,
      )}
    >
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* FingerprintChip — truncated sha256 + copy, hover shimmer            */
/* ------------------------------------------------------------------ */

export function truncateFingerprint(fp: string): string {
  const clean = fp.replace(/^sha256:/, '')
  if (clean.length <= 8) return clean
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`
}

export function FingerprintChip({ fingerprint, className }: { fingerprint: string; className?: string }) {
  const [flash, setFlash] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(fingerprint).catch(() => {})
    setFlash(true)
    window.setTimeout(() => setFlash(false), 400)
  }, [fingerprint])

  return (
    <button
      onClick={copy}
      title="Copy fingerprint"
      className={cn(
        'group relative inline-flex items-center gap-1.5 overflow-hidden rounded-chip bg-inset px-2 py-1 font-mono text-[11px] leading-4 tracking-[0.02em] text-ink-secondary transition-colors hover:text-ink-primary',
        className,
      )}
    >
      {/* hover sheen */}
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent transition-transform duration-500 group-hover:translate-x-full" />
      <span className={cn('transition-colors duration-200', flash && 'text-spin')}>
        {truncateFingerprint(fingerprint)}
      </span>
      {flash ? <Check className="size-3 text-spin" /> : <Copy className="size-3 text-ink-muted group-hover:text-ink-secondary" />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* MaskedValue — never renders real characters                         */
/* ------------------------------------------------------------------ */

export function MaskedValue({ className }: { className?: string }) {
  return (
    <span
      title="Plaintext is never stored."
      className={cn('cursor-help font-mono text-[13px] leading-5 tracking-widest text-ink-muted', className)}
    >
      •••• •••• ••••
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* HealthRing — SVG donut, 3 sizes                                     */
/* ------------------------------------------------------------------ */

const RING_SIZES = { lg: 160, md: 72, sm: 28 } as const

export function HealthRing({
  value,
  size = 'md',
  label,
  className,
}: {
  value: number // 0–100
  size?: keyof typeof RING_SIZES
  label?: string
  className?: string
}) {
  const px = RING_SIZES[size]
  const stroke = size === 'lg' ? 10 : size === 'md' ? 6 : 3
  const r = (px - stroke) / 2
  const c = 2 * Math.PI * r
  const [offset, setOffset] = useState(c)

  useEffect(() => {
    const t = window.setTimeout(() => setOffset(c - (c * Math.min(100, Math.max(0, value))) / 100), 50)
    return () => window.clearTimeout(t)
  }, [value, c])

  return (
    <span className={cn('relative inline-flex items-center justify-center', className)} style={{ width: px, height: px }}>
      <svg width={px} height={px} className="-rotate-90">
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="#1B2130" strokeWidth={stroke} />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={size === 'sm' ? '#2EE6A8' : 'url(#healthring-grad)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.33, 1, 0.68, 1)' }}
        />
        <defs>
          <linearGradient id="healthring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2EE6A8" />
            <stop offset="100%" stopColor="#178A64" />
          </linearGradient>
        </defs>
      </svg>
      {size !== 'sm' && (
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('tnum font-mono font-medium text-ink-primary', size === 'lg' ? 'text-xl leading-7' : 'text-[13px] leading-5')}>
            {Math.round(value)}%
          </span>
          {label && size === 'lg' && <span className="text-mono-s text-ink-muted">{label}</span>}
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* PipelineStepper — LOCK · ROTATE · PUSH · VERIFY · COMMIT · AUDIT    */
/* ------------------------------------------------------------------ */

export type StepState = 'pending' | 'running' | 'ok' | 'warn' | 'failed'

export const PIPELINE_STEPS = [
  { key: 'lock', label: 'LOCK', icon: Lock },
  { key: 'rotate', label: 'ROTATE', icon: RefreshCw },
  { key: 'push', label: 'PUSH', icon: Send },
  { key: 'verify', label: 'VERIFY', icon: ShieldCheck },
  { key: 'commit', label: 'COMMIT', icon: CheckCircle2 },
  { key: 'audit', label: 'AUDIT', icon: ScrollText },
] as const

export type PipelineStepDef = (typeof PIPELINE_STEPS)[number]

const NODE_STATE: Record<StepState, string> = {
  pending: 'border-line-strong text-ink-muted',
  running: 'border-info text-info animate-tick-pulse',
  ok: 'border-spin bg-spin/10 text-spin',
  warn: 'border-warn text-warn',
  failed: 'border-danger text-danger',
}

export function PipelineStepper({
  steps,
  nodeSize = 24,
  className,
}: {
  steps: StepState[]
  nodeSize?: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center', className)}>
      {PIPELINE_STEPS.map((step, i) => {
        const state: StepState = steps[i] ?? 'pending'
        const Icon: LucideIcon = step.icon
        const lineFilled = state === 'ok'
        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div className="relative h-px w-8 bg-line-subtle md:w-12" style={{ minWidth: 16 }}>
                <div
                  className="absolute inset-y-0 left-0 bg-spin transition-all duration-300"
                  style={{ width: lineFilled || state !== 'pending' ? '100%' : '0%' }}
                />
              </div>
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn('flex items-center justify-center rounded-full border bg-panel', NODE_STATE[state])}
                style={{ width: nodeSize, height: nodeSize }}
              >
                {state === 'ok' ? (
                  <Check style={{ width: nodeSize * 0.5, height: nodeSize * 0.5 }} />
                ) : state === 'failed' ? (
                  <X style={{ width: nodeSize * 0.5, height: nodeSize * 0.5 }} />
                ) : state === 'warn' ? (
                  <AlertTriangle style={{ width: nodeSize * 0.5, height: nodeSize * 0.5 }} />
                ) : (
                  <Icon style={{ width: nodeSize * 0.5, height: nodeSize * 0.5 }} />
                )}
              </div>
              <span className="text-mono-s text-ink-muted">{step.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sparkline — 60×20 SVG line, spin stroke, no axes                    */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  width = 60,
  height = 20,
  stroke = '#2EE6A8',
  className,
}: {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  className?: string
}) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2) + 1
      const y = height - 2 - ((v - min) / range) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* DataTable — sticky header, sortable, 44px rows                      */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string
  title: string | ReactNode
  sortable?: boolean
  width?: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  onRowClick,
  empty,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  onRowClick?: (row: T) => void
  empty?: ReactNode
  className?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sorted = [...rows]
  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey)
    if (col?.sortValue) {
      sorted.sort((a, b) => {
        const av = col.sortValue!(a)
        const bv = col.sortValue!(b)
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
  }

  return (
    <div className={cn('overflow-auto rounded-card border border-line-subtle bg-panel', className)}>
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="border-b border-line-subtle">
            {columns.map((col) => (
              <th key={col.key} style={{ width: col.width }} className="px-4 py-3">
                <button
                  className={cn(
                    'text-label flex items-center gap-1.5 text-ink-muted',
                    col.sortable && 'cursor-pointer hover:text-ink-secondary',
                  )}
                  disabled={!col.sortable}
                  onClick={() => {
                    if (!col.sortable) return
                    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    else {
                      setSortKey(col.key)
                      setSortDir('asc')
                    }
                  }}
                >
                  {col.title}
                  {col.sortable &&
                    (sortKey === col.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUpNarrowWide className="size-3.5 text-spin transition-transform duration-200" />
                      ) : (
                        <ArrowDownWideNarrow className="size-3.5 text-spin transition-transform duration-200" />
                      )
                    ) : (
                      <ChevronDown className="size-3.5 opacity-40" />
                    ))}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'h-11 border-b border-line-subtle/60 text-[13px] leading-5 text-ink-secondary transition-colors last:border-0 hover:bg-raised',
                onRowClick && 'cursor-pointer',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (empty ?? <div className="p-10 text-center text-sm text-ink-muted">No records.</div>)}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* DetailDrawer — right-side 480px drawer, 350ms glide                 */
/* ------------------------------------------------------------------ */

export function DetailDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[80] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="panel-light fixed right-0 top-0 z-[90] flex h-full w-full max-w-[480px] flex-col border-l border-line-subtle bg-panel shadow-pop"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
              <div className="font-display text-base font-semibold text-ink-primary">{title}</div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-control p-1.5 text-ink-muted hover:bg-raised hover:text-ink-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* EmptyState — dial outline, H3 + Body S + action                     */
/* ------------------------------------------------------------------ */

function DialOutline({ size = 96 }: { size?: number }) {
  const c = size / 2
  const r = size / 2 - 4
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (2 * Math.PI * i) / 12
    return {
      x1: c + (r - 7) * Math.cos(a),
      y1: c + (r - 7) * Math.sin(a),
      x2: c + r * Math.cos(a),
      y2: c + r * Math.sin(a),
    }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-ink-faint">
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {ticks.map((t, i) => (
        <line key={i} {...t} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ))}
      <circle cx={c} cy={c} r={3} fill="currentColor" />
    </svg>
  )
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string
  body?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-center', className)}>
      <DialOutline size={96} />
      <div>
        <h3 className="font-sans text-base font-semibold leading-[22px] tracking-[-0.01em] text-ink-primary">{title}</h3>
        {body && <p className="mt-1 max-w-sm text-[13px] leading-5 text-ink-secondary">{body}</p>}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Toast helpers — bottom-right stack, left 3px status border          */
/* ------------------------------------------------------------------ */

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

const TOAST_BORDER: Record<ToastKind, string> = {
  success: '#2EE6A8',
  error: '#F4586B',
  info: '#5EA8FF',
  warning: '#F5B84C',
}

export function showToast(kind: ToastKind, title: string, description?: string) {
  toast(title, {
    description,
    style: {
      background: '#11151F',
      border: '1px solid #1B2130',
      borderLeft: `3px solid ${TOAST_BORDER[kind]}`,
      color: '#E8ECF4',
      borderRadius: '10px',
    },
  })
}

export const toastSuccess = (t: string, d?: string) => showToast('success', t, d)
export const toastError = (t: string, d?: string) => showToast('error', t, d)
export const toastInfo = (t: string, d?: string) => showToast('info', t, d)
export const toastWarning = (t: string, d?: string) => showToast('warning', t, d)

/* ------------------------------------------------------------------ */
/* ConfirmRotationModal — hold-to-confirm (600ms press-and-hold fill)  */
/* ------------------------------------------------------------------ */

export interface RotationSummary {
  secretName: string
  connector: string
  targets: string[]
  currentFingerprint: string
  policy: string
}

export function ConfirmRotationModal({
  open,
  onClose,
  rotation,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  rotation: RotationSummary
  onConfirm?: () => void
}) {
  const [progress, setProgress] = useState(0)
  const holding = useRef(false)
  const raf = useRef<number>(0)
  const start = useRef(0)
  const tickRef = useRef<FrameRequestCallback | null>(null)

  const stop = useCallback(() => {
    holding.current = false
    cancelAnimationFrame(raf.current)
    setProgress(0)
  }, [])

  useEffect(() => {
    tickRef.current = (t: number) => {
      if (!holding.current) return
      const p = Math.min(1, (t - start.current) / 600)
      setProgress(p)
      if (p >= 1) {
        holding.current = false
        onConfirm?.()
        onClose()
        setProgress(0)
        return
      }
      if (tickRef.current) raf.current = requestAnimationFrame(tickRef.current)
    }
  }, [onConfirm, onClose])

  const begin = useCallback(() => {
    holding.current = true
    start.current = performance.now()
    if (tickRef.current) raf.current = requestAnimationFrame(tickRef.current)
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[110] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-modal border border-line-subtle bg-raised p-6 shadow-pop"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-1 flex items-center gap-2.5">
              <span className="spin-loader inline-block size-5" />
              <h2 className="font-display text-xl font-semibold tracking-[-0.015em] text-ink-primary">
                Rotate now?
              </h2>
            </div>
            <p className="mb-5 text-[13px] leading-5 text-ink-secondary">
              This runs the full pipeline immediately. The old credential is revoked on commit.
            </p>

            <dl className="space-y-3 rounded-card border border-line-subtle bg-inset p-4">
              <div className="flex justify-between gap-4">
                <dt className="text-label text-ink-muted">Secret</dt>
                <dd className="font-mono text-[13px] text-ink-primary">{rotation.secretName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-label text-ink-muted">Connector</dt>
                <dd className="text-[13px] text-ink-secondary">{rotation.connector}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-label shrink-0 text-ink-muted">Targets</dt>
                <dd className="text-right text-[13px] text-ink-secondary">{rotation.targets.join(' · ')}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-label text-ink-muted">Current</dt>
                <dd>
                  <FingerprintChip fingerprint={rotation.currentFingerprint} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-label text-ink-muted">Policy</dt>
                <dd className="text-right text-[13px] text-ink-secondary">{rotation.policy}</dd>
              </div>
            </dl>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
              >
                Cancel
              </button>
              <button
                onPointerDown={begin}
                onPointerUp={stop}
                onPointerLeave={stop}
                onKeyDown={(e) => e.key === 'Enter' && begin()}
                onKeyUp={stop}
                className="relative overflow-hidden rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] select-none"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-white/30"
                  style={{ width: `${progress * 100}%` }}
                />
                <span className="relative flex items-center gap-2">
                  <RefreshCw className="size-4" />
                  Hold to rotate
                </span>
              </button>
            </div>
            <p className="text-mono-s mt-3 text-center text-ink-muted">
              press &amp; hold 600ms to confirm · plaintext is never stored
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Modal — centered dialog with backdrop, escape listener & animations */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const maxW =
    size === 'sm'
      ? 'max-w-[420px]'
      : size === 'lg'
        ? 'max-w-[720px]'
        : size === 'xl'
          ? 'max-w-[960px]'
          : 'max-w-[560px]'

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
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              'fixed left-1/2 top-1/2 z-[110] max-h-[90vh] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-modal border border-line-subtle bg-raised p-6 shadow-pop',
              maxW,
            )}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>{title}</div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-control p-1.5 text-ink-muted hover:bg-panel hover:text-ink-primary"
              >
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}


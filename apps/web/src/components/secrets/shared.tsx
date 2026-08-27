/* eslint-disable react-refresh/only-export-components -- page-scoped data primitives intentionally export helpers + constants alongside components */
import type { ReactNode } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { FileKey2, Globe, KeyRound, Database } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Capability, StatusState } from '@/components/primitives'
import type { RotationPolicy, SecretStatus, TargetKind } from '@contracts/autorotate'

/* ------------------------------------------------------------------ */
/* Status / capability mapping (contracts → design-system primitives)  */
/* ------------------------------------------------------------------ */

export function statusDotState(status: SecretStatus): { state: StatusState; label: string } {
  switch (status) {
    case 'healthy':
      return { state: 'healthy', label: 'healthy' }
    case 'due_soon':
      return { state: 'due-soon', label: 'due soon' }
    case 'overdue':
      return { state: 'overdue', label: 'overdue' }
    case 'paused':
      return { state: 'paused', label: 'paused' }
    case 'rotating':
      return { state: 'running', label: 'rotating' }
    case 'failed':
      return { state: 'overdue', label: 'failed' }
  }
}

export function toCapability(cap: string): Capability {
  return cap === 'update_only' ? 'update-only' : cap === 'partial' ? 'partial' : 'programmatic'
}

/* ------------------------------------------------------------------ */
/* ConnectorTile — brand-letter tile                                   */
/* ------------------------------------------------------------------ */

const TILE_COLORS = ['#2EE6A8', '#5EA8FF', '#9B8CFF', '#F5B84C', '#F4586B']

function tileColor(platform: string): string {
  let h = 0
  for (let i = 0; i < platform.length; i++) h = (h * 31 + platform.charCodeAt(i)) >>> 0
  return TILE_COLORS[h % TILE_COLORS.length]
}

export function ConnectorTile({
  platform,
  displayName,
  size = 20,
  className,
}: {
  platform: string
  displayName?: string
  size?: number
  className?: string
}) {
  const letter = (displayName ?? platform).trim().charAt(0).toUpperCase() || '?'
  const color = tileColor(platform)
  return (
    <span
      title={displayName ?? platform}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-chip border border-line-subtle bg-inset font-mono font-semibold',
        className,
      )}
      style={{ width: size, height: size, color, fontSize: Math.max(9, size * 0.55) }}
    >
      {letter}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Target kind chips                                                   */
/* ------------------------------------------------------------------ */

export const TARGET_KIND_META: Record<
  TargetKind,
  { label: string; icon: LucideIcon; chip: string }
> = {
  infisical: { label: 'Infisical', icon: Database, chip: 'border-spin-dim text-spin' },
  file: { label: 'File', icon: FileKey2, chip: 'border-info/50 text-info' },
  webhook: { label: 'Webhook', icon: Globe, chip: 'border-warn/50 text-warn' },
  keychain: { label: 'Keychain', icon: KeyRound, chip: 'border-violet/50 text-violet' },
}

export function TargetKindChip({ kind, className }: { kind: TargetKind; className?: string }) {
  const meta = TARGET_KIND_META[kind]
  return (
    <span
      className={cn(
        'text-mono-s inline-flex items-center gap-1 rounded-chip border bg-transparent px-1.5 py-0.5 uppercase',
        meta.chip,
        className,
      )}
    >
      <meta.icon className="size-3" />
      {kind === 'file' ? 'file' : kind}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Toggle switch (150ms thumb slide)                                   */
/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-4 py-1.5 text-left',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span>
        <span className="block text-[13px] leading-5 text-ink-primary">{label}</span>
        {description && <span className="block text-[11px] leading-4 text-ink-muted">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150',
          checked ? 'border-spin-dim bg-spin/20' : 'border-line-strong bg-inset',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full transition-all duration-150',
            checked ? 'left-[18px] bg-spin' : 'left-[3px] bg-ink-muted',
          )}
        />
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Field — label + control wrapper                                     */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-label mb-1.5 block text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-4 text-ink-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-control border border-line-subtle bg-inset px-3 py-2 font-mono text-[13px] leading-5 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-spin-dim focus:shadow-[0_0_0_2px_rgba(46,230,168,0.16)]'

export const selectCls =
  'rounded-control border border-line-subtle bg-raised px-2.5 py-2 text-[13px] leading-5 text-ink-secondary outline-none transition-colors hover:border-line-strong focus:border-spin-dim'

/* ------------------------------------------------------------------ */
/* Formatters                                                          */
/* ------------------------------------------------------------------ */

export function relTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return '—'
  return formatDistanceToNow(date, { addSuffix: true })
}

export function durationMs(start: Date | string, end: Date | string | null | undefined): string {
  if (!end) return '—'
  const s = start instanceof Date ? start : new Date(start)
  const e = end instanceof Date ? end : new Date(end)
  const ms = e.getTime() - s.getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function policySummary(policy: Partial<RotationPolicy> | null | undefined): string {
  const hours = policy?.intervalHours ?? 24 * 30
  const base = hours % 24 === 0 ? `every ${hours / 24}d` : `every ${hours}h`
  return policy?.autoRotate === false ? `${base} · manual` : base
}

export function dueMeta(
  nextDueAt: Date | string | null | undefined,
  status: SecretStatus,
): { text: string; cls: string } {
  if (status === 'paused') return { text: 'paused', cls: 'text-ink-muted' }
  if (status === 'rotating') return { text: 'rotating…', cls: 'text-info animate-tick-pulse' }
  if (!nextDueAt) return { text: '—', cls: 'text-ink-muted' }
  const due = nextDueAt instanceof Date ? nextDueAt : new Date(nextDueAt)
  const diff = due.getTime() - Date.now()
  const dist = formatDistanceToNow(due)
  if (diff < 0) return { text: `${dist} overdue`, cls: 'text-danger animate-tick-pulse' }
  if (diff < 24 * 3600 * 1000) return { text: `in ${dist}`, cls: 'text-warn' }
  return { text: `in ${dist}`, cls: 'text-ink-muted' }
}

export function parsePolicy(json: unknown): RotationPolicy {
  const p = (json ?? {}) as Partial<RotationPolicy>
  return {
    intervalHours: typeof p.intervalHours === 'number' ? p.intervalHours : 24 * 30,
    autoRotate: p.autoRotate ?? true,
    verifyAfterWrite: p.verifyAfterWrite ?? true,
  }
}

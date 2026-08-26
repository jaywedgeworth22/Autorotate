import type { RotationRun, SecretWithRelations } from '@contracts/autorotate'
import type { RotationPolicy, RotationStep } from '@contracts/autorotate'
import type { StepState } from '@/components/primitives'

/* ------------------------------------------------------------------ */
/* Formatting helpers for the dashboard                                 */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 3600 * 1000

/** Relative timestamp like "2m ago" / "in 3d" */
export function relTime(input: Date | string | number | null | undefined): string {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = d.getTime() - Date.now()
  const abs = Math.abs(diff)
  const suffix = diff < 0 ? ' ago' : ''
  const prefix = diff > 0 ? 'in ' : ''
  const fmt = (v: number, unit: string) => `${prefix}${v}${unit}${suffix}`
  if (abs < 60_000) return diff > 0 ? 'in <1m' : 'just now'
  if (abs < 3_600_000) return fmt(Math.round(abs / 60_000), 'm')
  if (abs < DAY_MS) return fmt(Math.round(abs / 3_600_000), 'h')
  if (abs < 30 * DAY_MS) return fmt(Math.round(abs / DAY_MS), 'd')
  return fmt(Math.round(abs / (30 * DAY_MS)), 'mo')
}

/** "every 30d" / "every 12h" from a rotation policy */
export function policyLabel(policy: RotationPolicy | null | undefined): string {
  const h = policy?.intervalHours ?? 24 * 30
  if (h % 24 === 0) return `every ${h / 24}d`
  return `every ${h}h`
}

export function parsePolicy(json: unknown): RotationPolicy | null {
  if (json && typeof json === 'object') {
    const p = json as Partial<RotationPolicy>
    if (typeof p.intervalHours === 'number') {
      return {
        intervalHours: p.intervalHours,
        autoRotate: p.autoRotate ?? true,
        verifyAfterWrite: p.verifyAfterWrite ?? true,
      }
    }
  }
  return null
}

export function parseSteps(json: unknown): RotationStep[] {
  return Array.isArray(json) ? (json as RotationStep[]) : []
}

/** Map engine step statuses onto the shared PipelineStepper states */
export function toStepStates(steps: RotationStep[]): StepState[] {
  const order = ['lock', 'rotate', 'push', 'verify', 'commit', 'audit'] as const
  return order.map((name) => {
    const s = steps.find((st) => st.step === name)
    if (!s) return 'pending'
    switch (s.status) {
      case 'ok':
        return 'ok'
      case 'failed':
        return 'failed'
      case 'running':
        return 'running'
      case 'skipped':
        return 'warn'
      default:
        return 'pending'
    }
  })
}

/** Due-queue phrasing: "in 2d" (warn) or "2d overdue" (danger) */
export function dueLabel(secret: SecretWithRelations): { text: string; tone: 'warn' | 'danger' | 'muted' } {
  const due = secret.nextDueAt ? new Date(secret.nextDueAt) : null
  if (!due || Number.isNaN(due.getTime())) return { text: 'unscheduled', tone: 'muted' }
  const diffDays = (due.getTime() - Date.now()) / DAY_MS
  if (diffDays >= 0) {
    const d = Math.max(1, Math.ceil(diffDays))
    return { text: `in ${d}d`, tone: 'warn' }
  }
  const d = Math.max(1, Math.ceil(-diffDays))
  return { text: `${d}d overdue`, tone: 'danger' }
}

/** Brand-letter tile content from a platform key: "aws-iam" → "aws" */
export function platformInitials(platform: string): string {
  const clean = platform.toLowerCase().replace(/[^a-z0-9-]/g, '')
  const parts = clean.split('-').filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 3)
  return parts.map((p) => p[0]).join('').slice(0, 3)
}

/** Run duration in ms, null when unfinished */
export function runDurationMs(run: RotationRun): number | null {
  if (!run.finishedAt || !run.startedAt) return null
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  return ms >= 0 ? ms : null
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return 'running'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Daily bucket counts over the last `days` days (oldest → newest) */
export function dailyBuckets(dates: (Date | string | null | undefined)[], days: number): number[] {
  const buckets = new Array<number>(days).fill(0)
  const now = Date.now()
  for (const d of dates) {
    if (!d) continue
    const t = new Date(d).getTime()
    if (Number.isNaN(t)) continue
    const ageDays = Math.floor((now - t) / DAY_MS)
    if (ageDays >= 0 && ageDays < days) buckets[days - 1 - ageDays] += 1
  }
  return buckets
}

/** Count timestamps within the last `days` days */
export function countWithinDays(dates: (Date | string | null | undefined)[], days: number): number {
  const cutoff = Date.now() - days * DAY_MS
  return dates.reduce((n, d) => {
    if (!d) return n
    const t = new Date(d).getTime()
    return !Number.isNaN(t) && t >= cutoff ? n + 1 : n
  }, 0)
}

/** % delta between the first and second half of a bucket series */
export function halfDelta(buckets: number[]): number | null {
  const mid = Math.floor(buckets.length / 2)
  if (mid === 0) return null
  const first = buckets.slice(0, mid).reduce((a, b) => a + b, 0)
  const second = buckets.slice(mid).reduce((a, b) => a + b, 0)
  if (first === 0) return second > 0 ? 100 : null
  return Math.round(((second - first) / first) * 100)
}

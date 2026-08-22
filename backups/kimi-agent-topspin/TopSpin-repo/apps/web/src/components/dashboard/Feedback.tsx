import type { ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shimmering skeleton block (bg-raised pulse) */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-card border border-line-subtle bg-panel', className)}>
      <div className="absolute inset-0 animate-pulse bg-raised/60" />
      <div className="panel-light absolute inset-0" />
    </div>
  )
}

/** Full-page skeleton matching the dashboard grid */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex items-center gap-3">
        <span className="spin-loader inline-block size-7" />
        <span className="text-mono-s text-ink-muted">loading telemetry…</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SkeletonBlock className="h-[240px] sm:col-span-2 xl:col-span-1" />
        <SkeletonBlock className="h-[132px] self-center" />
        <SkeletonBlock className="h-[132px] self-center" />
        <SkeletonBlock className="h-[132px] self-center" />
        <SkeletonBlock className="h-[132px] self-center" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <SkeletonBlock className="h-[360px] xl:col-span-7" />
        <SkeletonBlock className="h-[360px] xl:col-span-5" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <SkeletonBlock className="h-[300px] xl:col-span-7" />
        <SkeletonBlock className="h-[300px] xl:col-span-5" />
      </div>
    </div>
  )
}

/** Inline error panel with retry for a failed query */
export function ErrorPanel({
  title,
  error,
  onRetry,
}: {
  title: string
  error: unknown
  onRetry?: () => void
}) {
  const message = error instanceof Error ? error.message : 'Unexpected error'
  return (
    <div className="panel-light flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-panel px-6 py-12 text-center">
      <AlertTriangle className="size-6 text-danger" />
      <div>
        <h3 className="font-sans text-base font-semibold text-ink-primary">{title}</h3>
        <p className="mt-1 max-w-md text-[13px] leading-5 text-ink-secondary">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
        >
          <RotateCw className="size-3.5" />
          Retry
        </button>
      )}
    </div>
  )
}

export function PanelShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('panel-light rounded-card border border-line-subtle bg-panel', className)}>{children}</div>
}

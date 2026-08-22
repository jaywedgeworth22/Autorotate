import { useEffect } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* BrandTile — rounded brand-letter tile (JetBrains Mono glyph)         */
/* ------------------------------------------------------------------ */

export function BrandTile({
  glyph,
  size = 40,
  className,
}: {
  glyph: string
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[10px] border border-line-subtle bg-raised font-mono font-medium text-ink-secondary',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {glyph}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Form primitives                                                      */
/* ------------------------------------------------------------------ */

export const inputCls =
  'h-10 w-full rounded-control border border-line-subtle bg-inset px-3 font-mono text-[13px] text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-spin-dim focus:ring-2 focus:ring-spin-glow'

export function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="text-label mb-1.5 flex items-center gap-2 text-ink-muted">
        {label}
        {optional && <span className="normal-case tracking-normal text-ink-faint">optional</span>}
      </span>
      {children}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* ModalShell — centered scale/fade modal (180ms)                       */
/* ------------------------------------------------------------------ */

export function ModalShell({
  open,
  onClose,
  title,
  width = 520,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  width?: number
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
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-[110] flex max-h-[calc(100dvh-64px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-modal border border-line-subtle bg-raised shadow-pop"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
                <div className="font-display text-lg font-semibold tracking-[-0.015em] text-ink-primary">
                  {title}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-control p-1.5 text-ink-muted hover:bg-panel hover:text-ink-primary"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Buttons                                                              */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  children,
  className,
  busy,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-100 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {busy && <span className="spin-loader inline-block size-4" />}
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  className,
  busy,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control border border-line-subtle px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {busy && <span className="spin-loader inline-block size-4" />}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* VerifyChecklist — animated step list used by connect + target test   */
/* ------------------------------------------------------------------ */

export type ChecklistRowState = 'pending' | 'running' | 'ok' | 'failed'

export function VerifyChecklist({
  rows,
  finalMessage,
}: {
  rows: { label: string; state: ChecklistRowState; caption?: string }[]
  finalMessage?: string
}) {
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <motion.div
          key={row.label}
          initial={{ opacity: 0, x: -12 }}
          animate={
            row.state === 'failed'
              ? { opacity: 1, x: [0, -6, 6, -4, 4, 0] }
              : { opacity: 1, x: 0 }
          }
          transition={row.state === 'failed' ? { duration: 0.3 } : { duration: 0.2 }}
          className={cn(
            'flex items-center gap-3 rounded-card border px-3.5 py-2.5',
            row.state === 'failed'
              ? 'border-danger/40 bg-danger/5'
              : row.state === 'ok'
                ? 'border-spin-dim/60 bg-spin/5'
                : 'border-line-subtle bg-inset',
          )}
        >
          <span className="flex size-5 items-center justify-center">
            {row.state === 'running' ? (
              <span className="spin-loader inline-block size-4" />
            ) : row.state === 'ok' ? (
              <motion.svg
                viewBox="0 0 16 16"
                className="size-4 text-spin"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            ) : row.state === 'failed' ? (
              <X className="size-4 text-danger" />
            ) : (
              <span className="size-2 rounded-full border border-line-strong" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'text-[13px] leading-5',
                row.state === 'pending'
                  ? 'text-ink-muted'
                  : row.state === 'failed'
                    ? 'text-danger'
                    : 'text-ink-primary',
              )}
            >
              {row.label}
            </div>
            {row.caption && (
              <div className="text-mono-s truncate text-ink-muted">{row.caption}</div>
            )}
          </div>
        </motion.div>
      ))}
      {finalMessage && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-mono-s px-1 pt-1 text-ink-secondary"
        >
          {finalMessage}
        </motion.p>
      )}
    </div>
  )
}

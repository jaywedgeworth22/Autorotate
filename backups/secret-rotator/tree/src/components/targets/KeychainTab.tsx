import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Laptop, Smartphone } from 'lucide-react'
import { FingerprintChip, StatusDot, toastSuccess } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/components/connectors/data'
import { EmptyState } from '@/components/primitives'
import { keychainCfg, type BoundTarget } from './data'

function MiniToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-spin' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 size-4 rounded-full bg-abyss transition-transform duration-200',
          on && 'translate-x-[18px]',
        )}
      />
    </button>
  )
}

interface Device {
  id: string
  name: string
  version: string
  icon: typeof Laptop
  toggles: { key: string; label: string; on: boolean }[]
}

const DEVICES: Device[] = [
  {
    id: 'mac',
    name: 'MacBook Pro (this Mac)',
    version: 'companion v1.4.2',
    icon: Laptop,
    toggles: [
      { key: 'auto', label: 'auto-approve from verified runs', on: true },
      { key: 'touchid', label: 'require Touch ID for production', on: true },
    ],
  },
  {
    id: 'ios',
    name: 'iPhone 16 Pro',
    version: 'companion v1.4.1',
    icon: Smartphone,
    toggles: [{ key: 'faceid', label: 'Face ID approval', on: true }],
  },
]

export function KeychainTab({ targets }: { targets: BoundTarget[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEVICES.flatMap((d) => d.toggles.map((t) => [`${d.id}:${t.key}`, t.on]))),
  )

  // split items across companion devices deterministically for display
  const itemsFor = (deviceId: string) =>
    targets.filter((t) => (t.id % 2 === 0 ? 'mac' : 'ios') === deviceId)

  return (
    <div className="space-y-5">
      {/* explainer banner */}
      <div className="flex items-start gap-4 rounded-card border border-violet/40 border-l-violet bg-violet/5 p-4" style={{ borderLeftWidth: 3 }}>
        <img
          src="/companion-macos.png"
          alt="macOS companion"
          className="hidden w-40 rounded-[8px] border border-line-subtle md:block"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
        <div>
          <h3 className="font-sans text-base font-semibold text-ink-primary">
            Keychain targets are fulfilled by the companion apps
          </h3>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-secondary">
            Deliveries are end-to-end encrypted; approve on-device with Face ID / Touch ID or
            auto-approve by policy. The web console delegates — it never touches the keychain
            directly.
          </p>
          <a href="/#companions" className="mt-2 inline-block text-[13px] font-medium text-spin hover:underline">
            Get the companions →
          </a>
        </div>
      </div>

      {/* device cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {DEVICES.map((d, di) => {
          const items = itemsFor(d.id)
          const last = items
            .map((t) => t.lastDeliveredAt)
            .filter((x): x is Date => !!x)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
          const isOpen = expanded === d.id
          return (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.07, duration: 0.25 }}
              className="panel-light rounded-card border border-line-subtle bg-panel p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-[10px] border border-violet/40 bg-violet/10">
                  <d.icon className="size-5 text-violet" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-sans text-[15px] font-semibold text-ink-primary">{d.name}</div>
                  <div className="text-mono-s text-ink-muted">
                    {d.version} · linked 32d ago
                  </div>
                </div>
                <StatusDot state="healthy" label="healthy" />
              </div>

              <div className="text-mono-s mt-3 text-ink-muted">
                keychain items: {items.length} · last delivery {timeAgo(last ?? null)}
              </div>

              <div className="mt-4 space-y-2">
                {d.toggles.map((t) => (
                  <div
                    key={t.key}
                    className="flex items-center justify-between gap-3 rounded-control border border-line-subtle bg-inset px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-ink-secondary">{t.label}</span>
                    <MiniToggle
                      on={toggles[`${d.id}:${t.key}`] ?? t.on}
                      onClick={() => {
                        const k = `${d.id}:${t.key}`
                        const next = !(toggles[k] ?? t.on)
                        setToggles((prev) => ({ ...prev, [k]: next }))
                        toastSuccess(
                          next ? 'Policy enabled on companion' : 'Policy disabled on companion',
                          t.label,
                        )
                      }}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => setExpanded(isOpen ? null : d.id)}
                className="mt-4 flex w-full items-center justify-between rounded-control border border-line-subtle px-3.5 py-2 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
              >
                Keychain items ({items.length})
                <ChevronDown className={cn('size-4 transition-transform duration-200', isOpen && 'rotate-180')} />
              </button>

              {isOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  className="mt-2 space-y-1.5 overflow-hidden"
                >
                  {items.length === 0 && (
                    <li className="py-3 text-center text-[13px] text-ink-muted">
                      No keychain items bound yet.
                    </li>
                  )}
                  {items.map((t) => {
                    const c = keychainCfg(t)
                    return (
                      <li
                        key={t.id}
                        className="flex items-center gap-2.5 rounded-control border border-line-subtle/60 bg-inset px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-primary">
                          {c.account}
                        </span>
                        {t.secretFingerprint && <FingerprintChip fingerprint={t.secretFingerprint} />}
                        <span className="text-mono-s rounded-chip border border-violet/40 px-2 py-0.5 text-violet">
                          delegated to companion
                        </span>
                        <span className="text-mono-s text-ink-muted">{timeAgo(t.lastDeliveredAt)}</span>
                      </li>
                    )
                  })}
                </motion.ul>
              )}
            </motion.div>
          )
        })}
      </div>

      {targets.length === 0 && (
        <div className="rounded-card border border-line-subtle bg-panel">
          <EmptyState
            title="No keychain targets yet"
            body="Add an Apple Keychain target to deliver rotated secrets to linked companion devices."
          />
        </div>
      )}
    </div>
  )
}

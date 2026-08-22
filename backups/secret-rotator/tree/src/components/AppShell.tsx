import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import {
  Activity,
  Bell,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FileKey2,
  LayoutDashboard,
  ListChecks,
  Plug,
  RotateCw,
  ScrollText,
  Search,
  Settings,
  Target,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Command } from 'cmdk'
import { cn } from '@/lib/utils'
import { LogoMark } from './Navbar'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Activity', href: '/runs', icon: Activity },
    ],
  },
  {
    title: 'Manage',
    items: [
      { label: 'Secrets', href: '/secrets', icon: FileKey2 },
      { label: 'Connectors', href: '/connectors', icon: Plug },
      { label: 'Targets', href: '/targets', icon: Target },
    ],
  },
  {
    title: 'Records',
    items: [
      { label: 'Rotation Runs', href: '/runs', icon: RotateCw },
      { label: 'Audit Log', href: '/audit', icon: ListChecks },
    ],
  },
]

const PALETTE_ITEMS = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  { label: 'Secrets inventory', href: '/secrets', icon: FileKey2 },
  { label: 'Audit log export', href: '/audit', icon: ScrollText },
]

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 pt-[18vh]" onClick={onClose}>
      <div
        className="w-[calc(100%-32px)] max-w-[560px] origin-center rounded-modal border border-line-subtle bg-raised shadow-pop animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-line-subtle px-4">
            <Search className="size-4 text-ink-muted" />
            <Command.Input
              autoFocus
              placeholder="Search secrets, connectors, runs…"
              className="h-12 w-full bg-transparent font-mono text-[13px] text-ink-primary outline-none placeholder:text-ink-muted"
            />
            <kbd className="text-mono-s rounded-chip border border-line-subtle px-1.5 py-0.5 text-ink-muted">ESC</kbd>
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-ink-muted">No results.</Command.Empty>
            {PALETTE_ITEMS.map((item) => (
              <Command.Item
                key={item.label}
                value={item.label}
                onSelect={() => {
                  navigate(item.href)
                  onClose()
                }}
                className="flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-sm text-ink-secondary data-[selected=true]:bg-panel data-[selected=true]:text-ink-primary"
              >
                <item.icon className="size-4 text-ink-muted" />
                {item.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const crumbs = useMemo(
    () => location.pathname.split('/').filter(Boolean),
    [location.pathname],
  )

  return (
    <div className="flex min-h-[100dvh] bg-abyss text-ink-primary">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line-subtle bg-panel transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-line-subtle px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            {!collapsed && <span className="font-display text-base font-semibold">TopSpin</span>}
          </Link>
        </div>

        {!collapsed && (
          <button className="mx-3 mt-3 flex items-center justify-between rounded-control border border-line-subtle bg-raised px-3 py-2 text-[13px] text-ink-secondary hover:border-line-strong">
            Acme Corp
            <ChevronDown className="size-3.5 text-ink-muted" />
          </button>
        )}

        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div className="text-label mb-1.5 px-2 text-ink-muted">{group.title}</div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location.pathname === item.href
                  return (
                    <li key={item.label + item.href}>
                      <Link
                        to={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'relative flex items-center gap-3 rounded-control px-2 py-2 text-[13px] transition-colors',
                          active
                            ? 'bg-raised font-medium text-ink-primary'
                            : 'text-ink-secondary hover:bg-raised/60 hover:text-ink-primary',
                          collapsed && 'justify-center px-0',
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-spin" />
                        )}
                        <item.icon className="size-4 shrink-0" />
                        {!collapsed && item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-line-subtle p-3">
          <a
            href="/#docs"
            className={cn(
              'flex items-center gap-3 rounded-control px-2 py-2 text-[13px] text-ink-secondary hover:bg-raised/60 hover:text-ink-primary',
              collapsed && 'justify-center px-0',
            )}
          >
            <BookOpen className="size-4 shrink-0" />
            {!collapsed && 'Docs'}
          </a>
          <button
            className={cn(
              'flex w-full items-center gap-3 rounded-control px-2 py-2 text-[13px] text-ink-secondary hover:bg-raised/60 hover:text-ink-primary',
              collapsed && 'justify-center px-0',
            )}
          >
            <Settings className="size-4 shrink-0" />
            {!collapsed && 'Settings'}
          </button>
          {!collapsed && (
            <div className="text-mono-s mt-2 flex items-center gap-2 rounded-chip border border-line-subtle bg-inset px-2.5 py-1.5 text-ink-secondary">
              <span className="size-1.5 rounded-full bg-spin" />
              macOS linked
            </div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center gap-3 rounded-control px-2 py-2 text-ink-muted hover:bg-raised/60 hover:text-ink-primary',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className={cn('flex min-w-0 flex-1 flex-col transition-[margin] duration-200', collapsed ? 'ml-16' : 'ml-60')}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line-subtle bg-panel/90 px-6 backdrop-blur">
          <nav className="text-mono-s hidden items-center gap-1.5 text-ink-muted sm:flex">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-faint">/</span>}
                <span className={cn(i === crumbs.length - 1 && 'text-ink-secondary')}>{c}</span>
              </span>
            ))}
          </nav>

          <button
            onClick={() => setPaletteOpen(true)}
            className="mx-auto flex h-9 w-full max-w-md items-center gap-2.5 rounded-control border border-line-subtle bg-inset px-3 text-[13px] text-ink-muted transition-colors hover:border-line-strong"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-mono-s rounded-chip border border-line-subtle px-1.5 py-0.5">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-mono-s hidden rounded-chip border border-spin-dim bg-spin/10 px-2.5 py-1 uppercase text-spin md:inline-block">
              production
            </span>
            <button className="hidden items-center gap-2 rounded-control bg-spin px-3.5 py-2 text-[13px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.03] active:scale-[0.97] sm:flex">
              <RotateCw className="size-3.5" />
              Rotate now
            </button>
            <button aria-label="Notifications" className="relative rounded-control p-2 text-ink-secondary hover:bg-raised hover:text-ink-primary">
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-danger" />
            </button>
            <span className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-raised font-mono text-[11px] text-ink-secondary">
              TS
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

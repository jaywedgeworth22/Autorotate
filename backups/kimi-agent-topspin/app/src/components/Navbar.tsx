import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Product', href: '/#pipeline' },
  { label: 'Connectors', href: '/#connectors' },
  { label: 'Security', href: '/#security' },
  { label: 'Companions', href: '/#companions' },
  { label: 'Changelog', href: '/#changelog' },
]

const APP_ROUTES = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Secrets', href: '/secrets' },
  { label: 'Connectors', href: '/connectors' },
  { label: 'Targets', href: '/targets' },
  { label: 'Rotation Runs', href: '/runs' },
  { label: 'Audit Log', href: '/audit' },
]

export function LogoMark({ size = 28, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <img
      src="/logo.svg"
      alt="TopSpin"
      width={size}
      height={size}
      className={cn(spinning && 'animate-dial-spin')}
    />
  )
}

function NavLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="group relative text-sm text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
    >
      {label}
      <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-spin transition-all duration-200 group-hover:w-full" />
    </a>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        className={cn(
          'fixed top-0 z-50 h-[72px] w-full border-b bg-abyss/80 backdrop-blur-[12px] transition-colors duration-200',
          scrolled ? 'border-line-subtle' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <LogoMark size={28} />
            <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink-primary">
              TopSpin
            </span>
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.label} {...l} />
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {/* AUTH-SLOT: rewired to useAuth() in Phase 5 */}
            <Link
              to="/login"
              className="rounded-control px-4 py-2 text-sm font-medium text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
            >
              Sign in
            </Link>
            <Link
              to="/dashboard"
              className="group flex items-center gap-2 rounded-control bg-spin px-4 py-2 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.03] active:scale-[0.97]"
            >
              Open the console
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>

          <button
            className="rounded-control p-2 text-ink-secondary hover:text-ink-primary lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-6" />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed right-0 top-0 z-[70] flex h-full w-[320px] flex-col border-l border-line-subtle bg-panel p-6"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <LogoMark size={26} />
                  <span className="font-display text-lg font-semibold">TopSpin</span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="rounded-control p-2 text-ink-secondary hover:text-ink-primary"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {NAV_LINKS.map((l, i) => (
                  <motion.a
                    key={l.label}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-control px-3 py-3 text-base text-ink-secondary hover:bg-raised hover:text-ink-primary"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.25 }}
                  >
                    {l.label}
                  </motion.a>
                ))}
              </nav>
              <div className="text-label mt-8 px-3 text-ink-muted">Console</div>
              <nav className="mt-2 flex flex-col gap-1">
                {APP_ROUTES.map((l, i) => (
                  <motion.button
                    key={l.label}
                    onClick={() => {
                      setOpen(false)
                      navigate(l.href)
                    }}
                    className="rounded-control px-3 py-2.5 text-left font-mono text-sm text-ink-secondary hover:bg-raised hover:text-ink-primary"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + 0.06 * i, duration: 0.25 }}
                  >
                    {l.label}
                  </motion.button>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-3">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-control border border-line-subtle px-4 py-2.5 text-center text-sm font-medium text-ink-secondary hover:border-line-strong hover:text-ink-primary"
                >
                  Sign in
                </Link>
                <Link
                  to="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-control bg-spin px-4 py-2.5 text-center text-sm font-semibold text-[#06231A]"
                >
                  Open the console
                </Link>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

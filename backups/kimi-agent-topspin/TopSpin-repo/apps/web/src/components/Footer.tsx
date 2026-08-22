import { Link } from 'react-router'
import { Github, Twitter } from 'lucide-react'
import { LogoMark } from './Navbar'

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Console', href: '/dashboard' },
      { label: 'Connectors', href: '/connectors' },
      { label: 'Companions', href: '/#companions' },
      { label: 'Changelog', href: '/#changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: '/#docs' },
      { label: 'API reference', href: '/#api' },
      { label: 'Status', href: '/#status' },
      { label: 'Security', href: '/#security' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/#about' },
      { label: 'Blog', href: '/#blog' },
      { label: 'Careers', href: '/#careers' },
      { label: 'Contact', href: '/#contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/#privacy' },
      { label: 'Terms', href: '/#terms' },
      { label: 'DPA', href: '/#dpa' },
      { label: 'SOC 2', href: '/#soc2' },
    ],
  },
]

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-mono-s rounded-chip border border-line-subtle bg-panel px-2.5 py-1 uppercase text-ink-secondary">
      {children}
    </span>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-line-subtle bg-abyss">
      <div className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-3">
              <LogoMark size={28} />
              <span className="font-display text-lg font-semibold tracking-[-0.02em]">TopSpin</span>
            </Link>
            <p className="text-mono-s mt-4 text-ink-muted">
              rotate everything.
              <br />
              store nothing.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-label mb-4 text-ink-muted">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-6 border-t border-line-subtle pt-8 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-mono-s text-ink-muted">© 2025 TopSpin Systems</span>
            <Chip>SOC 2 Type II</Chip>
            <Chip>Zero plaintext storage</Chip>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com"
              aria-label="GitHub"
              className="text-ink-muted transition-colors hover:text-ink-primary"
            >
              <Github className="size-5" />
            </a>
            <a
              href="https://x.com"
              aria-label="X"
              className="text-ink-muted transition-colors hover:text-ink-primary"
            >
              <Twitter className="size-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

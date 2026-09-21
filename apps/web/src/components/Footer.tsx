import { Link } from 'react-router'
import { Github, Twitter } from 'lucide-react'
import { LogoMark } from './Navbar'
import { openSentryFeedback } from '@/lib/sentry'

// AR31-17 (2026-09-20): the previous footer routed every column to
// dead `#anchor` URLs (/#docs, /#privacy, /#status, /#careers, …).  None
// of those IDs existed on the landing page, so each click scrolled to the
// top of the page with no error.  Now:
//   • In-page anchors use react-router `<Link>` with real IDs that exist
//     on the Home page (pipeline, connectors, companions, security).
//   • Cross-document links (changelog, docs, API, status, about, blog,
//     careers, contact, privacy, terms) point at the GitHub repo's
//     existing README / LICENSE / SECURITY.md / CHANGELOG.md / Issues,
//     so every link resolves to a real page.
const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Console', href: '/dashboard' },
      { label: 'Connectors', href: '/#connectors' },
      { label: 'Companions', href: '/#companions' },
      { label: 'Changelog', href: 'https://github.com/jaywedgeworth22/Autorotate/blob/main/CHANGELOG.md', external: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: 'https://github.com/jaywedgeworth22/Autorotate#readme', external: true },
      { label: 'API reference', href: 'https://github.com/jaywedgeworth22/Autorotate/tree/main/contracts', external: true },
      { label: 'Status', href: 'https://github.com/jaywedgeworth22/Autorotate/actions', external: true },
      { label: 'Security', href: '/#security' },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'About', href: 'https://github.com/jaywedgeworth22/Autorotate/blob/main/README.md', external: true },
      { label: 'Issue tracker', href: 'https://github.com/jaywedgeworth22/Autorotate/issues', external: true },
      { label: 'Roadmap', href: 'https://github.com/jaywedgeworth22/Autorotate/milestones', external: true },
      { label: 'Contact', href: 'https://github.com/jaywedgeworth22/Autorotate/issues/new', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: 'https://github.com/jaywedgeworth22/Autorotate/blob/main/SECURITY.md', external: true },
      { label: 'Terms', href: 'https://github.com/jaywedgeworth22/Autorotate/blob/main/LICENSE', external: true },
      { label: 'License', href: 'https://github.com/jaywedgeworth22/Autorotate/blob/main/LICENSE', external: true },
      { label: 'Security', href: '/#security' },
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
              <span className="font-display text-lg font-semibold tracking-[-0.02em]">
                Autorotate
              </span>
            </Link>
            <p className="text-mono-s mt-4 text-ink-muted">
              rotate everything.
              <br />
              store nothing.
              <br />
              <span className="text-spin font-medium">autorotate.codes</span>
            </p>

          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-label mb-4 text-ink-muted">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        to={l.href}
                        className="text-sm text-ink-secondary transition-colors duration-200 hover:text-ink-primary"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-6 border-t border-line-subtle pt-8 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-mono-s text-ink-muted">© 2026 Jay · Apache-2.0</span>
            <Chip>SOC 2 Type II</Chip>
            <Chip>Zero plaintext storage</Chip>
            <button
              type="button"
              onClick={() => openSentryFeedback()}
              className="text-mono-s text-ink-muted underline decoration-line-subtle underline-offset-2 transition-colors hover:text-ink-primary"
            >
              Report a Problem
            </button>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/jaywedgeworth22/Autorotate"
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

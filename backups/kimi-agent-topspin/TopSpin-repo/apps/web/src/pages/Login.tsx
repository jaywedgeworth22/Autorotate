import { Link } from 'react-router'

// Placeholder — replaced by the auth graft in Phase 5 if the backend is grafted.
export default function Login() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
        Sign in
      </h1>
      <p className="max-w-sm text-[13px] leading-5 text-ink-secondary">
        Authentication is wired up in a later phase.
      </p>
      <Link
        to="/dashboard"
        className="rounded-control bg-spin px-5 py-2.5 text-sm font-semibold text-[#06231A]"
      >
        Open the console
      </Link>
    </div>
  )
}

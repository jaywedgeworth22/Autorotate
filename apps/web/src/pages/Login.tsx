import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { trpc } from '@/providers/trpc'

/**
 * Sign-in (AR-01).  One field: the operator's admin token, exchanged for an
 * HttpOnly session cookie the browser never exposes to script.
 */
export default function Login() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      setToken('')
      setError(null)
      await utils.auth.session.invalidate()
      navigate('/dashboard')
    },
    onError: (err: { message: string }) => setError(err.message),
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token.trim()) {
      setError('Enter your admin token.')
      return
    }
    setError(null)
    login.mutate({ token: token.trim() })
  }

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6">
      <h1 className="font-display text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink-primary">
        Sign in
      </h1>
      <p className="max-w-sm text-center text-[13px] leading-5 text-ink-secondary">
        The console is protected by the deployment&rsquo;s admin token
        (<span className="font-mono">AUTOROTATE_ADMIN_TOKEN</span>).  Your session lasts 12
        hours.
      </p>

      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <label htmlFor="admin-token" className="text-label text-ink-muted">
          Admin token
        </label>
        <input
          id="admin-token"
          name="admin-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={login.isPending}
          className="w-full rounded-control border border-line-subtle bg-inset px-3 py-2.5 font-mono text-sm text-ink-primary outline-none focus:border-spin-dim disabled:opacity-60"
        />
        {error && (
          <p role="alert" className="text-[13px] leading-5 text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="rounded-control bg-spin px-5 py-2.5 text-sm font-semibold text-[#06231A] transition-all hover:brightness-110 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Open the console'}
        </button>
      </form>
    </div>
  )
}

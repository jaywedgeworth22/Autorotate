import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { trpc } from '@/providers/trpc'

/**
 * Console route guard (AR-01).  Console routes previously sat behind
 * AppShell, which rendered <Outlet/> with no check at all.
 *
 * Renders nothing while the session query is in flight — a flash of the
 * console for an unauthenticated visitor is worse than a blank frame.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const session = trpc.auth.session.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  })

  if (session.isPending) return null
  if (!session.data?.authenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

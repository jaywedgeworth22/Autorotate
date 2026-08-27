import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import { Toaster } from 'sonner'
import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import Home from '@/pages/Home'
import Login from '@/pages/Login'

// The authenticated console (AppShell + its pages) is only ever needed once a
// visitor signs in — marketing visitors should never pay for its bytes.
// Splitting it out keeps the landing-page bundle to what the landing page
// actually uses.
const AppShell = lazy(() => import('@/components/AppShell'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Secrets = lazy(() => import('@/pages/Secrets'))
const Connectors = lazy(() => import('@/pages/Connectors'))
const Targets = lazy(() => import('@/pages/Targets'))
const Runs = lazy(() => import('@/pages/Runs'))
const Audit = lazy(() => import('@/pages/Audit'))

function ConsoleFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-abyss">
      <div className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-spin" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Marketing pages — nested-route pattern (Layout renders <Outlet/>) */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
        </Route>
        {/* Authenticated console — RequireAuth gates it, AppShell renders
            <Outlet/>, and the whole thing is code-split from marketing.  The
            guard sits outside Suspense so an unauthenticated visitor is
            redirected without fetching the console chunk at all. */}
        <Route
          element={
            <RequireAuth>
              <Suspense fallback={<ConsoleFallback />}>
                <AppShell />
              </Suspense>
            </RequireAuth>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="secrets" element={<Secrets />} />
          <Route path="connectors" element={<Connectors />} />
          <Route path="targets" element={<Targets />} />
          <Route path="runs" element={<Runs />} />
          <Route path="audit" element={<Audit />} />
        </Route>
      </Routes>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#11151F',
            border: '1px solid #1B2130',
            color: '#E8ECF4',
            borderRadius: '10px',
          },
        }}
      />
    </>
  )
}

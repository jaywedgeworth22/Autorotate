import { Routes, Route } from 'react-router'
import { Toaster } from 'sonner'
import Layout from '@/components/Layout'
import AppShell from '@/components/AppShell'
import RequireAuth from '@/components/RequireAuth'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Secrets from '@/pages/Secrets'
import Connectors from '@/pages/Connectors'
import Targets from '@/pages/Targets'
import Runs from '@/pages/Runs'
import Audit from '@/pages/Audit'

export default function App() {
  return (
    <>
      <Routes>
        {/* Marketing pages — nested-route pattern (Layout renders <Outlet/>) */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
        </Route>
        {/* Authenticated console — RequireAuth gates it, AppShell renders <Outlet/> */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
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

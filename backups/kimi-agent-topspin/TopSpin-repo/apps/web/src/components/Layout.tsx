import { Outlet } from 'react-router'
import Navbar from './Navbar'
import Footer from './Footer'

/**
 * Marketing layout (landing pages).
 * Navbar is fixed top 72px (design.md §7.1 overlay nav), so this layout owns
 * the offset: the content slot gets 72px top padding. Full-bleed heroes opt
 * out inside the page with a negative top margin.
 */
export default function Layout() {
  return (
    <div className="min-h-[100dvh] bg-abyss text-ink-primary">
      <Navbar />
      <main className="pt-[72px]">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

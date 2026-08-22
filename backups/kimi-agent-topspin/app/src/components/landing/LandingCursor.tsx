import { useEffect, useRef, useState } from 'react'

/**
 * Landing-only custom cursor (design.md §6): 12px spin-ring dot, 100ms lag,
 * scales 2.5× over interactive elements. Desktop (fine pointer) only.
 */
export default function LandingCursor() {
  const ref = useRef<HTMLDivElement>(null)
  const [enabled] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  )

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const pos = { x: -100, y: -100 }
    const target = { x: -100, y: -100 }
    let hovering = false
    let raf = 0

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      const t = e.target as HTMLElement | null
      hovering = !!t?.closest('a, button, [role="button"]')
    }
    const loop = () => {
      pos.x += (target.x - pos.x) * 0.35
      pos.y += (target.y - pos.y) * 0.35
      el.style.transform = `translate(${pos.x - 6}px, ${pos.y - 6}px) scale(${hovering ? 2.5 : 1})`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] size-3 rounded-full border-2 border-spin transition-[border-color] duration-100"
      style={{ willChange: 'transform' }}
    />
  )
}

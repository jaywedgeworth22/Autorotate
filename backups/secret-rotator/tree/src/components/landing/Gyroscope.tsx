import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Landing hero gyroscope (home.md §1):
 * three concentric wireframe rings (torus, thin lines, spin/info/violet at
 * 60% opacity) precessing on different axes + a 600-point particle field.
 * Mouse: assembly tilts toward cursor (lerped, max 12°).
 * Scroll: rings spread apart (scale 1 → 1.35) and fade to 30% over first 100vh.
 */

const RING_COLORS = ['#2EE6A8', '#5EA8FF', '#9B8CFF']
const RING_RADII = [1.6, 2.1, 2.6]
// revolutions per second equivalents: 8s, 12s (reverse), 16s
const RING_SPEEDS = [(2 * Math.PI) / 8, -(2 * Math.PI) / 12, (2 * Math.PI) / 16]

function scrollProgress(): number {
  if (typeof window === 'undefined') return 0
  return Math.min(1, Math.max(0, window.scrollY / window.innerHeight))
}

function Ring({ index }: { index: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((_, delta) => {
    if (!mesh.current || !mat.current) return
    const speed = RING_SPEEDS[index]!
    // precession: rotate on two different axes per ring
    mesh.current.rotation.z += speed * delta
    mesh.current.rotation.x = Math.sin(performance.now() / 1000 / (4 + index * 3)) * (0.4 + index * 0.25)
    const p = scrollProgress()
    mat.current.opacity = THREE.MathUtils.lerp(0.6, 0.18, p)
  })

  return (
    <mesh ref={mesh} rotation={[Math.PI / 2.2 + index * 0.5, index * 0.7, 0]}>
      <torusGeometry args={[RING_RADII[index], 0.006, 8, 128]} />
      <meshBasicMaterial ref={mat} color={RING_COLORS[index]} transparent opacity={0.6} />
    </mesh>
  )
}

// deterministic seeded PRNG — pure, so particle layout is stable across renders
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Particles() {
  const points = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const rand = mulberry32(1337)
    const arr = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      arr[i * 3] = (rand() - 0.5) * 14
      arr[i * 3 + 1] = (rand() - 0.5) * 9
      arr[i * 3 + 2] = (rand() - 0.5) * 8 - 2
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (!points.current) return
    points.current.rotation.y += delta * 0.015
    const p = scrollProgress()
    const mat = points.current.material as THREE.PointsMaterial
    mat.opacity = THREE.MathUtils.lerp(0.5, 0.15, p)
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#9AA5B8" size={0.02} transparent opacity={0.5} sizeAttenuation />
    </points>
  )
}

function Assembly() {
  const group = useRef<THREE.Group>(null)
  const tilt = useRef({ x: 0, y: 0 })

  useFrame(() => {
    if (!group.current) return
    const p = scrollProgress()
    // rings spread apart on scroll: scale 1 → 1.35
    const target = 1 + p * 0.35
    const s = THREE.MathUtils.lerp(group.current.scale.x, target, 0.08)
    group.current.scale.setScalar(s)
    // mouse tilt toward cursor, lerped, max 12°
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, tilt.current.y, 0.06)
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, tilt.current.x, 0.06)
  })

  return (
    <group
      ref={group}
      onPointerMove={(e) => {
        const max = THREE.MathUtils.degToRad(12)
        tilt.current.x = (e.pointer.x ?? 0) * max
        tilt.current.y = -(e.pointer.y ?? 0) * max
      }}
    >
      <Ring index={0} />
      <Ring index={1} />
      <Ring index={2} />
      {/* center dial dot */}
      <mesh>
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshBasicMaterial color="#2EE6A8" />
      </mesh>
    </group>
  )
}

export default function Gyroscope() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      camera={{ position: [0, 0, 6.5], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <Assembly />
      <Particles />
    </Canvas>
  )
}

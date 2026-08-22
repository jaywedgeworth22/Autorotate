import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import { ArrowRight, Apple, Lock, RefreshCw, Send, ShieldCheck, CheckCircle2, ScrollText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PIPELINE_STEPS, PipelineStepper, CapabilityBadge } from '@/components/primitives'
import type { Capability, StepState } from '@/components/primitives'
import LandingCursor from '@/components/landing/LandingCursor'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const Gyroscope = lazy(() => import('@/components/landing/Gyroscope'))

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const STEP_COPY: { title: string; body: string; icon: LucideIcon }[] = [
  { title: 'LOCK', body: 'The old credential is frozen and flagged so nothing else touches it mid-rotation.', icon: Lock },
  { title: 'ROTATE', body: "TopSpin calls the provider's API to mint a fresh credential — programmatically, not by hand.", icon: RefreshCw },
  { title: 'PUSH', body: 'The new value travels encrypted straight to your targets: Infisical, env files, webhooks, Keychain.', icon: Send },
  { title: 'VERIFY', body: 'Each target confirms receipt. Fingerprints are compared — never values.', icon: ShieldCheck },
  { title: 'COMMIT', body: 'The rotation is finalized, the old credential is revoked at the provider.', icon: CheckCircle2 },
  { title: 'AUDIT', body: 'A hash-chained record is written to the immutable log. Every run, forever.', icon: ScrollText },
]

const CONNECTORS: { name: string; letters: string; capability: Capability }[] = [
  { name: 'Infisical', letters: 'inf', capability: 'programmatic' },
  { name: 'AWS IAM', letters: 'aws', capability: 'programmatic' },
  { name: 'GitHub', letters: 'gh', capability: 'partial' },
  { name: 'Stripe', letters: 'str', capability: 'programmatic' },
  { name: 'OpenAI', letters: 'oai', capability: 'programmatic' },
  { name: 'Anthropic', letters: 'ant', capability: 'partial' },
  { name: 'Cloudflare', letters: 'cf', capability: 'programmatic' },
  { name: 'Vercel', letters: 'vcl', capability: 'programmatic' },
  { name: 'Twilio', letters: 'tw', capability: 'programmatic' },
  { name: 'SendGrid', letters: 'sg', capability: 'programmatic' },
  { name: 'Resend', letters: 're', capability: 'programmatic' },
  { name: 'Slack', letters: 'slk', capability: 'partial' },
  { name: 'npm', letters: 'npm', capability: 'programmatic' },
  { name: 'Docker Hub', letters: 'dkr', capability: 'programmatic' },
  { name: 'Kubernetes', letters: 'k8s', capability: 'programmatic' },
  { name: 'Coolify', letters: 'cy', capability: 'update-only' },
  { name: 'xAI', letters: 'xai', capability: 'update-only' },
  { name: 'Groq', letters: 'gq', capability: 'update-only' },
  { name: 'Hugging Face', letters: 'hf', capability: 'programmatic' },
  { name: 'Neon', letters: 'ne', capability: 'programmatic' },
  { name: 'Generic REST', letters: 'rest', capability: 'programmatic' },
]

const RUN_CAPTION = 'run_01H… · 6/6 steps · 3.4s · verified ✓'

/* ------------------------------------------------------------------ */
/* Typewriter helper                                                   */
/* ------------------------------------------------------------------ */

function useTypewriter(text: string, start: boolean, speed = 18) {
  const [out, setOut] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!start) return
    let i = 0
    const id = window.setInterval(() => {
      i++
      setOut(text.slice(0, i))
      if (i >= text.length) {
        window.clearInterval(id)
        setDone(true)
      }
    }, speed)
    return () => window.clearInterval(id)
  }, [start, text, speed])
  return { out, done }
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const root = useRef<HTMLDivElement>(null)
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  // Pipeline pinned-scroll state
  const [activeStep, setActiveStep] = useState(0)
  const [pipelineDone, setPipelineDone] = useState(false)
  const caption = useTypewriter(RUN_CAPTION, pipelineDone, 20)

  // Security band typewriters
  const [secStart, setSecStart] = useState(false)
  const stored = useTypewriter('metadata · records · sha256', secStart, 18)
  const never = useTypewriter('plaintext · key material', secStart && stored.done, 18)
  const transport = useTypewriter('TLS 1.3 · E2E to Keychain', secStart && never.done, 18)

  // Lenis smooth scroll (landing)
  useEffect(() => {
    if (reduced) return
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [reduced])

  useGSAP(
    () => {
      const q = gsap.utils.selector(root)

      /* ---------- Section 1: hero intro ---------- */
      let split: SplitText | null = null
      if (!reduced) {
        split = new SplitText(q('.hero-h1'), { type: 'words' })
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.from(q('.hero-eyebrow'), { opacity: 0, duration: 0.2 })
          .from(
            split.words,
            { y: 60, rotateX: -40, opacity: 0, stagger: 0.08, duration: 0.7 },
            '>',
          )
          .from(q('.hero-sub'), { opacity: 0, y: 20, duration: 0.5 }, '+=0.12')
          .from(q('.hero-cta'), { opacity: 0, y: 20, duration: 0.5, stagger: 0.12 }, '<')
          .from(q('.hero-proof'), { opacity: 0, duration: 0.4 }, '<0.12')
      } else {
        gsap.from(q('.hero-fade'), { opacity: 0, duration: 0.6, stagger: 0.1 })
      }

      // headline parallax over first 100vh
      gsap.to(q('.hero-content'), {
        y: -80,
        ease: 'none',
        scrollTrigger: { trigger: q('.hero-section'), start: 'top top', end: 'bottom top', scrub: true },
      })

      /* ---------- Section 2: the problem ---------- */
      if (!reduced) {
        ScrollTrigger.create({
          trigger: q('.problem-section'),
          start: 'top 80px',
          end: '+=120%',
          pin: q('.problem-left'),
          pinSpacing: false,
        })
      }
      q<HTMLElement>('.stat-card').forEach((card, i) => {
        gsap.from(card, {
          x: 60,
          opacity: 0,
          duration: 0.7,
          ease: 'power3.out',
          delay: i * 0.15,
          scrollTrigger: { trigger: card, start: 'top 60%' },
        })
        const numEl = card.querySelector<HTMLElement>('.stat-num')
        const target = Number(numEl?.dataset.count ?? '0')
        if (numEl && target > 0) {
          const obj = { v: 0 }
          gsap.to(obj, {
            v: target,
            duration: 1.2,
            ease: 'power2.out',
            scrollTrigger: { trigger: card, start: 'top 60%' },
            onUpdate: () => {
              numEl.textContent = String(Math.round(obj.v))
            },
          })
        }
      })

      /* ---------- Section 3: pipeline pinned story ---------- */
      if (!reduced) {
        ScrollTrigger.create({
          trigger: q('.pipeline-section'),
          start: 'top top',
          end: '+=250%',
          pin: true,
          onUpdate: (self) => {
            const p = self.progress
            const idx = Math.min(5, Math.floor(p * 6))
            setActiveStep(idx)
            setPipelineDone(p >= 0.985)
          },
        })
      } else {
        setPipelineDone(true)
        setActiveStep(5)
      }

      /* ---------- Section 4: connectors ---------- */
      gsap.from(q('.sec4-head'), {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.06,
        ease: 'power3.out',
        scrollTrigger: { trigger: q('.connectors-section'), start: 'top 20%' },
      })
      gsap.fromTo(
        q('.marquee-row'),
        { opacity: 0.4 },
        { opacity: 1, duration: 0.8, scrollTrigger: { trigger: q('.marquee-row'), start: 'top 85%' } },
      )
      q<HTMLElement>('.cap-card').forEach((card, i) => {
        gsap.from(card, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          delay: i * 0.12,
          scrollTrigger: { trigger: card, start: 'top 80%' },
        })
        const badge = card.querySelector('.cap-badge')
        if (badge) {
          gsap.from(badge, {
            scale: 0.8,
            duration: 0.2,
            ease: 'back.out(2)',
            delay: i * 0.12 + 0.1,
            scrollTrigger: { trigger: card, start: 'top 80%' },
          })
        }
      })

      /* ---------- Section 5: targets ---------- */
      q<HTMLElement>('.check-item').forEach((item, i) => {
        gsap.from(item, {
          y: 20,
          opacity: 0,
          duration: 0.5,
          delay: i * 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: item, start: 'top 85%' },
        })
        const checkPath = item.querySelector('path')
        if (checkPath) {
          const len = checkPath.getTotalLength()
          gsap.fromTo(
            checkPath,
            { strokeDasharray: len, strokeDashoffset: len },
            {
              strokeDashoffset: 0,
              duration: 0.25,
              delay: i * 0.1 + 0.2,
              scrollTrigger: { trigger: item, start: 'top 85%' },
            },
          )
        }
      })
      q<SVGPathElement>('.delivery-path').forEach((path, i) => {
        const len = path.getTotalLength()
        gsap.fromTo(
          path,
          { strokeDasharray: len, strokeDashoffset: len },
          {
            strokeDashoffset: 0,
            duration: 0.9,
            delay: i * 0.15,
            ease: 'power2.out',
            scrollTrigger: { trigger: q('.diagram-card'), start: 'top 70%' },
          },
        )
      })
      gsap.fromTo(
        q('.diagram-card'),
        { y: 30 },
        {
          y: -30,
          ease: 'none',
          scrollTrigger: { trigger: q('.diagram-card'), start: 'top bottom', end: 'bottom top', scrub: true },
        },
      )

      /* ---------- Section 6: security band ---------- */
      ScrollTrigger.create({
        trigger: q('.security-band'),
        start: 'top 40%',
        onEnter: () => setSecStart(true),
      })
      gsap.from(q('.sec6-fade'), {
        y: 32,
        opacity: 0,
        duration: 0.7,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: q('.security-band'), start: 'top 60%' },
      })

      /* ---------- Section 7: companions ---------- */
      gsap.from(q('.companion-ios'), {
        x: -60,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
        scrollTrigger: { trigger: q('.companions-section'), start: 'top 25%' },
      })
      gsap.from(q('.companion-macos'), {
        x: 60,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
        scrollTrigger: { trigger: q('.companions-section'), start: 'top 25%' },
      })

      /* ---------- Section 8: CTA band ---------- */
      gsap.from(q('.cta-head-word'), {
        y: 40,
        opacity: 0,
        duration: 0.7,
        stagger: 0.06,
        ease: 'power3.out',
        scrollTrigger: { trigger: q('.cta-band'), start: 'top 30%' },
      })

      return () => split?.revert()
    },
    { scope: root, dependencies: [reduced] },
  )

  const stepStates: StepState[] = PIPELINE_STEPS.map((_, i) =>
    pipelineDone || i < activeStep ? 'ok' : i === activeStep ? 'running' : 'pending',
  )
  const ActiveIcon = STEP_COPY[activeStep]!.icon

  return (
    <div ref={root} className="relative">
      <LandingCursor />

      {/* ================= Section 1 — Hero ================= */}
      {/* full-bleed: opt out of Layout's 72px nav offset */}
      <section className="hero-section relative -mt-[72px] flex min-h-[100dvh] items-center justify-center overflow-hidden">
        {/* low-power fallback poster: dimmed, blurred */}
        <img
          src="/hero-gyro.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30 blur-md"
        />
        <div className="hero-radial absolute inset-0" />
        {!reduced && (
          <Suspense fallback={null}>
            <div className="absolute inset-0">
              <Gyroscope />
            </div>
          </Suspense>
        )}
        <div className="noise-overlay pointer-events-none absolute inset-0" />

        <div className="hero-content relative z-10 mx-auto flex max-w-[900px] flex-col items-center px-6 pb-24 pt-[72px] text-center">
          <div className="hero-eyebrow hero-fade text-mono-s mb-6 inline-flex items-center gap-2 rounded-full border border-line-subtle bg-panel/60 px-4 py-1.5 uppercase tracking-[0.08em] text-ink-secondary backdrop-blur">
            <span className="size-1.5 rounded-full bg-spin" />
            Zero-plaintext secret rotation
          </div>

          <h1 className="hero-h1 hero-fade font-display text-[44px] font-semibold leading-[48px] tracking-[-0.03em] text-ink-primary md:text-[72px] md:leading-[76px]">
            Rotate everything.
            <br />
            <span className="text-spin">Store nothing.</span>
          </h1>

          <p className="hero-sub hero-fade mt-6 max-w-[560px] text-[15px] leading-6 text-ink-secondary">
            TopSpin rotates API keys and secrets across every platform you use — AWS, GitHub,
            Stripe, OpenAI, and 10 more — then delivers them to Infisical, your env files,
            webhooks, and Apple Keychain. Plaintext never touches our servers. Ever.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="hero-cta group flex items-center gap-2 rounded-control bg-spin px-6 py-3 text-[15px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.04] active:scale-[0.97]"
            >
              Open the console
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            <button
              onClick={() => document.querySelector('#pipeline')?.scrollIntoView({ behavior: 'smooth' })}
              className="hero-cta rounded-control border border-line-subtle px-6 py-3 text-[15px] font-medium text-ink-secondary transition-colors duration-200 hover:border-line-strong hover:text-ink-primary"
            >
              See how it works
            </button>
          </div>

          <p className="hero-proof hero-fade text-mono-s mt-8 text-ink-muted">
            sha256 only · no plaintext at rest · hash-chained audit log
          </p>
        </div>

        {/* scroll cue */}
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
          <div className="relative h-12 w-px bg-line-subtle">
            <span
              className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-spin"
              style={{ animation: 'scroll-cue 2s ease-in-out infinite' }}
            />
          </div>
        </div>
      </section>

      {/* ================= Section 2 — The Problem ================= */}
      <section className="problem-section relative py-28">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-16 px-6 lg:grid-cols-2">
          <div className="problem-left self-start">
            <div className="text-label mb-4 text-spin">The problem</div>
            <h2 className="font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
              Your secrets are older than you think.
            </h2>
          </div>
          <div className="space-y-6">
            <div className="stat-card panel-light rounded-card border border-line-subtle bg-panel p-6">
              <div className="tnum font-mono text-xl font-medium leading-7 tracking-[-0.01em] text-danger">
                <span className="stat-num" data-count="217">0</span> days
              </div>
              <p className="mt-2 text-[13px] leading-5 text-ink-secondary">
                average age of a production API key
              </p>
            </div>
            <div className="stat-card panel-light rounded-card border border-line-subtle bg-panel p-6">
              <div className="tnum font-mono text-xl font-medium leading-7 tracking-[-0.01em] text-warn">
                1 in <span className="stat-num" data-count="3">0</span>
              </div>
              <p className="mt-2 text-[13px] leading-5 text-ink-secondary">
                breaches involve leaked or stale credentials
              </p>
            </div>
            <div className="stat-card panel-light rounded-card border border-line-subtle bg-panel p-6">
              <div className="tnum font-mono text-xl font-medium leading-7 tracking-[-0.01em] text-spin">0</div>
              <p className="mt-2 text-[13px] leading-5 text-ink-secondary">
                plaintext secrets TopSpin will ever store
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Section 3 — Pipeline (pinned) ================= */}
      <section id="pipeline" className="pipeline-section relative">
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
          <div className="text-label mb-4 text-spin">How it works</div>
          <h2 className="mb-16 max-w-[720px] text-center font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
            Six steps. Every rotation. No exceptions.
          </h2>

          <PipelineStepper steps={stepStates} nodeSize={40} />

          <div className="mt-14 h-[150px] w-full max-w-[440px]">
            <div
              key={activeStep}
              className="panel-light rounded-card border border-line-subtle bg-panel p-6"
              style={{ animation: 'card-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-control border border-spin-dim bg-spin/10 text-spin">
                  <ActiveIcon className="size-4" />
                </span>
                <span className="text-mono-s uppercase tracking-[0.08em] text-spin">
                  Step {activeStep + 1} · {STEP_COPY[activeStep]!.title}
                </span>
              </div>
              <p className="text-[15px] leading-6 text-ink-secondary">{STEP_COPY[activeStep]!.body}</p>
            </div>
          </div>

          <div className="text-mono-s mt-6 h-4 text-ink-muted">
            {pipelineDone && (
              <>
                <span className="text-spin">{caption.out}</span>
                {!caption.done && (
                  <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-spin" style={{ animation: 'cursor-blink 1s step-end infinite' }} />
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ================= Section 4 — Connectors ================= */}
      <section id="connectors" className="connectors-section relative overflow-hidden py-28">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="sec4-head text-label mb-4 text-spin">Connectors</div>
          <h2 className="sec4-head max-w-[720px] font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
            One rotation engine. Every platform.
          </h2>
        </div>

        {/* marquee */}
        <div className="marquee-row group relative mt-14 overflow-hidden border-y border-line-subtle py-5">
          <div className="flex w-max animate-marquee gap-4 pr-4 group-hover:[animation-play-state:paused]">
            {[...CONNECTORS, ...CONNECTORS].map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                className="flex items-center gap-3 rounded-card border border-line-subtle bg-panel px-4 py-3 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-raised font-mono text-[11px] font-medium text-ink-secondary">
                  {c.letters}
                </span>
                <span className="whitespace-nowrap text-sm text-ink-primary">{c.name}</span>
                <CapabilityBadge capability={c.capability} />
              </div>
            ))}
          </div>
        </div>

        {/* capability explainers */}
        <div className="mx-auto mt-16 grid max-w-[1200px] grid-cols-1 gap-6 px-6 md:grid-cols-3">
          <div className="cap-card panel-light rounded-card border border-line-subtle bg-panel p-6">
            <span className="cap-badge inline-block">
              <CapabilityBadge capability="programmatic" />
            </span>
            <p className="mt-4 text-[15px] leading-6 text-ink-secondary">
              Full lifecycle via API — create, verify, revoke. True hands-off rotation.
            </p>
            <p className="text-mono-s mt-4 text-ink-muted">e.g. AWS IAM, Stripe, GitHub, Cloudflare, Vercel</p>
          </div>
          <div className="cap-card panel-light rounded-card border border-line-subtle bg-panel p-6">
            <span className="cap-badge inline-block">
              <CapabilityBadge capability="partial" />
            </span>
            <p className="mt-4 text-[15px] leading-6 text-ink-secondary">
              Creation is automated; revocation or scoping needs a policy-defined follow-up.
            </p>
            <p className="text-mono-s mt-4 text-ink-muted">e.g. npm, Docker Hub</p>
          </div>
          <div className="cap-card panel-light rounded-card border border-line-subtle bg-panel p-6">
            <span className="cap-badge inline-block">
              <CapabilityBadge capability="update-only" />
            </span>
            <p className="mt-4 text-[15px] leading-6 text-ink-secondary">
              Provider can&apos;t mint keys via API — TopSpin drives the update, delivery, and
              verification of a value you supply.
            </p>
            <p className="text-mono-s mt-4 text-ink-muted">e.g. Generic REST, some Slack scopes</p>
          </div>
        </div>
      </section>

      {/* ================= Section 5 — Targets ================= */}
      <section className="relative py-28">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-16 px-6 lg:grid-cols-[55fr_45fr]">
          <div>
            <div className="text-label mb-4 text-spin">Targets</div>
            <h2 className="font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
              New secrets, delivered where they live.
            </h2>
            <p className="mt-5 max-w-[520px] text-[15px] leading-6 text-ink-secondary">
              A rotation isn&apos;t done until every consumer has the new value. TopSpin pushes to:
            </p>
            <ul className="mt-8 space-y-5">
              {[
                ['Infisical workspaces', 'native sync into projects & environments'],
                ['File targets', '.env, JSON, YAML, TOML, INI — including ~/.aws/credentials'],
                ['Webhooks', 'signed HMAC payloads to any HTTPS endpoint'],
                ['Apple Keychain', 'end-to-end encrypted via the iOS & macOS companions'],
              ].map(([title, sub]) => (
                <li key={title} className="check-item flex items-start gap-3.5">
                  <svg width="22" height="22" viewBox="0 0 22 22" className="mt-0.5 shrink-0">
                    <circle cx="11" cy="11" r="10" fill="none" stroke="#178A64" strokeWidth="1.5" />
                    <path
                      d="M 6.5 11.5 L 9.5 14.5 L 15.5 8"
                      fill="none"
                      stroke="#2EE6A8"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div>
                    <div className="text-[15px] font-medium text-ink-primary">{title}</div>
                    <div className="text-[13px] leading-5 text-ink-secondary">{sub}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* delivery diagram */}
          <div className="diagram-card panel-light rounded-card border border-line-subtle bg-panel p-6">
            <svg viewBox="0 0 400 320" className="w-full">
              {/* curved paths */}
              <path id="dp1" className="delivery-path" d="M 120 160 C 190 160 210 46 280 46" fill="none" stroke="#2A3247" strokeWidth="1.5" />
              <path id="dp2" className="delivery-path" d="M 120 160 C 190 160 210 122 280 122" fill="none" stroke="#2A3247" strokeWidth="1.5" />
              <path id="dp3" className="delivery-path" d="M 120 160 C 190 160 210 198 280 198" fill="none" stroke="#2A3247" strokeWidth="1.5" />
              <path id="dp4" className="delivery-path" d="M 120 160 C 190 160 210 274 280 274" fill="none" stroke="#2A3247" strokeWidth="1.5" />
              {/* packets */}
              {['#dp1', '#dp2', '#dp3', '#dp4'].map((href, i) => (
                <circle key={href} r="2.5" fill="#2EE6A8">
                  <animateMotion dur="2.4s" begin={`${i * 0.3}s`} repeatCount="indefinite">
                    <mpath href={href} />
                  </animateMotion>
                </circle>
              ))}
              {/* center node */}
              <rect x="24" y="136" width="96" height="48" rx="10" fill="#11151F" stroke="#2EE6A8" strokeWidth="1.5" />
              <text x="72" y="156" textAnchor="middle" fill="#E8ECF4" fontSize="11" fontFamily="JetBrains Mono, monospace">TopSpin</text>
              <text x="72" y="172" textAnchor="middle" fill="#2EE6A8" fontSize="11" fontFamily="JetBrains Mono, monospace">Engine</text>
              {/* target chips */}
              {[
                ['Infisical', 30],
                ['Env files', 106],
                ['Webhooks', 182],
                ['Keychain', 258],
              ].map(([label, y]) => (
                <g key={label as string}>
                  <rect x="280" y={(y as number)} width="96" height="32" rx="8" fill="#0C0F16" stroke="#1B2130" />
                  <text x="328" y={(y as number) + 20} textAnchor="middle" fill="#9AA5B8" fontSize="11" fontFamily="JetBrains Mono, monospace">
                    {label}
                  </text>
                </g>
              ))}
            </svg>
            <p className="text-mono-s mt-4 text-center text-ink-muted">
              encrypted delivery · fingerprint-verified
            </p>
          </div>
        </div>
      </section>

      {/* ================= Section 6 — Zero-plaintext band ================= */}
      <section id="security" className="security-band relative border-y border-line-subtle bg-inset py-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'url(/texture-topo.svg)', backgroundSize: 'cover' }}
        />
        <div className="relative mx-auto max-w-[760px] px-6 text-center">
          <div className="sec6-fade text-label mb-4 text-spin">Security model</div>
          <h2 className="sec6-fade font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
            We couldn&apos;t leak your secrets if we tried.
          </h2>
          <p className="sec6-fade mx-auto mt-5 max-w-[640px] text-[15px] leading-6 text-ink-secondary">
            TopSpin stores metadata, rotation records, and sha256 fingerprints — nothing else.
            Values move point-to-point, encrypted, and are never persisted by us. Verification
            compares hashes, not secrets.
          </p>

          <div className="sec6-fade mt-12 grid grid-cols-1 gap-4 text-left md:grid-cols-3">
            <div className="rounded-card border border-line-subtle bg-panel p-5 font-mono text-[13px] leading-6">
              <div className="text-mono-s uppercase text-ink-muted">stored:</div>
              <div className="mt-2 min-h-[48px] text-spin">
                {stored.out}
                {secStart && !stored.done && <TypeCursor />}
              </div>
            </div>
            <div className="rounded-card border border-line-subtle bg-panel p-5 font-mono text-[13px] leading-6">
              <div className="text-mono-s uppercase text-ink-muted">never stored:</div>
              <div className="mt-2 min-h-[48px] text-danger">
                {never.out}
                {stored.done && !never.done && <TypeCursor />}
              </div>
            </div>
            <div className="rounded-card border border-line-subtle bg-panel p-5 font-mono text-[13px] leading-6">
              <div className="text-mono-s uppercase text-ink-muted">transport:</div>
              <div className="mt-2 min-h-[48px] text-info">
                {transport.out}
                {never.done && !transport.done && <TypeCursor />}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Section 7 — Companions ================= */}
      <section id="companions" className="companions-section relative py-28">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="text-label mb-4 text-spin">Companion apps</div>
          <h2 className="max-w-[720px] font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
            Your Mac and iPhone are targets too.
          </h2>
          <p className="mt-4 max-w-[620px] text-[13px] leading-5 text-ink-secondary">
            The TopSpin companions receive rotated secrets end-to-end encrypted and write them
            straight into Apple Keychain — approve each delivery with Face ID, or let policy
            auto-approve.
          </p>

          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="companion-ios group panel-light rounded-card border border-line-subtle bg-panel p-6 transition-transform duration-300 hover:scale-[1.02]">
              <div className="flex justify-center p-6">
                <img
                  src="/companion-ios.png"
                  alt="TopSpin iOS companion — Keychain Sync screen"
                  className="max-h-[560px] w-auto rounded-[24px] shadow-[0_24px_48px_rgba(46,230,168,0.10)] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_32px_64px_rgba(46,230,168,0.16)]"
                />
              </div>
              <p className="text-[13px] leading-5 text-ink-secondary">
                iOS — approve rotations with Face ID, review fingerprints, Keychain delivery.
              </p>
              <a
                href="#companions"
                className="group/btn mt-4 inline-flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
              >
                <Apple className="size-4" />
                Download on the App Store
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
              </a>
            </div>

            <div className="companion-macos group panel-light rounded-card border border-line-subtle bg-panel p-6 transition-transform duration-300 hover:scale-[1.02]">
              <div className="flex items-center justify-center p-6 lg:min-h-[608px]">
                <img
                  src="/companion-macos.png"
                  alt="TopSpin macOS companion — Apple Keychain targets window"
                  className="w-full rounded-card shadow-[0_24px_48px_rgba(46,230,168,0.10)] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_32px_64px_rgba(46,230,168,0.16)]"
                />
              </div>
              <p className="text-[13px] leading-5 text-ink-secondary">
                macOS — menu-bar agent, <span className="font-mono">~/.aws/credentials</span> and
                Keychain write targets, Touch ID approvals.
              </p>
              <a
                href="#companions"
                className="group/btn mt-4 inline-flex items-center gap-2 rounded-control border border-line-subtle px-4 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
              >
                <Apple className="size-4" />
                Download for macOS
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================= Section 8 — CTA band ================= */}
      <section className="cta-band relative overflow-hidden border-t border-line-subtle py-32">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(800px 400px at 50% 50%, rgba(46,230,168,0.10), transparent 60%)' }} />
        <div
          className="dial-conic pointer-events-none absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.07] blur-3xl"
          style={{ animation: 'glow-rotate 20s linear infinite' }}
        />
        <div className="relative mx-auto max-w-[760px] px-6 text-center">
          <h2 className="font-display text-[48px] font-semibold leading-[54px] tracking-[-0.025em] text-ink-primary">
            {'Start rotating in five minutes.'.split(' ').map((w, i) => (
              <span key={i} className="cta-head-word inline-block overflow-visible">
                {w}
                {i < 4 ? ' ' : ''}
              </span>
            ))}
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-6 text-ink-secondary">
            Connect your first provider, set a policy, and watch the pipeline run. Free for your
            first 25 secrets.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="group flex items-center gap-2 rounded-control bg-spin px-6 py-3 text-[15px] font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.04] active:scale-[0.97]"
            >
              Open the console
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            <a
              href="#docs"
              className="rounded-control border border-line-subtle px-6 py-3 text-[15px] font-medium text-ink-secondary transition-colors duration-200 hover:border-line-strong hover:text-ink-primary"
            >
              Read the docs
            </a>
          </div>
          <p className="text-mono-s mt-8 text-ink-muted">no credit card · soc 2 type ii · zero plaintext</p>
        </div>
      </section>
    </div>
  )
}

function TypeCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-3.5 w-2 translate-y-0.5 bg-ink-secondary"
      style={{ animation: 'cursor-blink 0.5s step-end 3, none 0s 1.6s forwards' }}
    />
  )
}

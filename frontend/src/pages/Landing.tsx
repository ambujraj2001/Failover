import { ArrowRight, Bot, Map, MessagesSquare, Puzzle } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import LabWorkspace from '@/components/lab/LabWorkspace'
import { usePublicStats } from '@/components/landing/data'
import { HeroVisual } from '@/components/landing/HeroVisual'
import { buttonVariants } from '@/components/ui/button'
import { BRAND, cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>
}

function Header() {
  const status = useAuth((s) => s.status)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors duration-200',
        scrolled ? 'border-b border-white/[0.06] bg-ink-900/80 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" aria-label={`${BRAND.name} home`} className="flex h-full items-center">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-[14px] text-fg-muted md:flex" aria-label="Sections">
          <a href="#how" className="transition-colors hover:text-fg">How it works</a>
          <a href="#try" className="transition-colors hover:text-fg">Try a lab</a>
          <a href="#features" className="transition-colors hover:text-fg">Features</a>
        </nav>
        <div className="flex items-center gap-2">
          {status === 'authed' ? (
            <Link to="/app" className={buttonVariants({ size: 'sm' })}>
              Open app
            </Link>
          ) : (
            <>
              <Link to="/signin" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Sign in
              </Link>
              <Link to="/signup" className={buttonVariants({ size: 'sm' })}>
                Get started
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  )
}

function Hero() {
  const stats = usePublicStats().data
  return (
    <section className="relative overflow-hidden pt-20 pb-24 sm:pt-28">
      {/* single soft light from above; no blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgb(255_255_255/0.06),transparent_70%)]"
      />
      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[13px] text-fg-muted">
            <span className="size-1.5 rounded-full bg-brand-500" />
            A 30-day system design course
          </p>
          <h1 className="mt-7 text-[44px] leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
            Learn system design by fixing real outages.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-fg-muted">
            Every lesson ends with a broken system. Redesign it on a canvas, and a traffic simulator tells you whether it
            holds up.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup" className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
              Start for free <ArrowRight />
            </Link>
            <a href="#try" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full sm:w-auto')}>
              Try a lab first
            </a>
          </div>
          {stats && (
            <p className="mt-6 text-[13px] text-fg-subtle">
              {stats.labs} labs · {stats.problems} interview problems · {stats.lessons} lessons
            </p>
          )}
        </div>
        <div className="mx-auto mt-16 max-w-4xl">
          <HeroVisual />
        </div>
      </Container>
    </section>
  )
}

function SectionHead({ id, title, body }: { id?: string; title: string; body?: string }) {
  return (
    <div id={id} className="mx-auto max-w-2xl scroll-mt-24 text-center">
      <h2 className="text-[32px] leading-tight tracking-[-0.03em] sm:text-[40px]">{title}</h2>
      {body && <p className="mt-4 text-[16px] leading-relaxed text-fg-muted">{body}</p>}
    </div>
  )
}

const STEPS = [
  { title: 'Read the incident', body: 'Each lab starts with a page: what is slow, what is failing, and the budget you have.' },
  { title: 'Fix the design', body: 'Drag in caches, replicas, queues and load balancers. Every part has a real cost.' },
  { title: 'Pass the tests', body: 'The simulator replays traffic spikes and failures. Pass them all within budget.' },
]

function HowItWorks() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHead id="how" title="How it works" body="Short lessons explain the idea. A hands-on lab makes it stick." />
        <ol className="mt-16 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-7">
              <span className="font-mono text-[13px] text-fg-subtle">0{i + 1}</span>
              <h3 className="mt-6 text-[18px] tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

function TryLab() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHead
          id="try"
          title="Try a real lab"
          body="A link shortener is overloaded. Find the bottleneck, change the design and press Run. No account needed."
        />
        <div className="mx-auto mt-14 h-[620px] max-w-6xl overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] sm:h-[700px]">
          <LabWorkspace mode="demo" embedded />
        </div>
      </Container>
    </section>
  )
}

const FEATURES = [
  { icon: <Map />, title: 'A clear 30-day path', body: 'One topic a day, from a single server to multi-region systems. You always know what to do next.' },
  { icon: <Puzzle />, title: 'Real interview problems', body: 'Design a URL shortener, a chat app, YouTube or Uber, and see how your design holds under load.' },
  { icon: <Bot />, title: 'An AI mentor that coaches', body: 'Ask why your design is failing. It reads your canvas and your results, and guides you without giving it away.' },
  { icon: <MessagesSquare />, title: 'Mock interviews', body: 'A timed 45-minute interview with follow-up questions and a written score for your target level.' },
]

function Features() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <SectionHead id="features" title="Everything you need to get interview-ready" />
        <div className="mx-auto mt-16 grid max-w-5xl gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-8">
              <span className="grid size-10 place-items-center rounded-xl bg-white/[0.06] text-fg [&_svg]:size-5">{f.icon}</span>
              <h3 className="mt-6 text-[18px] tracking-[-0.02em]">{f.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="pt-8 pb-28">
      <Container>
        <div className="card relative overflow-hidden px-8 py-16 text-center sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_50%_120%,rgb(255_106_43/0.12),transparent_70%)]"
          />
          <h2 className="relative text-[32px] tracking-[-0.03em] sm:text-[40px]">Start with day one</h2>
          <p className="relative mx-auto mt-4 max-w-md text-[16px] text-fg-muted">
            Two short lessons and your first lab. About 30 minutes.
          </p>
          <Link to="/signup" className={cn(buttonVariants({ size: 'lg' }), 'relative mt-8')}>
            Create a free account <ArrowRight />
          </Link>
        </div>
      </Container>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <Container className="flex flex-col items-center justify-between gap-4 text-[13px] text-fg-subtle sm:flex-row">
        <Logo size="sm" />
        <p>© {new Date().getFullYear()} {BRAND.name}</p>
        <div className="flex gap-6">
          <Link to="/signin" className="hover:text-fg">Sign in</Link>
          <Link to="/signup" className="hover:text-fg">Create account</Link>
        </div>
      </Container>
    </footer>
  )
}

export default function Landing() {
  useEffect(() => {
    const prev = document.title
    document.title = `${BRAND.name} · ${BRAND.tagline}`
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <div className="min-h-full overflow-x-clip bg-ink-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-3 focus:py-2 focus:text-[13px] focus:text-fg"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <HowItWorks />
        <TryLab />
        <Features />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}

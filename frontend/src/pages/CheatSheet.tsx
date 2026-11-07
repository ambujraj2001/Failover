import { useQuery } from '@tanstack/react-query'
import { NotebookText, Printer } from 'lucide-react'
import { qk } from '@/components/learn/queries'
import { PageIntro } from '@/components/learn/shared'
import type { CheatSection } from '@/components/learn/types'
import { PageContainer } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { api } from '@/lib/api'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** Print rules: drop the app chrome and switch to dark-on-white sections. */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body { background: #fff !important; color: #111 !important; }
  aside, body div.fixed.inset-x-0.top-0, [data-noprint] { display: none !important; }
  main { padding-top: 0 !important; }
  [data-cheatsheet] * { color: #111 !important; background: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
  [data-cheatsheet] section { break-inside: avoid-page; }
  [data-cheatsheet] [data-row] { break-inside: avoid; }
}
`

export default function CheatSheet() {
  const q = useQuery({ queryKey: qk.cheatsheet, queryFn: () => api<CheatSection[]>('/cheatsheet'), staleTime: 10 * 60_000 })

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <PageContainer>
      <style>{PRINT_CSS}</style>
      <div data-cheatsheet>
        <PageIntro
          title="Cheat sheet"
          actions={
            <span data-noprint>
              <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!q.data?.length}>
                <Printer /> Print
              </Button>
            </span>
          }
        >
          Handy numbers and formulas for quick estimates. Rough rules of thumb, not exact benchmarks.
        </PageIntro>

        {q.isPending ? (
          <div aria-busy="true" aria-label="Loading cheat sheet">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-28 rounded-full" />
              ))}
            </div>
            <div className="mt-10 space-y-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </div>
        ) : q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState icon={<NotebookText />} title="Nothing here yet" body="The cheat sheet is being written. Check back soon." />
        ) : (
          <>
            <nav aria-label="Jump to a section" data-noprint>
              <ul className="flex flex-wrap gap-2">
                {q.data.map((s) => {
                  const id = slugify(s.title)
                  return (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          jump(id)
                        }}
                        className="inline-flex h-8 items-center rounded-full bg-white/[0.04] px-3.5 text-[13px] text-fg-muted transition-colors hover:bg-white/[0.07] hover:text-fg"
                      >
                        {s.title}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="mt-10 space-y-6">
              {q.data.map((s) => (
                <SectionCard key={s.title} section={s} />
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}

function SectionCard({ section }: { section: CheatSection }) {
  const id = slugify(section.title)
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-20 overflow-hidden lg:scroll-mt-8">
      <h2 id={`${id}-h`} className="px-6 pt-6 pb-3 text-[17px] sm:px-8 sm:pt-7">
        {section.title}
      </h2>
      <dl className="px-2 pb-2 sm:px-4 sm:pb-4">
        {section.rows.map((r, i) => (
          <div
            key={`${r.label}-${i}`}
            data-row
            className="flex min-h-12 items-start justify-between gap-6 rounded-xl px-4 py-3 transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <dt className="min-w-0">
              <span className="block text-[14.5px] text-fg">{r.label}</span>
              {r.note && <span className="mt-0.5 block text-[13px] text-fg-subtle">{r.note}</span>}
            </dt>
            <dd className="max-w-[50%] shrink-0 text-right font-mono text-[13.5px] break-words text-fg tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

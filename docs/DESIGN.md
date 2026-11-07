# Failover design system: calm premium dark

The product should feel like a premium consumer-grade tool (Linear, Vercel, Raycast, Arc): calm, spacious,
confident, easy for a beginner. Show less, but make every element feel considered.

**Reference implementations — copy their patterns:** `frontend/src/pages/Dashboard.tsx` (signed-in pages) and
`frontend/src/pages/Landing.tsx` (marketing). Tokens: `frontend/src/index.css`. Primitives:
`frontend/src/components/ui/*`.

## Principles

1. **One job per screen.** Each page has one obvious next action (one primary button, white). Secondary actions are
   `secondary` or `ghost` buttons, or quiet text links.
2. **Less information.** Show what a beginner needs to decide what to do next. Move detail behind a click
   (expandable row, dialog, detail page). If a number does not change a decision, drop it.
3. **Space is the luxury.** Generous padding (cards `p-6`–`p-8`), gaps of 20–24px between cards, 40px+ between page
   sections. Page container: `PageContainer` (max-w-5xl). Don't fill every inch.
4. **Big, quiet type.** Page title 30–32px semibold, tight tracking. Card titles 15–18px. Body 14.5–15px `text-fg-muted`.
   Meta 12.5–13px `text-fg-subtle`. Sentence case everywhere; no uppercase labels, no letter-spacing.
5. **Soft surfaces.** Use the `.card` class (12–16px radius, layered gradient, faint top highlight). Lists inside cards
   are rows with `rounded-xl` hover (`hover:bg-white/[0.04]`), not ruled tables. Real tables only where the data is
   genuinely tabular and dense (cheat sheet, practice list), and then with roomy rows (48px+) and no vertical lines.
6. **Colour is rare.** Neutral graphite UI. White primary buttons. The warm accent `brand-500` (orange) only for: the
   small "up next"/live dot, the streak flame, and at most one soft radial glow per page. Status colours (`ok`, `warn`,
   `crit`) only for state, usually a small dot or soft pill (`Badge` tones).
7. **Icons as quiet helpers.** lucide icons at 16–18px in `text-fg-subtle`, inside soft round/rounded tiles
   (`bg-white/[0.05]`) for list items and feature cards. Never decorative clusters.
8. **Plain, friendly copy.** Write for a smart beginner. Short sentences, no jargon in UI chrome, no slogans. Friendly
   is fine ("Good evening, Dev"); cute or salesy is not.
9. **Mono only for numbers in technical contexts** (latency, cost, timers). Not for labels.
10. **Motion:** 150–200ms fades and colour transitions; buttons `active:scale-[0.98]`. Nothing bouncy.

## Never

- Dense dashboards: heatmaps, multi-column stat strips, tables of everything on one screen.
- Uppercase/mono "eyebrow" labels, two-tone headlines, gradient text, glowing blobs, sparkle icons.
- More than one primary (white) button visible at once.
- Hairline-ruled "ops console" tables for simple lists.
- Tiny text (< 12px) except chart axes.

## Building blocks

| Need | Use |
|---|---|
| Page header | `<h1 className="text-[30px] tracking-[-0.03em]">` + one muted sentence, or `PageHeader` |
| Surface | `<div className="card p-6">` |
| List row | `<Link className="flex items-center gap-4 rounded-xl px-4 py-3 hover:bg-white/[0.04]">` with a 32px round icon tile |
| Status | `<span className="size-2 rounded-full bg-ok" />` + text, or `<Badge tone="ok">` |
| Progress | `<Progress value={…} />` (rounded, white fill) |
| Tabs | Segmented control: `rounded-xl bg-white/[0.04] p-1`, active item `rounded-lg bg-white/[0.08] text-fg` |
| Empty state | `EmptyState` (card, one sentence, one action) |

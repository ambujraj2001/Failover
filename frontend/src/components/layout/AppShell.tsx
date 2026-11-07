import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  BookOpen,
  ChevronsUpDown,
  Flame,
  Home,
  Layers,
  LogOut,
  Map,
  Menu,
  MessagesSquare,
  NotebookText,
  Route,
  Settings,
  Swords,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { useSignOut } from '@/hooks/useSession'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

type Item = { to: string; label: string; icon: ReactNode }

const PRIMARY: Item[] = [
  { to: '/app', label: 'Home', icon: <Home /> },
  { to: '/app/path', label: 'Learning path', icon: <Route /> },
  { to: '/app/practice', label: 'Practice', icon: <Swords /> },
  { to: '/app/interviews', label: 'Mock interviews', icon: <MessagesSquare /> },
]

const LIBRARY: Item[] = [
  { to: '/app/flashcards', label: 'Flashcards', icon: <Layers /> },
  { to: '/app/concepts', label: 'Concepts', icon: <BookOpen /> },
  { to: '/app/cheatsheet', label: 'Cheat sheet', icon: <NotebookText /> },
  { to: '/app/tracks', label: 'Study plans', icon: <Map /> },
]

function NavItem({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/app'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors duration-150 [&_svg]:size-[17px]',
          isActive
            ? 'bg-white/[0.07] text-fg [&_svg]:text-fg'
            : 'text-fg-muted hover:bg-white/[0.04] hover:text-fg [&_svg]:text-fg-subtle',
        )
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  )
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-7" aria-label="Main">
      <div className="flex flex-col gap-0.5">
        {PRIMARY.map((i) => (
          <NavItem key={i.to} item={i} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="mb-1.5 px-3 text-[12px] font-medium text-fg-faint">Library</p>
        {LIBRARY.map((i) => (
          <NavItem key={i.to} item={i} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  )
}

function Account() {
  const user = useAuth((s) => s.user)
  const signOut = useSignOut()
  const navigate = useNavigate()
  if (!user) return null
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const item =
    'flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-fg-muted outline-none data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-fg [&_svg]:size-4'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors hover:bg-white/[0.04] data-[state=open]:bg-white/[0.06]">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-b from-ink-600 to-ink-700 text-[12px] font-medium text-fg">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-fg">{user.name}</span>
          <span className="flex items-center gap-1 text-[12px] text-fg-subtle">
            <Flame className={cn('size-3', user.streak_current > 0 ? 'text-brand-500' : 'text-fg-faint')} />
            {user.streak_current} day streak
          </span>
        </span>
        <ChevronsUpDown className="size-4 text-fg-subtle" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-[220px] animate-fade-in rounded-xl border border-white/10 bg-ink-800 p-1.5 shadow-pop"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] text-fg">{user.name}</p>
            <p className="truncate text-[12px] text-fg-subtle">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-white/[0.06]" />
          <DropdownMenu.Item onSelect={() => navigate('/app/settings')} className={item}>
            <Settings /> Settings
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => signOut()} className={item}>
            <LogOut /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function AppShell() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-950 px-3 py-5 lg:flex">
        <NavLink to="/app" className="mb-8 px-3">
          <Logo />
        </NavLink>
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <Account />
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-ink-950/85 px-4 backdrop-blur-xl lg:hidden">
        <NavLink to="/app">
          <Logo />
        </NavLink>
        <button
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.05]"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-white/[0.06] bg-ink-950 px-3 py-5">
            <div className="mb-8 flex items-center justify-between px-3">
              <Logo />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-fg-muted hover:bg-white/[0.05]" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Nav onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-white/[0.06] pt-3">
              <Account />
            </div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  )
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:px-12 lg:py-14', className)}>{children}</div>
}

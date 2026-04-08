'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useTheme } from './ThemeProvider'

const navItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Your profile', href: '/profiles' },
  { label: 'Jobs', href: '/jobs' },
  { label: 'Settings', href: '/settings' },
]

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { data: session } = useSession()

  return (
    <aside className="flex h-screen w-56 flex-col bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shrink-0 border-r border-zinc-200 dark:border-zinc-800">
      <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-lg font-semibold tracking-tight">Jev board</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === item.href
                ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-white'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800">
        {session?.user && (
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">
              {session.user.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors"
              aria-label="Sign out"
            >
              <LogOutIcon />
            </button>
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">v0.1.0</span>
          <button
            onClick={toggle}
            className="p-2 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </aside>
  )
}

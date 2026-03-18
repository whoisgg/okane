'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase'

const NAV = [
  { href: "/inicio",           label: "Inicio",          icon: HomeIcon },
  { href: '/dashboard',        label: 'Flujo',            icon: BarChartIcon },
  { href: '/saldos',           label: 'Saldos',           icon: CreditCardIcon },
  { href: '/creditos-lista',   label: 'Créditos',         icon: LoanIcon },
  { href: '/suscripciones',    label: 'Suscripciones',    icon: RepeatIcon },
  { href: '/transactions',     label: 'Movimientos',      icon: ListIcon },
  { href: '/cartolas',         label: 'Cartolas PDF',     icon: DocumentIcon },
  { href: '/config',           label: 'Configuración',    icon: GearIcon },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const sb = getClient()
    await sb.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <span className="text-xl font-bold text-accent">お</span>
        <span className="text-lg font-bold text-text-primary">Okane</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition
                ${active
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-surface-high hover:text-text-primary'
                }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" active={active} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="border-t border-border p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                     text-text-secondary hover:bg-surface-high hover:text-danger transition"
        >
          <LogOutIcon className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function HomeIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 12L12 3l9 9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21V12h6v9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 12v9h18v-9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function BarChartIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 16V10M12 16V6M17 16v-4" strokeLinecap="round"/>
    </svg>
  )
}
function CreditCardIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <rect x="2" y="5" width="20" height="14" rx="3" strokeLinejoin="round"/>
      <path d="M2 10h20" strokeLinecap="round"/>
    </svg>
  )
}
function ListIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01" strokeLinecap="round"/>
    </svg>
  )
}
function DocumentIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinejoin="round"/>
      <path d="M14 2v6h6M9 13h6M9 17h4" strokeLinecap="round"/>
    </svg>
  )
}
function LoanIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <path d="M9 22V12h6v10"/>
    </svg>
  )
}
function RepeatIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 014-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 01-4 4H3"/>
    </svg>
  )
}
function GearIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}
function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

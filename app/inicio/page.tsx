'use client'

import { useEffect, useState, useCallback } from 'react'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted, clpAbbreviated } from '@/lib/utils'
import type { Transaction, UserSettings } from '@/lib/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Category config ────────────────────────────────────────────────────────────
const CAT_LABEL: Record<string, string> = {
  food: 'Alimentación',          comida: 'Alimentación',        supermercado: 'Supermercado',
  alimentacion: 'Alimentación',  alimentación: 'Alimentación',
  restaurants: 'Restaurantes',   restaurantes: 'Restaurantes',  restaurant: 'Restaurantes',
  transport: 'Transporte',       transporte: 'Transporte',      taxi: 'Transporte',  uber: 'Transporte',
  entertainment: 'Entretención', entretencion: 'Entretención',  entretención: 'Entretención', ocio: 'Entretención',
  health: 'Salud',               salud: 'Salud',                farmacia: 'Farmacia',
  shopping: 'Compras',           compras: 'Compras',            ropa: 'Ropa',        vestuario: 'Vestuario',
  utilities: 'Hogar',            hogar: 'Hogar',                servicios: 'Servicios',
  education: 'Educación',        educacion: 'Educación',        educación: 'Educación',
  travel: 'Viajes',              viajes: 'Viajes',              viaje: 'Viajes',
  subscriptions: 'Suscripciones',suscripciones: 'Suscripciones',suscripcion: 'Suscripciones', suscripción: 'Suscripciones',
  savings: 'Ahorro',             ahorro: 'Ahorro',
  technology: 'Tecnología',      tecnologia: 'Tecnología',      tecnología: 'Tecnología',
  otros: 'Otros',                other: 'Otros',                otro: 'Otros',
}

function catLabel(c: string) { return CAT_LABEL[c] ?? c }

// ── Inline SVG category icons ─────────────────────────────────────────────────
function CatIcon({ cat, className = 'h-5 w-5' }: { cat: string; className?: string }) {
  const k = cat.toLowerCase()
  const s = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  // Alimentación / supermercado → shopping cart
  if (['food','comida','supermercado','alimentacion','alimentación'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
    )

  // Restaurantes → utensils
  if (['restaurants','restaurantes','restaurant'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/>
        <path d="M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
      </svg>
    )

  // Transporte → car
  if (['transport','transporte','taxi','uber'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v9a2 2 0 01-2 2h-2"/>
        <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
        <path d="M13 3v5h5"/>
      </svg>
    )

  // Entretención → gamepad / play circle
  if (['entertainment','entretencion','entretención','ocio'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <circle cx="12" cy="12" r="10"/>
        <polygon points="10 8 16 12 10 16 10 8"/>
      </svg>
    )

  // Salud / farmacia → cross
  if (['health','salud','farmacia'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
        <path d="M12 8v8M8 12h8"/>
      </svg>
    )

  // Compras / ropa → shopping bag
  if (['shopping','compras','ropa','vestuario'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M6 2h12l2 20H4L6 2z"/>
        <path d="M9 8a3 3 0 006 0"/>
      </svg>
    )

  // Hogar / servicios → house
  if (['utilities','hogar','servicios'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M3 12L12 3l9 9"/>
        <path d="M9 21V12h6v9M3 12v9h18v-9"/>
      </svg>
    )

  // Educación → book open
  if (['education','educacion','educación'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
      </svg>
    )

  // Viajes → airplane
  if (['travel','viajes','viaje'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4s-2 1-3.5 2.5L11 10 2.8 8.2 2 9l7 3.7-2 3.6-3-.4L3 17l3.5 1 1 3.5 1.5-1-.4-3 3.6-2L16 22l.8-.8z"/>
      </svg>
    )

  // Suscripciones → smartphone
  if (['subscriptions','suscripciones','suscripcion','suscripción'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth={2.5}/>
      </svg>
    )

  // Ahorro → coin stack
  if (['savings','ahorro'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <ellipse cx="12" cy="6" rx="8" ry="3"/>
        <path d="M4 6v4c0 1.657 3.582 3 8 3s8-1.343 8-3V6"/>
        <path d="M4 10v4c0 1.657 3.582 3 8 3s8-1.343 8-3v-4"/>
      </svg>
    )

  // Tecnología → laptop / monitor
  if (['technology','tecnologia','tecnología'].includes(k))
    return (
      <svg className={className} viewBox="0 0 24 24" {...s}>
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
    )

  // Fallback → grid dots
  return (
    <svg className={className} viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/>
    </svg>
  )
}

export default function InicioPage() {
  const router = useRouter()
  const [txs, setTxs]         = useState<Transaction[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail]     = useState('')

  // Month navigation
  const now = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const targetDate  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const monthKey    = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
  const monthLabel  = targetDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())

  const load = useCallback(async () => {
    setLoading(true)
    const sb = getClient()
    const monthStart = `${monthKey}-01`
    const nextMonth  = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)
    const monthEnd   = new Date(nextMonth.getTime() - 86400000).toISOString().split('T')[0]

    const [{ data: userData }, txRes, settingsRes] = await Promise.all([
      sb.auth.getUser(),
      sb.from('transactions')
        .select('*')
        .eq('type', 'expense')
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: false }),
      sb.from('settings').select('*').single(),
    ])

    setEmail(userData?.user?.email?.split('@')[0] ?? '')
    setTxs((txRes.data ?? []) as Transaction[])
    const s = settingsRes.data as UserSettings | null
    setSettings(s)

    // Redirect to setup wizard if budget not configured
    if (!s || !s.monthly_budget) {
      router.replace('/setup')
      return
    }

    setLoading(false)
  }, [monthKey, router])

  useEffect(() => { load() }, [load])

  // Budget calculations
  const totalSpent  = txs.reduce((s, t) => s + Number(t.amount), 0)
  const budget      = Number(settings?.monthly_budget ?? 0)
  const disponible  = budget > 0 ? budget - totalSpent : 0
  const budgetPct   = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0

  // Categories
  const catMap: Record<string, number> = {}
  for (const tx of txs) {
    const cat = tx.category ?? 'otros'
    catMap[cat] = (catMap[cat] ?? 0) + Number(tx.amount)
  }
  const categories = Object.entries(catMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
  const maxCat = categories[0]?.[1] ?? 1

  // Recent
  const recentTxs = [...txs].slice(0, 5)

  if (loading) return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-28 sm:pb-6">

        {/* ── Month navigator header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-high transition text-lg"
            >‹</button>
            <h1 className="text-lg font-bold text-text-primary">{monthLabel}</h1>
            <button
              onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
              disabled={monthOffset >= 0}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-high transition text-lg disabled:opacity-25"
            >›</button>
          </div>
          {/* Profile avatar */}
          <button
            onClick={() => router.push('/config')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-base font-bold text-accent"
          >
            {email[0]?.toUpperCase() ?? 'G'}
          </button>
        </div>

        {/* ── Hero card: disponible ── */}
        <div className="rounded-2xl bg-surface p-5 shadow-sm border border-border space-y-3">
          <p className="text-sm text-text-muted">disponible este mes</p>
          <p className={`text-[2.4rem] font-bold leading-none tracking-tight ${
            budget > 0
              ? disponible < 0 ? 'text-danger' : 'text-text-primary'
              : 'text-text-primary'
          }`}>
            {budget > 0 ? clpFormatted(Math.abs(disponible)) : clpFormatted(totalSpent)}
          </p>

          {budget > 0 && (
            <>
              {/* Thin progress bar */}
              <div className="h-[3px] overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all ${budgetPct > 85 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>gastado {clpFormatted(totalSpent)}</span>
                <span>de {clpFormatted(budget)}</span>
              </div>
            </>
          )}

          {budget === 0 && (
            <p className="text-xs text-text-muted">
              Configura tu{' '}
              <Link href="/config" className="text-accent underline">presupuesto mensual</Link>
            </p>
          )}
        </div>

        {/* ── Categories ── */}
        {categories.length > 0 && (
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">Categorías</p>
            <div className="rounded-2xl bg-surface border border-border overflow-hidden divide-y divide-border">
              {categories.map(([cat, amount]) => {
                const pct = Math.round((amount / totalSpent) * 100)
                const barW = Math.round((amount / maxCat) * 100)
                return (
                  <div key={cat} className="flex items-center gap-3 px-4 py-3.5">
                    {/* Icon */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <CatIcon cat={cat} />
                    </div>
                    {/* Name + bar */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">{catLabel(cat)}</p>
                      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </div>
                    {/* Amount + pct */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold text-text-primary">{clpAbbreviated(amount)}</p>
                      <p className="text-[10px] text-text-muted">{pct}%</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Recientes ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Recientes</p>
            <Link href="/transactions" className="text-xs font-semibold text-accent">Ver todos</Link>
          </div>

          {recentTxs.length === 0 ? (
            <div className="rounded-2xl bg-surface border border-border px-4 py-10 text-center">
              <p className="text-sm text-text-muted">Sin gastos este mes</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface border border-border overflow-hidden divide-y divide-border">
              {recentTxs.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <CatIcon cat={tx.category} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {tx.description ?? catLabel(tx.category)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-text-muted">
                        {new Date(tx.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {tx.is_from_cartola && (
                        <span className="text-[9px] text-text-muted opacity-60">🕐</span>
                      )}
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-sm font-bold text-danger">
                    −{clpFormatted(Number(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}

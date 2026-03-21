'use client'

import { useEffect, useState, useCallback } from 'react'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted, clpAbbreviated } from '@/lib/utils'
import type { Transaction, UserSettings, CategoryBudget } from '@/lib/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CatIcon from '@/components/CatIcon'

// ── Canonical category labels (aligned with transaction modal + config) ────────
const CAT_LABEL: Record<string, string> = {
  hogar:          'Hogar',
  comida:         'Comida',
  salud:          'Salud',
  transporte:     'Transporte',
  entretenimiento:'Entretención',
  ropa:           'Ropa',
  educacion:      'Educación',
  tecnologia:     'Tecnología',
  viajes:         'Viajes',
  servicios:      'Servicios',
  otros:          'Compras',
}

function catLabel(c: string) { return CAT_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1) }

// ── Normalize any legacy/iOS category key → canonical new key ─────────────────
const CAT_NORMALIZE: Record<string, string> = {
  // comida
  food: 'comida', alimentacion: 'comida', alimentación: 'comida',
  supermercado: 'comida', restaurants: 'comida', restaurantes: 'comida', restaurant: 'comida',
  // transporte
  transport: 'transporte', taxi: 'transporte', uber: 'transporte',
  // entretenimiento
  entertainment: 'entretenimiento', entretencion: 'entretenimiento',
  entretención: 'entretenimiento', ocio: 'entretenimiento',
  // salud
  health: 'salud', farmacia: 'salud',
  // hogar
  utilities: 'hogar',
  // ropa
  shopping: 'ropa', compras: 'ropa', vestuario: 'ropa',
  // educacion
  education: 'educacion', educación: 'educacion',
  // tecnologia
  technology: 'tecnologia', tecnología: 'tecnologia',
  // viajes
  travel: 'viajes', viaje: 'viajes',
  // otros
  other: 'otros', otro: 'otros',
  savings: 'otros', ahorro: 'otros',
  subscriptions: 'suscripciones', suscripciones: 'suscripciones',
  suscripcion: 'suscripciones', suscripción: 'suscripciones',
  // servicios
  services: 'servicios', servicio: 'servicios', servicios: 'servicios',
}
function normalizeCat(c: string): string {
  return CAT_NORMALIZE[c.toLowerCase()] ?? c.toLowerCase()
}


export default function InicioPage() {
  const router = useRouter()
  const [txs, setTxs]               = useState<Transaction[]>([])
  const [settings, setSettings]     = useState<UserSettings | null>(null)
  const [catBudgets, setCatBudgets] = useState<CategoryBudget[]>([])
  const [loading, setLoading]       = useState(true)
  const [email, setEmail]           = useState('')

  // Month navigation
  const now = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const targetDate  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const monthKey    = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
  const monthLabel  = targetDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sb = getClient()
      const monthStart = `${monthKey}-01`
      const nextMonth  = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)
      const monthEnd   = new Date(nextMonth.getTime() - 86400000).toISOString().split('T')[0]

      const [{ data: userData }, txRes, settingsRes, catBudgetsRes] = await Promise.all([
        sb.auth.getUser(),
        sb.from('transactions')
          .select('*')
          .eq('type', 'expense')
          .is('bank_account_id', null)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date', { ascending: false }),
        sb.from('settings').select('*').single(),
        sb.from('category_budgets').select('*'),
      ])

      // Check auth first — unauthenticated users go to login, not setup
      if (!userData?.user) {
        router.replace('/login')
        return
      }

      setEmail(userData.user.email?.split('@')[0] ?? '')
      setTxs((txRes.data ?? []) as Transaction[])
      setCatBudgets((catBudgetsRes.data ?? []) as CategoryBudget[])
      const s = settingsRes.data as UserSettings | null
      setSettings(s)

      // Redirect to setup wizard only if settings truly don't exist (not an error/network issue)
      if (!settingsRes.error && (!s || !s.monthly_budget)) {
        router.replace('/setup')
        return
      }
    } catch (err) {
      console.error('[inicio] load error:', err)
      // On error still exit loading so UI isn't permanently stuck
    }
    setLoading(false)
  }, [monthKey, router])

  useEffect(() => { load() }, [load])

  // Budget calculations — only CLP transactions count toward the budget
  const totalSpent  = txs
    .filter(t => (t.currency ?? 'CLP') === 'CLP')
    .reduce((s, t) => s + Number(t.amount), 0)
  const budget      = Number(settings?.monthly_budget ?? 0)
  const savingsGoal = Number(settings?.savings_goal ?? 0)
  const disponible  = budget > 0 ? budget - totalSpent : 0
  const budgetPct   = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0
  // Ahorro = lo que queda del presupuesto (disponible), si es positivo
  const savedSoFar  = Math.max(0, disponible)
  const savingsPct  = savingsGoal > 0 ? Math.min(100, (savedSoFar / savingsGoal) * 100) : 0

  // Categories — CLP transactions only; auto-categorized at cartola upload time
  const catMap: Record<string, number> = {}
  for (const tx of txs) {
    if ((tx.currency ?? 'CLP') === 'USD') continue        // skip USD (separate currency)
    const cat = normalizeCat(tx.category ?? 'otros')
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

        {/* ── Savings goal ── */}
        {savingsGoal > 0 && (
          <div className="rounded-2xl bg-surface p-5 shadow-sm border border-border space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">meta de ahorro</p>
              <p className="text-xs font-medium text-text-muted">{clpFormatted(savingsGoal)}</p>
            </div>
            <p className={`text-2xl font-bold leading-none tracking-tight ${
              savedSoFar >= savingsGoal ? 'text-success' : 'text-text-primary'
            }`}>
              {clpFormatted(savedSoFar)}
              {savedSoFar >= savingsGoal && <span className="ml-2 text-base">🎯</span>}
            </p>
            <div className="h-[3px] overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all ${savedSoFar >= savingsGoal ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${savingsPct}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              {savingsPct >= 100
                ? '¡Meta alcanzada este mes!'
                : `${Math.round(savingsPct)}% de la meta · faltan ${clpFormatted(savingsGoal - savedSoFar)}`}
            </p>
          </div>
        )}

        {/* ── Categories ── */}
        {categories.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Categorías</p>
              <Link href="/config#metas" className="text-[11px] text-accent">Editar metas</Link>
            </div>
            <div className="rounded-2xl bg-surface border border-border overflow-hidden divide-y divide-border">
              {categories.map(([cat, amount]) => {
                const catBudget = catBudgets.find(b => b.category === normalizeCat(cat))
                const limit     = catBudget?.monthly_limit ?? 0
                const hasBudget = limit > 0
                const barW      = hasBudget
                  ? Math.min(100, Math.round((amount / limit) * 100))
                  : Math.round((amount / maxCat) * 100)
                const overBudget = hasBudget && amount > limit
                const nearBudget = hasBudget && !overBudget && barW >= 80
                const barColor   = overBudget ? 'bg-danger' : nearBudget ? 'bg-warning' : 'bg-accent'
                return (
                  <div key={cat} className="flex items-center gap-3 px-4 py-3.5">
                    {/* Icon */}
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${overBudget ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent'}`}>
                      <CatIcon cat={cat} />
                    </div>
                    {/* Name + bar */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-text-primary">{catLabel(cat)}</p>
                        {overBudget && <span className="text-[10px] font-semibold text-danger">+{clpAbbreviated(amount - limit)}</span>}
                      </div>
                      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </div>
                    {/* Amount */}
                    <div className="flex-shrink-0 text-right">
                      <p className={`text-sm font-bold ${overBudget ? 'text-danger' : 'text-text-primary'}`}>
                        {clpAbbreviated(amount)}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {hasBudget ? `de ${clpAbbreviated(limit)}` : `${Math.round((amount / totalSpent) * 100)}%`}
                      </p>
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
                    <CatIcon cat={normalizeCat(tx.category)} className="h-5 w-5" />
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
                  <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-sm font-bold text-danger">
                      −{tx.currency === 'USD'
                        ? `US$ ${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : clpFormatted(Number(tx.amount))
                      }
                    </span>
                    {tx.currency === 'USD' && (
                      <span className="text-[9px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 rounded px-1 py-px">USD</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}

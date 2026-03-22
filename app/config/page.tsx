'use client'

import { useEffect, useState } from 'react'
import { getClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import type { CreditCard, BankAccount, CategoryBudget } from '@/lib/types'
import { clpFormatted } from '@/lib/utils'
import Link from 'next/link'
import CatIcon from '@/components/CatIcon'

function fmt(n: number) {
  return n > 0 ? n.toLocaleString('es-CL') : ''
}
function parse(v: string) {
  return parseInt(v.replace(/\D/g, '') || '0', 10)
}

export default function ConfigPage() {
  const router = useRouter()
  const [cards, setCards]         = useState<CreditCard[]>([])
  const [accounts, setAccounts]   = useState<BankAccount[]>([])
  const [email, setEmail]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  // Bank account editing
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editingAccountName, setEditingAccountName] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)

  async function saveAccountName(id: string) {
    if (!editingAccountName.trim()) return
    setSavingAccount(true)
    const sb = getClient()
    await (sb.from('bank_accounts') as any).update({ name: editingAccountName.trim() }).eq('id', id)
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, name: editingAccountName.trim() } : a))
    setEditingAccountId(null)
    setSavingAccount(false)
  }

  // Budget settings
  const [budget, setBudget]         = useState('')
  const [savingsGoal, setSavingsGoal] = useState('')
  const [usdRate, setUsdRate]       = useState('950')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved]   = useState(false)

  // Category budgets
  const CATEGORIES = ['hogar','comida','salud','transporte','entretenimiento','ropa','educacion','tecnologia','viajes','servicios','otros']
  const CAT_LABEL: Record<string,string> = { hogar:'Hogar', comida:'Comida', salud:'Salud', transporte:'Transporte', entretenimiento:'Entretención', ropa:'Ropa', educacion:'Educación', tecnologia:'Tecnología', viajes:'Viajes', servicios:'Servicios', otros:'Compras' }

  const [catLimits, setCatLimits]   = useState<Record<string,string>>({})
  const [savingCats, setSavingCats] = useState(false)
  const [catsSaved, setCatsSaved]   = useState(false)

  useEffect(() => {
    const sb = getClient()
    Promise.all([
      sb.auth.getUser(),
      sb.from('credit_cards').select('*').order('created_at'),
      sb.from('bank_accounts').select('*').order('created_at'),
      sb.from('settings').select('*').single(),
      sb.from('category_budgets').select('*'),
    ]).then(([{ data: { user } }, cardsRes, accsRes, settRes, catRes]: any[]) => {
      setEmail(user?.email ?? '')
      setCards((cardsRes.data ?? []) as CreditCard[])
      setAccounts((accsRes.data ?? []) as BankAccount[])
      if (settRes.data) {
        setBudget(fmt(settRes.data.monthly_budget))
        setSavingsGoal(fmt(settRes.data.savings_goal ?? 0))
        setUsdRate(String(settRes.data.usd_exchange_rate ?? 950))
      }
      // Build catLimits map from DB
      const map: Record<string,string> = {}
      ;(catRes.data ?? []).forEach((b: CategoryBudget) => {
        if (b.monthly_limit > 0) map[b.category] = fmt(b.monthly_limit)
      })
      setCatLimits(map)
      setLoading(false)
    })
  }, [])

  async function saveCategoryBudgets(e: React.FormEvent) {
    e.preventDefault()
    setSavingCats(true)
    const sb = getClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    // Upsert all categories that have a value
    const rows = CATEGORIES
      .filter(c => catLimits[c] && parse(catLimits[c]) > 0)
      .map(c => ({ user_id: user.id, category: c, monthly_limit: parse(catLimits[c]) }))
    // Delete removed ones
    const removed = CATEGORIES.filter(c => !catLimits[c] || parse(catLimits[c]) === 0)
    await Promise.all([
      rows.length > 0
        ? (sb.from('category_budgets') as any).upsert(rows, { onConflict: 'user_id,category' })
        : Promise.resolve(),
      removed.length > 0
        ? (sb.from('category_budgets') as any).delete().eq('user_id', user.id).in('category', removed)
        : Promise.resolve(),
    ])
    setSavingCats(false)
    setCatsSaved(true)
    setTimeout(() => setCatsSaved(false), 2000)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSavingSettings(true)
    const sb = getClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await (sb.from('settings') as any).upsert({
      user_id: user.id,
      monthly_budget: parse(budget),
      savings_goal: parse(savingsGoal),
      usd_exchange_rate: parse(usdRate) || 950,
    }, { onConflict: 'user_id' })
    setSavingSettings(false)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  async function signOut() {
    setSigningOut(true)
    await getClient().auth.signOut()
    router.push('/login')
  }

  const BANK_LABEL: Record<string, string> = { falabella: '🏬 Falabella', santander: '🏦 Santander', scotiabank: '🏦 Scotiabank', unknown: '💳 Otro' }

  if (loading) return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6 pb-24 sm:pb-6">
        <h1 className="text-xl font-bold text-text-primary">Configuración</h1>

        {/* Account */}
        <section className="card divide-y divide-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
              {email[0]?.toUpperCase() ?? 'G'}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{email}</p>
              <p className="text-xs text-text-muted">Cuenta activa</p>
            </div>
          </div>
        </section>

        {/* Budget & savings */}
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Presupuesto y ahorro</p>
          <form onSubmit={saveSettings} className="card divide-y divide-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <label className="text-sm text-text-primary">Presupuesto mensual</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">$</span>
                <input
                  className="w-32 rounded-lg bg-surface-high px-2 py-1 text-right text-sm font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="0"
                  value={budget}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '')
                    setBudget(raw ? Number(raw).toLocaleString('es-CL') : '')
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <label className="text-sm text-text-primary">Tipo de cambio USD</label>
                <p className="text-xs text-text-muted">Pesos por 1 dólar (para flujo estimado)</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">$</span>
                <input
                  className="w-32 rounded-lg bg-surface-high px-2 py-1 text-right text-sm font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="950"
                  inputMode="numeric"
                  value={usdRate}
                  onChange={e => setUsdRate(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <label className="text-sm text-text-primary">Meta de ahorro mensual</label>
                <p className="text-xs text-text-muted">¿Cuánto querés guardar cada mes?</p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">$</span>
                <input
                  className="w-32 rounded-lg bg-surface-high px-2 py-1 text-right text-sm font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="0"
                  value={savingsGoal}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '')
                    setSavingsGoal(raw ? Number(raw).toLocaleString('es-CL') : '')
                  }}
                />
              </div>
            </div>
            <div className="px-4 py-3">
              <button type="submit" disabled={savingSettings} className="btn-primary w-full justify-center text-sm">
                {savingSettings ? 'Guardando...' : settingsSaved ? '✓ Guardado' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </section>

        {/* Category budgets */}
        <section id="metas">
          <div className="mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Metas por categoría</p>
            <p className="text-xs text-text-muted mt-0.5">Límite de gasto mensual por categoría. Dejá en blanco para sin límite.</p>
          </div>
          <form onSubmit={saveCategoryBudgets} className="card divide-y divide-border overflow-hidden">
            {CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between px-4 py-2.5">
                <label className="flex items-center gap-2.5 text-sm text-text-primary">
                  <span className="text-text-secondary"><CatIcon cat={cat} className="h-4 w-4" /></span>
                  {CAT_LABEL[cat]}
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted">$</span>
                  <input
                    className="w-32 rounded-lg bg-surface-high px-2 py-1 text-right text-sm font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="Sin límite"
                    value={catLimits[cat] ?? ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '')
                      setCatLimits(prev => ({ ...prev, [cat]: raw ? Number(raw).toLocaleString('es-CL') : '' }))
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="px-4 py-3">
              <button type="submit" disabled={savingCats} className="btn-primary w-full justify-center text-sm">
                {savingCats ? 'Guardando...' : catsSaved ? '✓ Guardado' : 'Guardar metas'}
              </button>
            </div>
          </form>
        </section>

        {/* Credit cards */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Tarjetas de crédito</p>
            <Link href="/saldos" className="text-xs text-accent">+ Agregar</Link>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {cards.length === 0 ? (
              <p className="px-4 py-5 text-sm text-text-muted">Sin tarjetas registradas</p>
            ) : cards.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.last_four && <span className="font-mono text-xs text-text-muted">•••• {c.last_four}</span>}
                    <span className="text-[10px] text-text-muted">{BANK_LABEL[c.bank ?? 'unknown']}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-danger">{clpFormatted(Number(c.balance))}</p>
                  {c.closing_day && <p className="text-[10px] text-text-muted">Cierre día {c.closing_day}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bank accounts */}
        <section>
          <div className="mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Cuentas bancarias</p>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {accounts.length === 0 ? (
              <p className="px-4 py-5 text-sm text-text-muted">Sin cuentas registradas</p>
            ) : accounts.map(a => (
              <div key={a.id} className="px-4 py-3">
                {editingAccountId === a.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1 text-sm"
                      value={editingAccountName}
                      onChange={e => setEditingAccountName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveAccountName(a.id); if (e.key === 'Escape') setEditingAccountId(null) }}
                      autoFocus
                    />
                    <button
                      onClick={() => saveAccountName(a.id)}
                      disabled={savingAccount}
                      className="text-xs font-semibold text-accent"
                    >
                      {savingAccount ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => setEditingAccountId(null)} className="text-xs text-text-muted">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{a.name}</p>
                      {a.bank_name && <p className="text-xs text-text-muted">{a.bank_name}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-success">{clpFormatted(Number(a.balance))}</p>
                      <button
                        onClick={() => { setEditingAccountId(a.id); setEditingAccountName(a.name) }}
                        className="text-xs text-text-muted hover:text-text-primary"
                      >
                        ✎
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Quick nav */}
        <section className="card divide-y divide-border overflow-hidden">
          <Link href="/cartolas" className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-high transition">
            <span className="text-sm text-text-primary">📄 Subir cartola PDF</span>
            <span className="text-text-muted">›</span>
          </Link>
          <Link href="/dashboard" className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-high transition">
            <span className="text-sm text-text-primary">📊 Flujo de caja</span>
            <span className="text-text-muted">›</span>
          </Link>
        </section>

        {/* Sign out */}
        <section className="card overflow-hidden">
          <button
            onClick={signOut}
            disabled={signingOut}
            className="w-full px-4 py-3.5 text-sm font-semibold text-danger hover:bg-danger/5 transition text-left"
          >
            {signingOut ? 'Cerrando sesión...' : '↩ Cerrar sesión'}
          </button>
        </section>

        <p className="text-center text-[10px] text-text-muted">Okane v1.0 · お金</p>
      </div>
    </AppShell>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import Link from 'next/link'
import { clpFormatted, clpAbbreviated, shortMonthLabel, monthYearLabel } from '@/lib/utils'
import type { Transaction, Subscription, Loan, UserSettings, CreditCard } from '@/lib/types'

const BANK_COLORS: Record<string, string> = {
  falabella: 'bg-emerald-50 border-emerald-200',
  santander: 'bg-red-50 border-red-200',
  unknown:   'bg-surface-high border-border',
}
const BANK_TEXT: Record<string, string> = {
  falabella: 'text-emerald-700',
  santander: 'text-red-700',
  unknown:   'text-text-secondary',
}

interface MonthData {
  month: number
  year: number
  label: string
  total: number
  facturado: number
  isForecast: boolean
  forecastIncome: number
  forecastSubs: number
  forecastLoans: number
  forecastCC: number
}

export default function DashboardPage() {
  const [months, setMonths] = useState<MonthData[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tarjetas' | 'creditos' | 'suscripciones'>('tarjetas')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [cardTxs, setCardTxs] = useState<{ credit_card_id: string; amount: number; date: string }[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)

  // ── Add subscription ────────────────────────────────────────────────────────
  const [showAddSub, setShowAddSub] = useState(false)
  const [subName, setSubName]       = useState('')
  const [subAmount, setSubAmount]   = useState('')
  const [subDay, setSubDay]         = useState('')
  const [savingSub, setSavingSub]   = useState(false)

  async function saveSub() {
    if (!subName.trim() || !subAmount) return
    setSavingSub(true)
    const sb = getClient()
    await sb.from('subscriptions').insert({
      name:        subName.trim(),
      amount:      parseInt(subAmount.replace(/\./g, ''), 10),
      billing_day: subDay ? parseInt(subDay) : 1,
      currency:    'CLP',
      category:    'suscripciones',
      is_active:   true,
    })
    setSubName(''); setSubAmount(''); setSubDay('')
    setShowAddSub(false); setSavingSub(false)
    load()
  }

  // ── Add loan ────────────────────────────────────────────────────────────────
  const [showAddLoan, setShowAddLoan]       = useState(false)
  const [loanName, setLoanName]             = useState('')
  const [loanLender, setLoanLender]         = useState('')
  const [loanTotal, setLoanTotal]           = useState('')
  const [loanPayment, setLoanPayment]       = useState('')
  const [loanBalance, setLoanBalance]       = useState('')
  const [loanRate, setLoanRate]             = useState('')
  const [savingLoan, setSavingLoan]         = useState(false)

  async function saveLoan() {
    if (!loanName.trim() || !loanPayment) return
    setSavingLoan(true)
    const sb = getClient()
    const parse = (v: string) => parseInt(v.replace(/\./g, '') || '0', 10)
    await sb.from('loans').insert({
      name:              loanName.trim(),
      lender:            loanLender.trim() || loanName.trim(),
      total_amount:      parse(loanTotal) || parse(loanPayment),
      remaining_balance: parse(loanBalance) || parse(loanTotal) || parse(loanPayment),
      monthly_payment:   parse(loanPayment),
      interest_rate:     loanRate ? parseFloat(loanRate) : 0,
      start_date:        new Date().toISOString().split('T')[0],
    })
    setLoanName(''); setLoanLender(''); setLoanTotal('')
    setLoanPayment(''); setLoanBalance(''); setLoanRate('')
    setShowAddLoan(false); setSavingLoan(false)
    load()
  }

  function clpInput(v: string) {
    return v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }

  const load = useCallback(async () => {
    const sb = getClient()
    setLoading(true)

    // Parallel fetch
    const [txRes, instRes, subsRes, loansRes, settingsRes, cardsRes, cardTxsRes] = await Promise.all([
      sb.from('transactions').select('amount,currency,date,is_from_cartola').eq('type', 'expense'),
      sb.from('transactions')
        .select('amount,date,installment_number,installment_total,credit_card_id')
        .eq('is_installment', true)
        .not('installment_number', 'is', null)
        .not('installment_total', 'is', null),
      sb.from('subscriptions').select('*').eq('is_active', true),
      sb.from('loans').select('*'),
      sb.from('settings').select('*').single(),
      sb.from('credit_cards').select('*').order('created_at'),
      sb.from('transactions').select('credit_card_id,amount,date').eq('type', 'expense').not('credit_card_id', 'is', null),
    ])

    const txRows = txRes.data ?? []
    const instRows = instRes.data ?? []
    const subsData = (subsRes.data ?? []) as Subscription[]
    const loansData = (loansRes.data ?? []) as Loan[]
    const settingsData = settingsRes.data as UserSettings | null

    setSubs(subsData)
    setLoans(loansData)
    setCards((cardsRes.data ?? []) as CreditCard[])
    setCardTxs((cardTxsRes.data ?? []) as { credit_card_id: string; amount: number; date: string }[])
    setSettings(settingsData)

    // Build installment projections: remaining cuotas per month key
    const instProjection: Record<string, number> = {}
    for (const tx of instRows) {
      const remaining = (tx.installment_total ?? 0) - (tx.installment_number ?? 0)
      if (remaining <= 0) continue
      const txDate = new Date(tx.date)
      for (let r = 1; r <= remaining; r++) {
        const projDate = new Date(txDate.getFullYear(), txDate.getMonth() + r, 1)
        const key = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`
        instProjection[key] = (instProjection[key] ?? 0) + Number(tx.amount)
      }
    }

    // Build 6-month rolling window
    const now = new Date()
    const result: MonthData[] = []

    for (let i = -2; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      const isForecast = i > 0

      if (!isForecast) {
        const monthTxs = txRows.filter(tx => {
          const td = new Date(tx.date)
          return td.getMonth() + 1 === m && td.getFullYear() === y
        })
        const total = monthTxs.reduce((s: number, tx: any) => s + Number(tx.amount), 0)
        const facturado = monthTxs
          .filter((tx: any) => tx.is_from_cartola)
          .reduce((s: number, tx: any) => s + Number(tx.amount), 0)

        result.push({ month: m, year: y, label: shortMonthLabel(m, y), total, facturado, isForecast: false, forecastIncome: 0, forecastSubs: 0, forecastLoans: 0, forecastCC: 0 })
      } else {
        const income = settingsData?.monthly_budget ?? 0
        const forecastSubs = subsData.reduce((s, sub) => s + Number(sub.amount), 0)
        const forecastLoans = loansData.reduce((s, l) => s + Number(l.monthly_payment), 0)
        const monthKey = `${y}-${String(m).padStart(2, '0')}`
        const forecastCC = instProjection[monthKey] ?? 0
        const total = income > 0 ? Math.max(0, income - forecastSubs - forecastLoans - forecastCC) : forecastSubs + forecastLoans + forecastCC

        result.push({ month: m, year: y, label: shortMonthLabel(m, y), total, facturado: 0, isForecast: true, forecastIncome: income, forecastSubs, forecastLoans, forecastCC })
      }
    }

    setMonths(result)
    // Select current month (index 2 in 6-month window starting -2)
    setSelected(2)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sel = months[selected]
  const maxTotal = Math.max(...months.map(m => m.total), 1)
  const subsTotal = subs.reduce((s, sub) => s + Number(sub.amount), 0)
  const loansTotal = loans.reduce((s, l) => s + Number(l.monthly_payment), 0)

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 pb-24 sm:pb-6">
        <h1 className="text-xl font-bold text-text-primary">Flujo</h1>

        {/* Bar chart */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs text-text-muted">Últimos 6 meses</span>
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-accent" /> Real</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded bg-success/60" /> Proyección</span>
            </div>
          </div>
          <div className="flex h-28 items-end gap-1">
            {months.map((m, i) => {
              const pct = m.total / maxTotal
              const h = Math.max(4, Math.round(96 * pct))
              const isSelected = i === selected
              return (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className={`text-[9px] ${isSelected ? 'font-bold text-text-primary' : 'text-text-muted'}`}>
                    {m.total > 0 ? clpAbbreviated(m.total) : ''}
                  </span>
                  <div className="relative w-full">
                    <div
                      style={{ height: h }}
                      className={`w-full rounded-md transition-all ${
                        m.isForecast
                          ? 'border border-dashed border-warning/40 bg-success/20'
                          : isSelected ? 'bg-accent' : 'bg-accent/50'
                      }`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex gap-1">
            {months.map((m, i) => (
              <div key={i} className="flex-1 text-center">
                <span className={`text-[10px] ${i === selected ? 'font-bold' : 'text-text-muted'}`}>{m.label}</span>
                {m.isForecast && <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-success/60" />}
              </div>
            ))}
          </div>
        </div>

        {/* Month summary */}
        {sel && (
          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary">{monthYearLabel(sel.month, sel.year)}</span>
                  {sel.isForecast && (
                    <span className="badge bg-warning/10 text-warning">Proyección</span>
                  )}
                </div>
                <p className={`mt-1 text-3xl font-bold ${sel.isForecast ? 'text-warning' : 'text-text-primary'}`}>
                  {sel.total > 0 ? clpFormatted(sel.total) : '—'}
                </p>
              </div>
            </div>

            {sel.isForecast && (
              <div className="rounded-lg bg-surface-high p-4 space-y-3 text-sm">
                <ForecastRow label="Ingresos estimados" amount={sel.forecastIncome} isIncome />
                <hr className="border-border" />
                <ForecastRow label="Suscripciones" amount={sel.forecastSubs} icon="↻" />
                <ForecastRow label="Créditos" amount={sel.forecastLoans} icon="🏦" />
                <ForecastRow label="Cuotas tarjetas" amount={sel.forecastCC} icon="💳" />
                <hr className="border-border" />
                <div className="flex items-center justify-between font-semibold">
                  <span>Disponible estimado</span>
                  <span className={sel.total > 0 ? 'text-success' : 'text-danger'}>{sel.forecastIncome > 0 ? clpAbbreviated(sel.total) : '—'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="card overflow-hidden">
          <div className="flex border-b border-border">
            {(['tarjetas', 'creditos', 'suscripciones'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-medium transition
                  ${activeTab === tab ? 'border-b-2 border-accent text-accent' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {tab === 'tarjetas' ? '💳 Tarjetas' : tab === 'creditos' ? '🏦 Créditos' : '↻ Suscripciones'}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3">
            {activeTab === 'suscripciones' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Total mensual</span>
                  <span className="font-bold text-text-primary">{clpFormatted(subsTotal)}</span>
                </div>
                {subs.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between rounded-lg bg-surface-high px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{sub.name}</p>
                      <p className="text-xs text-text-muted">Día {sub.billing_day}</p>
                    </div>
                    <span className="text-sm font-semibold text-text-primary">{clpFormatted(Number(sub.amount))}</span>
                  </div>
                ))}

                <Link href="/suscripciones" className="flex items-center justify-end gap-1 text-xs text-accent hover:underline">
                  Ver todas →
                </Link>

                {showAddSub ? (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <p className="text-sm font-semibold text-text-primary">Nueva suscripción</p>
                    <input className="input w-full" placeholder="Nombre (ej. Netflix, Spotify)" value={subName} onChange={e => setSubName(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input className="input pl-6 w-full" placeholder="Monto" inputMode="numeric" value={subAmount} onChange={e => setSubAmount(clpInput(e.target.value))} />
                      </div>
                      <input className="input" placeholder="Día cobro" inputMode="numeric" maxLength={2} value={subDay} onChange={e => setSubDay(e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddSub(false)} className="btn-secondary flex-1">Cancelar</button>
                      <button onClick={saveSub} disabled={savingSub || !subName || !subAmount} className="btn-primary flex-1 disabled:opacity-40">
                        {savingSub ? 'Guardando…' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddSub(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-2.5 text-sm font-medium text-text-muted hover:border-accent hover:text-accent transition-colors">
                    + Nueva suscripción
                  </button>
                )}
              </>
            )}

            {activeTab === 'creditos' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Cuota mensual total</span>
                  <span className="font-bold text-text-primary">{clpFormatted(loansTotal)}</span>
                </div>
                {loans.map(loan => (
                  <div key={loan.id} className="rounded-lg bg-surface-high px-3 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{loan.name}</p>
                        <p className="text-xs text-text-muted">{loan.lender}</p>
                      </div>
                      <span className="font-semibold text-danger">{clpFormatted(Number(loan.monthly_payment))}/mes</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.min(100, ((loan.total_amount - loan.remaining_balance) / loan.total_amount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}

                <Link href="/creditos-lista" className="flex items-center justify-end gap-1 text-xs text-accent hover:underline">
                  Ver todos →
                </Link>

                {showAddLoan ? (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <p className="text-sm font-semibold text-text-primary">Nuevo crédito</p>
                    <input className="input w-full" placeholder="Nombre (ej. Crédito consumo)" value={loanName} onChange={e => setLoanName(e.target.value)} />
                    <input className="input w-full" placeholder="Institución (ej. BCI, CMF)" value={loanLender} onChange={e => setLoanLender(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input className="input pl-6 w-full" placeholder="Cuota mensual" inputMode="numeric" value={loanPayment} onChange={e => setLoanPayment(clpInput(e.target.value))} />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input className="input pl-6 w-full" placeholder="Saldo pendiente" inputMode="numeric" value={loanBalance} onChange={e => setLoanBalance(clpInput(e.target.value))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
                        <input className="input pl-6 w-full" placeholder="Monto total (opcional)" inputMode="numeric" value={loanTotal} onChange={e => setLoanTotal(clpInput(e.target.value))} />
                      </div>
                      <div className="relative">
                        <input className="input w-full pr-6" placeholder="Tasa % (opcional)" inputMode="decimal" value={loanRate} onChange={e => setLoanRate(e.target.value)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">%</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddLoan(false)} className="btn-secondary flex-1">Cancelar</button>
                      <button onClick={saveLoan} disabled={savingLoan || !loanName || !loanPayment} className="btn-primary flex-1 disabled:opacity-40">
                        {savingLoan ? 'Guardando…' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddLoan(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-2.5 text-sm font-medium text-text-muted hover:border-accent hover:text-accent transition-colors">
                    + Nuevo crédito
                  </button>
                )}
              </>
            )}

            {activeTab === 'tarjetas' && sel && (
              <>
                {cards.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">Sin tarjetas registradas</p>
                ) : (
                  <>
                    {cards.map(card => {
                      const bank      = (card.bank ?? 'unknown').toLowerCase()
                      const colors    = BANK_COLORS[bank] ?? BANK_COLORS.unknown
                      const textColor = BANK_TEXT[bank] ?? BANK_TEXT.unknown
                      const closeDay  = card.closing_day

                      // Billing period total for the selected month
                      const periodTotal = closeDay
                        ? billingTotal(cardTxs, card.id, closeDay, sel.month, sel.year)
                        : null

                      // Billing period label e.g. "21 feb → 20 mar"
                      let periodLabel = ''
                      if (closeDay) {
                        const [start, end] = billingPeriod(closeDay, sel.month, sel.year)
                        const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                        periodLabel = `${fmt(start)} → ${fmt(end)}`
                      }

                      // Days until closing (only for current month)
                      const today = new Date()
                      const isCurrentMonth = sel.month === today.getMonth() + 1 && sel.year === today.getFullYear()
                      let daysUntil: number | null = null
                      if (closeDay && isCurrentMonth) {
                        daysUntil = closeDay >= today.getDate()
                          ? closeDay - today.getDate()
                          : (30 - today.getDate() + closeDay)
                      }

                      return (
                        <div key={card.id} className={`rounded-xl border px-4 py-3 ${colors}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className={`text-sm font-semibold ${textColor}`}>{card.name}</p>
                              {card.last_four && (
                                <p className="text-xs text-text-muted font-mono">•••• {card.last_four}</p>
                              )}
                            </div>
                            <div className="text-right">
                              {periodTotal !== null ? (
                                <p className={`text-base font-bold ${periodTotal > 0 ? 'text-danger' : 'text-text-muted'}`}>
                                  {periodTotal > 0 ? clpFormatted(periodTotal) : '$0'}
                                </p>
                              ) : (
                                <p className="text-sm text-text-muted">Sin fecha cierre</p>
                              )}
                            </div>
                          </div>
                          {closeDay && (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-text-muted">{periodLabel}</span>
                              {daysUntil !== null && (
                                <span className={`text-xs font-medium ${daysUntil <= 5 ? 'text-danger' : 'text-text-muted'}`}>
                                  {daysUntil === 0 ? 'Cierra hoy' : `cierra en ${daysUntil} días`}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Total for the period */}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-sm font-semibold text-text-secondary">Total a pagar</span>
                      <span className="font-bold text-danger">
                        {clpFormatted(
                          cards.reduce((s, c) =>
                            s + (c.closing_day ? billingTotal(cardTxs, c.id, c.closing_day, sel.month, sel.year) : 0), 0
                          )
                        )}
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

// Given a card's closing_day and the selected month/year, return the billing period [start, end] as Date objects
function billingPeriod(closingDay: number, month: number, year: number): [Date, Date] {
  const end = new Date(year, month - 1, closingDay)
  // Start = closing_day + 1 of previous month
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  const start = new Date(prevYear, prevMonth - 1, closingDay + 1)
  return [start, end]
}

function billingTotal(
  txs: { credit_card_id: string; amount: number; date: string }[],
  cardId: string,
  closingDay: number,
  month: number,
  year: number
): number {
  const [start, end] = billingPeriod(closingDay, month, year)
  return txs
    .filter(tx => {
      if (tx.credit_card_id !== cardId) return false
      const d = new Date(tx.date)
      return d >= start && d <= end
    })
    .reduce((s, tx) => s + Number(tx.amount), 0)
}

function ForecastRow({ label, amount, isIncome, icon }: { label: string; amount: number; isIncome?: boolean; icon?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{icon && <span className="mr-1">{icon}</span>}{label}</span>
      <span className={`font-semibold ${isIncome ? 'text-success' : amount > 0 ? 'text-text-primary' : 'text-text-muted'}`}>
        {amount > 0 ? `${isIncome ? '+' : '−'}${clpAbbreviated(amount)}` : '—'}
      </span>
    </div>
  )
}

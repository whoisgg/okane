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
  forecastCC: number           // total CLP = billed + unbilled
  forecastCCUnbilled: number   // manual unmatched transactions in billing period
  forecastUSDAmount: number    // raw USD sum across all cards for this month
  forecastUSDInCLP: number     // forecastUSDAmount * exchange rate
  forecastUSDUnbilled: number  // manual unmatched USD transactions (current month only)
}

export default function DashboardPage() {
  const [months, setMonths] = useState<MonthData[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tarjetas' | 'creditos' | 'suscripciones'>('tarjetas')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [cardTxs, setCardTxs] = useState<{ credit_card_id: string; amount: number; date: string; is_from_cartola?: boolean; match_status?: string; currency?: string }[]>([])
  const [cartolaUploads, setCartolaUploads] = useState<{ credit_card_id: string; period_end: string; total_amount: number; currency?: string; upcoming_amounts?: { dueDate: string; amount: number }[] }[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)

  // ── Add subscription ────────────────────────────────────────────────────────
  const [showAddSub, setShowAddSub] = useState(false)
  const [subName, setSubName]       = useState('')
  const [subAmount, setSubAmount]   = useState('')
  const [subDay, setSubDay]         = useState('')
  const [subCurrency, setSubCurrency] = useState<'CLP' | 'USD'>('CLP')
  const [savingSub, setSavingSub]   = useState(false)

  async function saveSub() {
    if (!subName.trim() || !subAmount) return
    setSavingSub(true)
    const sb = getClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSavingSub(false); return }
    await sb.from('subscriptions').insert({
      user_id:     user.id,
      name:        subName.trim(),
      amount:      subCurrency === 'USD'
        ? parseFloat(subAmount) || 0
        : parseInt(subAmount.replace(/\./g, ''), 10),
      billing_day: subDay ? parseInt(subDay) : 1,
      currency:    subCurrency,
      category:    'suscripciones',
      is_active:   true,
    })
    setSubName(''); setSubAmount(''); setSubDay(''); setSubCurrency('CLP')
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
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSavingLoan(false); return }
    const parse = (v: string) => parseInt(v.replace(/\./g, '') || '0', 10)
    await sb.from('loans').insert({
      user_id:           user.id,
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

  const [usdRate, setUsdRate] = useState(950)   // live USD→CLP exchange rate

  const load = useCallback(async () => {
    const sb = getClient()
    setLoading(true)

    // Fetch live USD/CLP rate from mindicador.cl (Chilean Central Bank)
    try {
      const rateRes = await fetch('https://mindicador.cl/api/dolar')
      const rateJson = await rateRes.json()
      const liveRate = rateJson?.serie?.[0]?.valor
      if (liveRate && liveRate > 0) {
        setUsdRate(Math.round(liveRate))
        // Persist to settings so config page shows current rate
        const sb2 = getClient()
        sb2.from('settings').update({ usd_exchange_rate: Math.round(liveRate) }).neq('id', '')
      }
    } catch { /* use default 950 if API fails */ }

    // Parallel fetch
    const [txRes, subsRes, loansRes, settingsRes, cardsRes, cardTxsRes, uploadsRes] = await Promise.all([
      sb.from('transactions').select('amount,currency,date,is_from_cartola,credit_card_id').eq('type', 'expense'),
      sb.from('subscriptions').select('*').eq('is_active', true),
      sb.from('loans').select('*'),
      sb.from('settings').select('*').single(),
      sb.from('credit_cards').select('*').order('created_at'),
      sb.from('transactions').select('credit_card_id,amount,date,is_from_cartola,match_status,currency').eq('type', 'expense').not('credit_card_id', 'is', null),
      sb.from('cartola_uploads').select('credit_card_id,period_end,total_amount,currency,upcoming_amounts').eq('status', 'procesada').not('period_end', 'is', null).not('total_amount', 'is', null),
    ])

    const txRows = txRes.data ?? []
    const subsData = (subsRes.data ?? []) as Subscription[]
    const loansData = (loansRes.data ?? []) as Loan[]
    const settingsData = settingsRes.data as UserSettings | null
    const cardsData = (cardsRes.data ?? []) as CreditCard[]
    const cardTxsData = (cardTxsRes.data ?? []) as { credit_card_id: string; amount: number; date: string; is_from_cartola?: boolean; match_status?: string; currency?: string }[]
    const uploadsData = (uploadsRes.data ?? []) as { credit_card_id: string; period_end: string; total_amount: number; currency?: string; upcoming_amounts?: { dueDate: string; amount: number }[] }[]

    setSubs(subsData)
    setLoans(loansData)
    setCards(cardsData)
    setCardTxs(cardTxsData)
    setCartolaUploads(uploadsData)
    setSettings(settingsData)
    // Seed exchange rate from DB if live API hasn't responded yet
    if (settingsData?.usd_exchange_rate && settingsData.usd_exchange_rate > 0) {
      setUsdRate(prev => prev === 950 ? settingsData.usd_exchange_rate! : prev)
    }

    // Build 6-month rolling window
    const now = new Date()
    const result: MonthData[] = []

    for (let i = -2; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      // Past months (i < 0): show real totals. Current + future (i >= 0): show as Proyección
      const isForecast = i >= 0

      if (!isForecast) {
        // Non-CC expenses: sum by calendar month (CLP only)
        const nonCCTotal = txRows
          .filter((tx: any) => {
            if (tx.credit_card_id) return false
            if ((tx.currency ?? 'CLP') === 'USD') return false
            const td = new Date(tx.date)
            return td.getMonth() + 1 === m && td.getFullYear() === y
          })
          .reduce((s: number, tx: any) => s + Number(tx.amount), 0)

        // CC expenses: use CLP cartola total when available, else billing period tx sum
        const ccTotal = cardsData.reduce((s, card) => {
          if (!card.closing_day) return s
          const [, periodEnd] = billingPeriod(card.closing_day, m, y)
          const periodEndStr = periodEnd.toISOString().split('T')[0]
          // Only use CLP cartola (not USD) for CLP totals
          const upload = uploadsData.find(u => u.credit_card_id === card.id && u.period_end === periodEndStr && u.currency !== 'USD')
          return s + (upload
            ? Number(upload.total_amount)
            : billingTotal(cardTxsData, card.id, card.closing_day, m, y))
        }, 0)

        const total = nonCCTotal + ccTotal
        const facturado = txRows
          .filter((tx: any) => {
            if (!tx.is_from_cartola) return false
            const td = new Date(tx.date)
            return td.getMonth() + 1 === m && td.getFullYear() === y
          })
          .reduce((s: number, tx: any) => s + Number(tx.amount), 0)

        result.push({ month: m, year: y, label: shortMonthLabel(m, y), total, facturado, isForecast: false, forecastIncome: 0, forecastSubs: 0, forecastLoans: 0, forecastCC: 0, forecastCCUnbilled: 0, forecastUSDAmount: 0, forecastUSDInCLP: 0, forecastUSDUnbilled: 0 })
      } else {
        const income = settingsData?.monthly_budget ?? 0
        // Annual subscriptions contribute amount/12 per month
        const forecastSubs = subsData.reduce((s, sub) => {
          const monthly = sub.billing_period === 'annual' ? Number(sub.amount) / 12 : Number(sub.amount)
          return s + monthly
        }, 0)
        const forecastLoans = loansData.reduce((s, l) => s + Number(l.monthly_payment), 0)

        // CC forecast: billed from exact cartola (if available) or upcoming_amounts; unbilled from manual txs
        let forecastCCBilled = 0
        let forecastCCUnbilled = 0

        for (const card of cardsData) {
          if (!card.closing_day) continue

          const [, periodEnd] = billingPeriod(card.closing_day, m, y)
          const periodEndStr = periodEnd.toISOString().split('T')[0]

          // 1. Check for exact CLP cartola already uploaded for this billing period
          const exactUpload = uploadsData.find(u =>
            u.credit_card_id === card.id && u.period_end === periodEndStr && u.currency !== 'USD'
          )

          if (exactUpload) {
            // Real cartola data available — use it, no unbilled to add
            forecastCCBilled += exactUpload.total_amount
          } else {
            // 2. Try upcoming_amounts from the latest cartola
            const latestUpload = uploadsData
              .filter(u => u.credit_card_id === card.id && u.upcoming_amounts)
              .sort((a, b) => b.period_end.localeCompare(a.period_end))[0]

            if (latestUpload?.upcoming_amounts) {
              const match = latestUpload.upcoming_amounts.find(up => {
                const d = new Date(up.dueDate)
                return d.getMonth() + 1 === m && d.getFullYear() === y
              })
              if (match) forecastCCBilled += match.amount
            }

            // 3. Add manual unmatched (sin facturar) CLP transactions in this billing period
            forecastCCUnbilled += billingTotalUnbilled(cardTxsData, card.id, card.closing_day, m, y)
          }
        }

        const forecastCC = forecastCCBilled + forecastCCUnbilled

        // USD cartola amounts for this month (converted to CLP for total calculation)
        // Use exact cartola if available, otherwise carry forward the latest USD cartola total as estimate
        let forecastUSDAmount = 0
        for (const card of cardsData) {
          if (!card.closing_day) continue
          const [, periodEnd] = billingPeriod(card.closing_day, m, y)
          const periodEndStr = periodEnd.toISOString().split('T')[0]

          // 1. Exact USD cartola for this billing period
          const usdUpload = uploadsData.find(u =>
            u.credit_card_id === card.id && u.period_end === periodEndStr && u.currency === 'USD'
          )
          if (usdUpload) {
            forecastUSDAmount += usdUpload.total_amount
          } else {
            // 2. Carry forward latest USD cartola total as estimate (status already filtered at fetch time)
            const latestUSD = uploadsData
              .filter(u => u.credit_card_id === card.id && u.currency === 'USD')
              .sort((a, b) => b.period_end.localeCompare(a.period_end))[0]
            if (latestUSD) forecastUSDAmount += latestUSD.total_amount
          }
        }
        // Manual unmatched USD transactions (current month only — same logic as CLP unbilled)
        let forecastUSDUnbilled = 0
        if (i === 0) {
          for (const card of cardsData) {
            if (!card.closing_day) continue
            forecastUSDUnbilled += billingTotalUnbilledUSD(cardTxsData, card.id, card.closing_day, m, y)
          }
        }

        // Use settingsData exchange rate as seed (will be overridden by live rate once loaded)
        const exchangeRateSeed = settingsData?.usd_exchange_rate ?? 950
        const forecastUSDInCLP = Math.round(forecastUSDAmount * exchangeRateSeed)

        const total = income > 0
          ? Math.max(0, income - forecastSubs - forecastLoans - forecastCC - forecastUSDInCLP)
          : forecastSubs + forecastLoans + forecastCC + forecastUSDInCLP

        result.push({ month: m, year: y, label: shortMonthLabel(m, y), total, facturado: 0, isForecast: true, forecastIncome: income, forecastSubs, forecastLoans, forecastCC, forecastCCUnbilled, forecastUSDAmount, forecastUSDInCLP, forecastUSDUnbilled })
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
                <ForecastRow label="Tarjetas Facturado" amount={sel.forecastCC - sel.forecastCCUnbilled} icon="💳" />
                {sel.forecastCCUnbilled > 0 && (
                  <ForecastRow label="↳ Sin facturar" amount={sel.forecastCCUnbilled} />
                )}
                {sel.forecastUSDAmount > 0 && (
                  <>
                    <ForecastRow
                      label={`Dólar ($${usdRate.toLocaleString('es-CL')})`}
                      amount={sel.forecastUSDInCLP}
                      icon="💵"
                      inlineAnnotation={`US$ ${sel.forecastUSDAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    {sel.forecastUSDUnbilled > 0 && (
                      <ForecastRow
                        label="↳ Sin facturar USD"
                        amount={Math.round(sel.forecastUSDUnbilled * usdRate)}
                        inlineAnnotation={`US$ ${sel.forecastUSDUnbilled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      />
                    )}
                  </>
                )}
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
                    <div className="flex gap-1 rounded-lg bg-surface-high p-1">
                      {(['CLP', 'USD'] as const).map(cur => (
                        <button key={cur} onClick={() => setSubCurrency(cur)}
                          className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${subCurrency === cur ? (cur === 'USD' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-accent text-white shadow-sm') : 'text-text-muted hover:text-text-primary'}`}>
                          {cur}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">{subCurrency === 'USD' ? 'US$' : '$'}</span>
                        <input className="input pl-8 w-full" placeholder="Monto"
                          inputMode={subCurrency === 'USD' ? 'decimal' : 'numeric'}
                          value={subAmount}
                          onChange={e => setSubAmount(subCurrency === 'USD'
                            ? e.target.value.replace(/[^\d.]/g, '').replace(/(\.\d{0,2}).*/g, '$1')
                            : clpInput(e.target.value))} />
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
                      // Prefer cartola total (Monto Total Facturado a Pagar) when available
                      let periodTotal: number | null = null
                      let periodFromCartola = false
                      let usdUpload: { total_amount: number } | null = null
                      if (closeDay) {
                        const [, periodEnd] = billingPeriod(closeDay, sel.month, sel.year)
                        const periodEndStr = periodEnd.toISOString().split('T')[0]

                        // USD upload for the same card+period — if no exact match, carry forward latest
                        usdUpload = cartolaUploads.find(u =>
                          u.credit_card_id === card.id && u.period_end === periodEndStr && u.currency === 'USD'
                        ) ?? cartolaUploads
                          .filter(u => u.credit_card_id === card.id && u.currency === 'USD')
                          .sort((a, b) => b.period_end.localeCompare(a.period_end))[0]
                          ?? null

                        // 1. Exact CLP cartola match for this billing period
                        const upload = cartolaUploads.find(u =>
                          u.credit_card_id === card.id && u.period_end === periodEndStr && u.currency !== 'USD'
                        )

                        if (upload) {
                          periodTotal = upload.total_amount
                          periodFromCartola = true
                        } else {
                          // 2. Check upcoming_amounts from the latest cartola (for future months)
                          const latestWithUpcoming = cartolaUploads
                            .filter(u => u.credit_card_id === card.id && u.upcoming_amounts)
                            .sort((a, b) => b.period_end.localeCompare(a.period_end))[0]

                          const upcoming = latestWithUpcoming?.upcoming_amounts?.find(up => {
                            const d = new Date(up.dueDate)
                            return d.getMonth() === periodEnd.getMonth() && d.getFullYear() === periodEnd.getFullYear()
                          })

                          if (upcoming) {
                            periodTotal = upcoming.amount
                            periodFromCartola = true
                          } else {
                            // 3. Fallback: sum of transactions in this billing period
                            periodTotal = billingTotal(cardTxs, card.id, closeDay, sel.month, sel.year)
                          }
                        }
                      }

                      // Billing period label e.g. "21 feb → 20 mar"
                      let periodLabel = ''
                      if (closeDay) {
                        const [start, end] = billingPeriod(closeDay, sel.month, sel.year)
                        const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                        periodLabel = `${fmt(start)} → ${fmt(end)}`
                      }

                      // Sin facturar CTA: show when billing period has unmatched manual txs and no cartola yet
                      const unbilledAmount = closeDay
                        ? billingTotalUnbilled(cardTxs, card.id, closeDay, sel.month, sel.year)
                        : 0
                      const unbilledUSDAmount = closeDay
                        ? billingTotalUnbilledUSD(cardTxs, card.id, closeDay, sel.month, sel.year)
                        : 0
                      const hasExactCartola = (() => {
                        if (!closeDay) return false
                        const [, pe] = billingPeriod(closeDay, sel.month, sel.year)
                        const peStr = pe.toISOString().split('T')[0]
                        return cartolaUploads.some(u => u.credit_card_id === card.id && u.period_end === peStr && (u.currency ?? 'CLP') !== 'USD')
                      })()
                      const hasExactUSDCartola = (() => {
                        if (!closeDay) return false
                        const [, pe] = billingPeriod(closeDay, sel.month, sel.year)
                        const peStr = pe.toISOString().split('T')[0]
                        return cartolaUploads.some(u => u.credit_card_id === card.id && u.period_end === peStr && u.currency === 'USD')
                      })()
                      const showUploadCTA = unbilledAmount > 0 && !hasExactCartola
                      const showUSDUploadCTA = unbilledUSDAmount > 0 && !hasExactUSDCartola

                      // Closing status (only for current month)
                      const today = new Date()
                      const isCurrentMonth = sel.month === today.getMonth() + 1 && sel.year === today.getFullYear()
                      let closingStatus: 'open' | 'today' | 'closed' | null = null
                      let daysUntil: number | null = null
                      if (closeDay && isCurrentMonth) {
                        const todayDate = today.getDate()
                        if (todayDate < closeDay) {
                          closingStatus = 'open'
                          daysUntil = closeDay - todayDate
                        } else if (todayDate === closeDay) {
                          closingStatus = 'today'
                        } else {
                          closingStatus = 'closed'
                        }
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
                                <>
                                  <p className={`text-base font-bold ${periodTotal > 0 ? 'text-danger' : 'text-text-muted'}`}>
                                    {periodTotal > 0 ? clpFormatted(periodTotal) : '$0'}
                                  </p>
                                  {usdUpload && (
                                    <div className="mt-0.5">
                                      <p className="text-xs font-semibold text-emerald-600">
                                        + US$ {usdUpload.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      <p className="text-[9px] text-text-muted text-right">
                                        ~{clpFormatted(Math.round(usdUpload.total_amount * usdRate))}
                                      </p>
                                    </div>
                                  )}
                                  {periodFromCartola && (
                                    <span className="text-[9px] text-text-muted">📄 cartola</span>
                                  )}
                                </>
                              ) : (
                                <p className="text-sm text-text-muted">Sin fecha cierre</p>
                              )}
                            </div>
                          </div>
                          {closeDay && (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-text-muted">{periodLabel}</span>
                              {closingStatus === 'closed' && (
                                <span className="text-xs font-medium text-success">✓ Cerrado</span>
                              )}
                              {closingStatus === 'today' && (
                                <span className="text-xs font-medium text-danger">Cierra hoy</span>
                              )}
                              {closingStatus === 'open' && daysUntil !== null && (
                                <span className={`text-xs font-medium ${daysUntil <= 5 ? 'text-danger' : 'text-text-muted'}`}>
                                  cierra en {daysUntil} día{daysUntil !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          )}
                          {showUploadCTA && (
                            <div className="mt-2 flex items-center justify-between rounded-lg bg-warning/10 px-3 py-2">
                              <div className="flex items-center gap-1.5 text-xs text-warning">
                                <span>⚠</span>
                                <span>{clpFormatted(unbilledAmount)} sin facturar</span>
                              </div>
                              <Link
                                href="/cartolas"
                                className="flex items-center gap-1 text-xs font-semibold text-warning hover:underline"
                              >
                                📄 Subir cartola →
                              </Link>
                            </div>
                          )}
                          {showUSDUploadCTA && (
                            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
                              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                                <span>⚠</span>
                                <span>US$ {unbilledUSDAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sin facturar</span>
                              </div>
                              <Link
                                href="/cartolas"
                                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline"
                              >
                                📄 Subir cartola →
                              </Link>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Total for the period */}
                    {(() => {
                      let clpTotal = 0
                      let usdTotal = 0
                      for (const c of cards) {
                        if (!c.closing_day) continue
                        const [, periodEnd] = billingPeriod(c.closing_day, sel.month, sel.year)
                        const periodEndStr = periodEnd.toISOString().split('T')[0]

                        // CLP portion
                        const clpUpload = cartolaUploads.find(u =>
                          u.credit_card_id === c.id && u.period_end === periodEndStr && u.currency !== 'USD'
                        )
                        if (clpUpload) {
                          clpTotal += clpUpload.total_amount
                        } else {
                          const latestWithUpcoming = cartolaUploads
                            .filter(u => u.credit_card_id === c.id && u.upcoming_amounts)
                            .sort((a, b) => b.period_end.localeCompare(a.period_end))[0]
                          const upcoming = latestWithUpcoming?.upcoming_amounts?.find(up => {
                            const d = new Date(up.dueDate)
                            return d.getMonth() === periodEnd.getMonth() && d.getFullYear() === periodEnd.getFullYear()
                          })
                          clpTotal += upcoming ? upcoming.amount : billingTotal(cardTxs, c.id, c.closing_day, sel.month, sel.year)
                        }

                        // USD portion — find USD cartola for same card + period
                        const usdUpload = cartolaUploads.find(u =>
                          u.credit_card_id === c.id && u.period_end === periodEndStr && u.currency === 'USD'
                        )
                        if (usdUpload) usdTotal += usdUpload.total_amount
                      }
                      const usdInCLP = Math.round(usdTotal * usdRate)
                      const grandTotal = clpTotal + usdInCLP
                      return (
                        <div className="flex items-center justify-between pt-1 border-t border-border">
                          <span className="text-sm font-semibold text-text-secondary">Total a pagar</span>
                          <div className="text-right">
                            <span className="font-bold text-danger">{clpFormatted(grandTotal)}</span>
                            {usdTotal > 0 && (
                              <p className="text-[10px] text-text-muted">
                                CLP {clpAbbreviated(clpTotal)} + US$ {usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (~{clpAbbreviated(usdInCLP)})
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })()}
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
  txs: { credit_card_id: string; amount: number; date: string; currency?: string }[],
  cardId: string,
  closingDay: number,
  month: number,
  year: number
): number {
  const [start, end] = billingPeriod(closingDay, month, year)
  return txs
    .filter(tx => {
      if (tx.credit_card_id !== cardId) return false
      if ((tx.currency ?? 'CLP') === 'USD') return false   // exclude USD from CLP totals
      const d = new Date(tx.date)
      return d >= start && d <= end
    })
    .reduce((s, tx) => s + Number(tx.amount), 0)
}

// Only counts manual, unmatched CLP transactions — used for "sin facturar" calculation
function billingTotalUnbilled(
  txs: { credit_card_id: string; amount: number; date: string; is_from_cartola?: boolean; match_status?: string; currency?: string }[],
  cardId: string,
  closingDay: number,
  month: number,
  year: number
): number {
  const [start, end] = billingPeriod(closingDay, month, year)
  return txs
    .filter(tx => {
      if (tx.credit_card_id !== cardId) return false
      if (tx.is_from_cartola) return false
      if (tx.match_status === 'matched') return false
      if ((tx.currency ?? 'CLP') === 'USD') return false   // exclude USD from CLP totals
      const d = new Date(tx.date)
      return d >= start && d <= end
    })
    .reduce((s, tx) => s + Number(tx.amount), 0)
}

// Only counts manual, unmatched USD transactions — used for "sin facturar USD" calculation
function billingTotalUnbilledUSD(
  txs: { credit_card_id: string; amount: number; date: string; is_from_cartola?: boolean; match_status?: string; currency?: string }[],
  cardId: string,
  closingDay: number,
  month: number,
  year: number
): number {
  const [start, end] = billingPeriod(closingDay, month, year)
  return txs
    .filter(tx => {
      if (tx.credit_card_id !== cardId) return false
      if (tx.is_from_cartola) return false
      if (tx.match_status === 'matched') return false
      if ((tx.currency ?? 'CLP') !== 'USD') return false   // only USD
      const d = new Date(tx.date)
      return d >= start && d <= end
    })
    .reduce((s, tx) => s + Number(tx.amount), 0)
}

function ForecastRow({ label, amount, isIncome, icon, inlineAnnotation }: {
  label: string; amount: number; isIncome?: boolean; icon?: string; inlineAnnotation?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{icon && <span className="mr-1">{icon}</span>}{label}</span>
      <div className="flex items-center gap-2">
        {inlineAnnotation && (
          <span className="text-[10px] text-text-muted tabular-nums">{inlineAnnotation}</span>
        )}
        <span className={`font-semibold ${isIncome ? 'text-success' : amount > 0 ? 'text-text-primary' : 'text-text-muted'}`}>
          {amount > 0 ? `${isIncome ? '+' : '−'}${clpAbbreviated(amount)}` : '—'}
        </span>
      </div>
    </div>
  )
}

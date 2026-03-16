'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted, clpAbbreviated, shortMonthLabel, monthYearLabel } from '@/lib/utils'
import type { Transaction, Subscription, Loan, UserSettings } from '@/lib/types'

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
  const [settings, setSettings] = useState<UserSettings | null>(null)

  const load = useCallback(async () => {
    const sb = getClient()
    setLoading(true)

    // Parallel fetch
    const [txRes, instRes, subsRes, loansRes, settingsRes] = await Promise.all([
      sb.from('transactions').select('amount,currency,date,is_from_cartola').eq('type', 'expense'),
      sb.from('transactions')
        .select('amount,date,installment_number,installment_total,credit_card_id')
        .eq('is_installment', true)
        .not('installment_number', 'is', null)
        .not('installment_total', 'is', null),
      sb.from('subscriptions').select('*').eq('is_active', true),
      sb.from('loans').select('*'),
      sb.from('settings').select('*').single(),
    ])

    const txRows = txRes.data ?? []
    const instRows = instRes.data ?? []
    const subsData = (subsRes.data ?? []) as Subscription[]
    const loansData = (loansRes.data ?? []) as Loan[]
    const settingsData = settingsRes.data as UserSettings | null

    setSubs(subsData)
    setLoans(loansData)
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
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-xl font-bold text-text-primary">Flujo de Caja</h1>

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
                <ForecastRow label="Cuotas tarjetas (conocidas)" amount={sel.forecastCC} icon="💳" />
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
                {subs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">Sin suscripciones</p>
                ) : (
                  subs.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between rounded-lg bg-surface-high px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{sub.name}</p>
                        <p className="text-xs text-text-muted">Día {sub.billing_day}</p>
                      </div>
                      <span className="text-sm font-semibold text-text-primary">{clpFormatted(Number(sub.amount))}</span>
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === 'creditos' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Cuota mensual total</span>
                  <span className="font-bold text-text-primary">{clpFormatted(loansTotal)}</span>
                </div>
                {loans.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">Sin créditos registrados</p>
                ) : (
                  loans.map(loan => (
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
                  ))
                )}
              </>
            )}

            {activeTab === 'tarjetas' && (
              <p className="py-6 text-center text-sm text-text-muted">
                Ver detalle por tarjeta en <a href="/saldos" className="text-accent underline">Saldos</a>
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
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

'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { Loan } from '@/lib/types'

function clpInput(v: string) {
  return v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function parse(v: string) {
  return parseInt(v.replace(/\./g, '') || '0', 10)
}

const EMPTY = { name: '', lender: '', payment: '', balance: '', total: '', rate: '' }

export default function CreditosPage() {
  const [loans, setLoans]     = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm]       = useState(EMPTY)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getClient().from('loans').select('*').order('created_at')
    setLoans((data ?? []) as Loan[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = ['payment','balance','total'].includes(key) ? clpInput(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [key]: v }))
    }
  }

  async function save() {
    if (!form.name.trim() || !form.payment) return
    setSaving(true); setError(null)
    const { error: err } = await getClient().from('loans').insert({
      name:              form.name.trim(),
      lender:            form.lender.trim() || form.name.trim(),
      total_amount:      parse(form.total) || parse(form.payment),
      remaining_balance: parse(form.balance) || parse(form.total) || parse(form.payment),
      monthly_payment:   parse(form.payment),
      interest_rate:     form.rate ? parseFloat(form.rate) : 0,
      start_date:        new Date().toISOString().split('T')[0],
    })
    if (err) { setError(err.message); setSaving(false); return }
    setForm(EMPTY); setShowForm(false); setSaving(false)
    load()
  }

  async function remove(id: string) {
    setDeleting(id)
    await getClient().from('loans').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  const total = loans.reduce((s, l) => s + Number(l.monthly_payment), 0)
  const totalBalance = loans.reduce((s, l) => s + Number(l.remaining_balance), 0)

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 pb-24 sm:pb-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="text-text-secondary hover:text-text-primary transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-text-primary">Créditos</h1>
          </div>
          <button onClick={() => { setShowForm(true); setError(null) }} className="btn-primary text-xs px-3 py-1.5">
            + Nuevo crédito
          </button>
        </div>

        {/* Summary */}
        {loans.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-xs text-text-muted mb-1">Cuota mensual total</p>
              <p className="text-lg font-bold text-danger">{clpFormatted(total)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-text-muted mb-1">Deuda total pendiente</p>
              <p className="text-lg font-bold text-text-primary">{clpFormatted(totalBalance)}</p>
            </div>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-text-primary">Nuevo crédito</h2>
            <input className="input w-full" placeholder="Nombre (ej. Crédito consumo BCI)" value={form.name} onChange={f('name')} />
            <input className="input w-full" placeholder="Institución (ej. BCI, Santander)" value={form.lender} onChange={f('lender')} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Cuota mensual *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">$</span>
                  <input className="input pl-6 w-full" placeholder="0" inputMode="numeric" value={form.payment} onChange={f('payment')} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Saldo pendiente</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">$</span>
                  <input className="input pl-6 w-full" placeholder="0" inputMode="numeric" value={form.balance} onChange={f('balance')} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Monto total original</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">$</span>
                  <input className="input pl-6 w-full" placeholder="0" inputMode="numeric" value={form.total} onChange={f('total')} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Tasa de interés anual</label>
                <div className="relative">
                  <input className="input pr-6 w-full" placeholder="0.0" inputMode="decimal" value={form.rate} onChange={f('rate')} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">%</span>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setForm(EMPTY) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.payment} className="btn-primary flex-1 disabled:opacity-40">
                {saving ? 'Guardando…' : 'Guardar crédito'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : loans.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-3xl mb-3">🏦</p>
            <p className="text-sm font-medium text-text-secondary">Sin créditos registrados</p>
            <p className="mt-1 text-xs text-text-muted">Agrega un crédito para hacer seguimiento de cuotas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {loans.map(loan => {
              const pct = loan.total_amount > 0
                ? Math.min(100, ((loan.total_amount - loan.remaining_balance) / loan.total_amount) * 100)
                : 0
              const cuotasLeft = loan.monthly_payment > 0
                ? Math.ceil(loan.remaining_balance / loan.monthly_payment)
                : null

              return (
                <div key={loan.id} className="card p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-text-primary">{loan.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">{loan.lender}{loan.interest_rate > 0 ? ` · ${loan.interest_rate}% anual` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-base font-bold text-danger">{clpFormatted(Number(loan.monthly_payment))}<span className="text-xs font-normal text-text-muted">/mes</span></p>
                        <p className="text-xs text-text-muted">saldo: {clpFormatted(Number(loan.remaining_balance))}</p>
                      </div>
                      <button
                        onClick={() => remove(loan.id)}
                        disabled={deleting === loan.id}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-danger/10 hover:text-danger transition disabled:opacity-40"
                      >
                        {deleting === loan.id ? '…' : '✕'}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>{pct.toFixed(0)}% pagado</span>
                      {cuotasLeft !== null && <span>~{cuotasLeft} cuotas restantes</span>}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </AppShell>
  )
}

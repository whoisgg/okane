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

const LENDERS = ['Santander', 'BancoEstado', 'BCI', 'Banco de Chile', 'Itaú', 'Falabella', 'Scotiabank', 'Security', 'Consorcio', 'Ripley', 'Otro']
const thisMonth = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` }
const EMPTY = { name: '', lender: '', payment: '', balance: '', startDate: thisMonth() }

function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}
function formatMonthYear(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function CreditosPage() {
  const [loans, setLoans]     = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
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
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = ['payment','balance'].includes(key) ? clpInput(e.target.value) : e.target.value
      setForm(prev => ({ ...prev, [key]: v }))
    }
  }

  function numToClp(n: number) {
    return n > 0 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''
  }

  function startEdit(loan: Loan) {
    setEditingId(loan.id)
    setForm({
      name:      loan.name,
      lender:    loan.lender ?? '',
      payment:   numToClp(Number(loan.monthly_payment)),
      balance:   numToClp(Number(loan.remaining_balance)),
      startDate: loan.start_date ? loan.start_date.slice(0, 7) : thisMonth(),
    })
    setShowForm(true)
    setError(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY)
  }

  async function save() {
    if (!form.name.trim() || !form.payment) return
    setSaving(true); setError(null)
    const sb = getClient()
    if (editingId) {
      // On edit, the trigger owns remaining_balance. Only update editable fields.
      const payload = {
        name:            form.name.trim(),
        lender:          form.lender || form.name.trim(),
        monthly_payment: parse(form.payment),
        start_date:      `${form.startDate}-01`,
      }
      const { error: err } = await (sb.from('loans') as any).update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setError('No autenticado'); setSaving(false); return }
      const balance = parse(form.balance) || parse(form.payment)
      const payload = {
        user_id:           user.id,
        name:              form.name.trim(),
        lender:            form.lender || form.name.trim(),
        monthly_payment:   parse(form.payment),
        total_amount:      balance,
        remaining_balance: balance,
        start_date:        `${form.startDate}-01`,
      }
      const { error: err } = await (sb.from('loans') as any).insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    cancelForm(); setSaving(false)
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
          {!showForm && (
            <button onClick={() => { setEditingId(null); setForm(EMPTY); setShowForm(true); setError(null) }} className="btn-primary text-xs px-3 py-1.5">
              + Nuevo crédito
            </button>
          )}
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
            <h2 className="font-semibold text-text-primary">{editingId ? 'Editar crédito' : 'Nuevo crédito'}</h2>
            <input className="input w-full" placeholder="Nombre (ej. Crédito consumo)" value={form.name} onChange={f('name')} />
            <select className="input w-full" value={form.lender} onChange={f('lender')}>
              <option value="">Selecciona institución…</option>
              {LENDERS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Cuota mensual *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">$</span>
                  <input className="input pl-6 w-full" placeholder="0" inputMode="numeric" value={form.payment} onChange={f('payment')} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">
                  Saldo pendiente {editingId && <span className="text-text-muted/60">(automático)</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">$</span>
                  <input
                    className="input pl-6 w-full disabled:opacity-50"
                    placeholder="0"
                    inputMode="numeric"
                    value={form.balance}
                    onChange={f('balance')}
                    disabled={!!editingId}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Fecha inicio</label>
              <input
                type="month"
                className="input w-full text-sm"
                value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            {editingId && (
              <p className="text-xs text-text-muted">
                El saldo se actualiza automáticamente cuando registras un pago marcado como "crédito".
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={cancelForm} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.payment} className="btn-primary flex-1 disabled:opacity-40">
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar crédito'}
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
              const endLabel = cuotasLeft && cuotasLeft > 0
                ? formatMonthYear(addMonths(new Date(), cuotasLeft))
                : null
              const startLabel = loan.start_date
                ? `${loan.start_date.slice(5, 7)}/${loan.start_date.slice(0, 4)}`
                : null

              return (
                <div key={loan.id} className="card p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-text-primary">{loan.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {loan.lender}
                        {startLabel && ` · desde ${startLabel}`}
                        {endLabel && ` · hasta ${endLabel}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-base font-bold text-danger">{clpFormatted(Number(loan.monthly_payment))}<span className="text-xs font-normal text-text-muted">/mes</span></p>
                        <p className="text-xs text-text-muted">saldo: {clpFormatted(Number(loan.remaining_balance))}</p>
                      </div>
                      <button
                        onClick={() => startEdit(loan)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-accent/10 hover:text-accent transition"
                        title="Editar"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => remove(loan.id)}
                        disabled={deleting === loan.id}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-danger/10 hover:text-danger transition disabled:opacity-40"
                        title="Eliminar"
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

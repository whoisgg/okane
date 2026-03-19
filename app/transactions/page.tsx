'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { Transaction, CreditCard } from '@/lib/types'

const CATEGORIES = [
  'hogar','comida','salud','transporte','entretenimiento',
  'ropa','educacion','tecnologia','viajes','otros',
]

export default function TransactionsPage() {
  const searchParams = useSearchParams()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards]               = useState<CreditCard[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<'all' | 'expense' | 'income'>('all')
  const [monthFilter, setMonthFilter]   = useState<string>('')
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [editing, setEditing]           = useState<Transaction | null>(null)
  const [showAdd, setShowAdd]           = useState(false)

  // Auto-open add modal when coming from sidebar "Nueva transacción" button
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowAdd(true)
  }, [searchParams])

  const load = useCallback(async () => {
    const sb = getClient()
    const [txRes, cardsRes] = await Promise.all([
      sb.from('transactions').select('*').order('date', { ascending: false }).limit(200),
      sb.from('credit_cards').select('*'),
    ])
    setTransactions((txRes.data ?? []) as Transaction[])
    setCards((cardsRes.data ?? []) as CreditCard[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteTransaction(id: string) {
    setDeleting(id)
    const sb = getClient()
    await sb.from('transactions').delete().eq('id', id)
    setTransactions(prev => prev.filter(t => t.id !== id))
    setDeleting(null)
  }

  const months = Array.from(new Set(
    transactions.map(t => t.date.slice(0, 7))
  )).sort().reverse()

  const filtered = transactions.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (monthFilter && !t.date.startsWith(monthFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      const desc = (t.description ?? t.category).toLowerCase()
      if (!desc.includes(q)) return false
    }
    return true
  })

  const total = filtered.reduce((s, t) => t.type === 'expense' ? s - Number(t.amount) : s + Number(t.amount), 0)

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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-text-primary">Movimientos</h1>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1.5">
            + Agregar
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            className="input flex-1 min-w-36 py-1.5 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="input w-auto py-1.5 text-xs" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
          </select>
          <select className="input w-auto py-1.5 text-xs" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
            <option value="">Todos los meses</option>
            {months.map(m => (
              <option key={m} value={m}>
                {new Date(m + '-15').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between rounded-lg bg-surface-high px-4 py-2 text-sm">
          <span className="text-text-secondary">{filtered.length} movimientos</span>
          <span className={`font-bold ${total >= 0 ? 'text-success' : 'text-danger'}`}>
            {total >= 0 ? '+' : ''}{clpFormatted(Math.abs(total))}
          </span>
        </div>

        {/* List */}
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">Sin movimientos</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(tx => {
                const card = cards.find(c => c.id === tx.credit_card_id)
                return (
                  <div
                    key={tx.id}
                    className="group flex items-center justify-between px-4 py-3 hover:bg-surface-high cursor-pointer"
                    onClick={() => setEditing(tx)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {tx.description ?? tx.category}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-text-muted">
                          {new Date(tx.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-text-muted">{tx.category}</span>
                        {card && <span className="badge bg-border text-text-muted">{card.name}</span>}
                        {tx.is_installment && tx.installment_number != null && (
                          <span className="badge bg-accent/10 text-accent">{tx.installment_number}/{tx.installment_total}</span>
                        )}
                        {tx.is_from_cartola && <span className="badge bg-success/10 text-success">cartola</span>}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className={`whitespace-nowrap text-sm font-semibold ${tx.type === 'expense' ? 'text-danger' : 'text-success'}`}>
                        {tx.type === 'expense' ? '−' : '+'}{clpFormatted(Number(tx.amount))}
                      </span>
                      {/* Delete — always visible on mobile, hover-only on desktop */}
                      <button
                        onClick={e => { e.stopPropagation(); deleteTransaction(tx.id) }}
                        disabled={deleting === tx.id}
                        className="text-text-muted hover:text-danger transition text-xs sm:invisible sm:group-hover:visible"
                        title="Eliminar"
                      >
                        {deleting === tx.id ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add modal */}
        {showAdd && (
          <TransactionModal
            cards={cards}
            onClose={() => setShowAdd(false)}
            onSaved={(tx) => { setTransactions(prev => [tx, ...prev]); setShowAdd(false) }}
          />
        )}

        {/* Edit modal */}
        {editing && (
          <TransactionModal
            cards={cards}
            initial={editing}
            onClose={() => setEditing(null)}
            onSaved={(tx) => {
              setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t))
              setEditing(null)
            }}
          />
        )}
      </div>
    </AppShell>
  )
}

// ── Unified Add / Edit modal ───────────────────────────────────────────────

function TransactionModal({ cards, initial, onClose, onSaved }: {
  cards: CreditCard[]
  initial?: Transaction
  onClose: () => void
  onSaved: (tx: Transaction) => void
}) {
  const isEdit = !!initial

  const fmtClp = (n: number) => n.toLocaleString('es-CL')
  const clpInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const usdInput = (v: string) => v.replace(/[^\d.]/g, '').replace(/(\.\d{0,2}).*/g, '$1')

  const initCurrency = (initial?.currency ?? 'CLP') as 'CLP' | 'USD'
  const initAmount = initial
    ? initCurrency === 'USD'
      ? String(Number(initial.amount))
      : fmtClp(Number(initial.amount))
    : ''

  const [currency, setCurrency]           = useState<'CLP' | 'USD'>(initCurrency)
  const [amount, setAmount]               = useState(initAmount)
  const [description, setDescription]     = useState(initial?.description ?? '')
  const [category, setCategory]           = useState(initial?.category ?? 'otros')
  const [date, setDate]                   = useState(initial?.date ?? new Date().toISOString().split('T')[0])
  const [type, setType]                   = useState<'expense' | 'income'>(initial?.type ?? 'expense')
  const [cardId, setCardId]               = useState(initial?.credit_card_id ?? '')
  const [isInstallment, setIsInstallment] = useState(initial?.is_installment ?? false)
  const [installmentTotal, setInstallmentTotal] = useState(String(initial?.installment_total ?? ''))
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  function handleAmountChange(v: string) {
    setAmount(currency === 'USD' ? usdInput(v) : clpInput(v))
  }

  function handleCurrencySwitch(cur: 'CLP' | 'USD') {
    setCurrency(cur)
    setAmount('')   // reset amount when switching to avoid garbage formatting
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const sb = getClient()

    const parsedAmount = currency === 'USD'
      ? parseFloat(amount)
      : parseInt(amount.replace(/\./g, ''), 10)

    if (!parsedAmount || parsedAmount <= 0) {
      setError('Ingresa un monto válido'); setSaving(false); return
    }

    const body: any = {
      amount:            parsedAmount,
      currency,
      type,
      category,
      description:       description || null,
      date,
      credit_card_id:    cardId || null,
      is_installment:    isInstallment,
      installment_total: isInstallment ? parseInt(installmentTotal) : null,
    }

    let data: Transaction | null = null
    if (isEdit) {
      const res = await sb.from('transactions').update(body).eq('id', initial!.id).select().single()
      if (res.error) { setError(res.error.message); setSaving(false); return }
      data = res.data as Transaction
    } else {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setError('No autenticado'); setSaving(false); return }
      const res = await sb.from('transactions').insert({
        ...body,
        user_id: user.id,
        match_status: 'unmatched',
        is_from_cartola: false,
      }).select().single()
      if (res.error) { setError(res.error.message); setSaving(false); return }
      data = res.data as Transaction
    }

    onSaved(data!)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">
            {isEdit ? 'Editar movimiento' : 'Agregar movimiento'}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          {/* Type + Currency toggles */}
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${type === t ? (t === 'expense' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success') : 'bg-surface-high text-text-secondary'}`}>
                {t === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>

          {/* Currency selector */}
          <div className="flex gap-1 rounded-lg bg-surface-high p-1">
            {(['CLP', 'USD'] as const).map(cur => (
              <button key={cur} type="button" onClick={() => handleCurrencySwitch(cur)}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${currency === cur ? (cur === 'USD' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-accent text-white shadow-sm') : 'text-text-muted hover:text-text-primary'}`}>
                {cur}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm pointer-events-none">
              {currency === 'USD' ? 'US$' : '$'}
            </span>
            <input
              className="input pl-10"
              placeholder={currency === 'USD' ? '0.00' : '0'}
              value={amount}
              inputMode={currency === 'USD' ? 'decimal' : 'numeric'}
              onChange={e => handleAmountChange(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <input className="input" placeholder="Descripción (opcional)" value={description} onChange={e => setDescription(e.target.value)} />

          {/* Category */}
          <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>

          {/* Date */}
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />

          {/* Card */}
          {cards.length > 0 && (
            <select className="input" value={cardId} onChange={e => setCardId(e.target.value)}>
              <option value="">Sin tarjeta</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Installments */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isInstallment} onChange={e => setIsInstallment(e.target.checked)} />
            <span className="text-text-secondary">Es en cuotas</span>
          </label>
          {isInstallment && (
            <input className="input" placeholder="Total de cuotas" value={installmentTotal} onChange={e => setInstallmentTotal(e.target.value)} />
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={saving}>
              {saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

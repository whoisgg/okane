'use client'

import { useEffect, useState, useCallback } from 'react'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { Transaction, CreditCard } from '@/lib/types'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [monthFilter, setMonthFilter] = useState<string>('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

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

  // Available months for filter
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
      <div className="mx-auto max-w-2xl space-y-4 p-6">
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
          <select
            className="input w-auto py-1.5 text-xs"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
          >
            <option value="all">Todos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
          </select>
          <select
            className="input w-auto py-1.5 text-xs"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
          >
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
                  <div key={tx.id} className="group flex items-center justify-between px-4 py-3 hover:bg-surface-high">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {tx.description ?? tx.category}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-text-muted">
                          {new Date(tx.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {card && <span className="badge bg-border text-text-muted">{card.name}</span>}
                        {tx.is_installment && tx.installment_number != null && (
                          <span className="badge bg-accent/10 text-accent">{tx.installment_number}/{tx.installment_total}</span>
                        )}
                        {tx.is_from_cartola && <span className="badge bg-success/10 text-success">cartola</span>}
                        {tx.match_status === 'matched' && <span className="badge bg-success/10 text-success">match</span>}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className={`whitespace-nowrap text-sm font-semibold ${tx.type === 'expense' ? 'text-danger' : 'text-success'}`}>
                        {tx.type === 'expense' ? '−' : '+'}{clpFormatted(Number(tx.amount))}
                      </span>
                      <button
                        onClick={() => deleteTransaction(tx.id)}
                        disabled={deleting === tx.id}
                        className="invisible text-text-muted hover:text-danger group-hover:visible transition text-xs"
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
          <AddTransactionModal
            cards={cards}
            onClose={() => setShowAdd(false)}
            onAdded={(tx) => { setTransactions(prev => [tx, ...prev]); setShowAdd(false) }}
          />
        )}
      </div>
    </AppShell>
  )
}

function AddTransactionModal({ cards, onClose, onAdded }: {
  cards: CreditCard[]
  onClose: () => void
  onAdded: (tx: Transaction) => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('otros')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [cardId, setCardId] = useState(cards[0]?.id ?? '')
  const [isInstallment, setIsInstallment] = useState(false)
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const sb = getClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('No autenticado'); setSaving(false); return }

    const body: any = {
      user_id: user.id,
      amount: parseInt(amount.replace(/\D/g, ''), 10),
      currency: 'CLP',
      type,
      category,
      description: description || null,
      date,
      credit_card_id: cardId || null,
      is_installment: isInstallment,
      installment_total: isInstallment ? parseInt(installmentTotal) : null,
      match_status: 'unmatched',
      is_from_cartola: false,
    }

    const { data, error: err } = await sb.from('transactions').insert(body).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    onAdded(data as Transaction)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary">Agregar movimiento</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${type === t ? (t === 'expense' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success') : 'bg-surface-high text-text-secondary'}`}>
                {t === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
          <input className="input" placeholder="Monto (CLP)" value={amount} onChange={e => setAmount(e.target.value)} required />
          <input className="input" placeholder="Descripción (opcional)" value={description} onChange={e => setDescription(e.target.value)} />
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          {cards.length > 0 && (
            <select className="input" value={cardId} onChange={e => setCardId(e.target.value)}>
              <option value="">Sin tarjeta</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
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
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

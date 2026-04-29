'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { Transaction, CreditCard, Subscription, BankAccount, Loan } from '@/lib/types'

const CATEGORIES = [
  'hogar','comida','salud','transporte','entretenimiento',
  'ropa','educacion','tecnologia','viajes','servicios','suscripciones','financiero','otros',
]
const CAT_LABEL: Record<string,string> = {
  hogar:'Hogar', comida:'Comida', salud:'Salud', transporte:'Transporte',
  entretenimiento:'Entretención', ropa:'Ropa', educacion:'Educación',
  tecnologia:'Tecnología', viajes:'Viajes', servicios:'Servicios',
  suscripciones:'Suscripciones', financiero:'Financiero', otros:'Compras',
}

const INCOME_CATEGORIES = [
  'sueldo','honorarios','bonos','inversiones','arriendo','reembolsos','intereses','otros_ingreso',
]
const INCOME_LABEL: Record<string,string> = {
  sueldo:'Sueldo', honorarios:'Honorarios', bonos:'Bonos',
  inversiones:'Inversiones', arriendo:'Arriendo', reembolsos:'Reembolsos',
  intereses:'Intereses', otros_ingreso:'Otros',
}

const ALL_LABELS: Record<string,string> = { ...CAT_LABEL, ...INCOME_LABEL }

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsContent />
    </Suspense>
  )
}

function TransactionsContent() {
  const searchParams = useSearchParams()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [cards, setCards]               = useState<CreditCard[]>([])
  const [subs, setSubs]                 = useState<Subscription[]>([])
  const [loans, setLoans]               = useState<Loan[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<'all' | 'expense' | 'income' | 'payment'>('all')
  const [monthFilter, setMonthFilter]   = useState<string>('')
  const [itemFilter, setItemFilter]     = useState<string>('all')
  const [catFilter, setCatFilter]       = useState<string>('all')
  const [sinFacturar, setSinFacturar]   = useState(false)
  const [sfType, setSfType]             = useState<'all' | 'cc_clp' | 'cc_usd' | 'subs'>('all')
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [editing, setEditing]           = useState<Transaction | null>(null)
  const [showAdd, setShowAdd]           = useState(false)

  // Auto-open add modal when coming from sidebar "Nueva transacción" button
  // Also handle sin_facturar filter from dashboard deep links
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowAdd(true)
    if (searchParams.get('filter') === 'sin_facturar') {
      setSinFacturar(true)
      const t = searchParams.get('sfType')
      if (t === 'cc_clp' || t === 'cc_usd' || t === 'subs') setSfType(t)
      const m = searchParams.get('month')
      if (m) setMonthFilter(m)
      const item = searchParams.get('item')
      if (item) setItemFilter(item)
    }
    // Standalone month / cat params (used by inicio category cards)
    const m = searchParams.get('month')
    if (m) setMonthFilter(m)
    const c = searchParams.get('cat')
    if (c) setCatFilter(c)
  }, [searchParams])

  const load = useCallback(async () => {
    const sb = getClient()
    const [txRes, cardsRes, subsRes, loansRes, bankRes] = await Promise.all([
      sb.from('transactions').select('*').order('date', { ascending: false }).limit(200),
      sb.from('credit_cards').select('*'),
      sb.from('subscriptions').select('id,name,amount,currency,billing_period').eq('is_active', true).order('name'),
      sb.from('loans').select('id,name,lender,monthly_payment').eq('is_active', true).order('name'),
      sb.from('bank_accounts').select('*').eq('is_active', true).order('created_at'),
    ])
    setTransactions((txRes.data ?? []) as Transaction[])
    setCards((cardsRes.data ?? []) as CreditCard[])
    setSubs((subsRes.data ?? []) as Subscription[])
    setLoans((loansRes.data ?? []) as Loan[])
    setBankAccounts((bankRes.data ?? []) as BankAccount[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteTransaction(id: string) {
    setDeleting(id)
    const sb = getClient()
    await (sb.from('transactions') as any).delete().eq('id', id)
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
    if (itemFilter !== 'all') {
      const [kind, id] = itemFilter.split(':')
      if (kind === 'cc' && t.credit_card_id !== id) return false
      if (kind === 'ba' && t.bank_account_id !== id) return false
    }
    if (catFilter !== 'all' && t.category !== catFilter) return false
    // Sin facturar filter: manual, unmatched transactions
    if (sinFacturar) {
      if (t.is_from_cartola) return false
      if (t.match_status === 'matched') return false
      if (sfType === 'cc_clp') {
        if (!t.credit_card_id) return false
        if ((t.currency ?? 'CLP') === 'USD') return false
        if (t.subscription_id) return false
      } else if (sfType === 'cc_usd') {
        if (!t.credit_card_id) return false
        if ((t.currency ?? 'CLP') !== 'USD') return false
      } else if (sfType === 'subs') {
        if (!t.subscription_id) return false
      } else {
        // 'all': any unbilled transaction on a credit card
        if (!t.credit_card_id) return false
      }
    }
    return true
  })

  // Unique categories present in all transactions (not filtered, so chips don't disappear)
  const presentCats = Array.from(new Set(transactions.map(t => t.category))).sort()

  // payments are transfers, excluded from income/expense total
  const total = filtered.reduce((s, t) => t.type === 'expense' ? s - Number(t.amount) : t.type === 'income' ? s + Number(t.amount) : s, 0)

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
        <div className="flex flex-col gap-2">
          {/* Row 1: search + type + month */}
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
              <option value="payment">Pagos tarjeta</option>
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

          {/* Sin facturar filter toggle */}
          {sinFacturar && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2">
              <span className="text-xs text-warning font-medium">⚠ Sin facturar</span>
              {sfType !== 'all' && (
                <span className="text-[10px] text-warning/70 bg-warning/10 rounded-full px-2 py-0.5">
                  {sfType === 'cc_clp' ? 'CLP tarjetas' : sfType === 'cc_usd' ? 'USD tarjetas' : 'Suscripciones'}
                </span>
              )}
              <button
                onClick={() => { setSinFacturar(false); setSfType('all') }}
                className="ml-auto text-xs text-warning hover:text-warning/80 font-medium"
              >
                ✕ Quitar filtro
              </button>
            </div>
          )}

          {/* Row 2: item (tarjeta / cuenta) */}
          <select className="input w-full py-1.5 text-xs" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
            <option value="all">Todos los medios de pago</option>
            {cards.length > 0 && (
              <optgroup label="Tarjetas">
                {cards.map(c => (
                  <option key={c.id} value={`cc:${c.id}`}>
                    {c.name}{c.last_four ? ` ···· ${c.last_four}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {bankAccounts.length > 0 && (
              <optgroup label="Cuentas corrientes">
                {bankAccounts.map(b => (
                  <option key={b.id} value={`ba:${b.id}`}>
                    {b.name}{b.last_four ? ` ···· ${b.last_four}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {/* Row 3: category chips */}
          {presentCats.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setCatFilter('all')}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  catFilter === 'all'
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-high border-border text-text-muted hover:text-text-primary'
                }`}
              >
                Todas
              </button>
              {presentCats.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(catFilter === cat ? 'all' : cat)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    catFilter === cat
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-high border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {ALL_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          )}
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
                          {new Date(tx.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-text-muted">{tx.category}</span>
                        {card && <span className="badge bg-border text-text-muted">{card.name}</span>}
                        {tx.is_installment && tx.installment_number != null && (
                          <span className="badge bg-accent/10 text-accent">{tx.installment_number}/{tx.installment_total}</span>
                        )}
                        {tx.is_from_cartola && <span className="badge bg-success/10 text-success">cartola</span>}
                        {!tx.is_from_cartola && tx.credit_card_id && tx.match_status !== 'matched' && (
                          <span className="badge bg-warning/10 text-warning">sin facturar</span>
                        )}
                        {tx.bank_account_id && !tx.is_transfer && <span className="badge bg-accent/15 text-accent">flujo</span>}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className={`whitespace-nowrap text-sm font-semibold ${tx.type === 'expense' ? 'text-danger' : tx.type === 'payment' ? 'text-accent' : 'text-success'}`}>
                        {tx.type === 'expense' ? '−' : tx.type === 'payment' ? '⇄' : '+'}{clpFormatted(Number(tx.amount))}
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
            subs={subs}
            loans={loans}
            bankAccounts={bankAccounts}
            onClose={() => setShowAdd(false)}
            onSaved={(tx) => { setTransactions(prev => [tx, ...prev]); setShowAdd(false) }}
            onBankAccountCreated={(ba) => setBankAccounts(prev => [...prev, ba])}
          />
        )}

        {/* Edit modal */}
        {editing && (
          <TransactionModal
            cards={cards}
            subs={subs}
            loans={loans}
            bankAccounts={bankAccounts}
            initial={editing}
            onClose={() => setEditing(null)}
            onSaved={(tx) => {
              setTransactions(prev => prev.map(t => t.id === tx.id ? tx : t))
              setEditing(null)
            }}
            onBankAccountCreated={(ba) => setBankAccounts(prev => [...prev, ba])}
          />
        )}
      </div>
    </AppShell>
  )
}

// ── Unified Add / Edit modal ───────────────────────────────────────────────

export function TransactionModal({ cards, subs, loans, bankAccounts, initial, onClose, onSaved, onBankAccountCreated }: {
  cards: CreditCard[]
  subs: Subscription[]
  loans: Loan[]
  bankAccounts: BankAccount[]
  initial?: Transaction
  onClose: () => void
  onSaved: (tx: Transaction) => void
  onBankAccountCreated: (ba: BankAccount) => void
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
  const [date, setDate]                   = useState(initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().split('T')[0])
  const [type, setType]                   = useState<'expense' | 'income' | 'payment'>((initial?.type ?? 'expense') as 'expense' | 'income' | 'payment')
  const [cardId, setCardId]               = useState(initial?.credit_card_id ?? '')
  const [bankAccountId, setBankAccountId] = useState(initial?.bank_account_id ?? '')
  const [newBankName, setNewBankName]     = useState('')
  const [newBankLastFour, setNewBankLastFour] = useState('')
  const [creatingBank, setCreatingBank]   = useState(false)
  const [isInstallment, setIsInstallment] = useState(initial?.is_installment ?? false)
  const [installmentTotal, setInstallmentTotal] = useState(String(initial?.installment_total ?? ''))
  const [isSubLinked, setIsSubLinked]     = useState(!!(initial?.subscription_id) || initial?.category === 'suscripciones')
  const [subscriptionId, setSubscriptionId] = useState(initial?.subscription_id ?? '')
  const [isLoanLinked, setIsLoanLinked]   = useState(!!(initial?.loan_id))
  const [loanId, setLoanId]               = useState(initial?.loan_id ?? '')
  // isRelevantToFlujo = !is_transfer. Bank account txs default to NOT relevant (excluded from flujo).
  const [isRelevantToFlujo, setIsRelevantToFlujo] = useState(
    initial ? !(initial.is_transfer ?? false) : false
  )
  const [isReimbursement, setIsReimbursement] = useState(!!initial?.is_reimbursement)
  const [saving, setSaving]               = useState(false)

  // When bank account is selected on a NEW transaction, default to excluded from flujo
  useEffect(() => {
    if (!isEdit && bankAccountId) setIsRelevantToFlujo(false)
  }, [bankAccountId, isEdit])
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

    const body: any = type === 'payment' ? {
      amount:           parsedAmount,
      currency,
      type:             'payment',
      category:         'pago_tarjeta',
      description:      description || null,
      date,
      credit_card_id:   cardId || null,
      bank_account_id:  bankAccountId || null,
      is_installment:   false,
      subscription_id:  null,
      is_transfer:      !isRelevantToFlujo,
    } : {
      amount:            parsedAmount,
      currency,
      type,
      category,
      description:       description || null,
      date,
      credit_card_id:    bankAccountId ? null : (cardId || null),
      bank_account_id:   bankAccountId || null,
      is_installment:    isInstallment,
      installment_total: isInstallment ? parseInt(installmentTotal) : null,
      subscription_id:   (type === 'expense' && isSubLinked && subscriptionId) ? subscriptionId : null,
      loan_id:           (type === 'expense' && isLoanLinked && loanId) ? loanId : null,
      is_transfer:       !isRelevantToFlujo,
      is_reimbursement:  type === 'income' && isReimbursement,
    }

    let data: Transaction | null = null
    if (isEdit) {
      const res = await (sb.from('transactions') as any).update(body).eq('id', initial!.id).select().single()
      if (res.error) { setError(res.error.message); setSaving(false); return }
      data = res.data as Transaction
    } else {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setError('No autenticado'); setSaving(false); return }
      const res = await (sb.from('transactions') as any).insert({
        ...body,
        user_id: user.id,
        match_status: 'unmatched',
        is_from_cartola: false,
      }).select().single()
      if (res.error) { setError(res.error.message); setSaving(false); return }
      data = res.data as Transaction
    }

    // If payment: reduce credit card balance by the payment amount
    if (type === 'payment' && cardId) {
      const { data: card } = await sb.from('credit_cards').select('balance').eq('id', cardId).single() as { data: any }
      if (card) {
        await (sb.from('credit_cards') as any)
          .update({ balance: Math.max(0, Number(card.balance) - parsedAmount) })
          .eq('id', cardId)
      }
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
          {/* Type tabs */}
          <div className="flex gap-2">
            {(['expense', 'income', 'payment'] as const).map(t => (
              <button key={t} type="button" onClick={() => {
                setType(t)
                // Reset category to a sensible default for the new type
                if (t === 'income' && !INCOME_CATEGORIES.includes(category)) setCategory('sueldo')
                else if (t === 'expense' && !CATEGORIES.includes(category)) setCategory('otros')
                // Income can't go on a credit card — clear cardId if any
                if (t === 'income' && cardId) setCardId('')
              }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  type === t
                    ? t === 'expense' ? 'bg-danger/10 text-danger'
                    : t === 'income'  ? 'bg-success/10 text-success'
                    : 'bg-accent/10 text-accent'
                    : 'bg-surface-high text-text-secondary'
                }`}>
                {t === 'expense' ? 'Gasto' : t === 'income' ? 'Ingreso' : 'Pago tarjeta'}
              </button>
            ))}
          </div>

          {/* Currency selector (not shown for payments — always CLP) */}
          {type !== 'payment' && (
            <div className="flex gap-1 rounded-lg bg-surface-high p-1">
              {(['CLP', 'USD'] as const).map(cur => (
                <button key={cur} type="button" onClick={() => handleCurrencySwitch(cur)}
                  className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${currency === cur ? (cur === 'USD' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-accent text-white shadow-sm') : 'text-text-muted hover:text-text-primary'}`}>
                  {cur}
                </button>
              ))}
            </div>
          )}

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

          {/* Date */}
          <input
            className="input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />

          {/* ── PAGO TARJETA fields ── */}
          {type === 'payment' && (
            <>
              {/* Which CC was paid */}
              {cards.length > 0 && (
                <select className="input" value={cardId} onChange={e => setCardId(e.target.value)} required>
                  <option value="">Selecciona tarjeta pagada...</option>
                  {cards.map(c => <option key={c.id} value={c.id}>{c.name} {c.last_four ? `···· ${c.last_four}` : ''}</option>)}
                </select>
              )}

              {/* From which bank account */}
              {bankAccounts.length > 0 ? (
                <select className="input" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
                  <option value="">Cuenta corriente (opcional)</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}{b.last_four ? ` ···· ${b.last_four}` : ''}</option>)}
                  <option value="__new__">+ Agregar cuenta corriente</option>
                </select>
              ) : (
                <button type="button" className="input text-left text-text-muted text-sm"
                  onClick={() => setCreatingBank(true)}>
                  + Agregar cuenta corriente
                </button>
              )}

              {/* Inline new bank account form */}
              {(creatingBank || bankAccountId === '__new__') && (
                <div className="rounded-lg bg-surface-high p-3 space-y-2">
                  <p className="text-xs font-medium text-text-secondary">Nueva cuenta corriente</p>
                  <input className="input" placeholder="Nombre (ej: Cuenta Santander)" value={newBankName} onChange={e => setNewBankName(e.target.value)} />
                  <input className="input" placeholder="Últimos 4 dígitos (opcional)" maxLength={4} value={newBankLastFour} onChange={e => setNewBankLastFour(e.target.value.replace(/\D/g, ''))} />
                  <button type="button" className="btn-primary text-xs px-3 py-1.5 w-full" onClick={async () => {
                    if (!newBankName.trim()) return
                    const sb = getClient()
                    const { data: { user } } = await sb.auth.getUser()
                    if (!user) return
                    const { data } = await (sb.from('bank_accounts') as any).insert({
                      user_id: user.id, name: newBankName.trim(),
                      last_four: newBankLastFour || null, is_active: true,
                    }).select().single()
                    if (data) {
                      onBankAccountCreated(data as BankAccount)
                      setBankAccountId(data.id)
                      setCreatingBank(false)
                      setNewBankName('')
                      setNewBankLastFour('')
                    }
                  }}>Guardar cuenta</button>
                </div>
              )}

              {bankAccountId && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isRelevantToFlujo} onChange={e => setIsRelevantToFlujo(e.target.checked)} />
                  <span className="text-text-secondary">Relevante para flujo</span>
                  <span className="ml-auto text-xs text-text-muted">(incluir en proyección)</span>
                </label>
              )}
            </>
          )}

          {/* ── GASTO / INGRESO fields ── */}
          {type !== 'payment' && (
            <>
              <select className="input" value={category} onChange={e => {
                setCategory(e.target.value)
                if (e.target.value === 'suscripciones') setIsSubLinked(true)
              }}>
                {(type === 'income' && !isReimbursement
                  ? INCOME_CATEGORIES
                  : CATEGORIES
                ).map(c => (
                  <option key={c} value={c}>
                    {(type === 'income' && !isReimbursement ? INCOME_LABEL : CAT_LABEL)[c] ?? c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>

              {/* Payment source: card OR bank account.
                  For income: only bank accounts (you can't deposit into a credit card). */}
              {((type === 'expense' && (cards.length > 0 || bankAccounts.length > 0)) ||
                (type === 'income' && bankAccounts.length > 0)) && (
                <select className="input" value={bankAccountId ? `ba:${bankAccountId}` : cardId ? `cc:${cardId}` : ''}
                  onChange={e => {
                    const v = e.target.value
                    if (!v) { setCardId(''); setBankAccountId('') }
                    else if (v.startsWith('cc:')) { setCardId(v.slice(3)); setBankAccountId('') }
                    else if (v.startsWith('ba:')) { setBankAccountId(v.slice(3)); setCardId('') }
                  }}>
                  <option value="">{type === 'income' ? 'Selecciona cuenta de abono' : 'Sin medio de pago'}</option>
                  {type === 'expense' && cards.length > 0 && <optgroup label="Tarjetas">
                    {cards.map(c => <option key={c.id} value={`cc:${c.id}`}>{c.name}</option>)}
                  </optgroup>}
                  {bankAccounts.length > 0 && <optgroup label={type === 'income' ? 'Cuentas' : 'Cuentas corrientes'}>
                    {bankAccounts.map(b => <option key={b.id} value={`ba:${b.id}`}>{b.name}</option>)}
                  </optgroup>}
                </select>
              )}

              {type === 'expense' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isSubLinked} onChange={e => {
                    setIsSubLinked(e.target.checked)
                    if (e.target.checked) {
                      setCategory('suscripciones')
                      // Subscription payments from bank account are tracked via forecastSubs (no double count)
                      if (bankAccountId) setIsRelevantToFlujo(true)
                    } else {
                      setSubscriptionId('')
                      if (category === 'suscripciones') setCategory('otros')
                    }
                  }} />
                  <span className="text-text-secondary">Es una suscripción</span>
                </label>
              )}
              {type === 'expense' && isSubLinked && subs.length > 0 && (
                <select className="input" value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)}>
                  <option value="">Selecciona suscripción...</option>
                  {subs.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {Number(s.amount).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}
                    </option>
                  ))}
                </select>
              )}

              {type === 'expense' && loans.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isLoanLinked} onChange={e => {
                    setIsLoanLinked(e.target.checked)
                    if (e.target.checked) {
                      // Loan payments from bank account are tracked via forecastLoans (no double count)
                      if (bankAccountId) setIsRelevantToFlujo(true)
                    } else {
                      setLoanId('')
                    }
                  }} />
                  <span className="text-text-secondary">Es pago de crédito</span>
                </label>
              )}
              {type === 'expense' && isLoanLinked && loans.length > 0 && (
                <select className="input" value={loanId} onChange={e => setLoanId(e.target.value)}>
                  <option value="">Selecciona crédito...</option>
                  {loans.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.lender ? ` — ${l.lender}` : ''} (${Number(l.monthly_payment).toLocaleString('es-CL')}/mes)
                    </option>
                  ))}
                </select>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isInstallment} onChange={e => setIsInstallment(e.target.checked)} />
                <span className="text-text-secondary">Es en cuotas</span>
              </label>
              {isInstallment && (
                <input className="input" placeholder="Total de cuotas" value={installmentTotal} onChange={e => setInstallmentTotal(e.target.value)} />
              )}

              {bankAccountId && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isRelevantToFlujo} onChange={e => setIsRelevantToFlujo(e.target.checked)} />
                  <span className="text-text-secondary">Relevante para flujo</span>
                  <span className="ml-auto text-xs text-text-muted">(incluir en proyección)</span>
                </label>
              )}

              {type === 'income' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isReimbursement} onChange={e => {
                    const v = e.target.checked
                    setIsReimbursement(v)
                    // Switching the meaning of category — reset to a safe default
                    if (v && !CATEGORIES.includes(category)) setCategory('otros')
                    else if (!v && !INCOME_CATEGORIES.includes(category)) setCategory('reembolsos')
                  }} />
                  <span className="text-text-secondary">Es rendición / reembolso</span>
                  <span className="ml-auto text-xs text-text-muted">(neta del gasto)</span>
                </label>
              )}
            </>
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

'use client'

import { useEffect, useState, useCallback, useRef, MouseEvent } from 'react'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { CreditCard, BankAccount, Transaction, BankType } from '@/lib/types'

const CARD_GRADIENTS = [
  'from-[#4F46E5] to-[#7C3AED]',
  'from-[#0F172A] to-[#1E3A5F]',
  'from-[#064E3B] to-[#065F46]',
  'from-[#7C2D12] to-[#9A3412]',
  'from-[#1E1B4B] to-[#312E81]',
]

const BANKS: { id: BankType; label: string; emoji: string }[] = [
  { id: 'falabella', label: 'Falabella', emoji: '🏬' },
  { id: 'santander', label: 'Santander', emoji: '🏦' },
  { id: 'unknown',   label: 'Otro',      emoji: '💳' },
]

function usdFormatted(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

export default function SaldosPage() {
  const [cards, setCards]               = useState<CreditCard[]>([])
  const [accounts, setAccounts]         = useState<BankAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedCard, setSelectedCard] = useState(0)
  const [tab, setTab]                   = useState<'facturado' | 'sin-facturar'>('sin-facturar')
  const [loading, setLoading]           = useState(true)
  const scrollRef                       = useRef<HTMLDivElement>(null)
  const isDragging                      = useRef(false)
  const dragStartX                      = useRef(0)
  const dragScrollLeft                  = useRef(0)

  function onMouseDown(e: MouseEvent<HTMLDivElement>) {
    isDragging.current = true
    dragStartX.current = e.pageX - (scrollRef.current?.offsetLeft ?? 0)
    dragScrollLeft.current = scrollRef.current?.scrollLeft ?? 0
    if (scrollRef.current) scrollRef.current.style.cursor = 'grabbing'
  }
  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!isDragging.current || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    scrollRef.current.scrollLeft = dragScrollLeft.current - (x - dragStartX.current)
  }
  function onMouseUp() {
    isDragging.current = false
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
  }

  function scrollToCard(idx: number) {
    if (!scrollRef.current) return
    const cardWidth = scrollRef.current.offsetWidth - 24
    scrollRef.current.scrollTo({ left: idx * cardWidth, behavior: 'smooth' })
    setSelectedCard(idx)
  }

  // ── Add card modal state ──────────────────────────────────────────────────
  const [showAddCard, setShowAddCard]   = useState(false)
  const [newCardBank, setNewCardBank]   = useState<BankType>('unknown')
  const [newCardName, setNewCardName]   = useState('')
  const [newCardLast4, setNewCardLast4] = useState('')
  const [newCardClose, setNewCardClose] = useState('')
  const [addingCard, setAddingCard]     = useState(false)
  const [addCardErr, setAddCardErr]     = useState<string | null>(null)

  function openAddCard() {
    setNewCardBank('unknown'); setNewCardName(''); setNewCardLast4('')
    setNewCardClose(''); setAddCardErr(null); setShowAddCard(true)
  }

  const load = useCallback(async () => {
    const sb = getClient()
    const [cardsRes, accsRes] = await Promise.all([
      sb.from('credit_cards').select('*').order('created_at'),
      sb.from('bank_accounts').select('*').order('created_at'),
    ])
    setCards((cardsRes.data ?? []) as CreditCard[])
    setAccounts((accsRes.data ?? []) as BankAccount[])
    setLoading(false)
  }, [])

  async function saveNewCard() {
    if (!newCardName.trim()) return
    setAddingCard(true); setAddCardErr(null)
    try {
      const sb = getClient()
      const { error } = await sb.from('credit_cards').insert({
        name: newCardName.trim(),
        last_four: newCardLast4.trim() || null,
        closing_day: newCardClose ? parseInt(newCardClose) : null,
        balance: 0,
        balance_usd: 0,
        bank: newCardBank,
      })
      if (error) throw error
      setShowAddCard(false)
      await load()
    } catch (e: any) {
      setAddCardErr(e.message ?? 'Error al guardar')
    }
    setAddingCard(false)
  }

  const loadTxs = useCallback(async (cardId: string) => {
    const sb = getClient()
    const { data } = await sb
      .from('transactions')
      .select('*')
      .eq('credit_card_id', cardId)
      .order('date', { ascending: false })
      .limit(100)
    setTransactions((data ?? []) as Transaction[])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const card = cards[selectedCard]
    if (card) loadTxs(card.id)
  }, [cards, selectedCard, loadTxs])

  const allItems = [
    ...cards.map(c => ({ type: 'card' as const, item: c })),
    ...accounts.map(a => ({ type: 'account' as const, item: a })),
  ]

  const current      = allItems[selectedCard]
  const facturados   = transactions.filter(t => t.is_from_cartola || t.match_status === 'matched')
  const sinFacturar  = transactions.filter(t => !t.is_from_cartola && t.match_status !== 'matched')
  const displayedTxs = tab === 'facturado' ? facturados : sinFacturar

  // ── Month navigation ───────────────────────────────────────────────────────
  const months = Array.from(
    new Set(displayedTxs.map(t => t.date.slice(0, 7)))
  ).sort().reverse()  // newest first

  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const activeMonth = selectedMonth && months.includes(selectedMonth)
    ? selectedMonth
    : months[0] ?? ''
  const monthTxs = displayedTxs.filter(t => t.date.startsWith(activeMonth))
  const monthIdx = months.indexOf(activeMonth)
  const monthTotal = monthTxs.reduce(
    (s, t) => t.type === 'expense' ? s - Number(t.amount) : s + Number(t.amount), 0
  )
  const monthLabel = activeMonth
    ? new Date(activeMonth + '-02').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
        .replace(/^./, c => c.toUpperCase())
    : ''

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
          <h1 className="text-xl font-bold text-text-primary">Saldos</h1>
          <button onClick={openAddCard} className="btn-primary text-xs px-3 py-1.5">
            + Tarjeta
          </button>
        </div>

        {/* Card carousel — one card at a time with snap */}
        <div className="relative -mx-6 px-6">
          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory select-none"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', cursor: 'grab' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onScroll={e => {
              const el = e.currentTarget
              const cardWidth = el.offsetWidth - 24  // accounts for gap
              const idx = Math.round(el.scrollLeft / cardWidth)
              setSelectedCard(Math.max(0, Math.min(idx, allItems.length - 1)))
            }}
          >
            {allItems.map(({ type, item }, i) => {
              const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length]
              const isCC     = type === 'card'
              const cc       = item as CreditCard
              const ba       = item as BankAccount
              const balanceCLP = Number(item.balance)
              const balanceUSD = isCC ? Number(cc.balance_usd ?? 0) : null

              return (
                <div
                  key={item.id}
                  className={`relative flex-shrink-0 snap-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg overflow-hidden`}
                  style={{ width: 'calc(100% - 24px)', minHeight: '11rem' }}
                >
                  {/* Subtle gloss overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                  {/* Chip icon — top right */}
                  <div className="absolute top-5 right-5 flex gap-0.5 opacity-40">
                    {[0,1,2,3].map(n => (
                      <div key={n} className="h-[7px] w-[18px] rounded-[2px] border border-white/80" />
                    ))}
                  </div>

                  {/* Card name */}
                  <div className="px-5 pt-5">
                    <p className="text-[15px] font-semibold tracking-tight">{item.name}</p>
                    {isCC && cc.last_four && (
                      <p className="mt-1.5 font-mono text-[13px] tracking-[0.2em] opacity-70">
                        •••• •••• •••• {cc.last_four}
                      </p>
                    )}
                    {!isCC && ba.bank_name && (
                      <p className="mt-1.5 text-[13px] opacity-60">{ba.bank_name}</p>
                    )}
                  </div>

                  {/* Balance — bottom section */}
                  <div className="flex items-end justify-between px-5 pb-5 pt-5">
                    {/* CLP | USD side by side */}
                    <div className="flex items-end gap-0">
                      {/* CLP column */}
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-50 mb-0.5">
                          {isCC ? 'Deuda actual' : 'Saldo'}
                        </p>
                        <p className="text-[10px] font-bold opacity-65 mb-0.5 tracking-wider">CLP</p>
                        <p className="text-[22px] font-bold leading-none tracking-tight">
                          {clpFormatted(balanceCLP)}
                        </p>
                      </div>

                      {/* Divider + USD column — credit cards always */}
                      {isCC && balanceUSD !== null && (
                        <>
                          <div className="mx-3.5 mb-1 w-px self-stretch bg-white/20" />
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-50 mb-0.5">
                              &nbsp;
                            </p>
                            <p className="text-[10px] font-bold opacity-65 mb-0.5 tracking-wider">USD</p>
                            <p className="text-[22px] font-bold leading-none tracking-tight">
                              {usdFormatted(balanceUSD)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Closing day */}
                    {isCC && cc.closing_day && (
                      <div className="text-right pb-0.5">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-50 mb-0.5">Cierre</p>
                        <p className="text-[15px] font-semibold">día {cc.closing_day}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination dots + arrows */}
          {allItems.length > 1 && (
            <div className="mt-3 grid grid-cols-3 items-center px-1">
              {/* Left arrow */}
              <div className="flex justify-start">
                <button
                  onClick={() => scrollToCard(Math.max(0, selectedCard - 1))}
                  disabled={selectedCard === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-high text-text-secondary transition hover:bg-accent hover:text-white disabled:opacity-20"
                >
                  ‹
                </button>
              </div>

              {/* Dots */}
              <div className="flex justify-center gap-1.5">
                {allItems.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToCard(i)}
                    className={`rounded-full transition-all duration-200 ${
                      i === selectedCard
                        ? 'h-2 w-5 bg-accent'
                        : 'h-2 w-2 bg-text-muted/30 hover:bg-text-muted/60'
                    }`}
                  />
                ))}
              </div>

              {/* Right arrow */}
              <div className="flex justify-end">
                <button
                  onClick={() => scrollToCard(Math.min(allItems.length - 1, selectedCard + 1))}
                  disabled={selectedCard === allItems.length - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-high text-text-secondary transition hover:bg-accent hover:text-white disabled:opacity-20"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transaction tabs */}
        {current?.type === 'card' && (
          <div className="card overflow-hidden">
            {/* Tab row */}
            <div className="flex border-b border-border">
              <button
                onClick={() => { setTab('sin-facturar'); setSelectedMonth('') }}
                className={`flex-1 py-3 text-sm font-medium transition ${tab === 'sin-facturar' ? 'border-b-2 border-warning text-warning' : 'text-text-secondary'}`}
              >
                Sin facturar{' '}
                <span className="ml-1 rounded-full bg-warning/10 px-1.5 text-xs text-warning">{sinFacturar.length}</span>
              </button>
              <button
                onClick={() => { setTab('facturado'); setSelectedMonth('') }}
                className={`flex-1 py-3 text-sm font-medium transition ${tab === 'facturado' ? 'border-b-2 border-success text-success' : 'text-text-secondary'}`}
              >
                Facturados{' '}
                <span className="ml-1 rounded-full bg-success/10 px-1.5 text-xs text-success">{facturados.length}</span>
              </button>
            </div>

            {displayedTxs.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-muted">
                {tab === 'facturado' ? 'Sube una cartola para ver gastos facturados' : 'Todo reconciliado ✓'}
              </p>
            ) : (
              <>
                {/* Month navigator */}
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-surface-high/60">
                  <button
                    onClick={() => setSelectedMonth(months[monthIdx + 1] ?? months[months.length - 1])}
                    disabled={monthIdx >= months.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition hover:bg-accent/10 hover:text-accent disabled:opacity-20"
                  >
                    ‹
                  </button>

                  <div className="text-center">
                    <p className="text-sm font-bold text-text-primary">{monthLabel}</p>
                    <p className={`text-xs font-semibold tabular-nums ${monthTotal < 0 ? 'text-danger' : 'text-success'}`}>
                      {monthTotal < 0 ? '−' : '+'}{clpFormatted(Math.abs(monthTotal))}
                      <span className="ml-1.5 font-normal text-text-muted">· {monthTxs.length} mov.</span>
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedMonth(months[monthIdx - 1] ?? months[0])}
                    disabled={monthIdx <= 0}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition hover:bg-accent/10 hover:text-accent disabled:opacity-20"
                  >
                    ›
                  </button>
                </div>

                {/* Transactions for active month */}
                {monthTxs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-text-muted">Sin movimientos este mes</p>
                ) : (
                  <div className="divide-y divide-border">
                    {monthTxs.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary line-clamp-1">
                            {tx.description ?? tx.category}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-text-muted">
                              {new Date(tx.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                            </p>
                            {tx.is_installment && tx.installment_number != null && tx.installment_total != null && (
                              <span className="badge bg-accent/10 text-accent">{tx.installment_number}/{tx.installment_total}</span>
                            )}
                            {tx.is_from_cartola && (
                              <span className="badge bg-accent/10 text-accent">cartola</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-sm font-semibold tabular-nums ${tx.type === 'expense' ? 'text-danger' : 'text-success'}`}>
                            {tx.type === 'expense' ? '−' : '+'}{
                              tx.currency === 'USD'
                                ? usdFormatted(Number(tx.amount))
                                : clpFormatted(Number(tx.amount))
                            }
                          </span>
                          <span className={`rounded px-1.5 py-px text-[9px] font-bold tracking-wider ${
                            tx.currency === 'USD'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-text-muted/10 text-text-muted'
                          }`}>
                            {tx.currency ?? 'CLP'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Add Card Modal ───────────────────────────────────────────────── */}
      {showAddCard && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">Nueva tarjeta</h2>
              <button onClick={() => setShowAddCard(false)} className="text-text-muted text-xl leading-none">✕</button>
            </div>

            {/* Bank selection */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Banco</p>
              <div className="grid grid-cols-3 gap-2">
                {BANKS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setNewCardBank(b.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition ${
                      newCardBank === b.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-surface-2 text-text-secondary'
                    }`}
                  >
                    <span className="text-xl">{b.emoji}</span>
                    <span className="text-xs font-medium">{b.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Card fields */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Nombre *</label>
                <input
                  className="input w-full"
                  placeholder="ej: CMR Falabella"
                  value={newCardName}
                  onChange={e => setNewCardName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Últimos 4 dígitos</label>
                  <input
                    className="input w-full"
                    placeholder="1234"
                    maxLength={4}
                    inputMode="numeric"
                    value={newCardLast4}
                    onChange={e => setNewCardLast4(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Día de cierre</label>
                  <input
                    className="input w-full"
                    placeholder="ej: 14"
                    inputMode="numeric"
                    value={newCardClose}
                    onChange={e => setNewCardClose(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
            </div>

            {addCardErr && <p className="text-xs text-danger">{addCardErr}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAddCard(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={saveNewCard}
                disabled={!newCardName.trim() || addingCard}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {addingCard ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}


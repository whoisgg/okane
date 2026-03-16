'use client'

import { useEffect, useState, useCallback, useRef, MouseEvent } from 'react'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { CreditCard, BankAccount, Transaction, BankType } from '@/lib/types'

// ── Bank-branded card themes ──────────────────────────────────────────────────
type CardTheme = {
  gradient: string          // tailwind bg-gradient-to-br classes
  gloss: string             // top-overlay opacity
  ringColor: string         // decorative ring color (rgba)
  networkColor: string      // Visa/MC text color
}

const BANK_THEMES: Record<string, CardTheme> = {
  falabella: {
    gradient:     'from-[#006B3C] via-[#00874C] to-[#00A556]',
    gloss:        'from-white/15',
    ringColor:    'rgba(255,255,255,0.12)',
    networkColor: 'rgba(255,255,255,0.85)',
  },
  santander: {
    gradient:     'from-[#A00000] via-[#CC0000] to-[#E8000B]',
    gloss:        'from-white/15',
    ringColor:    'rgba(255,255,255,0.12)',
    networkColor: 'rgba(255,255,255,0.85)',
  },
  unknown: {
    gradient:     'from-[#1E1B4B] via-[#3730A3] to-[#4F46E5]',
    gloss:        'from-white/10',
    ringColor:    'rgba(255,255,255,0.10)',
    networkColor: 'rgba(255,255,255,0.75)',
  },
}
function cardTheme(bank?: string): CardTheme {
  return BANK_THEMES[(bank ?? 'unknown').toLowerCase()] ?? BANK_THEMES.unknown
}

// Detect card network from name string
function cardNetwork(name: string): 'visa' | 'mastercard' | null {
  const n = name.toLowerCase()
  if (n.includes('visa')) return 'visa'
  if (n.includes('mastercard') || n.includes('world elite') || n.includes('world') || n.includes('cmr')) return 'mastercard'
  return null
}

// Inline SVG network logos
function VisaLogo({ color = 'white' }: { color?: string }) {
  return (
    <svg viewBox="0 0 48 16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="14" fontFamily="Arial, Helvetica, sans-serif" fontStyle="italic"
        fontWeight="bold" fontSize="18" fill={color} letterSpacing="-0.5">VISA</text>
    </svg>
  )
}
function MastercardLogo() {
  return (
    <svg viewBox="0 0 38 24" height="24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="12" r="10" fill="#EB001B" opacity="0.9" />
      <circle cx="24" cy="12" r="10" fill="#F79E1B" opacity="0.9" />
      <path d="M19 4.8a10 10 0 010 14.4A10 10 0 0119 4.8z" fill="#FF5F00" opacity="0.9" />
    </svg>
  )
}

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
  const [view, setView]                 = useState<'tarjetas' | 'cuentas'>('tarjetas')
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

  const loadTxs = useCallback(async (id: string, type: 'card' | 'account') => {
    const sb = getClient()
    const query = sb
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .limit(100)
    const { data } = type === 'card'
      ? await query.eq('credit_card_id', id)
      : await query.eq('bank_account_id', id)
    setTransactions((data ?? []) as Transaction[])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const item = allItems[selectedCard]
    if (item) loadTxs(item.item.id, item.type)
  }, [allItems, selectedCard, loadTxs])

  const allItems = view === 'tarjetas'
    ? cards.map(c => ({ type: 'card' as const, item: c }))
    : accounts.map(a => ({ type: 'account' as const, item: a }))

  // Reset carousel position when switching views
  function switchView(v: 'tarjetas' | 'cuentas') {
    setView(v)
    setSelectedCard(0)
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }

  const current      = allItems[selectedCard]
  const facturados   = transactions.filter(t => t.is_from_cartola || t.match_status === 'matched')
  const sinFacturar  = transactions.filter(t => !t.is_from_cartola && t.match_status !== 'matched')
  const displayedTxs = current?.type === 'account'
    ? transactions                                        // accounts: show all
    : tab === 'facturado' ? facturados : sinFacturar      // cards: filtered by tab

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
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 pb-24 sm:pb-6">
        {/* Segmented tab + add button */}
        <div className="flex items-center justify-between">
          {/* Pill segmented control */}
          <div className="flex rounded-xl bg-surface-secondary p-1 gap-1">
            {(['tarjetas', 'cuentas'] as const).map(v => (
              <button
                key={v}
                onClick={() => switchView(v)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  view === v
                    ? 'bg-white text-text-primary shadow-sm dark:bg-surface'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {v === 'tarjetas' ? 'Tarjetas' : 'Cuentas'}
              </button>
            ))}
          </div>

          {/* Contextual add button */}
          <button onClick={openAddCard} className="btn-primary text-xs px-3 py-1.5">
            {view === 'tarjetas' ? '+ Tarjeta' : '+ Cuenta'}
          </button>
        </div>

        {/* Empty state */}
        {allItems.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-3xl mb-3">{view === 'tarjetas' ? '💳' : '🏦'}</p>
            <p className="text-sm font-medium text-text-secondary">
              {view === 'tarjetas' ? 'No hay tarjetas aún' : 'No hay cuentas aún'}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Toca "+ {view === 'tarjetas' ? 'Tarjeta' : 'Cuenta'}" para agregar
            </p>
          </div>
        )}

        {/* Card carousel — one card at a time with snap */}
        {allItems.length > 0 && <div className="relative -mx-6 px-6">
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
              const isCC       = type === 'card'
              const cc         = item as CreditCard
              const ba         = item as BankAccount
              const balanceCLP = Number(item.balance)
              const balanceUSD = isCC ? Number(cc.balance_usd ?? 0) : null
              const bank       = isCC ? (cc.bank ?? 'unknown') : 'unknown'
              const theme      = cardTheme(bank)
              const network    = isCC ? cardNetwork(cc.name) : null
              const bankLabel  = bank === 'falabella' ? 'Falabella' : bank === 'santander' ? 'Santander' : null

              return (
                <div
                  key={item.id}
                  className={`relative flex-shrink-0 snap-center rounded-2xl bg-gradient-to-br ${theme.gradient} text-white shadow-xl overflow-hidden`}
                  style={{ width: 'calc(100% - 24px)', minHeight: '11rem' }}
                >
                  {/* Top gloss */}
                  <div className={`absolute inset-0 bg-gradient-to-b ${theme.gloss} to-transparent pointer-events-none`} />

                  {/* Decorative rings — bottom-right watermark */}
                  <div className="absolute -bottom-8 -right-8 pointer-events-none">
                    {[64, 96, 128].map(size => (
                      <div key={size} className="absolute rounded-full border"
                        style={{
                          width: size, height: size,
                          borderColor: theme.ringColor,
                          bottom: 0, right: 0,
                          transform: `translate(${size * 0.3}px, ${size * 0.3}px)`,
                        }}
                      />
                    ))}
                  </div>

                  {/* Top row: bank name (left) + EMV chip (right) */}
                  <div className="flex items-start justify-between px-5 pt-5">
                    {bankLabel ? (
                      <span className="text-[11px] font-bold tracking-widest uppercase opacity-75 select-none">
                        {bankLabel}
                      </span>
                    ) : <span />}

                    {/* EMV chip */}
                    <div className="flex flex-col gap-[3px] opacity-50">
                      {[0,1,2].map(row => (
                        <div key={row} className="flex gap-[3px]">
                          {[0,1].map(col => (
                            <div key={col} className="h-[5px] w-[9px] rounded-[1.5px] bg-white/70" />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card name + number */}
                  <div className="px-5 pt-3">
                    <p className="text-[15px] font-semibold tracking-tight">{item.name}</p>
                    {isCC && cc.last_four && (
                      <p className="mt-1 font-mono text-[13px] tracking-[0.2em] opacity-60">
                        •••• •••• •••• {cc.last_four}
                      </p>
                    )}
                    {!isCC && ba.bank_name && (
                      <p className="mt-1 text-[13px] opacity-60">{ba.bank_name}</p>
                    )}
                  </div>

                  {/* Bottom row: balances (left) + network logo (right) */}
                  <div className="flex items-end justify-between px-5 pb-5 pt-4">
                    {/* CLP | USD */}
                    <div className="flex items-end gap-0">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-50 mb-0.5">
                          {isCC ? 'Deuda actual' : 'Saldo'}
                        </p>
                        <p className="text-[10px] font-bold opacity-60 mb-0.5 tracking-wider">CLP</p>
                        <p className="text-[22px] font-bold leading-none tracking-tight">
                          {clpFormatted(balanceCLP)}
                        </p>
                      </div>
                      {isCC && balanceUSD !== null && (
                        <>
                          <div className="mx-3.5 mb-1 w-px self-stretch bg-white/20" />
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-50 mb-0.5">&nbsp;</p>
                            <p className="text-[10px] font-bold opacity-60 mb-0.5 tracking-wider">USD</p>
                            <p className="text-[22px] font-bold leading-none tracking-tight">
                              {usdFormatted(balanceUSD)}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right column: closing day + network logo stacked */}
                    <div className="flex flex-col items-end gap-2">
                      {isCC && cc.closing_day && (
                        <div className="text-right">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-50 mb-0.5">Cierre</p>
                          <p className="text-[15px] font-semibold">día {cc.closing_day}</p>
                        </div>
                      )}
                      {network === 'visa' && <VisaLogo color={theme.networkColor} />}
                      {network === 'mastercard' && <MastercardLogo />}
                    </div>
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
        </div>}

        {/* Transaction section */}
        {current && (
          <div className="card overflow-hidden">
            {/* Credit card: facturado / sin-facturar tabs */}
            {current.type === 'card' && (
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
            )}

            {displayedTxs.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-muted">
                {current.type === 'account'
                  ? 'Sin movimientos registrados'
                  : tab === 'facturado' ? 'Sube una cartola para ver gastos facturados' : 'Todo reconciliado ✓'}
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


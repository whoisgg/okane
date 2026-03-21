'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { getClient } from '@/lib/supabase'
import type { CreditCard, BankAccount } from '@/lib/types'

const CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'comida',          label: 'Comida',        emoji: '🍽️' },
  { id: 'hogar',           label: 'Hogar',         emoji: '🏠' },
  { id: 'transporte',      label: 'Transporte',    emoji: '🚗' },
  { id: 'salud',           label: 'Salud',         emoji: '🏥' },
  { id: 'entretenimiento', label: 'Entretención',  emoji: '🎮' },
  { id: 'servicios',       label: 'Servicios',     emoji: '🚰' },
  { id: 'suscripciones',   label: 'Suscripciones', emoji: '📅' },
  { id: 'ropa',            label: 'Ropa',          emoji: '👕' },
  { id: 'viajes',          label: 'Viajes',        emoji: '✈️' },
  { id: 'educacion',       label: 'Educación',     emoji: '📚' },
  { id: 'tecnologia',      label: 'Tecnología',    emoji: '💻' },
  { id: 'otros',           label: 'Compras',       emoji: '🛍️' },
]

const LEFT_TABS  = [
  { href: '/inicio',  label: 'Inicio',  icon: HomeIcon },
  { href: '/saldos',  label: 'Saldos',  icon: CardIcon },
]
const RIGHT_TABS = [
  { href: '/dashboard', label: 'Flujo',  icon: ChartIcon },
  { href: '/config',    label: 'Config', icon: GearIcon },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <>
      <nav className="flex items-end border-t border-border bg-surface/95 backdrop-blur-md px-1 pb-safe">
        {LEFT_TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition ${active ? 'text-accent' : 'text-text-muted'}`}>
              <Icon active={active} />
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
            </Link>
          )
        })}

        <div className="flex flex-col items-center px-2" style={{ marginTop: '-20px' }}>
          <button
            onClick={() => setShowAdd(true)}
            className="relative flex h-[56px] w-[56px] items-center justify-center rounded-full shadow-lg transition active:scale-95"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)' }}
          >
            <div className="absolute inset-0 rounded-full opacity-40 blur-md"
                 style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }} />
            <svg className="relative h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
            </svg>
          </button>
          <span className="mt-1 text-[10px] font-medium text-text-muted">Nuevo</span>
        </div>

        {RIGHT_TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition ${active ? 'text-accent' : 'text-text-muted'}`}>
              <Icon active={active} />
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
            </Link>
          )
        })}
      </nav>

      {showAdd && <QuickAddModal onClose={() => setShowAdd(false)} />}
    </>
  )
}

function QuickAddModal({ onClose }: { onClose: () => void }) {
  const [type, setType]                     = useState<'expense' | 'income'>('expense')
  const [currency, setCurrency]             = useState<'CLP' | 'USD'>('CLP')
  const [amount, setAmount]                 = useState('')
  const [description, setDescription]       = useState('')
  const [date, setDate]                     = useState(new Date().toISOString().split('T')[0])
  const [category, setCategory]             = useState('otros')
  const [cardId, setCardId]                 = useState('')
  const [bankAccountId, setBankAccountId]   = useState('')
  const [isInstallment, setIsInstallment]   = useState(false)
  const [installmentTotal, setInstallmentTotal] = useState('')
  const [cards, setCards]                   = useState<CreditCard[]>([])
  const [bankAccounts, setBankAccounts]     = useState<BankAccount[]>([])
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')
  const [done, setDone]                     = useState(false)

  useEffect(() => {
    const sb = getClient()
    sb.from('credit_cards').select('*').order('created_at').then(({ data }) =>
      setCards((data ?? []) as CreditCard[])
    )
    sb.from('bank_accounts').select('*').eq('is_active', true).order('created_at').then(({ data }) =>
      setBankAccounts((data ?? []) as BankAccount[])
    )
  }, [])

  function handleAmountChange(v: string) {
    if (currency === 'USD') {
      setAmount(v.replace(/[^\d.]/g, '').replace(/(\.\d{0,2}).*/g, '$1'))
    } else {
      const raw = v.replace(/\D/g, '')
      setAmount(raw ? Number(raw).toLocaleString('es-CL') : '')
    }
  }

  function switchCurrency(cur: 'CLP' | 'USD') {
    setCurrency(cur)
    setAmount('')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!amount) return
    setSaving(true); setError('')
    const sb = getClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('No autenticado'); setSaving(false); return }

    const parsedAmount = currency === 'USD'
      ? parseFloat(amount)
      : parseInt(amount.replace(/\./g, ''), 10)

    if (!parsedAmount || parsedAmount <= 0) {
      setError('Monto inválido'); setSaving(false); return
    }

    const { error: err } = await sb.from('transactions').insert({
      user_id:           user.id,
      amount:            parsedAmount,
      currency,
      type,
      category,
      description:       description || null,
      date,
      credit_card_id:    bankAccountId ? null : (cardId || null),
      bank_account_id:   bankAccountId || null,
      is_installment:    isInstallment,
      installment_total: isInstallment ? parseInt(installmentTotal) || null : null,
      match_status:      'unmatched',
      is_from_cartola:   false,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setDone(true)
    setTimeout(onClose, 700)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-3xl bg-surface shadow-2xl overflow-y-auto max-h-[92dvh]">
        <div className="px-5 pt-5 pb-10 space-y-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">Nuevo movimiento</h2>
            <button onClick={onClose} className="text-text-muted text-xl leading-none p-1">✕</button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-3xl">✓</div>
              <p className="text-sm font-semibold text-success">Guardado</p>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-3">
              <div className="flex gap-2 rounded-xl bg-surface-high p-1">
                {(['expense', 'income'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                      type === t
                        ? t === 'expense' ? 'bg-danger text-white shadow' : 'bg-success text-white shadow'
                        : 'text-text-muted'
                    }`}>
                    {t === 'expense' ? '↓ Gasto' : '↑ Ingreso'}
                  </button>
                ))}
              </div>

              <div className="flex gap-1 rounded-lg bg-surface-high p-1">
                {(['CLP', 'USD'] as const).map(cur => (
                  <button key={cur} type="button" onClick={() => switchCurrency(cur)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                      currency === cur
                        ? cur === 'USD' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-accent text-white shadow-sm'
                        : 'text-text-muted'
                    }`}>
                    {cur}
                  </button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-text-muted pointer-events-none">
                  {currency === 'USD' ? 'US$' : '$'}
                </span>
                <input
                  className="input w-full pl-12 text-2xl font-bold py-4"
                  placeholder={currency === 'USD' ? '0.00' : '0'}
                  inputMode={currency === 'USD' ? 'decimal' : 'numeric'}
                  value={amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <input className="input w-full" placeholder="Descripción (opcional)"
                value={description} onChange={e => setDescription(e.target.value)} />

              <input className="input w-full" type="date" value={date}
                onChange={e => setDate(e.target.value)} required />

              <select className="input w-full" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>

              {(cards.length > 0 || bankAccounts.length > 0) && (
                <select className="input w-full"
                  value={bankAccountId ? `ba:${bankAccountId}` : cardId ? `cc:${cardId}` : ''}
                  onChange={e => {
                    const v = e.target.value
                    if (!v) { setCardId(''); setBankAccountId('') }
                    else if (v.startsWith('cc:')) { setCardId(v.slice(3)); setBankAccountId('') }
                    else if (v.startsWith('ba:')) { setBankAccountId(v.slice(3)); setCardId('') }
                  }}>
                  <option value="">Sin medio de pago</option>
                  {cards.length > 0 && (
                    <optgroup label="Tarjetas">
                      {cards.map(c => <option key={c.id} value={`cc:${c.id}`}>{c.name}</option>)}
                    </optgroup>
                  )}
                  {bankAccounts.length > 0 && (
                    <optgroup label="Cuentas">
                      {bankAccounts.map(b => <option key={b.id} value={`ba:${b.id}`}>{b.name}</option>)}
                    </optgroup>
                  )}
                </select>
              )}

              {type === 'expense' && (
                <label className="flex items-center gap-2.5 text-sm select-none cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded accent-accent"
                    checked={isInstallment} onChange={e => setIsInstallment(e.target.checked)} />
                  <span className="text-text-secondary">Es en cuotas</span>
                </label>
              )}
              {isInstallment && (
                <input className="input w-full" placeholder="Total de cuotas (ej: 12)"
                  inputMode="numeric"
                  value={installmentTotal}
                  onChange={e => setInstallmentTotal(e.target.value.replace(/\D/g, ''))} />
              )}

              {error && <p className="text-xs text-danger">{error}</p>}

              <button type="submit" disabled={saving || !amount}
                className="btn-primary w-full py-3.5 text-base font-semibold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 12L12 3l9 9" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 21V12h6v9M3 12v9h18v-9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function CardIcon({ active }: { active?: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <rect x="2" y="5" width="20" height="14" rx="3" strokeLinejoin="round"/>
      <path d="M2 10h20" strokeLinecap="round"/>
    </svg>
  )
}
function ChartIcon({ active }: { active?: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 16V10M12 16V6M17 16v-4" strokeLinecap="round"/>
    </svg>
  )
}
function GearIcon({ active }: { active?: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

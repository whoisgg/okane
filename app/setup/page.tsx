'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getClient } from '@/lib/supabase'
import type { BankType } from '@/lib/types'

const STEPS = ['Presupuesto', 'Tarjetas', 'Cuentas']

// ── Bank options ──────────────────────────────────────────────────────────────
const BANKS: { id: BankType; label: string; color: string }[] = [
  { id: 'falabella',  label: 'Falabella',  color: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { id: 'santander',  label: 'Santander',  color: 'border-red-500 bg-red-50 text-red-700' },
  { id: 'scotiabank', label: 'Scotiabank', color: 'border-gray-400 bg-gray-50 text-gray-700' },
  { id: 'unknown',    label: 'Otro',       color: 'border-accent bg-accent/5 text-accent' },
]

interface CardDraft   { bank: BankType; name: string; last_four: string; closing_day: string }
interface AccountDraft { bank_name: string; name: string; balance: string }

function clpInput(val: string) {
  return val.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function clpParse(val: string) {
  return parseInt(val.replace(/\./g, '') || '0', 10)
}

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep]     = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Guard: redirect to login if not authenticated
  useEffect(() => {
    const sb = getClient()
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
    })
  }, [router])

  // Step 1 — budget
  const [budget, setBudget] = useState('')

  // Step 2 — cards
  const [cards, setCards]           = useState<CardDraft[]>([])
  const [addingCard, setAddingCard] = useState(false)
  const [cardDraft, setCardDraft]   = useState<CardDraft>({ bank: 'unknown', name: '', last_four: '', closing_day: '' })

  // Step 3 — accounts
  const [accounts, setAccounts]         = useState<AccountDraft[]>([])
  const [addingAcc, setAddingAcc]       = useState(false)
  const [accDraft, setAccDraft]         = useState<AccountDraft>({ bank_name: '', name: '', balance: '' })

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function saveCard() {
    if (!cardDraft.name.trim()) return
    setCards(prev => [...prev, cardDraft])
    setCardDraft({ bank: 'unknown', name: '', last_four: '', closing_day: '' })
    setAddingCard(false)
  }

  function saveAcc() {
    if (!accDraft.name.trim()) return
    setAccounts(prev => [...prev, accDraft])
    setAccDraft({ bank_name: '', name: '', balance: '' })
    setAddingAcc(false)
  }

  // ── Final submit ─────────────────────────────────────────────────────────────
  async function finish() {
    setSaving(true)
    setError(null)
    try {
      const sb = getClient()

      // Get current user
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // Upsert settings
      const { error: sErr } = await (sb.from('settings') as any).upsert(
        { user_id: user.id, monthly_budget: clpParse(budget) },
        { onConflict: 'user_id' }
      )
      if (sErr) throw sErr

      // Insert cards
      for (const c of cards) {
        const { error: cErr } = await (sb.from('credit_cards') as any).insert({
          user_id:     user.id,
          name:        c.name.trim(),
          last_four:   c.last_four.trim() || null,
          closing_day: c.closing_day ? parseInt(c.closing_day) : null,
          balance:     0,
          balance_usd: 0,
          bank:        c.bank,
        })
        if (cErr) throw cErr
      }

      // Insert accounts
      for (const a of accounts) {
        const { error: aErr } = await (sb.from('bank_accounts') as any).insert({
          user_id:   user.id,
          name:      a.name.trim(),
          bank_name: a.bank_name.trim() || null,
          balance:   clpParse(a.balance),
          currency:  'CLP',
        })
        if (aErr) throw aErr
      }

      router.push('/inicio')
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar')
      setSaving(false)
    }
  }

  // ── Layout ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 pt-12 pb-24">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <span className="text-3xl font-bold text-accent">お</span>
        <span className="text-2xl font-bold text-text-primary">Okane</span>
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              i < step  ? 'bg-accent text-white' :
              i === step ? 'bg-accent text-white ring-4 ring-accent/20' :
                           'bg-surface-high text-text-muted'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-accent' : 'text-text-muted'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`h-px w-6 ${i < step ? 'bg-accent' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-md">

        {/* ── Step 1: Budget ───────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="card p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Bienvenido a Okane</h1>
              <p className="mt-1 text-sm text-text-secondary">Empecemos configurando tu presupuesto mensual.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                Ingreso mensual estimado
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary font-semibold">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={budget}
                  onChange={e => setBudget(clpInput(e.target.value))}
                  placeholder="0"
                  className="input pl-7 text-xl font-bold w-full"
                />
              </div>
              <p className="mt-1.5 text-xs text-text-muted">
                Este valor se usa para calcular tu disponible estimado cada mes.
              </p>
            </div>

            <button
              onClick={() => setStep(1)}
              disabled={!clpParse(budget)}
              className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}

        {/* ── Step 2: Cards ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="card p-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold text-text-primary">Tarjetas de crédito</h1>
              <p className="mt-1 text-sm text-text-secondary">Agrega tus tarjetas para hacer seguimiento de deudas y cuotas.</p>
            </div>

            {/* Added cards list */}
            {cards.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-surface-high px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{c.name}</p>
                  <p className="text-xs text-text-muted capitalize">{c.bank} {c.last_four ? `· •••• ${c.last_four}` : ''} {c.closing_day ? `· cierra día ${c.closing_day}` : ''}</p>
                </div>
                <button onClick={() => setCards(prev => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-danger text-lg">✕</button>
              </div>
            ))}

            {/* Add card form */}
            {addingCard ? (
              <div className="rounded-xl border border-border p-4 space-y-3">
                {/* Bank picker */}
                <div className="grid grid-cols-3 gap-2">
                  {BANKS.map(b => (
                    <button
                      key={b.id}
                      onClick={() => setCardDraft(d => ({ ...d, bank: b.id }))}
                      className={`rounded-lg border-2 py-2 text-xs font-bold transition-all ${
                        cardDraft.bank === b.id ? b.color : 'border-border text-text-muted'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <input
                  className="input w-full"
                  placeholder="Nombre (ej. CMR Falabella)"
                  value={cardDraft.name}
                  onChange={e => setCardDraft(d => ({ ...d, name: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="Últimos 4 dígitos"
                    maxLength={4}
                    value={cardDraft.last_four}
                    onChange={e => setCardDraft(d => ({ ...d, last_four: e.target.value.replace(/\D/g, '') }))}
                  />
                  <input
                    className="input"
                    placeholder="Día de cierre"
                    inputMode="numeric"
                    maxLength={2}
                    value={cardDraft.closing_day}
                    onChange={e => setCardDraft(d => ({ ...d, closing_day: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingCard(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={saveCard} disabled={!cardDraft.name.trim()} className="btn-primary flex-1 disabled:opacity-40">Agregar</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingCard(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-3 text-sm font-medium text-text-muted hover:border-accent hover:text-accent transition-colors"
              >
                + Agregar tarjeta
              </button>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setStep(0)} className="btn-secondary px-4">← Atrás</button>
              <button onClick={() => setStep(2)} className="btn-primary flex-1 py-2.5">
                {cards.length > 0 ? 'Siguiente →' : 'Omitir →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Accounts ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="card p-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold text-text-primary">Cuentas bancarias</h1>
              <p className="mt-1 text-sm text-text-secondary">Agrega tus cuentas corrientes o de ahorro.</p>
            </div>

            {/* Added accounts list */}
            {accounts.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-surface-high px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{a.name}</p>
                  <p className="text-xs text-text-muted">{a.bank_name || 'Sin banco'} {a.balance ? `· $${a.balance}` : ''}</p>
                </div>
                <button onClick={() => setAccounts(prev => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-danger text-lg">✕</button>
              </div>
            ))}

            {/* Add account form */}
            {addingAcc ? (
              <div className="rounded-xl border border-border p-4 space-y-3">
                {/* Bank quick-select */}
                <div className="flex gap-2">
                  {['Santander', 'Falabella', 'BCI', 'Banco Chile', 'Scotiabank'].map(b => (
                    <button
                      key={b}
                      onClick={() => setAccDraft(d => ({ ...d, bank_name: b }))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                        accDraft.bank_name === b
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-text-muted hover:border-accent/50'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <input
                  className="input w-full"
                  placeholder="Banco (si no está arriba)"
                  value={accDraft.bank_name}
                  onChange={e => setAccDraft(d => ({ ...d, bank_name: e.target.value }))}
                />
                <input
                  className="input w-full"
                  placeholder="Nombre (ej. Cuenta Corriente)"
                  value={accDraft.name}
                  onChange={e => setAccDraft(d => ({ ...d, name: e.target.value }))}
                />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary font-semibold text-sm">$</span>
                  <input
                    className="input pl-7 w-full"
                    placeholder="Saldo actual (opcional)"
                    inputMode="numeric"
                    value={accDraft.balance}
                    onChange={e => setAccDraft(d => ({ ...d, balance: clpInput(e.target.value) }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAddingAcc(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={saveAcc} disabled={!accDraft.name.trim()} className="btn-primary flex-1 disabled:opacity-40">Agregar</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingAcc(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-3 text-sm font-medium text-text-muted hover:border-accent hover:text-accent transition-colors"
              >
                + Agregar cuenta
              </button>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setStep(1)} className="btn-secondary px-4">← Atrás</button>
              <button
                onClick={finish}
                disabled={saving}
                className="btn-primary flex-1 py-2.5 disabled:opacity-60"
              >
                {saving ? 'Guardando…' : accounts.length > 0 ? '¡Listo! →' : 'Omitir y entrar →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

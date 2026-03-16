'use client'

import { useEffect, useState } from 'react'
import { getClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import type { CreditCard, BankAccount } from '@/lib/types'
import { clpFormatted } from '@/lib/utils'
import Link from 'next/link'

export default function ConfigPage() {
  const router = useRouter()
  const [cards, setCards]     = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const sb = getClient()
    Promise.all([
      sb.auth.getUser(),
      sb.from('credit_cards').select('*').order('created_at'),
      sb.from('bank_accounts').select('*').order('created_at'),
    ]).then(([{ data: { user } }, cardsRes, accsRes]) => {
      setEmail(user?.email ?? '')
      setCards((cardsRes.data ?? []) as CreditCard[])
      setAccounts((accsRes.data ?? []) as BankAccount[])
      setLoading(false)
    })
  }, [])

  async function signOut() {
    setSigningOut(true)
    await getClient().auth.signOut()
    router.push('/login')
  }

  const BANK_LABEL: Record<string, string> = { falabella: '🏬 Falabella', santander: '🏦 Santander', unknown: '💳 Otro' }

  if (loading) return (
    <AppShell>
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6 pb-24 sm:pb-6">
        <h1 className="text-xl font-bold text-text-primary">Configuración</h1>

        {/* Account */}
        <section className="card divide-y divide-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
              {email[0]?.toUpperCase() ?? 'G'}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{email}</p>
              <p className="text-xs text-text-muted">Cuenta activa</p>
            </div>
          </div>
        </section>

        {/* Credit cards */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Tarjetas de crédito</p>
            <Link href="/saldos" className="text-xs text-accent">+ Agregar</Link>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {cards.length === 0 ? (
              <p className="px-4 py-5 text-sm text-text-muted">Sin tarjetas registradas</p>
            ) : cards.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.last_four && <span className="font-mono text-xs text-text-muted">•••• {c.last_four}</span>}
                    <span className="text-[10px] text-text-muted">{BANK_LABEL[c.bank ?? 'unknown']}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-danger">{clpFormatted(Number(c.balance))}</p>
                  {c.closing_day && <p className="text-[10px] text-text-muted">Cierre día {c.closing_day}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bank accounts */}
        <section>
          <div className="mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Cuentas bancarias</p>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {accounts.length === 0 ? (
              <p className="px-4 py-5 text-sm text-text-muted">Sin cuentas registradas</p>
            ) : accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{a.name}</p>
                  {a.bank_name && <p className="text-xs text-text-muted">{a.bank_name}</p>}
                </div>
                <p className="text-sm font-semibold text-success">{clpFormatted(Number(a.balance))}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick nav */}
        <section className="card divide-y divide-border overflow-hidden">
          <Link href="/cartolas" className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-high transition">
            <span className="text-sm text-text-primary">📄 Subir cartola PDF</span>
            <span className="text-text-muted">›</span>
          </Link>
          <Link href="/dashboard" className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-high transition">
            <span className="text-sm text-text-primary">📊 Flujo de caja</span>
            <span className="text-text-muted">›</span>
          </Link>
        </section>

        {/* Sign out */}
        <section className="card overflow-hidden">
          <button
            onClick={signOut}
            disabled={signingOut}
            className="w-full px-4 py-3.5 text-sm font-semibold text-danger hover:bg-danger/5 transition text-left"
          >
            {signingOut ? 'Cerrando sesión...' : '↩ Cerrar sesión'}
          </button>
        </section>

        <p className="text-center text-[10px] text-text-muted">Okane v1.0 · お金</p>
      </div>
    </AppShell>
  )
}

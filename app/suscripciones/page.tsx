'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { Subscription } from '@/lib/types'

function clpInput(v: string) {
  return v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const CATEGORIES = ['Streaming', 'Música', 'Software', 'Salud', 'Educación', 'Noticias', 'Otro']
const EMPTY = { name: '', amount: '', day: '', category: 'Otro' }

export default function SuscripcionesPage() {
  const [subs, setSubs]       = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [form, setForm]       = useState(EMPTY)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getClient().from('subscriptions').select('*').order('created_at')
    setSubs((data ?? []) as Subscription[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.name.trim() || !form.amount) return
    setSaving(true); setError(null)
    const { error: err } = await getClient().from('subscriptions').insert({
      name:        form.name.trim(),
      amount:      parseInt(form.amount.replace(/\./g, ''), 10),
      billing_day: form.day ? parseInt(form.day) : 1,
      currency:    'CLP',
      category:    form.category.toLowerCase(),
      is_active:   true,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setForm(EMPTY); setShowForm(false); setSaving(false)
    load()
  }

  async function remove(id: string) {
    setDeleting(id)
    await getClient().from('subscriptions').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  async function toggle(sub: Subscription) {
    setToggling(sub.id)
    await getClient().from('subscriptions').update({ is_active: !sub.is_active }).eq('id', sub.id)
    setToggling(null)
    load()
  }

  const active   = subs.filter(s => s.is_active)
  const inactive = subs.filter(s => !s.is_active)
  const total    = active.reduce((s, sub) => s + Number(sub.amount), 0)

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
            <h1 className="text-xl font-bold text-text-primary">Suscripciones</h1>
          </div>
          <button onClick={() => { setShowForm(true); setError(null) }} className="btn-primary text-xs px-3 py-1.5">
            + Nueva
          </button>
        </div>

        {/* Summary */}
        {active.length > 0 && (
          <div className="card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-muted">Total mensual activo</p>
              <p className="text-lg font-bold text-text-primary mt-0.5">{clpFormatted(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">{active.length} activa{active.length !== 1 ? 's' : ''}</p>
              {inactive.length > 0 && <p className="text-xs text-text-muted">{inactive.length} pausada{inactive.length !== 1 ? 's' : ''}</p>}
            </div>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-text-primary">Nueva suscripción</h2>
            <input className="input w-full" placeholder="Nombre (ej. Netflix, Spotify, iCloud)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />

            {/* Category pills */}
            <div>
              <label className="block text-xs text-text-muted mb-2">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(p => ({ ...p, category: c }))}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all border ${
                      form.category === c
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-muted hover:border-accent/50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Monto mensual *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">$</span>
                  <input className="input pl-6 w-full" placeholder="0" inputMode="numeric"
                    value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: clpInput(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Día de cobro</label>
                <input className="input w-full" placeholder="1" inputMode="numeric" maxLength={2}
                  value={form.day}
                  onChange={e => setForm(p => ({ ...p, day: e.target.value.replace(/\D/g, '') }))} />
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setForm(EMPTY) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.amount} className="btn-primary flex-1 disabled:opacity-40">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : subs.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-3xl mb-3">↻</p>
            <p className="text-sm font-medium text-text-secondary">Sin suscripciones</p>
            <p className="mt-1 text-xs text-text-muted">Agrega tus servicios recurrentes</p>
          </div>
        ) : (
          <>
            {/* Active */}
            {active.length > 0 && (
              <div className="card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Activas</p>
                </div>
                <div className="divide-y divide-border">
                  {active.map(sub => (
                    <SubRow key={sub.id} sub={sub} onDelete={() => remove(sub.id)} onToggle={() => toggle(sub)}
                      deleting={deleting === sub.id} toggling={toggling === sub.id} />
                  ))}
                </div>
              </div>
            )}

            {/* Paused */}
            {inactive.length > 0 && (
              <div className="card overflow-hidden opacity-60">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Pausadas</p>
                </div>
                <div className="divide-y divide-border">
                  {inactive.map(sub => (
                    <SubRow key={sub.id} sub={sub} onDelete={() => remove(sub.id)} onToggle={() => toggle(sub)}
                      deleting={deleting === sub.id} toggling={toggling === sub.id} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </AppShell>
  )
}

function SubRow({ sub, onDelete, onToggle, deleting, toggling }: {
  sub: Subscription
  onDelete: () => void
  onToggle: () => void
  deleting: boolean
  toggling: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Toggle active/paused */}
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`h-5 w-9 rounded-full transition-colors ${sub.is_active ? 'bg-accent' : 'bg-border'}`}
        >
          <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5 ${sub.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <div>
          <p className="text-sm font-medium text-text-primary">{sub.name}</p>
          <p className="text-xs text-text-muted capitalize">{sub.category} · día {sub.billing_day}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-text-primary">{clpFormatted(Number(sub.amount))}</span>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-danger/10 hover:text-danger transition disabled:opacity-40"
        >
          {deleting ? '…' : '✕'}
        </button>
      </div>
    </div>
  )
}

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
function usdInput(v: string) {
  const cleaned = v.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length > 2) return parts[0] + '.' + parts[1]
  if (parts[1]?.length > 2) return parts[0] + '.' + parts[1].slice(0, 2)
  return cleaned
}

// Monthly equivalent cost (annual subs divided by 12)
function monthlyAmount(sub: Subscription): number {
  return sub.billing_period === 'annual' ? Number(sub.amount) / 12 : Number(sub.amount)
}

const CATEGORIES = ['Streaming', 'Música', 'Software', 'Salud', 'Educación', 'Noticias', 'Otro']
const thisMonth = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` }
const EMPTY = { name: '', amount: '', day: '', category: 'Otro', currency: 'CLP' as 'CLP' | 'USD', billing_period: 'monthly' as 'monthly' | 'annual', start_date: thisMonth() }

export default function SuscripcionesPage() {
  const [subs, setSubs]         = useState<Subscription[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]         = useState(EMPTY)
  const [editForm, setEditForm] = useState(EMPTY)
  const [error, setError]       = useState<string | null>(null)

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
    const sb = getClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setError('No autenticado'); setSaving(false); return }
    const { error: err } = await (sb.from('subscriptions') as any).insert({
      user_id:        user.id,
      name:           form.name.trim(),
      amount:         form.currency === 'USD' ? parseFloat(form.amount) || 0 : parseInt(form.amount.replace(/\./g, ''), 10),
      billing_day:    form.day ? parseInt(form.day) : 1,
      currency:       form.currency,
      billing_period: form.billing_period,
      category:       form.category.toLowerCase(),
      is_active:      true,
      start_date:     form.start_date ? form.start_date + '-01' : null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setForm(EMPTY); setShowForm(false); setSaving(false)
    load()
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim() || !editForm.amount) return
    setSaving(true); setError(null)
    const { error: err } = await (getClient().from('subscriptions') as any).update({
      name:           editForm.name.trim(),
      amount:         editForm.currency === 'USD' ? parseFloat(editForm.amount) || 0 : parseInt(editForm.amount.replace(/\./g, ''), 10),
      billing_day:    editForm.day ? parseInt(editForm.day) : 1,
      currency:       editForm.currency,
      billing_period: editForm.billing_period,
      category:       editForm.category.toLowerCase(),
      start_date:     editForm.start_date ? editForm.start_date + '-01' : null,
    }).eq('id', id)
    if (err) { setError(err.message); setSaving(false); return }
    setEditingId(null); setSaving(false)
    load()
  }

  function startEdit(sub: Subscription) {
    setEditForm({
      name:           sub.name,
      amount:         sub.currency === 'USD'
        ? String(Number(sub.amount))
        : clpInput(String(Math.round(Number(sub.amount)))),
      day:            String(sub.billing_day ?? ''),
      category:       CATEGORIES.find(c => c.toLowerCase() === sub.category) ?? 'Otro',
      currency:       (sub.currency ?? 'CLP') as 'CLP' | 'USD',
      billing_period: sub.billing_period ?? 'monthly',
      start_date:     sub.start_date ? sub.start_date.slice(0, 7) : thisMonth(),
    })
    setEditingId(sub.id)
  }

  async function remove(id: string) {
    setDeleting(id)
    await getClient().from('subscriptions').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  async function toggle(sub: Subscription) {
    setToggling(sub.id)
    await (getClient().from('subscriptions') as any).update({ is_active: !sub.is_active }).eq('id', sub.id)
    setToggling(null)
    load()
  }

  const active   = subs.filter(s => s.is_active)
  const inactive = subs.filter(s => !s.is_active)
  const totalMonthly = active.reduce((s, sub) => s + monthlyAmount(sub), 0)

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
              <p className="text-lg font-bold text-text-primary mt-0.5">{clpFormatted(Math.round(totalMonthly))}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">{active.length} activa{active.length !== 1 ? 's' : ''}</p>
              {inactive.length > 0 && <p className="text-xs text-text-muted">{inactive.length} pausada{inactive.length !== 1 ? 's' : ''}</p>}
            </div>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <SubForm
            form={form}
            setForm={setForm}
            onSave={save}
            onCancel={() => { setShowForm(false); setForm(EMPTY) }}
            saving={saving}
            error={error}
            title="Nueva suscripción"
          />
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
            {active.length > 0 && (
              <div className="card overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Activas</p>
                </div>
                <div className="divide-y divide-border">
                  {active.map(sub => (
                    editingId === sub.id ? (
                      <div key={sub.id} className="p-4">
                        <SubForm
                          form={editForm}
                          setForm={setEditForm}
                          onSave={() => saveEdit(sub.id)}
                          onCancel={() => setEditingId(null)}
                          saving={saving}
                          error={error}
                          title="Editar suscripción"
                          compact
                        />
                      </div>
                    ) : (
                      <SubRow key={sub.id} sub={sub}
                        onDelete={() => remove(sub.id)}
                        onToggle={() => toggle(sub)}
                        onEdit={() => startEdit(sub)}
                        deleting={deleting === sub.id}
                        toggling={toggling === sub.id}
                      />
                    )
                  ))}
                </div>
              </div>
            )}

            {inactive.length > 0 && (
              <div className="card overflow-hidden opacity-60">
                <div className="border-b border-border px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Pausadas</p>
                </div>
                <div className="divide-y divide-border">
                  {inactive.map(sub => (
                    editingId === sub.id ? (
                      <div key={sub.id} className="p-4">
                        <SubForm
                          form={editForm}
                          setForm={setEditForm}
                          onSave={() => saveEdit(sub.id)}
                          onCancel={() => setEditingId(null)}
                          saving={saving}
                          error={error}
                          title="Editar suscripción"
                          compact
                        />
                      </div>
                    ) : (
                      <SubRow key={sub.id} sub={sub}
                        onDelete={() => remove(sub.id)}
                        onToggle={() => toggle(sub)}
                        onEdit={() => startEdit(sub)}
                        deleting={deleting === sub.id}
                        toggling={toggling === sub.id}
                      />
                    )
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

// ── Shared form component ─────────────────────────────────────────────────────
type FormState = { name: string; amount: string; day: string; category: string; currency: 'CLP' | 'USD'; billing_period: 'monthly' | 'annual'; start_date: string }

function SubForm({ form, setForm, onSave, onCancel, saving, error, title, compact }: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string | null
  title: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'space-y-3' : 'card p-5 space-y-4'}>
      {!compact && <h2 className="font-semibold text-text-primary">{title}</h2>}
      <input className="input w-full" placeholder="Nombre (ej. Netflix, Spotify, iCloud)"
        value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />

      {/* Category pills */}
      {!compact && (
        <div>
          <label className="block text-xs text-text-muted mb-2">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, category: c }))}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all border ${
                  form.category === c ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-muted hover:border-accent/50'
                }`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Currency + Billing period */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Moneda</label>
          <div className="flex gap-1 rounded-lg bg-surface-high p-1">
            {(['CLP', 'USD'] as const).map(cur => (
              <button key={cur} type="button" onClick={() => setForm(p => ({ ...p, currency: cur }))}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                  form.currency === cur
                    ? cur === 'USD' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}>
                {cur}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Frecuencia</label>
          <div className="flex gap-1 rounded-lg bg-surface-high p-1">
            {([['monthly', 'Mensual'], ['annual', 'Anual']] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setForm(p => ({ ...p, billing_period: val }))}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                  form.billing_period === val ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-primary'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Amount + Day */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">
            Monto {form.billing_period === 'annual' ? 'anual' : 'mensual'} *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">
              {form.currency === 'USD' ? 'US$' : '$'}
            </span>
            <input className="input pl-8 w-full" placeholder="0"
              inputMode={form.currency === 'USD' ? 'decimal' : 'numeric'}
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: form.currency === 'USD' ? usdInput(e.target.value) : clpInput(e.target.value) }))} />
          </div>
          {form.billing_period === 'annual' && form.amount && (
            <p className="text-[10px] text-text-muted mt-1">
              ≈ {form.currency === 'USD'
                ? `US$ ${(parseFloat(form.amount || '0') / 12).toFixed(2)}/mes`
                : `${clpFormatted(Math.round(parseInt(form.amount.replace(/\./g, '') || '0') / 12))}/mes`}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Día de cobro</label>
          <input className="input w-full" placeholder="1" inputMode="numeric" maxLength={2}
            value={form.day}
            onChange={e => setForm(p => ({ ...p, day: e.target.value.replace(/\D/g, '') }))} />
        </div>
      </div>

      {/* Start date */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-text-secondary whitespace-nowrap">Desde</label>
        <input type="month" className="input flex-1 text-sm"
          value={form.start_date}
          onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button onClick={onSave} disabled={saving || !form.name || !form.amount} className="btn-primary flex-1 disabled:opacity-40">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Subscription row ──────────────────────────────────────────────────────────
function SubRow({ sub, onDelete, onToggle, onEdit, deleting, toggling }: {
  sub: Subscription
  onDelete: () => void
  onToggle: () => void
  onEdit: () => void
  deleting: boolean
  toggling: boolean
}) {
  const isAnnual = sub.billing_period === 'annual'
  const isUSD = sub.currency === 'USD'
  const monthly = monthlyAmount(sub)

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <button onClick={onToggle} disabled={toggling}
          className={`h-5 w-9 rounded-full transition-colors ${sub.is_active ? 'bg-accent' : 'bg-border'}`}>
          <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5 ${sub.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <div>
          <p className="text-sm font-medium text-text-primary">{sub.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isUSD && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">USD</span>}
            {isAnnual && <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">Anual</span>}
            <p className="text-xs text-text-muted capitalize">{sub.category} · día {sub.billing_day}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-semibold text-text-primary">
            {isUSD
              ? `US$ ${Number(sub.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : clpFormatted(Number(sub.amount))}
            {isAnnual && <span className="text-xs text-text-muted font-normal">/año</span>}
          </p>
          {isAnnual && (
            <p className="text-[10px] text-text-muted">
              ≈ {isUSD
                ? `US$ ${monthly.toFixed(2)}/mes`
                : `${clpFormatted(Math.round(monthly))}/mes`}
            </p>
          )}
        </div>
        <button onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-accent/10 hover:text-accent transition">
          ✎
        </button>
        <button onClick={onDelete} disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-danger/10 hover:text-danger transition disabled:opacity-40">
          {deleting ? '…' : '✕'}
        </button>
      </div>
    </div>
  )
}

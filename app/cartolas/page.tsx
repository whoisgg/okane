'use client'

import { useCallback, useEffect, useState } from 'react'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted, categorizeTransaction } from '@/lib/utils'
import type { CartolaParseResult, CartolaTransaction, CreditCard, BankType } from '@/lib/types'

// ── Supported banks ────────────────────────────────────────────────────────────
const BANKS: { id: BankType; label: string; color: string; icon: string; description: string }[] = [
  {
    id: 'falabella',
    label: 'Falabella',
    color: 'from-[#D62B1E] to-[#A01E15]',
    icon: '🏬',
    description: 'Tarjetas CMR, Visa CMR, etc.',
  },
  {
    id: 'santander',
    label: 'Santander',
    color: 'from-[#E31837] to-[#A00F27]',
    icon: '🏦',
    description: 'Visa, Mastercard, LATAM Pass',
  },
]

type Step = 'select-bank' | 'upload' | 'preview' | 'matching' | 'done'

interface UploadHistory {
  id: string
  status: string
  period_start: string | null
  period_end: string | null
  total_amount: number
  transaction_count: number
  matched_count: number
  created_at: string
  credit_card_id: string
  card_name?: string
  bank_name?: string
}

interface MatchPair {
  id: string
  manual: any
  cartola: CartolaTransaction
  confidence: 'high' | 'medium'
}

export default function CartolasPage() {
  const [step, setStep]                     = useState<Step>('select-bank')
  const [selectedBank, setSelectedBank]     = useState<BankType | null>(null)
  const [parsed, setParsed]                 = useState<CartolaParseResult | null>(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const [cards, setCards]                   = useState<CreditCard[]>([])
  const [selectedCard, setSelectedCard]     = useState('')
  const [dragOver, setDragOver]             = useState(false)
  const [matchedPairs, setMatchedPairs]     = useState<MatchPair[]>([])
  const [cartolaOnly, setCartolaOnly]       = useState<CartolaTransaction[]>([])
  const [manualOnly, setManualOnly]         = useState<any[]>([])
  const [confirmedPairs, setConfirmedPairs] = useState<Set<string>>(new Set())
  const [uploadId, setUploadId]             = useState<string | null>(null)
  const [dupWarning, setDupWarning]         = useState<{ periodStart: string; periodEnd: string; uploadedAt: string } | null>(null)
  const [history, setHistory]               = useState<UploadHistory[]>([])
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [subMatchedIds, setSubMatchedIds]   = useState<Set<string>>(new Set())

  async function loadCards() {
    const sb = getClient()
    const { data } = await sb.from('credit_cards').select('*').order('created_at')
    setCards((data ?? []) as CreditCard[])
  }

  async function loadHistory() {
    const sb = getClient()
    const { data } = await sb
      .from('cartola_uploads')
      .select('id,status,period_start,period_end,total_amount,transaction_count,matched_count,created_at,credit_card_id,bank_name')
      .order('created_at', { ascending: false })
      .limit(20)
    if (!data) return
    // Attach card names
    const cardsMap: Record<string, string> = {}
    cards.forEach(c => { cardsMap[c.id] = c.name })
    setHistory(data.map(u => ({ ...u, card_name: cardsMap[u.credit_card_id] })))
  }

  async function deleteUpload(uploadId: string) {
    setDeletingId(uploadId)
    const sb = getClient()
    // Delete imported transactions first
    await sb.from('transactions').delete()
      .eq('cartola_upload_id', uploadId)
      .eq('is_from_cartola', true)
    // Delete the upload record
    await sb.from('cartola_uploads').delete().eq('id', uploadId)
    await loadHistory()
    setDeletingId(null)
  }

  useEffect(() => {
    loadCards()
  }, [])

  useEffect(() => {
    if (cards.length > 0) loadHistory()
  }, [cards])

  // Cards filtered to the selected bank
  const bankCards = selectedBank
    ? cards.filter(c => (c as any).bank === selectedBank || (c as any).bank === 'unknown' || !(c as any).bank)
    : cards

  function selectBank(bank: BankType) {
    setSelectedBank(bank)
    setSelectedCard('')
    setError('')
    setDupWarning(null)
    setStep('upload')
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se aceptan archivos PDF')
      return
    }
    if (!selectedCard) {
      setError('Selecciona una tarjeta primero')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { parsePDFFile } = await import('@/lib/parser')
      const result = await parsePDFFile(file, selectedBank ?? undefined)
      if (result.transactions.length === 0) {
        setError('No se encontraron movimientos en el PDF. Verifica que sea el estado de cuenta correcto.')
        setLoading(false)
        return
      }

      // ── Duplicate check ────────────────────────────────────────────────────
      if (result.periodStart && result.periodEnd && selectedCard) {
        const sb = getClient()
        const ps = result.periodStart.toISOString().split('T')[0]
        const pe = result.periodEnd.toISOString().split('T')[0]
        const { data: existing } = await sb
          .from('cartola_uploads')
          .select('id, period_start, period_end, created_at')
          .eq('credit_card_id', selectedCard)
          .eq('period_start', ps)
          .eq('period_end', pe)
          .limit(1)
        if (existing && existing.length > 0) {
          const prev = existing[0]
          setDupWarning({
            periodStart: ps,
            periodEnd: pe,
            uploadedAt: new Date(prev.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
          })
          setParsed(result)
          setLoading(false)
          return  // stay on upload step, show warning banner
        }
      }

      setParsed(result)
      setStep('preview')
    } catch (e: any) {
      setError(e.message ?? 'Error al procesar el PDF')
    }
    setLoading(false)
  }

  async function runMatching() {
    if (!parsed || !selectedCard) return
    setLoading(true)
    setError('')
    try {
      const sb = getClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const uploadBody = {
        user_id: user.id,
        credit_card_id: selectedCard,
        bank_name: parsed.bank,
        card_last_four: parsed.cardLastFour,
        period_start: parsed.periodStart?.toISOString().split('T')[0] ?? null,
        period_end: parsed.periodEnd?.toISOString().split('T')[0] ?? null,
        total_amount: parsed.totalAmount,
        transaction_count: parsed.transactions.length,
        matched_count: 0,
        status: 'revisando',
        currency: parsed.currency ?? 'CLP',
        upcoming_amounts: parsed.upcomingPayments ?? null,
      }
      const { data: uploadData, error: uploadErr } = await sb
        .from('cartola_uploads').insert(uploadBody).select('id').single()
      if (uploadErr) throw new Error(uploadErr.message)
      setUploadId(uploadData.id)

      const start = parsed.periodStart ?? new Date(Date.now() - 30 * 86400_000)
      const end   = parsed.periodEnd   ?? new Date()
      const { data: manuals } = await sb
        .from('transactions')
        .select('*')
        .eq('credit_card_id', selectedCard)
        .eq('is_from_cartola', false)
        .neq('match_status', 'matched')
        .gte('date', start.toISOString().split('T')[0])
        .lte('date', end.toISOString().split('T')[0])
      const manualTxs = manuals ?? []

      // Fetch active subscriptions for matching
      const { data: subsData } = await sb.from('subscriptions').select('id,name,amount,currency').eq('is_active', true)
      const activeSubs = subsData ?? []

      const pairs: MatchPair[] = []
      const usedManual   = new Set<string>()
      const usedCartola  = new Set<string>()

      for (const ct of parsed.transactions) {
        for (const mt of manualTxs) {
          if (usedManual.has(mt.id)) continue
          const amountMatch = Math.abs(Number(mt.amount) - ct.amount) < 1
          const dateDiff    = Math.abs(ct.date.getTime() - new Date(mt.date).getTime()) / 86400_000
          if (amountMatch && dateDiff <= 5) {
            pairs.push({ id: `${mt.id}-${ct.id}`, manual: mt, cartola: ct, confidence: dateDiff <= 1 ? 'high' : 'medium' })
            usedManual.add(mt.id)
            usedCartola.add(ct.id)
            break
          }
        }
      }

      // Match remaining cartola transactions against active subscriptions by name + amount
      // Note: we do NOT add to usedCartola so they still appear in cartolaOnly and get imported
      const subMatched = new Set<string>()
      for (const ct of parsed.transactions) {
        if (usedCartola.has(ct.id)) continue
        const descLower = (ct.description ?? '').toLowerCase()
        for (const sub of activeSubs) {
          const subNameLower = sub.name.toLowerCase()
          const nameMatch = descLower.includes(subNameLower) || subNameLower.includes(descLower.split(' ')[0])
          const amountMatch = Math.abs(Number(sub.amount) - ct.amount) < ct.amount * 0.05  // within 5%
          if (nameMatch || amountMatch) {
            subMatched.add(ct.id)
            break
          }
        }
      }

      setSubMatchedIds(subMatched)
      setMatchedPairs(pairs)
      setCartolaOnly(parsed.transactions.filter(t => !usedCartola.has(t.id)))
      setManualOnly(manualTxs.filter((t: any) => !usedManual.has(t.id)))
      setConfirmedPairs(new Set(pairs.filter(p => p.confidence === 'high').map(p => p.id)))
      setStep('matching')
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function confirm() {
    if (!uploadId || !selectedCard) return
    setLoading(true)
    setError('')
    try {
      const sb = getClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const confirmed = matchedPairs.filter(p => confirmedPairs.has(p.id))
      for (const pair of confirmed) {
        await sb.from('transactions').update({ match_status: 'matched' }).eq('id', pair.manual.id)
      }

      if (cartolaOnly.length > 0) {
        await sb.from('transactions').insert(cartolaOnly.map(ct => ({
          user_id: user.id,
          amount: ct.amount,
          currency: parsed.currency ?? 'CLP',
          type: 'expense',
          category: subMatchedIds.has(ct.id) ? 'suscripciones' : categorizeTransaction(ct.description ?? ''),
          description: ct.description,
          date: ct.date.toISOString().split('T')[0],
          credit_card_id: selectedCard,
          is_installment: ct.isInstallment,
          installment_number: ct.installmentNumber ?? null,
          installment_total: ct.installmentTotal ?? null,
          is_from_cartola: true,
          match_status: 'matched',
          cartola_upload_id: uploadId,
        })))
      }

      await sb.from('cartola_uploads').update({ status: 'procesada', matched_count: confirmed.length }).eq('id', uploadId)

      // Update card balance with the cartola total (Monto Total Facturado a Pagar)
      // USD cartolas update balance_usd; CLP cartolas update balance
      if (parsed.totalAmount > 0) {
        const balanceField = parsed.currency === 'USD'
          ? { balance_usd: parsed.totalAmount }
          : { balance: parsed.totalAmount }
        await sb.from('credit_cards').update(balanceField).eq('id', selectedCard)
      }

      setStep('done')
      loadHistory()
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  function reset() {
    setStep('select-bank')
    setSelectedBank(null)
    setSelectedCard('')
    setParsed(null)
    setError('')
    setMatchedPairs([])
    setCartolaOnly([])
    setManualOnly([])
    setUploadId(null)
    setDupWarning(null)
    setSubMatchedIds(new Set())
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6 pb-24 sm:pb-6">
        <h1 className="text-xl font-bold text-text-primary">Cartolas PDF</h1>

        <StepIndicator step={step} />

        {/* ── 0. Select bank ── */}
        {step === 'select-bank' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">Selecciona el banco del estado de cuenta que vas a subir</p>
              <div className="grid grid-cols-2 gap-3">
                {BANKS.map(bank => (
                  <button
                    key={bank.id}
                    onClick={() => selectBank(bank.id)}
                    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bank.color} p-5 text-left text-white shadow-md transition hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                    <span className="text-3xl">{bank.icon}</span>
                    <p className="mt-2 text-base font-bold">{bank.label}</p>
                    <p className="mt-0.5 text-[11px] opacity-70">{bank.description}</p>
                    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold opacity-80">
                      Seleccionar <span>→</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── History ── */}
            {history.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">Historial de cartolas</p>
                <div className="card divide-y divide-border overflow-hidden">
                  {history.map(upload => {
                    const bankLabel = BANKS.find(b => b.id === upload.bank_name)?.label ?? upload.bank_name ?? '—'
                    const periodStr = upload.period_start && upload.period_end
                      ? `${upload.period_start} → ${upload.period_end}`
                      : '—'
                    const isDeleting = deletingId === upload.id
                    return (
                      <div key={upload.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-text-primary truncate">
                              {upload.card_name ?? bankLabel}
                            </span>
                            <span className={`badge text-[10px] ${upload.status === 'procesada' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                              {upload.status}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted">{periodStr}</p>
                          <p className="text-xs text-text-muted">
                            {clpFormatted(Number(upload.total_amount))} · {upload.transaction_count ?? 0} mov
                          </p>
                        </div>
                        <button
                          onClick={() => deleteUpload(upload.id)}
                          disabled={isDeleting}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-danger/10 hover:text-danger transition disabled:opacity-40"
                          title="Eliminar cartola"
                        >
                          {isDeleting ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-danger border-t-transparent block" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 1. Select card + upload PDF ── */}
        {step === 'upload' && selectedBank && (
          <div className="space-y-4">
            {/* Selected bank pill + back */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setStep('select-bank'); setSelectedBank(null) }}
                className="text-sm text-text-muted hover:text-text-primary transition"
              >
                ←
              </button>
              <div className={`flex items-center gap-2 rounded-full bg-gradient-to-r ${BANKS.find(b => b.id === selectedBank)?.color} px-3 py-1 text-xs font-semibold text-white`}>
                <span>{BANKS.find(b => b.id === selectedBank)?.icon}</span>
                <span>{BANKS.find(b => b.id === selectedBank)?.label}</span>
              </div>
            </div>

            {/* Card selector */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-primary">Tarjeta</label>
              <div className="grid gap-2">
                {bankCards.length === 0 ? (
                  <p className="text-sm text-text-muted py-2">No hay tarjetas registradas. Agrega una en Configuración.</p>
                ) : (
                  bankCards.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCard(c.id); setDupWarning(null); setParsed(null) }}
                      className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition
                        ${selectedCard === c.id
                          ? 'border-accent bg-accent/5'
                          : 'border-border bg-surface hover:border-accent/30'}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{c.name}</p>
                        {c.last_four && (
                          <p className="text-xs text-text-muted font-mono">•••• {c.last_four}</p>
                        )}
                      </div>
                      {selectedCard === c.id && (
                        <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">✓</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* PDF drop zone */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-primary">Estado de cuenta PDF</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 transition
                  ${!selectedCard ? 'border-border bg-surface opacity-50 cursor-not-allowed'
                    : dragOver ? 'border-accent bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50 cursor-pointer'}`}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-2xl">📄</div>
                <p className="text-sm font-semibold text-text-primary">Arrastra el PDF aquí</p>
                <p className="mt-1 text-xs text-text-muted">
                  {!selectedCard ? 'Selecciona una tarjeta primero' : `Estado de cuenta ${BANKS.find(b => b.id === selectedBank)?.label}`}
                </p>
                {selectedCard && (
                  <label className="mt-4 cursor-pointer">
                    <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                    <span className="btn-secondary text-sm">Seleccionar archivo</span>
                  </label>
                )}
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      <p className="text-sm text-text-secondary">Procesando PDF...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            {/* Duplicate warning */}
            {dupWarning && parsed && (
              <div className="rounded-xl border-2 border-warning/40 bg-warning/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-warning">Cartola ya registrada</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      Ya subiste el período <strong>{dupWarning.periodStart}</strong> → <strong>{dupWarning.periodEnd}</strong> el {dupWarning.uploadedAt}.
                      Subir de nuevo puede generar movimientos duplicados.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDupWarning(null); setParsed(null) }}
                    className="btn-secondary flex-1 text-xs py-1.5"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { setDupWarning(null); setStep('preview') }}
                    className="rounded-lg border-2 border-warning bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning flex-1 hover:bg-warning/20 transition"
                  >
                    Subir de todas formas
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 2. Preview ── */}
        {step === 'preview' && parsed && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <InfoRow label="Banco" value={BANKS.find(b => b.id === parsed.bank)?.label ?? parsed.bank} />
              <InfoRow label="Tarjeta" value={`••••${parsed.cardLastFour || '----'}`} />
              {parsed.periodEnd && (
                <InfoRow label="Fecha cierre" value={parsed.periodEnd.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })} />
              )}
              <InfoRow label="Total a pagar" value={
                parsed.currency === 'USD'
                  ? `US$ ${parsed.totalAmount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : clpFormatted(parsed.totalAmount)
              } />
              <InfoRow label="Movimientos detectados" value={String(parsed.transactions.length)} />
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-text-primary">{parsed.transactions.length} movimientos</p>
              </div>
              <div className="divide-y divide-border max-h-96 overflow-y-auto">
                {parsed.transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-text-primary line-clamp-1">{tx.description}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-text-muted">
                          {tx.date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {tx.isInstallment && tx.installmentNumber != null && tx.installmentTotal != null && (
                          <span className="badge bg-accent/10 text-accent text-[9px]">{tx.installmentNumber}/{tx.installmentTotal}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-danger">{clpFormatted(tx.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <div className="flex gap-3">
              <button onClick={() => { setStep('upload'); setParsed(null); setError('') }} className="btn-secondary flex-1 justify-center">
                ← Atrás
              </button>
              <button onClick={runMatching} disabled={loading || !selectedCard} className="btn-primary flex-1 justify-center">
                {loading ? 'Procesando...' : '⇄ Hacer match'}
              </button>
            </div>
          </div>
        )}

        {/* ── 3. Matching ── */}
        {step === 'matching' && (
          <div className="space-y-4">
            {matchedPairs.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <span>✓</span> Matches encontrados ({matchedPairs.length})
                </p>
                {matchedPairs.map(pair => (
                  <button
                    key={pair.id}
                    onClick={() => setConfirmedPairs(prev => {
                      const next = new Set(prev)
                      next.has(pair.id) ? next.delete(pair.id) : next.add(pair.id)
                      return next
                    })}
                    className={`w-full rounded-xl border-2 p-3 text-left transition
                      ${confirmedPairs.has(pair.id) ? 'border-success/30 bg-success/5' : 'border-border bg-surface'}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`badge ${pair.confidence === 'high' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        {pair.confidence === 'high' ? '✓ Alta confianza' : '~ Media confianza'}
                      </span>
                      <span className="text-sm font-bold text-danger">{clpFormatted(pair.cartola.amount)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-surface-high p-2">
                        <p className="text-[9px] text-text-muted uppercase">Manual</p>
                        <p className="text-xs font-medium line-clamp-1">{pair.manual.description ?? pair.manual.category}</p>
                        <p className="text-xs text-text-muted">{clpFormatted(Number(pair.manual.amount))}</p>
                      </div>
                      <div className="rounded-lg bg-surface-high p-2">
                        <p className="text-[9px] text-text-muted uppercase">Cartola</p>
                        <p className="text-xs font-medium line-clamp-1">{pair.cartola.description}</p>
                        <p className="text-xs text-text-muted">{clpFormatted(pair.cartola.amount)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {cartolaOnly.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                  <span>↓</span> Se importarán automáticamente ({cartolaOnly.length})
                </p>
                <p className="text-xs text-text-muted">Sin ingreso manual pendiente — se concilian directamente</p>
                {cartolaOnly.map(tx => {
                  const isSub = subMatchedIds.has(tx.id)
                  return (
                    <div key={tx.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isSub ? 'bg-emerald-500/8' : 'bg-accent/5'}`}>
                      <span className={isSub ? 'text-emerald-500' : 'text-accent'}>✓</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{tx.description}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-text-muted">{tx.date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</p>
                          {tx.isInstallment && tx.installmentNumber != null && (
                            <span className="badge bg-accent/10 text-accent text-[9px]">{tx.installmentNumber}/{tx.installmentTotal}</span>
                          )}
                          {isSub && (
                            <span className="badge bg-emerald-500/15 text-emerald-600 text-[9px]">↻ Suscripción</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-danger">{clpFormatted(tx.amount)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {manualOnly.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-text-muted">No encontrados en cartola ({manualOnly.length})</p>
                {manualOnly.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-lg bg-surface-high px-3 py-2.5 opacity-60">
                    <div>
                      <p className="text-sm line-clamp-1">{tx.description ?? tx.category}</p>
                      <p className="text-xs text-text-muted">{new Date(tx.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    <span className="text-sm font-medium text-text-secondary">{clpFormatted(Number(tx.amount))}</span>
                  </div>
                ))}
              </div>
            )}

            {error && <ErrorBanner message={error} />}

            <div className="flex gap-3">
              <button onClick={() => setStep('preview')} className="btn-secondary flex-1 justify-center">← Atrás</button>
              <button onClick={confirm} disabled={loading} className="btn-primary flex-1 justify-center">
                {loading ? 'Guardando...' : '✓ Confirmar'}
              </button>
            </div>
          </div>
        )}

        {/* ── 4. Done ── */}
        {step === 'done' && (
          <div className="card flex flex-col items-center py-16 px-8 text-center space-y-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-4xl">✓</div>
            <h2 className="text-xl font-bold text-text-primary">¡Cartola procesada!</h2>
            <p className="text-sm text-text-secondary">Los matches fueron confirmados y los gastos nuevos importados.</p>
            <button onClick={reset} className="btn-primary">Subir otra cartola</button>
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const steps: Step[]  = ['select-bank', 'upload', 'preview', 'matching', 'done']
  const labels         = ['Banco', 'Subir', 'Revisar', 'Match', 'Listo']
  const current        = steps.indexOf(step)
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition
            ${i < current ? 'bg-success text-white' : i === current ? 'bg-accent text-white' : 'bg-border text-text-muted'}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`text-xs ${i === current ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>{labels[i]}</span>
          {i < steps.length - 1 && <div className={`h-px w-5 ${i < current ? 'bg-success' : 'bg-border'}`} />}
        </div>
      ))}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-semibold text-text-primary">{value}</span>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">⚠ {message}</div>
  )
}

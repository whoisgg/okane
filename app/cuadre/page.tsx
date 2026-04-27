'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { BankAccount } from '@/lib/types'
import {
  parseCuentaCorrientePDF,
  parseMovimientosExcel,
  type CuentaCorrientePdfResult,
  type ExcelResult,
} from '@/lib/parser/cuenta-corriente'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d?: Date): string {
  if (!d) return '—'
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CuadrePage() {
  const [accounts, setAccounts]     = useState<BankAccount[]>([])
  const [accountId, setAccountId]   = useState('')
  const [pdfResult, setPdfResult]   = useState<CuentaCorrientePdfResult | null>(null)
  const [excelResult, setExcelResult] = useState<ExcelResult | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [xlsLoading, setXlsLoading] = useState(false)
  const [pdfError, setPdfError]     = useState('')
  const [xlsError, setXlsError]     = useState('')
  const [importTxs, setImportTxs]   = useState(true)
  const [saving, setSaving]         = useState(false)
  const [done, setDone]             = useState(false)
  const [pdfDrag, setPdfDrag]       = useState(false)
  const [xlsDrag, setXlsDrag]       = useState(false)

  useEffect(() => {
    getClient().from('bank_accounts').select('*').order('created_at').then(({ data }) => {
      const list = (data ?? []) as BankAccount[]
      setAccounts(list)
      if (list[0]) setAccountId(list[0].id)
    })
  }, [])

  async function handlePDF(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { setPdfError('Solo se aceptan archivos PDF'); return }
    setPdfLoading(true); setPdfError('')
    try {
      const { extractSantanderText } = await import('@/lib/parser')
      const text = await extractSantanderText(file)
      const result = parseCuentaCorrientePDF(text)
      if (!result.saldoFinal) {
        setPdfError('No se pudo extraer el saldo. Verifica que sea una cartola de Cuenta Corriente Santander.')
        setPdfLoading(false); return
      }
      setPdfResult(result)
    } catch (e: any) { setPdfError(e.message ?? 'Error al procesar el PDF') }
    setPdfLoading(false)
  }

  async function handleExcel(file: File) {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) { setXlsError('Solo se aceptan archivos Excel (.xlsx)'); return }
    setXlsLoading(true); setXlsError('')
    try {
      const result = await parseMovimientosExcel(file)
      setExcelResult(result)
    } catch (e: any) { setXlsError(e.message ?? 'Error al procesar el Excel') }
    setXlsLoading(false)
  }

  const selectedAccount = accounts.find(a => a.id === accountId)
  const accountLabel    = selectedAccount?.name ?? 'Cuenta'

  const bestBalance = excelResult?.saldoActual ?? pdfResult?.saldoFinal ?? null
  const bestDate    = excelResult?.periodEnd ?? pdfResult?.periodEnd

  async function cuadrar() {
    if (!accountId || bestBalance === null) return
    setSaving(true)
    const sb = getClient()

    // 1. Update account balance
    await (sb.from('bank_accounts') as any).update({ balance: bestBalance }).eq('id', accountId)

    // 2. Optionally import Excel transactions
    if (importTxs && excelResult && excelResult.transactions.length > 0) {
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        // Deduplicate against existing bank account transactions
        const { data: existing } = await sb.from('transactions')
          .select('date, description, amount')
          .eq('bank_account_id', accountId)
          .eq('is_from_cartola', true)

        const existSet = new Set(
          ((existing ?? []) as any[]).map(t => `${String(t.date).slice(0, 10)}|${t.description}|${t.amount}`)
        )

        const toInsert = excelResult.transactions
          .filter(tx => {
            const amt = tx.cargo > 0 ? tx.cargo : tx.abono
            const key = `${tx.date.toISOString().slice(0, 10)}|${tx.description}|${amt}`
            return !existSet.has(key)
          })
          .map(tx => ({
            user_id:         user.id,
            bank_account_id: accountId,
            date:            tx.date.toISOString().slice(0, 10),
            description:     tx.description,
            amount:          tx.cargo > 0 ? tx.cargo : tx.abono,
            type:            tx.cargo > 0 ? 'expense' : 'income',
            currency:        'CLP',
            category:        'otros',
            is_from_cartola: true,
            match_status:    null,
          }))

        if (toInsert.length > 0) {
          await (sb.from('transactions') as any).insert(toInsert)
        }
      }
    }

    setSaving(false)
    setDone(true)
  }

  function reset() {
    setDone(false); setPdfResult(null); setExcelResult(null)
    setPdfError(''); setXlsError('')
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 pb-24 sm:pb-6">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href="/saldos" className="text-text-secondary hover:text-text-primary transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-text-primary">Cuadre de Cuenta</h1>
        </div>

        {done ? (
          /* ── Done state ── */
          <div className="card p-10 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center text-3xl">✓</div>
            <p className="text-lg font-bold text-success">¡Cuadre realizado!</p>
            <div className="text-sm text-text-muted space-y-1">
              <p>Saldo actualizado a <span className="font-semibold text-text-primary">{clpFormatted(bestBalance ?? 0)}</span></p>
              {importTxs && excelResult && (
                <p>{excelResult.transactions.length} movimientos importados al historial</p>
              )}
              {bestDate && <p className="text-xs">Al {fmtDate(bestDate)}</p>}
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={reset} className="btn-secondary">Cuadrar de nuevo</button>
              <Link href="/saldos" className="btn-primary">Ver saldos</Link>
            </div>
          </div>
        ) : (
          <>
            {/* ── Account selector ── */}
            <div className="card p-4 space-y-2">
              <label className="block text-sm font-medium text-text-secondary">Cuenta a cuadrar</label>
              <select className="input w-full" value={accountId} onChange={e => {
                setAccountId(e.target.value)
                setPdfResult(null); setExcelResult(null)
                setPdfError(''); setXlsError('')
              }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* ── Upload zones ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UploadZone
                title="Cartola oficial"
                subtitle={`PDF · ${accountLabel}`}
                accept=".pdf"
                icon="📄"
                loading={pdfLoading}
                error={pdfError}
                done={!!pdfResult}
                doneLabel={pdfResult ? `Saldo al ${fmtDate(pdfResult.periodEnd)}` : ''}
                doneValue={pdfResult ? clpFormatted(pdfResult.saldoFinal) : ''}
                isDragging={pdfDrag}
                onDragChange={setPdfDrag}
                onFile={handlePDF}
                onClear={() => { setPdfResult(null); setPdfError('') }}
              />
              <UploadZone
                title="Últimos movimientos"
                subtitle={`Excel · ${accountLabel}`}
                accept=".xlsx,.xls"
                icon="📊"
                loading={xlsLoading}
                error={xlsError}
                done={!!excelResult}
                doneLabel={excelResult ? `Saldo al ${fmtDate(excelResult.periodEnd)}` : ''}
                doneValue={excelResult ? clpFormatted(excelResult.saldoActual) : ''}
                isDragging={xlsDrag}
                onDragChange={setXlsDrag}
                onFile={handleExcel}
                onClear={() => { setExcelResult(null); setXlsError('') }}
              />
            </div>

            {/* ── Result panel ── */}
            {(pdfResult || excelResult) && (
              <div className="card p-5 space-y-4">
                <h2 className="font-semibold text-text-primary">Resumen del cuadre</h2>

                <div className="space-y-2">
                  {pdfResult && (
                    <ResultRow
                      label="Cartola oficial"
                      sub={pdfResult.cartolaNumber
                        ? `N° ${pdfResult.cartolaNumber} · ${fmtDate(pdfResult.periodStart)} – ${fmtDate(pdfResult.periodEnd)}`
                        : `${fmtDate(pdfResult.periodStart)} – ${fmtDate(pdfResult.periodEnd)}`}
                      value={clpFormatted(pdfResult.saldoFinal)}
                    />
                  )}
                  {excelResult && (
                    <ResultRow
                      label="Movimientos recientes"
                      sub={`${excelResult.transactions.length} movs · ${fmtDate(excelResult.periodStart)} – ${fmtDate(excelResult.periodEnd)}`}
                      value={clpFormatted(excelResult.saldoActual)}
                      highlight
                    />
                  )}
                </div>

                {/* Best balance callout */}
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <p className="text-xs text-text-muted mb-1">Saldo a registrar</p>
                  <p className="text-2xl font-bold text-accent">{clpFormatted(bestBalance ?? 0)}</p>
                  <p className="text-xs text-text-muted mt-1">
                    {excelResult
                      ? `Movimientos recientes al ${fmtDate(bestDate)} (más reciente)`
                      : `Cartola oficial al ${fmtDate(bestDate)}`}
                  </p>
                </div>

                {/* Import checkbox */}
                {excelResult && excelResult.transactions.length > 0 && (
                  <label className="flex items-start gap-3 cursor-pointer rounded-xl bg-surface-high p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded accent-accent"
                      checked={importTxs}
                      onChange={e => setImportTxs(e.target.checked)}
                    />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        Importar {excelResult.transactions.length} movimientos
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        Se agregarán al historial de la cuenta (sin duplicados)
                      </p>
                    </div>
                  </label>
                )}

                {/* Preview of top transactions */}
                {importTxs && excelResult && excelResult.transactions.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-border">
                    {excelResult.transactions.slice(0, 20).map((tx, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-high">
                        <div className="flex-1 min-w-0">
                          <p className="text-text-secondary truncate">{tx.description}</p>
                          <p className="text-text-muted">{fmtDate(tx.date)}</p>
                        </div>
                        <p className={`ml-3 font-medium flex-shrink-0 ${tx.cargo > 0 ? 'text-danger' : 'text-success'}`}>
                          {tx.cargo > 0 ? `- ${clpFormatted(tx.cargo)}` : `+ ${clpFormatted(tx.abono)}`}
                        </p>
                      </div>
                    ))}
                    {excelResult.transactions.length > 20 && (
                      <p className="text-center text-xs text-text-muted py-2">
                        +{excelResult.transactions.length - 20} más
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={cuadrar}
                  disabled={saving || !accountId || bestBalance === null}
                  className="btn-primary w-full py-3 font-semibold disabled:opacity-40"
                >
                  {saving ? 'Guardando…' : 'Confirmar cuadre'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

// ── Upload Zone Component ──────────────────────────────────────────────────────
function UploadZone({
  title, subtitle, accept, icon, loading, error,
  done, doneLabel, doneValue, isDragging,
  onDragChange, onFile, onClear,
}: {
  title: string; subtitle: string; accept: string; icon: string
  loading: boolean; error: string; done: boolean; doneLabel: string; doneValue: string
  isDragging: boolean; onDragChange: (v: boolean) => void
  onFile: (f: File) => void; onClear: () => void
}) {
  function drop(e: React.DragEvent) {
    e.preventDefault(); onDragChange(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  function change(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    e.target.value = ''
  }

  return (
    <div
      className={`card p-4 border-2 transition-all ${
        isDragging ? 'border-accent bg-accent/5 scale-[1.01]' :
        done ? 'border-success/30 bg-success/3' : 'border-transparent'
      }`}
      onDragOver={e => { e.preventDefault(); onDragChange(true) }}
      onDragLeave={() => onDragChange(false)}
      onDrop={drop}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
        <span className="text-xl">{done ? '✅' : icon}</span>
      </div>

      {done ? (
        <div className="space-y-1.5">
          <p className="text-xs text-text-muted">{doneLabel}</p>
          <p className="text-base font-bold text-success">{doneValue}</p>
          <button onClick={onClear} className="text-xs text-text-muted hover:text-danger transition">
            ✕ Quitar archivo
          </button>
        </div>
      ) : (
        <label className={`block cursor-pointer rounded-xl border border-dashed border-border p-4 text-center transition hover:border-accent/50 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          <input type="file" className="hidden" accept={accept} onChange={change} />
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <span className="text-xs text-text-muted">Procesando…</span>
            </div>
          ) : (
            <>
              <p className="text-sm text-text-muted">Arrastra aquí o toca para subir</p>
              <p className="text-xs text-text-muted/50 mt-0.5">{accept.replace(/\./g, '').toUpperCase()}</p>
            </>
          )}
        </label>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}

// ── Result Row Component ───────────────────────────────────────────────────────
function ResultRow({ label, sub, value, highlight }: { label: string; sub?: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg p-3 ${highlight ? 'bg-surface-high' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${highlight ? 'text-text-primary' : 'text-text-secondary'}`}>{label}</p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
      <p className={`text-sm font-semibold flex-shrink-0 ${highlight ? 'text-text-primary' : 'text-text-secondary'}`}>{value}</p>
    </div>
  )
}

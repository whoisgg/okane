'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { clpFormatted } from '@/lib/utils'
import type { BankAccount } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CCPdfResult {
  accountNumber?: string
  cartolaNumber?: number
  periodStart?: Date
  periodEnd?: Date
  saldoFinal: number
}

interface ExcelTx {
  date: Date
  description: string
  cargo: number
  abono: number
  saldo: number
}

interface ExcelResult {
  accountNumber?: string
  periodStart?: Date
  periodEnd?: Date
  saldoActual: number
  transactions: ExcelTx[]
}

// ── PDF Parser (Santander CC cartola) ─────────────────────────────────────────
function parseSantanderCC(text: string): CCPdfResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  let periodStart: Date | undefined
  let periodEnd: Date | undefined
  let cartolaNumber: number | undefined
  let accountNumber: string | undefined
  let saldoFinal = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Account number: "0-000-63-97817-5" style
    if (!accountNumber) {
      const m = line.match(/\b(\d-\d{3}-\d{5}-\d)\b/)
      if (m) accountNumber = m[1]
    }

    // Period + cartola number: "188 30/01/2026 27/02/2026 1 de 2"
    // Or just two DD/MM/YYYY dates near "DESDE" / "HASTA"
    const dateM = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/)
    if (dateM) {
      periodStart = pdDate(dateM[1])
      periodEnd   = pdDate(dateM[2])
      const numM = line.match(/^(\d+)\s/)
      if (numM) cartolaNumber = parseInt(numM[1])
    }

    // Saldo final from summary table
    // After header "SALDO INICIAL ... SALDO FINAL", the next data line has 7 numbers
    if (/SALDO INICIAL/i.test(line) && /SALDO FINAL/i.test(line)) {
      // Look forward for the data row
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nums = lines[j].match(/([\d.]+)/g)?.map(n => parseInt(n.replace(/\./g, ''), 10)).filter(n => !isNaN(n) && n >= 0)
        if (nums && nums.length >= 5) {
          saldoFinal = nums[nums.length - 1]
          break
        }
      }
    }

    // Also handle case where the header and data might be on the same reconstructed line
    // "5.469.072 0 13.732.772 0 13.885.307 145 5.316.392" after "INFORMACION DE CUENTA CORRIENTE"
    if (!saldoFinal && /INFORMACION DE CUENTA CORRIENTE/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const nums = lines[j].match(/([\d.]+)/g)?.map(n => parseInt(n.replace(/\./g, ''), 10)).filter(n => !isNaN(n) && n >= 0)
        if (nums && nums.length >= 6) {
          saldoFinal = nums[nums.length - 1]
          break
        }
      }
    }
  }

  return { accountNumber, cartolaNumber, periodStart, periodEnd, saldoFinal }
}

function pdDate(s: string): Date | undefined {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return undefined
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
}

// ── Minimal native XLSX parser (no library required) ──────────────────────────
// XLSX = ZIP archive containing XML files. We use browser's DecompressionStream
// to inflate the DEFLATE-compressed entries, then parse the XML.

function readUint16LE(b: Uint8Array, off: number) { return b[off] | (b[off + 1] << 8) }
function readUint32LE(b: Uint8Array, off: number) {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new (window as any).DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()
  writer.write(data)
  writer.close()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((s: number, c: Uint8Array) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out
}

async function readZip(bytes: Uint8Array): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  const dec = new TextDecoder('utf-8')
  let off = 0
  while (off < bytes.length - 4) {
    if (bytes[off] !== 0x50 || bytes[off + 1] !== 0x4B || bytes[off + 2] !== 0x03 || bytes[off + 3] !== 0x04) {
      off++; continue
    }
    const method    = readUint16LE(bytes, off + 8)
    const compSize  = readUint32LE(bytes, off + 18)
    const fnLen     = readUint16LE(bytes, off + 26)
    const extraLen  = readUint16LE(bytes, off + 28)
    const fnBytes   = bytes.slice(off + 30, off + 30 + fnLen)
    const fileName  = dec.decode(fnBytes)
    const dataStart = off + 30 + fnLen + extraLen
    const rawData   = bytes.slice(dataStart, dataStart + compSize)

    const wanted = ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml']
    if (wanted.includes(fileName)) {
      let xml: string
      if (method === 0) {
        xml = dec.decode(rawData)
      } else if (method === 8) {
        xml = dec.decode(await inflate(rawData))
      } else {
        off += 30 + fnLen + extraLen + compSize; continue
      }
      entries[fileName] = xml
    }
    off += 30 + fnLen + extraLen + compSize
  }
  return entries
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const text = Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map(t => t[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
      .join('')
    strings.push(text)
  }
  return strings
}

function colToIdx(col: string): number {
  let r = 0
  for (const c of col) r = r * 26 + (c.charCodeAt(0) - 64)
  return r - 1
}

function parseSheetXML(xml: string, strings: string[]): string[][] {
  const rows: string[][] = []
  for (const rowM of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cellM of rowM[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellM[1]
      const inner = cellM[2]
      const rMatch = attrs.match(/\br="([A-Z]+)/)
      const tMatch = attrs.match(/\bt="([^"]*)/)
      if (!rMatch) continue
      const colIdx = colToIdx(rMatch[1])
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/)
      let val = ''
      if (vMatch) {
        val = tMatch?.[1] === 's' ? (strings[parseInt(vMatch[1])] ?? '') : vMatch[1]
      }
      while (cells.length <= colIdx) cells.push('')
      cells[colIdx] = val
    }
    if (cells.some(c => c !== '')) rows.push(cells)
  }
  return rows
}

async function parseMovimientosExcel(file: File): Promise<ExcelResult> {
  const buffer = await file.arrayBuffer()
  const bytes  = new Uint8Array(buffer)
  const files  = await readZip(bytes)

  const sharedStrings = files['xl/sharedStrings.xml'] ? parseSharedStrings(files['xl/sharedStrings.xml']) : []
  const sheetXML = files['xl/worksheets/sheet1.xml']
  if (!sheetXML) throw new Error('No se encontró la hoja de datos en el archivo Excel')

  const rows = parseSheetXML(sheetXML, sharedStrings)

  // Find header row (contains "Fecha")
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => c.toLowerCase().includes('fecha'))) { headerIdx = i; break }
  }
  if (headerIdx === -1) throw new Error('No se encontró la fila de encabezados (Fecha, Detalle...)')

  // Account number from first rows
  let accountNumber: string | undefined
  for (let i = 0; i < headerIdx; i++) {
    const m = rows[i].join(' ').match(/(\d-\d{3}-\d{5}-\d)/)
    if (m) { accountNumber = m[1]; break }
  }

  // Parse data rows
  const transactions: ExcelTx[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue
    const dateStr = row[0]
    // Handle both DD-MM-YYYY and serial date number
    let date: Date | undefined
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const p = dateStr.split('-')
      date = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    } else if (/^\d+$/.test(dateStr)) {
      // Excel serial date (days since 1900-01-00)
      const serial = parseInt(dateStr)
      date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    }
    if (!date || isNaN(date.getTime())) continue

    const description = row[1]?.trim() ?? ''
    if (!description) continue
    const cargo = parseXlsNum(row[2])
    const abono = parseXlsNum(row[3])
    const saldo = parseXlsNumSigned(row[4])
    transactions.push({ date, description, cargo, abono, saldo })
  }

  // Rows come newest-first from Santander's export
  const saldoActual = transactions.length > 0 ? transactions[0].saldo : 0
  const periodEnd   = transactions.length > 0 ? transactions[0].date : undefined
  const periodStart = transactions.length > 0 ? transactions[transactions.length - 1].date : undefined

  return { accountNumber, periodStart, periodEnd, saldoActual, transactions }
}

function parseXlsNum(v: string | undefined): number {
  if (!v) return 0
  const n = parseFloat(v.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}
function parseXlsNumSigned(v: string | undefined): number {
  if (!v) return 0
  const n = parseFloat(v.replace(/[^\d.-]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d?: Date): string {
  if (!d) return '—'
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CuadrePage() {
  const [accounts, setAccounts]     = useState<BankAccount[]>([])
  const [accountId, setAccountId]   = useState('')
  const [pdfResult, setPdfResult]   = useState<CCPdfResult | null>(null)
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
      const result = parseSantanderCC(text)
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

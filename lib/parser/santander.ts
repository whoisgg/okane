// ── Santander parser ──────────────────────────────────────────────────────────
// Handles two statement types:
//   CLP (moneda nacional):
//     Installment: DD/MM/YY DESCRIPTION RATE% $ ORIG $ TOTAL N/T $MONTHLY
//     Single:      [CITY ]DD/MM/YY DESCRIPTION $AMOUNT
//   USD (internacional):
//     Single only: DD/MM/YY DESCRIPTION CITY COUNTRY ORIG_AMT USD_AMT

import type { CartolaParseResult, CartolaTransaction } from '../types'
import { parseAmount, parseDate, firstMatch, nextId } from './utils'

const SKIP_WORDS = [
  'MONTO CANCELADO', 'NOTA DE CREDITO', 'TRASPASO', 'INTERESES',
  'IMPUESTO', 'IMPTO', 'DEUDA INTERNA', 'MOVIMIENTOS TARJETA',
  'CARGOS, COMISIONES', 'PRODUCTOS O SERVICIOS', 'INFORMACION COMPRAS',
  'PERÍODO ANTERIOR', 'PERIODO ANTERIOR', 'PERÍODO ACTUAL', 'PERIODO ACTUAL',
  'TOTAL OPERACIONES', 'ABONO DE DIVISAS', 'TRASPASO DE DEUDA',
]

// CLP: Installment — rate "%" as anchor
// Groups: 1=date  2=description  3=rate(ignored)  4=origAmt  5=totalAmt  6=ratio  7=monthly
const INSTALL_RE = /(\d{2}\/\d{2}\/\d{2})(.+?)\s+([\d,]+)\s+%\s+\$\s*([\d.]+)\s+\$\s*([\d.]+)\s+(\d{1,2}\/\d{1,2})\s+\$([\d.,]+)/i

// CLP: Single purchase — [CITY ]DATE DESCRIPTION $AMOUNT
const SINGLE_RE = /(?:^[A-ZÁÉÍÓÚ\s]+\s)?(\d{2}\/\d{2}\/\d{2})(?!\d)\s*([^$\n]+?)\s+\$([\d.,]+)$/

// USD: DATE DESCRIPTION [CITY] COUNTRY ORIG_AMT USD_AMT
// Last two numbers are original-currency amount and USD equivalent
const USD_TX_RE = /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)$/

/** Parse amounts in European decimal format: "1.057,55" → 1057.55, "8,19" → 8.19 */
function parseAmountDecimal(raw: string): number {
  const s = raw.replace(/[US$\s]/g, '')
  if (s.includes('.') && s.includes(',')) {
    // "1.057,55" — dot is thousands separator, comma is decimal
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (s.includes(',')) {
    // "8,19" — comma is decimal separator
    return parseFloat(s.replace(',', '.')) || 0
  }
  return parseFloat(s) || 0
}

export function parseSantander(text: string, lastFour: string): CartolaParseResult {
  // ── Detect currency ──────────────────────────────────────────────────────────
  const isUSD = /ESTADO DE CUENTA INTERNACIONAL|US\$/i.test(text)
  const currency = isUSD ? 'USD' : 'CLP'

  // ── Meta info ────────────────────────────────────────────────────────────────
  const closingPattern = /FECHA ESTADO DE CUENTA\s+(\d{2}\/\d{2}\/\d{4})/i
  const periodEnd = parseDate(firstMatch(closingPattern, text) ?? '') ?? undefined

  const periodStartPattern = /PER[ÍI]ODO FACTURADO\s+(\d{2}\/\d{2}\/\d{4})/i
  const periodStart = parseDate(firstMatch(periodStartPattern, text) ?? '') ?? undefined

  // Total facturado — CLP uses "$", USD uses "US$" before the amount
  let totalAmount = 0
  if (isUSD) {
    // "US$ 1.057,55" appears within a few lines of "MONTO TOTAL FACTURADO A PAGAR"
    // but with intermediate text (Timbre, Banco, date) in between — allow up to 200 chars
    const m = text.match(/MONTO TOTAL FACTURADO A PAGAR[\s\S]{0,200}?US\$\s*([\d.,]+)/i)
    if (m) totalAmount = parseAmountDecimal(m[1])
  } else {
    // Allow the $ amount to be on the same line OR the very next line.
    // [^$\n]* stops at the line boundary; \n?\s* then allows one optional newline
    // before the $. This avoids matching "11/03/2026" (a date on the next line
    // in the payment stub) because that line starts with a digit, not "$".
    const m = text.match(/MONTO TOTAL FACTURADO A PAGAR[^$\n]*\n?\s*\$\s*([\d.]+)/i)
    if (m) totalAmount = parseAmount(m[1])
  }

  // ── Vencimiento Próximos 4 Meses (CLP only — USD statement has no such table) ─
  const upcomingPayments: { dueDate: string; amount: number }[] = []
  if (!isUSD) {
    const vencIdx = text.search(/VENCIMIENTO PR[ÓO]XIMOS 4 MESES/i)
    if (vencIdx !== -1) {
      const section = text.slice(vencIdx, vencIdx + 600)

      const MONTH_MAP: Record<string, number> = {
        ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
        JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
      }

      const foundMonths: { month: number; pos: number }[] = []
      for (const [name, num] of Object.entries(MONTH_MAP)) {
        const idx = section.indexOf(name)
        if (idx !== -1) foundMonths.push({ month: num, pos: idx })
      }
      foundMonths.sort((a, b) => a.pos - b.pos)

      const amounts: number[] = []
      const amtRe = /\$\s*([\d.]+)/g
      let amtMatch
      while ((amtMatch = amtRe.exec(section)) !== null) {
        const a = parseAmount(amtMatch[1])
        if (a > 0) amounts.push(a)
      }

      const baseYear  = periodEnd?.getFullYear()  ?? new Date().getFullYear()
      const baseMonth = periodEnd ? periodEnd.getMonth() + 1 : new Date().getMonth() + 1

      foundMonths.forEach((fm, i) => {
        const amt = amounts[i + 1]  // skip SALDO CAPITAL at index 0
        if (amt == null || amt <= 0) return
        const year = fm.month < baseMonth ? baseYear + 1 : baseYear
        upcomingPayments.push({
          dueDate: `${year}-${String(fm.month).padStart(2, '0')}-01`,
          amount: amt,
        })
      })
    }
  }

  // ── Process line by line ────────────────────────────────────────────────────
  const transactions: CartolaTransaction[] = []
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (SKIP_WORDS.some(w => upper.includes(w))) continue

    if (isUSD) {
      // ── USD transaction ───────────────────────────────────────────────────
      const um = line.match(USD_TX_RE)
      if (!um) continue

      const date = parseDate(um[1])
      if (!date) continue

      // Last column is USD amount; second-to-last is the original-currency amount
      const usdAmount = parseAmountDecimal(um[4])
      if (usdAmount <= 0) continue

      // description includes city/country — keep it as-is (informative)
      const desc = um[2].trim()

      transactions.push({
        id: nextId(),
        date,
        description: desc,
        amount: usdAmount,        // stored in USD (decimal)
        isInstallment: false,
        isPayment: false,
      })
    } else {
      // ── CLP: installment first ─────────────────────────────────────────────
      const im = line.match(INSTALL_RE)
      if (im) {
        const date = parseDate(im[1])
        if (!date) continue

        const desc    = im[2].trim()
        const origAmt = parseAmount(im[4])
        const monthly = parseAmount(im[7])
        const ratio   = im[6].split('/')
        const instNum = parseInt(ratio[0], 10)
        const instTot = parseInt(ratio[1], 10)

        if (monthly <= 0) continue

        transactions.push({
          id: nextId(),
          date,
          description: desc,
          amount: monthly,
          isInstallment: true,
          installmentNumber: instNum,
          installmentTotal: instTot,
          originalAmount: origAmt > 0 ? origAmt : undefined,
          isPayment: false,
        })
        continue
      }

      // ── CLP: single purchase ───────────────────────────────────────────────
      const sm = line.match(SINGLE_RE)
      if (sm) {
        const date = parseDate(sm[1])
        if (!date) continue

        const desc   = sm[2].trim()
        const amount = parseAmount(sm[3])

        if (SKIP_WORDS.some(w => desc.toUpperCase().includes(w))) continue
        if (amount <= 0) continue

        transactions.push({
          id: nextId(),
          date,
          description: desc,
          amount,
          isInstallment: false,
          isPayment: false,
        })
      }
    }
  }

  return {
    bank: 'santander',
    cardLastFour: lastFour,
    periodStart,
    periodEnd,
    totalAmount,
    currency,
    transactions,
    upcomingPayments: upcomingPayments.length > 0 ? upcomingPayments : undefined,
  }
}

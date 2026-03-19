// ── Santander parser ──────────────────────────────────────────────────────────
// Port of CartolaParser.parseSantander (Swift → TypeScript)
//
// Two line formats:
//   Installment: DD/MM/YY DESCRIPTION RATE% $ ORIG $ TOTAL N/T $MONTHLY
//   Single:      [CITY ]DD/MM/YY DESCRIPTION $AMOUNT

import type { CartolaParseResult, CartolaTransaction } from '../types'
import { parseAmount, parseDate, firstMatch, nextId } from './utils'

const SKIP_WORDS = [
  'MONTO CANCELADO', 'NOTA DE CREDITO', 'TRASPASO', 'INTERESES',
  'IMPUESTO', 'IMPTO', 'DEUDA INTERNA', 'MOVIMIENTOS TARJETA',
  'CARGOS, COMISIONES', 'PRODUCTOS O SERVICIOS', 'INFORMACION COMPRAS',
  'PERÍODO ANTERIOR', 'PERIODO ANTERIOR', 'PERÍODO ACTUAL', 'PERIODO ACTUAL',
  'TOTAL OPERACIONES',
]

// Installment: rate "%" as anchor — covers CUOTA FIJA, AVANCE CUOTAS, N CUOTAS TASA, etc.
// Groups: 1=date  2=description  3=rate(ignored)  4=origAmt  5=totalAmt  6=ratio  7=monthly
const INSTALL_RE = /(\d{2}\/\d{2}\/\d{2})(.+?)\s+([\d,]+)\s+%\s+\$\s*([\d.]+)\s+\$\s*([\d.]+)\s+(\d{1,2}\/\d{1,2})\s+\$([\d.,]+)/i

// Single purchase: [CITY ]DATE DESCRIPTION $AMOUNT (end of line)
// City prefix (e.g. "SANTIAGO", "LAS CONDES") may precede the date — skip it
const SINGLE_RE = /(?:^[A-ZÁÉÍÓÚ\s]+\s)?(\d{2}\/\d{2}\/\d{2})(?!\d)\s*([^$\n]+?)\s+\$([\d.,]+)$/

export function parseSantander(text: string, lastFour: string): CartolaParseResult {
  // ── Meta info ───────────────────────────────────────────────────────────────
  const closingPattern = /FECHA ESTADO DE CUENTA\s+(\d{2}\/\d{2}\/\d{4})/i
  const periodEnd = parseDate(firstMatch(closingPattern, text) ?? '') ?? undefined

  const periodStartPattern = /PER[ÍI]ODO FACTURADO\s+(\d{2}\/\d{2}\/\d{4})/i
  const periodStart = parseDate(firstMatch(periodStartPattern, text) ?? '') ?? undefined

  // Allow the $ amount to be on the same line OR the very next line.
  // [^$\n]* stops at the line boundary; \n?\s* then allows one optional newline
  // before the $. This avoids matching "11/03/2026" (a date on the next line
  // in the payment stub) because that line starts with a digit, not "$".
  const totalPattern = /MONTO TOTAL FACTURADO A PAGAR[^$\n]*\n?\s*\$\s*([\d.]+)/i
  const totalAmount = parseAmount(firstMatch(totalPattern, text) ?? '0')

  // ── Vencimiento Próximos 4 Meses ────────────────────────────────────────────
  // Santander shows month names (MARZO, ABRIL…) instead of explicit dates.
  // We find them in order of appearance, then pair with the $ amounts that follow,
  // skipping the first amount which is "SALDO CAPITAL" (total outstanding balance).
  const upcomingPayments: { dueDate: string; amount: number }[] = []
  const vencIdx = text.search(/VENCIMIENTO PR[ÓO]XIMOS 4 MESES/i)
  if (vencIdx !== -1) {
    const section = text.slice(vencIdx, vencIdx + 600)

    const MONTH_MAP: Record<string, number> = {
      ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
      JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
    }

    // Find each month name once (first occurrence), sort by position
    const foundMonths: { month: number; pos: number }[] = []
    for (const [name, num] of Object.entries(MONTH_MAP)) {
      const idx = section.indexOf(name)
      if (idx !== -1) foundMonths.push({ month: num, pos: idx })
    }
    foundMonths.sort((a, b) => a.pos - b.pos)

    // Collect all $ amounts in the section
    const amounts: number[] = []
    const amtRe = /\$\s*([\d.]+)/g
    let amtMatch
    while ((amtMatch = amtRe.exec(section)) !== null) {
      const a = parseAmount(amtMatch[1])
      if (a > 0) amounts.push(a)
    }

    // amounts[0] = SALDO CAPITAL (skip); amounts[1..N] map to months in order
    const baseYear  = periodEnd?.getFullYear()  ?? new Date().getFullYear()
    const baseMonth = periodEnd ? periodEnd.getMonth() + 1 : new Date().getMonth() + 1

    foundMonths.forEach((fm, i) => {
      const amt = amounts[i + 1]  // skip SALDO CAPITAL
      if (amt == null || amt <= 0) return
      // If the payment month is before the billing period close month, it's next year
      const year = fm.month < baseMonth ? baseYear + 1 : baseYear
      upcomingPayments.push({
        dueDate: `${year}-${String(fm.month).padStart(2, '0')}-01`,
        amount: amt,
      })
    })
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

    // ── Try installment regex first ─────────────────────────────────────────
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

    // ── Try single purchase regex ───────────────────────────────────────────
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

  return {
    bank: 'santander',
    cardLastFour: lastFour,
    periodStart,
    periodEnd,
    totalAmount,
    transactions,
    upcomingPayments: upcomingPayments.length > 0 ? upcomingPayments : undefined,
  }
}

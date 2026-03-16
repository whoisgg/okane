// ── Falabella parser ──────────────────────────────────────────────────────────
// Port of CartolaParser.parseFalabella (Swift → TypeScript)
//
// Line format: [CITY] DD/MM/YYYY MERCHANT T ORIG_AMT TOTAL NN/TT MON-YYYY MONTHLY
// Example: Santiago 03/09/2025 Colloky la dehesa T 102.180 102.180 06/06 sep-2025 17.030

import type { CartolaParseResult, CartolaTransaction } from '../types'
import { parseAmount, parseDate, firstMatch, nextId } from './utils'

export function parseFalabella(text: string, lastFour: string): CartolaParseResult {
  // ── Meta info ───────────────────────────────────────────────────────────────
  const closingPattern = /Fecha Facturaci[oó]n Estado de\s+(?:Cuenta[:\s]+)?(\d{2}\/\d{2}\/\d{4})/i
  const periodEnd = parseDate(firstMatch(closingPattern, text) ?? '') ?? undefined

  const periodStartPattern = /Per[ií]odo Facturado\s+(\d{2}\/\d{2}\/\d{4})/i
  const periodStart = parseDate(firstMatch(periodStartPattern, text) ?? '') ?? undefined

  const totalPattern = /Monto Total Facturado a Pagar\s*\$?([\d.]+)/i
  const totalAmount = parseAmount(firstMatch(totalPattern, text) ?? '0')

  // ── Transaction pattern ─────────────────────────────────────────────────────
  // Groups: 1=date  2=description  3=totalAmt  4=cuotaNum  5=cuotaTotal  6=monthlyCuota
  const txRE = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+T\s+[\d.,]+\s+([\d.,]+)\s+(\d{2})\/(\d{2})(?:\s+[a-zA-Z]+-\d{4}\s+([\d.,]+))?/g

  const transactions: CartolaTransaction[] = []
  let match: RegExpExecArray | null

  while ((match = txRE.exec(text)) !== null) {
    const date = parseDate(match[1])
    if (!date) continue

    const desc        = match[2].trim()
    const totalAmt    = parseAmount(match[3])
    const cuotaNum    = parseInt(match[4], 10)
    const cuotaTotal  = parseInt(match[5], 10)
    const isInstallment = cuotaTotal > 1
    const monthlyAmt  = match[6] ? parseAmount(match[6]) : totalAmt

    if (monthlyAmt <= 0) continue

    transactions.push({
      id: nextId(),
      date,
      description: desc,
      amount: monthlyAmt,
      isInstallment,
      installmentNumber: cuotaNum,
      installmentTotal: cuotaTotal,
      originalAmount: isInstallment ? totalAmt : undefined,
      isPayment: false,
    })
  }

  return {
    bank: 'falabella',
    cardLastFour: lastFour,
    periodStart,
    periodEnd,
    totalAmount,
    transactions: transactions.filter(t => !t.isPayment),
  }
}

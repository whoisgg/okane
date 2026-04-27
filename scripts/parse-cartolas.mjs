// One-off script: parse Santander CC PDFs from a folder, output JSON.
// Run: node scripts/parse-cartolas.mjs <folder> <last_four>

import fs from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('Usage: node parse-cartolas.mjs <folder> <last_four>')
  process.exit(1)
}
const [folder, lastFourArg] = args

// ── Parser helpers (ported from lib/parser/utils.ts + santander.ts) ───────────

function parseAmount(raw) {
  const cleaned = String(raw).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '')
  return parseInt(cleaned, 10) || 0
}
function parseAmountDecimal(raw) {
  const s = String(raw).replace(/[US$\s]/g, '')
  if (s.includes('.') && s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0
  return parseFloat(s) || 0
}
function parseDate(raw) {
  const parts = String(raw).trim().split('/')
  if (parts.length !== 3) return null
  const d = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  let y = parseInt(parts[2], 10)
  if (y < 100) y += 2000
  const date = new Date(y, m, d)
  return isNaN(date.getTime()) ? null : date
}
function firstMatch(pattern, text) {
  const m = text.match(pattern)
  return m ? m[1] : null
}

const SKIP_WORDS = [
  'MONTO CANCELADO', 'NOTA DE CREDITO', 'TRASPASO', 'INTERESES',
  'IMPUESTO', 'IMPTO', 'DEUDA INTERNA', 'MOVIMIENTOS TARJETA',
  'CARGOS, COMISIONES', 'PRODUCTOS O SERVICIOS', 'INFORMACION COMPRAS',
  'PERÍODO ANTERIOR', 'PERIODO ANTERIOR', 'PERÍODO ACTUAL', 'PERIODO ACTUAL',
  'TOTAL OPERACIONES', 'ABONO DE DIVISAS', 'TRASPASO DE DEUDA',
]

const INSTALL_RE = /(\d{2}\/\d{2}\/\d{2})(.+?)\s+([\d,]+)\s+%\s+\$\s*([\d.]+)\s+\$\s*([\d.]+)\s+(\d{1,2}\/\d{1,2})\s+\$([\d.,]+)/i
const SINGLE_RE = /(?:^[A-ZÁÉÍÓÚ\s]+\s)?(\d{2}\/\d{2}\/\d{2})(?!\d)\s*([^$\n]+?)\s+\$([\d.,]+)$/
const USD_TX_RE = /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)$/

function parseSantander(text, lastFour) {
  const isUSD = /ESTADO DE CUENTA INTERNACIONAL|US\$/i.test(text)
  const currency = isUSD ? 'USD' : 'CLP'

  const periodEnd = parseDate(firstMatch(/FECHA ESTADO DE CUENTA\s+(\d{2}\/\d{2}\/\d{4})/i, text) ?? '')
  const periodStart = parseDate(firstMatch(/PER[ÍI]ODO FACTURADO\s+(\d{2}\/\d{2}\/\d{4})/i, text) ?? '')

  let totalAmount = 0
  if (isUSD) {
    const m = text.match(/MONTO TOTAL FACTURADO A PAGAR[\s\S]{0,200}?US\$\s*([\d.,]+)/i)
    if (m) totalAmount = parseAmountDecimal(m[1])
  } else {
    const m = text.match(/MONTO TOTAL FACTURADO A PAGAR[^$\n]*\n?\s*\$\s*([\d.]+)/i)
    if (m) totalAmount = parseAmount(m[1])
  }

  let cupoUtilizado
  if (!isUSD) {
    const cupoM = text.match(/^CUPO TOTAL\s+\$\s*([\d.]+)\s+\$\s*([\d.]+)/im)
    if (cupoM) cupoUtilizado = parseAmount(cupoM[2])
  } else {
    const deudaM = text.match(/DEUDA TOTAL\s+US\$\s*([\d.,]+)/i)
    if (deudaM) cupoUtilizado = parseAmountDecimal(deudaM[1])
  }

  const upcomingPayments = []
  if (!isUSD) {
    const vencIdx = text.search(/VENCIMIENTO PR[ÓO]XIMOS 4 MESES/i)
    if (vencIdx !== -1) {
      const section = text.slice(vencIdx, vencIdx + 600)
      const MONTH_MAP = {
        ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
        JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
      }
      const foundMonths = []
      for (const [name, num] of Object.entries(MONTH_MAP)) {
        const idx = section.indexOf(name)
        if (idx !== -1) foundMonths.push({ month: num, pos: idx })
      }
      foundMonths.sort((a, b) => a.pos - b.pos)
      const amounts = []
      const amtRe = /\$\s*([\d.]+)/g
      let amtMatch
      while ((amtMatch = amtRe.exec(section)) !== null) {
        const a = parseAmount(amtMatch[1])
        if (a > 0) amounts.push(a)
      }
      const baseYear  = periodEnd?.getFullYear()  ?? new Date().getFullYear()
      const baseMonth = periodEnd ? periodEnd.getMonth() + 1 : new Date().getMonth() + 1
      foundMonths.forEach((fm, i) => {
        const amt = amounts[i + 1]
        if (amt == null || amt <= 0) return
        const year = fm.month < baseMonth ? baseYear + 1 : baseYear
        upcomingPayments.push({ dueDate: `${year}-${String(fm.month).padStart(2, '0')}-01`, amount: amt })
      })
    }
  }

  const transactions = []
  let txCounter = 0
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (SKIP_WORDS.some(w => upper.includes(w))) continue

    if (isUSD) {
      const um = line.match(USD_TX_RE)
      if (!um) continue
      const date = parseDate(um[1])
      if (!date) continue
      const usdAmount = parseAmountDecimal(um[4])
      if (usdAmount <= 0) continue
      transactions.push({ id: `tx-${++txCounter}`, date: date.toISOString().slice(0, 10), description: um[2].trim(), amount: usdAmount, isInstallment: false, isPayment: false })
    } else {
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
          id: `tx-${++txCounter}`,
          date: date.toISOString().slice(0, 10),
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
      const sm = line.match(SINGLE_RE)
      if (sm) {
        const date = parseDate(sm[1])
        if (!date) continue
        const desc   = sm[2].trim()
        const amount = parseAmount(sm[3])
        if (SKIP_WORDS.some(w => desc.toUpperCase().includes(w))) continue
        if (amount <= 0) continue
        transactions.push({
          id: `tx-${++txCounter}`,
          date: date.toISOString().slice(0, 10),
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
    periodStart: periodStart?.toISOString().slice(0, 10) ?? null,
    periodEnd: periodEnd?.toISOString().slice(0, 10) ?? null,
    totalAmount,
    cupoUtilizado: cupoUtilizado ?? null,
    currency,
    transactions,
    upcomingPayments: upcomingPayments.length > 0 ? upcomingPayments : null,
  }
}

// ── Santander visual-line reconstruction (mirrors lib/parser/index.ts) ────────

async function extractSantanderText(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Run everything on main thread (no worker) — simpler in Node.
  const pdf = await pdfjsLib.getDocument({
    data: buffer,
    isEvalSupported: false,
    disableWorker: true,
    useWorkerFetch: false,
    useSystemFonts: true,
  }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lineMap = new Map()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = item.str
      if (!str) continue
      const t = item.transform
      const x = t[4]
      const y = Math.round(t[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y).push({ x, str })
    }
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)
    for (const y of sortedY) {
      const segs = lineMap.get(y).sort((a, b) => a.x - b.x)
      const line = segs.map(s => s.str).join(' ').replace(/\s{2,}/g, ' ').trim()
      if (line) fullText += line + '\n'
    }
    fullText += '\n'
  }
  return fullText
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const files = (await fs.readdir(folder)).filter(f => f.toLowerCase().endsWith('.pdf'))
  const out = []

  for (const fname of files) {
    const fpath = path.join(folder, fname)
    process.stderr.write(`Parsing ${fname}... `)
    try {
      const buffer = new Uint8Array(await fs.readFile(fpath))
      const text = await extractSantanderText(buffer)
      const parsed = parseSantander(text, lastFourArg)
      process.stderr.write(`${parsed.transactions.length} txs, ${parsed.currency}, ${parsed.periodStart}→${parsed.periodEnd}, total ${parsed.totalAmount}\n`)
      out.push({ file: fname, ...parsed })
    } catch (e) {
      process.stderr.write(`ERROR: ${e.message}\n`)
      out.push({ file: fname, error: e.message })
    }
  }

  console.log(JSON.stringify(out, null, 2))
}

main()

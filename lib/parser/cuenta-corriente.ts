// ── Santander cuenta corriente: PDF cartola + XLSX movimientos parsers ────────
// Used by app/cuadre/page.tsx for bank-account reconciliation (NOT credit cards).

export interface CuentaCorrientePdfResult {
  accountNumber?: string
  cartolaNumber?: number
  periodStart?: Date
  periodEnd?: Date
  saldoFinal: number
}

export interface ExcelTx {
  date: Date
  description: string
  cargo: number
  abono: number
  saldo: number
}

export interface ExcelResult {
  accountNumber?: string
  periodStart?: Date
  periodEnd?: Date
  saldoActual: number
  transactions: ExcelTx[]
}

// ── PDF parser (Santander cuenta corriente cartola) ───────────────────────────
export function parseCuentaCorrientePDF(text: string): CuentaCorrientePdfResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  let periodStart: Date | undefined
  let periodEnd: Date | undefined
  let cartolaNumber: number | undefined
  let accountNumber: string | undefined
  let saldoFinal = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!accountNumber) {
      const m = line.match(/\b(\d-\d{3}-\d{5}-\d)\b/)
      if (m) accountNumber = m[1]
    }

    const dateM = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/)
    if (dateM) {
      periodStart = pdDate(dateM[1])
      periodEnd   = pdDate(dateM[2])
      const numM = line.match(/^(\d+)\s/)
      if (numM) cartolaNumber = parseInt(numM[1])
    }

    if (/SALDO INICIAL/i.test(line) && /SALDO FINAL/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nums = lines[j].match(/([\d.]+)/g)?.map(n => parseInt(n.replace(/\./g, ''), 10)).filter(n => !isNaN(n) && n >= 0)
        if (nums && nums.length >= 5) {
          saldoFinal = nums[nums.length - 1]
          break
        }
      }
    }

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

// ── Native XLSX parser (no library) ───────────────────────────────────────────
// XLSX = ZIP archive containing XML files. Browser DecompressionStream inflates
// the DEFLATE-compressed entries; minimal SAX-style XML parsing follows.

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

export async function parseMovimientosExcel(file: File): Promise<ExcelResult> {
  const buffer = await file.arrayBuffer()
  const bytes  = new Uint8Array(buffer)
  const files  = await readZip(bytes)

  const sharedStrings = files['xl/sharedStrings.xml'] ? parseSharedStrings(files['xl/sharedStrings.xml']) : []
  const sheetXML = files['xl/worksheets/sheet1.xml']
  if (!sheetXML) throw new Error('No se encontró la hoja de datos en el archivo Excel')

  const rows = parseSheetXML(sheetXML, sharedStrings)

  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => c.toLowerCase().includes('fecha'))) { headerIdx = i; break }
  }
  if (headerIdx === -1) throw new Error('No se encontró la fila de encabezados (Fecha, Detalle...)')

  let accountNumber: string | undefined
  for (let i = 0; i < headerIdx; i++) {
    const m = rows[i].join(' ').match(/(\d-\d{3}-\d{5}-\d)/)
    if (m) { accountNumber = m[1]; break }
  }

  const transactions: ExcelTx[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue
    const dateStr = row[0]
    let date: Date | undefined
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const p = dateStr.split('-')
      date = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    } else if (/^\d+$/.test(dateStr)) {
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

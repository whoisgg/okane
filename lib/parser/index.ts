// ── PDF text extraction + bank routing ────────────────────────────────────────
// This is a TypeScript port of CartolaParser.swift using pdfjs-dist.
// Also exports extractSantanderText for CC-cartola reconciliation.

import type { CartolaParseResult, BankType } from '../types'
import { parseFalabella } from './falabella'
import { parseSantander } from './santander'

// Load pdfjs dynamically (browser only)
async function getPdfJs() {
  const pdfjsLib = await import('pdfjs-dist')
  // Use local worker bundled by Next.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  return pdfjsLib
}

export async function parsePDFFile(file: File, bankHint?: BankType): Promise<CartolaParseResult> {
  const arrayBuffer = await file.arrayBuffer()
  const pdfjsLib = await getPdfJs()

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // First pass: raw item-by-item extraction (original method, used for Falabella + bank detection)
  const pageContents: any[] = []
  let rawText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageContents.push(content)
    rawText += content.items.map((item: any) => ('str' in item ? item.str : '')).join('\n') + '\n'
  }

  // Use explicit bank hint first, fall back to auto-detection
  const bank: BankType = (bankHint && bankHint !== 'unknown') ? bankHint : detectBank(rawText)
  const lastFour = extractLastFour(rawText, bank)

  // Santander PDFs have many tiny text items per visual line — reconstruct visual lines
  // by grouping items with the same y-coordinate before parsing.
  // Falabella uses raw extraction (unchanged, already works).
  let fullText = rawText
  if (bank === 'santander') {
    fullText = ''
    for (const content of pageContents) {
      const lineMap = new Map<number, { x: number; str: string }[]>()
      for (const item of content.items) {
        if (!('str' in item)) continue
        const str = (item as any).str as string
        if (!str) continue
        const transform = (item as any).transform as number[]
        const x = transform[4]
        const y = Math.round(transform[5])
        if (!lineMap.has(y)) lineMap.set(y, [])
        lineMap.get(y)!.push({ x, str })
      }
      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)
      for (const y of sortedY) {
        const segs = lineMap.get(y)!.sort((a, b) => a.x - b.x)
        const line = segs.map(s => s.str).join(' ').replace(/\s{2,}/g, ' ').trim()
        if (line) fullText += line + '\n'
      }
      fullText += '\n'
    }
  }

  switch (bank) {
    case 'falabella': return parseFalabella(fullText, lastFour)
    case 'santander': return parseSantander(fullText, lastFour)
    default:
      throw new Error('Banco no reconocido. Soportamos Falabella y Santander.')
  }
}

// ── Export raw text extraction for CC cartola reconciliation ──────────────────
// Uses the same Santander visual-line grouping so the CC summary table is intact.
export async function extractSantanderText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdfjsLib = await getPdfJs()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lineMap = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = (item as any).str as string
      if (!str) continue
      const transform = (item as any).transform as number[]
      const x = transform[4]
      const y = Math.round(transform[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push({ x, str })
    }
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a)
    for (const y of sortedY) {
      const segs = lineMap.get(y)!.sort((a, b) => a.x - b.x)
      const line = segs.map(s => s.str).join(' ').replace(/\s{2,}/g, ' ').trim()
      if (line) fullText += line + '\n'
    }
    fullText += '\n'
  }
  return fullText
}

function detectBank(text: string): BankType {
  if (/BancoFalabella|Banco Falabella|CMR/i.test(text)) return 'falabella'
  if (/Santander/i.test(text)) return 'santander'
  return 'unknown'
}

function extractLastFour(text: string, bank: BankType): string {
  if (bank === 'santander') {
    const m = text.match(/XXXX XXXX XXXX (\d{4})/)
    if (m) return m[1]
  }
  if (bank === 'falabella') {
    const m = text.match(/Contrato[:\s]+\S*\*+(\d{4})/i)
    if (m) return m[1]
  }
  const fallback = text.match(/\*{4,}(\d{4})/)
  return fallback ? fallback[1] : ''
}

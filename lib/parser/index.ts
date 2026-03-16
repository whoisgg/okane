// ── PDF text extraction + bank routing ────────────────────────────────────────
// This is a TypeScript port of CartolaParser.swift using pdfjs-dist.

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
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join('\n')
    fullText += pageText + '\n'
  }

  // Use explicit bank hint first, fall back to auto-detection
  const bank: BankType = (bankHint && bankHint !== 'unknown') ? bankHint : detectBank(fullText)
  const lastFour = extractLastFour(fullText, bank)

  switch (bank) {
    case 'falabella': return parseFalabella(fullText, lastFour)
    case 'santander': return parseSantander(fullText, lastFour)
    default:
      throw new Error('Banco no reconocido. Soportamos Falabella y Santander.')
  }
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

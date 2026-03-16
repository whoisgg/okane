// ── Shared parser helpers ─────────────────────────────────────────────────────

let _idCounter = 0
export function nextId(): string {
  return `tx-${++_idCounter}-${Date.now()}`
}

/** Parse Chilean amount string: "1.234.567" or "1,234" → number */
export function parseAmount(raw: string): number {
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')   // thousands separator in CLP
    .replace(/,/g, '')    // also strip commas
  return parseInt(cleaned, 10) || 0
}

/** Parse "DD/MM/YYYY" or "DD/MM/YY" → Date */
export function parseDate(raw: string): Date | null {
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return null
  const d = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1  // JS months are 0-indexed
  let y = parseInt(parts[2], 10)
  if (y < 100) y += 2000
  const date = new Date(y, m, d)
  return isNaN(date.getTime()) ? null : date
}

/** First regex match — returns capture group 1 */
export function firstMatch(pattern: RegExp, text: string): string | null {
  const m = text.match(pattern)
  return m ? m[1] : null
}

// ── Number formatting — matches iOS Decimal extensions ────────────────────────

export function clpFormatted(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

export function clpAbbreviated(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${Math.round(abs)}`
}

export function usdFormatted(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function shortMonthLabel(month: number, year: number): string {
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return names[month - 1] ?? ''
}

export function monthYearLabel(month: number, year: number): string {
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return `${names[month - 1]} ${year}`
}

export function isoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// ── Class name helper ─────────────────────────────────────────────────────────
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

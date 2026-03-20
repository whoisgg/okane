// Shared monochrome SVG category icons.
// All icons use stroke-based style (no fill) for a consistent look.

const S = {
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export default function CatIcon({ cat, className = 'h-5 w-5' }: { cat: string; className?: string }) {
  switch (cat) {

    case 'hogar':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <path d="M9 22V12h6v10"/>
        </svg>
      )

    case 'comida':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          {/* fork */}
          <path d="M8 2v20M5 2v4a3 3 0 006 0V2"/>
          {/* knife */}
          <path d="M16 2v20M19 2c0 4-1.5 5.5-3 5.5"/>
        </svg>
      )

    case 'salud':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          <path d="M12 8v8M8 12h8"/>
        </svg>
      )

    case 'transporte':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <rect x="1" y="3" width="15" height="13" rx="1"/>
          <path d="M16 8h4l3 5v4h-7V8z"/>
          <circle cx="5.5" cy="18.5" r="2.5"/>
          <circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
      )

    case 'entretenimiento':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <circle cx="12" cy="12" r="10"/>
          <polygon points="10 8 16 12 10 16 10 8"/>
        </svg>
      )

    case 'ropa':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M9 2a3 3 0 006 0h3l4 5-4 3V20H6V10L2 7l4-5h3z"/>
        </svg>
      )

    case 'educacion':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
        </svg>
      )

    case 'tecnologia':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
        </svg>
      )

    case 'viajes':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4s-2 1-3.5 2.5L11 10 2.8 8.2 2 9l7 3.7-2 3.6-3-.4L3 17l3.5 1 1 3.5 1.5-1-.4-3 3.6-2L16 22l.8-.8z"/>
        </svg>
      )

    case 'servicios':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
        </svg>
      )

    case 'otros':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 01-8 0"/>
        </svg>
      )

    case 'suscripciones':
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <path d="M17 2.1l4 4-4 4"/>
          <path d="M3 12.2v-2a4 4 0 014-4h12.8M7 21.9l-4-4 4-4"/>
          <path d="M21 11.8v2a4 4 0 01-4 4H4.2"/>
        </svg>
      )

    default:
      return (
        <svg className={className} viewBox="0 0 24 24" {...S}>
          <circle cx="5" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="19" cy="12" r="1" fill="currentColor"/>
        </svg>
      )
  }
}

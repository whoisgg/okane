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

// ── Auto-categorization from merchant / transaction description ───────────────
// Returns one of the canonical category keys used throughout the app
export function categorizeTransaction(description: string): string {
  const d = description.toLowerCase()

  // ── Comida ──────────────────────────────────────────────────────────────────
  if (/uber.?eat|ubereats|rappi|pedidos\.ya|pedidosya|ifood|glovo|delivery|junaeb/.test(d)) return 'comida'
  if (/mcdonalds|mc donald|burger king|wendy|subway|domino|pizza|sushi|kfc|taco bell|papa john/.test(d)) return 'comida'
  if (/starbucks|dunkin|juan valdez|cafe|café|panaderia|panadería|fuente de soda/.test(d)) return 'comida'
  if (/lider|jumbo|santa isabel|tottus|unimarc|walmart|acuenta|ekono|easy food|supermercado/.test(d)) return 'comida'
  if (/restaurant|restoran|sushi|marisqueria|picada|comedor|cevicheria/.test(d)) return 'comida'

  // ── Transporte ──────────────────────────────────────────────────────────────
  if (/\buber\b(?!.?eat)/.test(d)) return 'transporte'
  if (/cabify|didi|beat|indriver|taxi|transfer/.test(d)) return 'transporte'
  if (/shell|copec|petrobras|enex|bp |gulf |repsol|gasolinera|bencina|bencinera/.test(d)) return 'transporte'
  if (/metro |bip |transantiago|redbus|tur bus|turbus|pullman|flixbus/.test(d)) return 'transporte'
  if (/peaje|autopista|costanera norte|vespucio|americo vespucio|route 68|ruta 68/.test(d)) return 'transporte'
  if (/parking|estacionamiento|parquimetro|urbanparq|easypark/.test(d)) return 'transporte'

  // ── Entretención ────────────────────────────────────────────────────────────
  if (/netflix|hbo|disney|paramount|apple tv|apple\.tv|amazon prime|prime video/.test(d)) return 'entretenimiento'
  if (/spotify|apple.?music|deezer|tidal|soundcloud/.test(d)) return 'entretenimiento'
  if (/twitch|youtube|steam|playstation|xbox|nintendo|epic games|blizzard|riot games/.test(d)) return 'entretenimiento'
  if (/crunchyroll|mubi|filmin|star\+|starplus/.test(d)) return 'entretenimiento'
  if (/cine|cinemark|cinehoyts|hoyts|showcase|cinema/.test(d)) return 'entretenimiento'
  if (/ticketmaster|ticketek|puntoticket|feria|festival|concierto/.test(d)) return 'entretenimiento'

  // ── Tecnología ──────────────────────────────────────────────────────────────
  if (/apple\.com|apple store|icloud|itunes/.test(d)) return 'tecnologia'
  if (/microsoft|azure|office 365|m365/.test(d)) return 'tecnologia'
  if (/google|g suite|workspace/.test(d)) return 'tecnologia'
  if (/amazon web|aws |vercel|github|digitalocean|cloudflare|heroku|railway/.test(d)) return 'tecnologia'
  if (/openai|chatgpt|anthropic|midjourney/.test(d)) return 'tecnologia'
  if (/adobe|figma|notion|dropbox|slack|zoom|loom|canva/.test(d)) return 'tecnologia'
  if (/entel|movistar|claro|wom|vtr|gtd|mundo pacífico|mundo pacifico/.test(d)) return 'tecnologia'

  // ── Salud ───────────────────────────────────────────────────────────────────
  if (/farmacia|salcobrand|cruz verde|ahumada|knop|mifarma/.test(d)) return 'salud'
  if (/clinica|clínica|hospital|centro medico|centro médico|posta/.test(d)) return 'salud'
  if (/doctor|médico|medico|dentist|dentista|optica|óptica|laboratorio|examenes|exámenes/.test(d)) return 'salud'
  if (/bupa|fonasa|isapre|banmedica|consalud|colmena|cruz blanca/.test(d)) return 'salud'
  if (/gimnasio|gym |smartfit|bodytech|elitecenter/.test(d)) return 'salud'

  // ── Hogar ───────────────────────────────────────────────────────────────────
  if (/homecenter|easy |leroy merlin|construmart|chilemat/.test(d)) return 'hogar'
  if (/enel|cgecl|cge |metrogas|abastible|gasco|lipigas/.test(d)) return 'hogar'
  if (/aguas andinas|essal|essbio|aguas\./.test(d)) return 'hogar'
  if (/arriendo|renta |condominio|gastos comunes|administracion|administración/.test(d)) return 'hogar'
  if (/ikea|paris home|falabella home|corona |easy home/.test(d)) return 'hogar'

  // ── Ropa ────────────────────────────────────────────────────────────────────
  if (/zara|h&m|\bhm\b|mango|forever 21|topshop|pull.?bear|bershka|massimo dutti/.test(d)) return 'ropa'
  if (/adidas|nike|puma|reebok|new balance|converse|vans|under armour/.test(d)) return 'ropa'
  if (/forus|bata|flexi|victoria secret|tricot|corona ropa|paris ropa|falabella ropa/.test(d)) return 'ropa'

  // ── Educación ───────────────────────────────────────────────────────────────
  if (/universidad|college|colegio|school|instituto|preuniversitario|prepa/.test(d)) return 'educacion'
  if (/udemy|coursera|duolingo|babbel|platzi|linkedin learning/.test(d)) return 'educacion'
  if (/kindle|amazon book|libreria|librería|fnac/.test(d)) return 'educacion'

  // ── Viajes ──────────────────────────────────────────────────────────────────
  if (/airbnb|booking\.com|hotels\.com|trivago|expedia|despegar/.test(d)) return 'viajes'
  if (/latam|sky airline|jetsmart|american airlines|delta |lufthansa|iberia |lan /.test(d)) return 'viajes'
  if (/hotel|hostal|hostel|lodge|resort/.test(d)) return 'viajes'
  if (/aeropuerto|airport|duty free/.test(d)) return 'viajes'

  return 'otros'
}

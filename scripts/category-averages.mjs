// Compute average monthly spending per category from parsed cartolas.
// Uses both 7863 (WB) and 2147 (WL) — 5 cartolas each = 5 months of history.

import fs from 'node:fs/promises'

function categorize(description) {
  const d = (description || '').toLowerCase()
  if (/uber.?eat|ubereats|rappi|pedidos\.ya|pedidosya|ifood|glovo|delivery|junaeb/.test(d)) return 'comida'
  if (/mcdonalds|mc donald|burger king|wendy|subway|domino|pizza|sushi|kfc|taco bell|papa john|arcos dorados/.test(d)) return 'comida'
  if (/starbucks|dunkin|juan valdez|cafe|café|panaderia|panadería|fuente de soda|donde jose/.test(d)) return 'comida'
  if (/lider|jumbo|santa isabel|tottus|unimarc|walmart|acuenta|ekono|easy food|supermercado|hip lider/.test(d)) return 'comida'
  if (/restaurant|restoran|sushi|marisqueria|picada|comedor|cevicheria|tanta|mille\s?fleur/.test(d)) return 'comida'
  if (/\buber\b(?!.?eat)/.test(d)) return 'transporte'
  if (/cabify|didi|beat|indriver|taxi|transfer/.test(d)) return 'transporte'
  if (/shell|copec|petrobras|enex|bp |gulf |repsol|gasolinera|bencina|bencinera/.test(d)) return 'transporte'
  if (/metro |bip |transantiago|redbus|tur bus|turbus|pullman|flixbus/.test(d)) return 'transporte'
  if (/peaje|autopista|costanera norte|vespucio|americo vespucio|route 68|ruta 68/.test(d)) return 'transporte'
  if (/parking|estacionamiento|parquimetro|urbanparq|easypark/.test(d)) return 'transporte'
  if (/netflix|hbo|disney|paramount|apple tv|apple\.tv|amazon prime|prime video/.test(d)) return 'entretenimiento'
  if (/spotify|apple.?music|deezer|tidal|soundcloud/.test(d)) return 'entretenimiento'
  if (/twitch|youtube|steam|playstation|xbox|nintendo|epic games|blizzard|riot games/.test(d)) return 'entretenimiento'
  if (/crunchyroll|mubi|filmin|star\+|starplus/.test(d)) return 'entretenimiento'
  if (/cine|cinemark|cinehoyts|hoyts|showcase|cinema/.test(d)) return 'entretenimiento'
  if (/ticketmaster|ticketek|puntoticket|feria|festival|concierto/.test(d)) return 'entretenimiento'
  if (/apple\.com|apple store|icloud|itunes|compra apple/.test(d)) return 'tecnologia'
  if (/microsoft|azure|office 365|m365/.test(d)) return 'tecnologia'
  if (/google|g suite|workspace/.test(d)) return 'tecnologia'
  if (/amazon web|aws |vercel|github|digitalocean|cloudflare|heroku|railway/.test(d)) return 'tecnologia'
  if (/openai|chatgpt|anthropic|midjourney/.test(d)) return 'tecnologia'
  if (/adobe|figma|notion|dropbox|slack|zoom|loom|canva/.test(d)) return 'tecnologia'
  if (/entel|movistar|claro|wom|vtr|gtd|mundo pacífico|mundo pacifico/.test(d)) return 'tecnologia'
  if (/farmacia|salcobrand|cruz verde|ahumada|knop|mifarma/.test(d)) return 'salud'
  if (/clinica|clínica|hospital|centro medico|centro médico|posta/.test(d)) return 'salud'
  if (/doctor|médico|medico|dentist|dentista|optica|óptica|laboratorio|examenes|exámenes/.test(d)) return 'salud'
  if (/bupa|fonasa|isapre|banmedica|consalud|colmena|cruz blanca|meds/.test(d)) return 'salud'
  if (/gimnasio|gym |smartfit|bodytech|elitecenter|kinflex/.test(d)) return 'salud'
  if (/homecenter|easy |leroy merlin|construmart|chilemat|sodimac/.test(d)) return 'hogar'
  if (/enel|cgecl|cge |metrogas|abastible|gasco|lipigas/.test(d)) return 'hogar'
  if (/aguas andinas|essal|essbio|aguas\./.test(d)) return 'hogar'
  if (/arriendo|renta |condominio|gastos comunes|administracion|administración|edifito/.test(d)) return 'hogar'
  if (/ikea|paris home|falabella home|corona |easy home|electromundo/.test(d)) return 'hogar'
  if (/zara|h&m|\bhm\b|mango|forever 21|topshop|pull.?bear|bershka|massimo dutti|saville row|colloky/.test(d)) return 'ropa'
  if (/adidas|nike|puma|reebok|new balance|converse|vans|under armour/.test(d)) return 'ropa'
  if (/forus|bata|flexi|victoria secret|tricot|corona ropa|paris ropa|falabella ropa/.test(d)) return 'ropa'
  if (/universidad|college|colegio|school|instituto|preuniversitario|prepa/.test(d)) return 'educacion'
  if (/udemy|coursera|duolingo|babbel|platzi|linkedin learning/.test(d)) return 'educacion'
  if (/kindle|amazon book|libreria|librería|fnac/.test(d)) return 'educacion'
  if (/airbnb|booking\.com|hotels\.com|trivago|expedia|despegar/.test(d)) return 'viajes'
  if (/latam|sky airline|jetsmart|american airlines|delta |lufthansa|iberia |lan /.test(d)) return 'viajes'
  if (/hotel|hostal|hostel|lodge|resort|courtyard/.test(d)) return 'viajes'
  if (/aeropuerto|airport|duty free/.test(d)) return 'viajes'
  return 'otros'
}

const json7863 = JSON.parse(await fs.readFile('C:\\Users\\ggoyc\\AppData\\Local\\Temp\\cartolas-7863.json', 'utf8'))
const json2147 = JSON.parse(await fs.readFile('C:\\Users\\ggoyc\\AppData\\Local\\Temp\\cartolas-2147.json', 'utf8'))

// Bucket each tx into (period_end YYYY-MM, category) — period_end is the cartola's closing month.
const byMonthCategory = new Map() // key = "YYYY-MM|category" → sum
const months = new Set()

function ingest(cartolas) {
  for (const c of cartolas) {
    if (c.error || c.currency !== 'CLP') continue
    const monthKey = c.periodEnd.slice(0, 7) // YYYY-MM
    months.add(monthKey)
    for (const t of c.transactions) {
      const cat = categorize(t.description)
      const k = `${monthKey}|${cat}`
      byMonthCategory.set(k, (byMonthCategory.get(k) ?? 0) + Number(t.amount))
    }
  }
}
ingest(json7863)
ingest(json2147)

// Aggregate per category across months
const byCategory = new Map() // category → array of monthly totals
for (const [key, sum] of byMonthCategory) {
  const [, cat] = key.split('|')
  if (!byCategory.has(cat)) byCategory.set(cat, [])
  byCategory.get(cat).push(sum)
}

const monthCount = months.size
console.log(`Months covered: ${monthCount} (${[...months].sort().join(', ')})`)
console.log()
console.log('Category | Promedio mensual | Detalle por mes')
console.log('---|---:|---')

const result = []
for (const [cat, sums] of [...byCategory.entries()].sort((a, b) => {
  const avgA = a[1].reduce((s, n) => s + n, 0) / monthCount
  const avgB = b[1].reduce((s, n) => s + n, 0) / monthCount
  return avgB - avgA
})) {
  // Pad with zeros for months with no spending in this category
  const total = sums.reduce((s, n) => s + n, 0)
  const avg = Math.round(total / monthCount)
  result.push({ category: cat, monthly_limit: avg })
  console.log(`${cat} | ${avg.toLocaleString('es-CL')} | ${sums.map(n => Math.round(n).toLocaleString('es-CL')).join(' / ')}`)
}

console.log()
console.log('JSON for SQL inserts:')
console.log(JSON.stringify(result, null, 2))

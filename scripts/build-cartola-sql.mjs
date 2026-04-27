// Reads parsed cartola JSONs and emits SQL inserts for cartola_uploads + transactions.
// Skips cartolas whose period_end is already in DB (provided via SKIP_PERIOD_ENDS env per card).

import fs from 'node:fs/promises'

const USER_ID = '8e8b6d1e-1348-4d0e-9f43-a17299e19adf'
const CARD_BY_LAST_FOUR = {
  '7863': '53191a14-ce46-478e-b045-395c8d002385',
  '2147': 'fefb60c6-7b6b-4152-b5e6-08b2745c66c6',
}

// period_end values already in DB (CLP only) — skip these
const ALREADY_UPLOADED = {
  '7863': new Set(['2026-02-24', '2026-03-23']),
  '2147': new Set(['2025-12-22', '2026-02-23']),
}

// ── Auto-categorization (port of lib/utils.ts categorizeTransaction) ──────────
function categorize(description) {
  const d = (description || '').toLowerCase()
  if (/uber.?eat|ubereats|rappi|pedidos\.ya|pedidosya|ifood|glovo|delivery|junaeb/.test(d)) return 'comida'
  if (/mcdonalds|mc donald|burger king|wendy|subway|domino|pizza|sushi|kfc|taco bell|papa john/.test(d)) return 'comida'
  if (/starbucks|dunkin|juan valdez|cafe|café|panaderia|panadería|fuente de soda/.test(d)) return 'comida'
  if (/lider|jumbo|santa isabel|tottus|unimarc|walmart|acuenta|ekono|easy food|supermercado/.test(d)) return 'comida'
  if (/restaurant|restoran|sushi|marisqueria|picada|comedor|cevicheria/.test(d)) return 'comida'
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
  if (/apple\.com|apple store|icloud|itunes/.test(d)) return 'tecnologia'
  if (/microsoft|azure|office 365|m365/.test(d)) return 'tecnologia'
  if (/google|g suite|workspace/.test(d)) return 'tecnologia'
  if (/amazon web|aws |vercel|github|digitalocean|cloudflare|heroku|railway/.test(d)) return 'tecnologia'
  if (/openai|chatgpt|anthropic|midjourney/.test(d)) return 'tecnologia'
  if (/adobe|figma|notion|dropbox|slack|zoom|loom|canva/.test(d)) return 'tecnologia'
  if (/entel|movistar|claro|wom|vtr|gtd|mundo pacífico|mundo pacifico/.test(d)) return 'tecnologia'
  if (/farmacia|salcobrand|cruz verde|ahumada|knop|mifarma/.test(d)) return 'salud'
  if (/clinica|clínica|hospital|centro medico|centro médico|posta/.test(d)) return 'salud'
  if (/doctor|médico|medico|dentist|dentista|optica|óptica|laboratorio|examenes|exámenes/.test(d)) return 'salud'
  if (/bupa|fonasa|isapre|banmedica|consalud|colmena|cruz blanca/.test(d)) return 'salud'
  if (/gimnasio|gym |smartfit|bodytech|elitecenter/.test(d)) return 'salud'
  if (/homecenter|easy |leroy merlin|construmart|chilemat/.test(d)) return 'hogar'
  if (/enel|cgecl|cge |metrogas|abastible|gasco|lipigas/.test(d)) return 'hogar'
  if (/aguas andinas|essal|essbio|aguas\./.test(d)) return 'hogar'
  if (/arriendo|renta |condominio|gastos comunes|administracion|administración/.test(d)) return 'hogar'
  if (/ikea|paris home|falabella home|corona |easy home/.test(d)) return 'hogar'
  if (/zara|h&m|\bhm\b|mango|forever 21|topshop|pull.?bear|bershka|massimo dutti/.test(d)) return 'ropa'
  if (/adidas|nike|puma|reebok|new balance|converse|vans|under armour/.test(d)) return 'ropa'
  if (/forus|bata|flexi|victoria secret|tricot|corona ropa|paris ropa|falabella ropa/.test(d)) return 'ropa'
  if (/universidad|college|colegio|school|instituto|preuniversitario|prepa/.test(d)) return 'educacion'
  if (/udemy|coursera|duolingo|babbel|platzi|linkedin learning/.test(d)) return 'educacion'
  if (/kindle|amazon book|libreria|librería|fnac/.test(d)) return 'educacion'
  if (/airbnb|booking\.com|hotels\.com|trivago|expedia|despegar/.test(d)) return 'viajes'
  if (/latam|sky airline|jetsmart|american airlines|delta |lufthansa|iberia |lan /.test(d)) return 'viajes'
  if (/hotel|hostal|hostel|lodge|resort/.test(d)) return 'viajes'
  if (/aeropuerto|airport|duty free/.test(d)) return 'viajes'
  return 'otros'
}

// SQL escaping — single quotes doubled, backslashes preserved (Postgres standard)
function q(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

async function processFile(jsonPath, lastFour) {
  const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
  const cardId = CARD_BY_LAST_FOUR[lastFour]
  const skip = ALREADY_UPLOADED[lastFour]
  const sqls = []
  let cartolaCount = 0
  let txCount = 0

  for (const c of data) {
    if (c.error) continue
    if (skip.has(c.periodEnd)) {
      console.error(`SKIP ${c.file} (already in DB: period_end ${c.periodEnd})`)
      continue
    }
    if (c.currency !== 'CLP') {
      console.error(`SKIP ${c.file} (USD not in this batch)`)
      continue
    }

    const upcomingJson = c.upcomingPayments ? `'${JSON.stringify(c.upcomingPayments).replace(/'/g, "''")}'::jsonb` : 'null'

    // INSERT cartola_upload, return id into a temp table style — use a CTE per file
    const cteName = `up_${lastFour}_${c.periodEnd.replace(/-/g, '')}`
    const txValues = c.transactions.map(t => {
      const cat = categorize(t.description)
      return `(${q(USER_ID)}, ${q(t.amount)}, 'CLP', 'expense', ${q(cat)}, ${q(t.description)}, ${q(t.date)}, ${q(cardId)}, ${q(t.isInstallment)}, ${q(t.installmentNumber ?? null)}, ${q(t.installmentTotal ?? null)}, ${q(t.originalAmount ?? null)}, true, 'matched', (select id from ${cteName}))`
    }).join(',\n  ')

    const sql = `with ${cteName} as (
  insert into cartola_uploads (user_id, credit_card_id, bank_name, card_last_four, period_start, period_end, total_amount, transaction_count, matched_count, status, currency, upcoming_amounts)
  values (${q(USER_ID)}, ${q(cardId)}, 'santander', ${q(lastFour)}, ${q(c.periodStart)}, ${q(c.periodEnd)}, ${q(c.totalAmount)}, ${q(c.transactions.length)}, ${q(c.transactions.length)}, 'procesada', 'CLP', ${upcomingJson})
  returning id
)
insert into transactions (user_id, amount, currency, type, category, description, date, credit_card_id, is_installment, installment_number, installment_total, original_amount, is_from_cartola, match_status, cartola_upload_id)
values
  ${txValues};
`
    sqls.push(sql)
    cartolaCount++
    txCount += c.transactions.length
    console.error(`PREP ${c.file}: ${c.transactions.length} txs, total ${c.totalAmount} CLP, period ${c.periodStart}→${c.periodEnd}`)
  }

  console.error(`\n[${lastFour}] ${cartolaCount} cartolas, ${txCount} transactions to insert.\n`)
  return sqls
}

const all = []
all.push(...await processFile('C:\\Users\\ggoyc\\AppData\\Local\\Temp\\cartolas-7863.json', '7863'))
all.push(...await processFile('C:\\Users\\ggoyc\\AppData\\Local\\Temp\\cartolas-2147.json', '2147'))

// Write one file per cartola for chunked execution
const outDir = 'C:\\Users\\ggoyc\\AppData\\Local\\Temp\\cartola-sqls'
await fs.mkdir(outDir, { recursive: true })
for (let i = 0; i < all.length; i++) {
  const fname = `${outDir}\\cartola-${String(i + 1).padStart(2, '0')}.sql`
  await fs.writeFile(fname, all[i], 'utf8')
  console.error(`Wrote ${fname} (${all[i].length} chars)`)
}

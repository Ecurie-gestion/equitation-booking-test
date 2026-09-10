const { createClient } = require('@supabase/supabase-js')
const { checkAdminAuth, getValidToken } = require('./lib/google-auth-helpers')

// Synchronisation "de rattrapage" : envoie vers Google Agenda tout ce qui
// existe déjà dans le site (créneaux libres à venir, cours fixes actifs,
// stages/concours/événements à venir) et qui n'a jamais été synchronisé
// (créé avant la mise en place de la synchro, donc sans gcal_event_id).
// À lancer une seule fois après la connexion du compte Google — les
// créations/modifications/suppressions futures se synchronisent ensuite
// automatiquement au fil de l'eau.

const JOURS_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function prochaineDate(jourSemaine) {
  const jour = new Date()
  const diff = (jourSemaine - jour.getDay() + 7) % 7
  jour.setDate(jour.getDate() + diff)
  const y = jour.getFullYear()
  const m = String(jour.getMonth() + 1).padStart(2, '0')
  const d = String(jour.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function lendemain(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function creerEvenementGoogle(token, body) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  return res.ok ? data.id : null
}

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const auth = await checkAdminAuth(supabase, event)
  if (!auth.ok) return { statusCode: auth.statusCode, body: auth.body }

  const token = await getValidToken(supabase)
  if (!token) return { statusCode: 401, body: 'Non connecté à Google' }

  const today = new Date().toISOString().slice(0, 10)
  let syncedSlots = 0, syncedFixes = 0, syncedEvents = 0, errors = 0

  // 1. Créneaux libres à venir, jamais synchronisés
  const { data: slots } = await supabase
    .from('slots_with_availability')
    .select('*')
    .gte('date', today)
    .is('gcal_event_id', null)

  for (const slot of (slots || [])) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('child_name, parent_name')
      .eq('slot_id', slot.id)

    const description = bookings && bookings.length > 0
      ? `${slot.booked_count}/${slot.max_places} inscrits\n\n` +
        bookings.map((b, i) => `${i + 1}. ${b.child_name} (${b.parent_name})`).join('\n')
      : `0/${slot.max_places} inscrits`

    const id = await creerEvenementGoogle(token, {
      summary: slot.title,
      description,
      start: { dateTime: `${slot.date}T${slot.time_start}`, timeZone: 'Europe/Brussels' },
      end: { dateTime: `${slot.date}T${slot.time_end}`, timeZone: 'Europe/Brussels' }
    })
    if (id) {
      await supabase.from('slots').update({ gcal_event_id: id }).eq('id', slot.id)
      syncedSlots++
    } else {
      errors++
    }
  }

  // 2. Cours fixes actifs, jamais synchronisés
  const { data: fixes } = await supabase
    .from('creneaux_fixes')
    .select('*')
    .eq('actif', true)
    .is('gcal_event_id', null)

  for (const cr of (fixes || [])) {
    const dateDebut = prochaineDate(cr.jour_semaine)
    const id = await creerEvenementGoogle(token, {
      summary: cr.niveaux || 'Cours fixe',
      description: cr.moniteur ? `Cours fixe — ${cr.moniteur}` : 'Cours fixe',
      start: { dateTime: `${dateDebut}T${cr.heure_debut}`, timeZone: 'Europe/Brussels' },
      end: { dateTime: `${dateDebut}T${cr.heure_fin}`, timeZone: 'Europe/Brussels' },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${JOURS_RRULE[cr.jour_semaine]}`]
    })
    if (id) {
      await supabase.from('creneaux_fixes').update({ gcal_event_id: id }).eq('id', cr.id)
      syncedFixes++
    } else {
      errors++
    }
  }

  // 3. Stages / concours / événements à venir, jamais synchronisés
  const { data: evenements } = await supabase
    .from('events')
    .select('*')
    .gte('date_end', today)
    .is('gcal_event_id', null)

  for (const ev of (evenements || [])) {
    const icone = ev.type === 'stage' ? '🏕️' : ev.type === 'concours' ? '🏆' : '📌'
    const id = await creerEvenementGoogle(token, {
      summary: `${icone} ${ev.title}`,
      description: ev.description || '',
      start: { date: ev.date_start },
      end: { date: lendemain(ev.date_end) }
    })
    if (id) {
      await supabase.from('events').update({ gcal_event_id: id }).eq('id', ev.id)
      syncedEvents++
    } else {
      errors++
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncedSlots, syncedFixes, syncedEvents, errors })
  }
}

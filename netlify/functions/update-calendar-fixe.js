const { createClient } = require('@supabase/supabase-js')
const { checkAdminAuth, getValidToken, deleteGoogleEvent } = require('./lib/google-auth-helpers')

// Synchronise un COURS FIXE (créneau qui revient chaque semaine) avec Google
// Agenda, sous la forme d'un événement récurrent (répété chaque semaine,
// sans date de fin — tant que le créneau existe et est actif).
//
// Contrairement aux créneaux libres (un événement = une séance précise),
// ici un seul événement Google représente tout le cours récurrent : le
// modifier met à jour toutes les occurrences futures, le supprimer les
// retire toutes.

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

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const auth = await checkAdminAuth(supabase, event)
  if (!auth.ok) return { statusCode: auth.statusCode, body: auth.body }

  const { creneau_fixe_id, action } = JSON.parse(event.body)

  const token = await getValidToken(supabase)
  if (!token) return { statusCode: 401, body: 'Non connecté à Google' }

  const { data: cr } = await supabase
    .from('creneaux_fixes')
    .select('*')
    .eq('id', creneau_fixe_id)
    .single()

  if (!cr) return { statusCode: 404, body: 'Créneau fixe introuvable' }

  // Suppression (ou désactivation) : retire l'événement récurrent de Google
  // Agenda. Appelé AVANT la suppression/désactivation en base.
  if (action === 'delete') {
    const result = await deleteGoogleEvent(token, cr.gcal_event_id)
    if (!result.ok) return { statusCode: 502, body: 'Erreur lors de la suppression dans Google Agenda' }
    return { statusCode: 200, body: 'Événement récurrent supprimé de Google Agenda' }
  }

  const dateDebut = prochaineDate(cr.jour_semaine)
  const startDateTime = `${dateDebut}T${cr.heure_debut}`
  const endDateTime = `${dateDebut}T${cr.heure_fin}`
  const summary = cr.niveaux || 'Cours fixe'
  const description = cr.moniteur ? `Cours fixe — ${cr.moniteur}` : 'Cours fixe'

  const eventBody = {
    summary,
    description,
    start: { dateTime: startDateTime, timeZone: 'Europe/Brussels' },
    end: { dateTime: endDateTime, timeZone: 'Europe/Brussels' },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${JOURS_RRULE[cr.jour_semaine]}`]
  }

  if (action === 'create' || !cr.gcal_event_id) {
    const createRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody)
      }
    )
    const createdEvent = await createRes.json()
    if (!createRes.ok) return { statusCode: 502, body: "Erreur lors de la création dans Google Agenda" }
    await supabase.from('creneaux_fixes').update({ gcal_event_id: createdEvent.id }).eq('id', creneau_fixe_id)
  } else {
    const updateRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${cr.gcal_event_id}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody)
      }
    )
    if (!updateRes.ok) return { statusCode: 502, body: "Erreur lors de la mise à jour dans Google Agenda" }
  }

  return { statusCode: 200, body: 'Agenda mis à jour' }
}

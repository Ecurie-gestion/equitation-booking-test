const { createClient } = require('@supabase/supabase-js')
const { checkAdminAuth, getValidToken, deleteGoogleEvent } = require('./lib/google-auth-helpers')

// Synchronise un STAGE / CONCOURS / ÉVÉNEMENT avec Google Agenda, sous la
// forme d'un événement "journée entière" (ou plusieurs jours si le stage
// dure plusieurs jours). Il n'y a pas de modification possible pour ces
// événements dans le site (seulement création et suppression), donc cette
// fonction ne gère que ces deux actions.

// Google Agenda attend une date de fin EXCLUSIVE pour les événements
// "journée entière" (le lendemain du dernier jour).
function lendemain(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const auth = await checkAdminAuth(supabase, event)
  if (!auth.ok) return { statusCode: auth.statusCode, body: auth.body }

  const { event_id, action } = JSON.parse(event.body)

  const token = await getValidToken(supabase)
  if (!token) return { statusCode: 401, body: 'Non connecté à Google' }

  const { data: ev } = await supabase
    .from('events')
    .select('*')
    .eq('id', event_id)
    .single()

  if (!ev) return { statusCode: 404, body: 'Événement introuvable' }

  if (action === 'delete') {
    const result = await deleteGoogleEvent(token, ev.gcal_event_id)
    if (!result.ok) return { statusCode: 502, body: 'Erreur lors de la suppression dans Google Agenda' }
    return { statusCode: 200, body: 'Événement supprimé de Google Agenda' }
  }

  const icone = ev.type === 'stage' ? '🏕️' : ev.type === 'concours' ? '🏆' : '📌'
  const createRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `${icone} ${ev.title}`,
        description: ev.description || '',
        start: { date: ev.date_start },
        end: { date: lendemain(ev.date_end) }
      })
    }
  )
  const createdEvent = await createRes.json()
  if (!createRes.ok) return { statusCode: 502, body: "Erreur lors de la création dans Google Agenda" }
  await supabase.from('events').update({ gcal_event_id: createdEvent.id }).eq('id', event_id)

  return { statusCode: 200, body: 'Agenda mis à jour' }
}

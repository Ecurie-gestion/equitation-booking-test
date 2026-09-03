const { createClient } = require('@supabase/supabase-js')

async function getValidToken(supabase) {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('id', 'moniteur')
    .single()

  if (!data) return null

  // Rafraîchit le token si expiré
  if (Date.now() > data.expires_at - 60000) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: 'refresh_token'
      })
    })
    const newTokens = await res.json()
    await supabase.from('google_tokens').update({
      access_token: newTokens.access_token,
      expires_at: Date.now() + newTokens.expires_in * 1000
    }).eq('id', 'moniteur')
    return newTokens.access_token
  }

  return data.access_token
}

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Sécurité : seule une session admin valide (connectée via /admin) peut
  // déclencher cette fonction — sinon n'importe qui connaissant son URL
  // pourrait écrire dans le Google Agenda de l'écurie et épuiser le quota
  // de l'API Google.
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!accessToken) {
    return { statusCode: 401, body: 'Non autorisé' }
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !user) {
    return { statusCode: 401, body: 'Non autorisé' }
  }

  console.log('UPDATE-CALENDAR APPELE avec:', event.body)
  const { slot_id, action } = JSON.parse(event.body)

  const token = await getValidToken(supabase)
  if (!token) return { statusCode: 401, body: 'Non connecté à Google' }

  const { data: slot } = await supabase
    .from('slots_with_availability')
    .select('*')
    .eq('id', slot_id)
    .single()

  if (!slot) return { statusCode: 404, body: 'Créneau introuvable' }

  const { data: bookings } = await supabase
    .from('bookings')
    .select('child_name, parent_name')
    .eq('slot_id', slot_id)

  const description = bookings && bookings.length > 0
    ? `${slot.booked_count}/${slot.max_places} inscrits\n\n` +
      bookings.map((b, i) => `${i + 1}. ${b.child_name} (${b.parent_name})`).join('\n')
    : `0/${slot.max_places} inscrits`

  const eventDate = slot.date
  const startDateTime = `${eventDate}T${slot.time_start}`
  const endDateTime = `${eventDate}T${slot.time_end}`

  // Crée ou met à jour l'événement
  if (action === 'create' || !slot.gcal_event_id) {
    const createRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: slot.title,
          description,
          start: { dateTime: startDateTime, timeZone: 'Europe/Brussels' },
          end: { dateTime: endDateTime, timeZone: 'Europe/Brussels' }
        })
      }
    )
    const createdEvent = await createRes.json()

    // Sauvegarde l'ID de l'événement Google dans Supabase
    await supabase.from('slots').update({ gcal_event_id: createdEvent.id }).eq('id', slot_id)

  } else {
    // Met à jour l'événement existant
    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${slot.gcal_event_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const eventData = await eventRes.json()

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${slot.gcal_event_id}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...eventData,
          summary: slot.title,
          description,
          start: { dateTime: startDateTime, timeZone: 'Europe/Brussels' },
          end: { dateTime: endDateTime, timeZone: 'Europe/Brussels' }
        })
      }
    )
  }

  return { statusCode: 200, body: 'Agenda mis à jour' }
}
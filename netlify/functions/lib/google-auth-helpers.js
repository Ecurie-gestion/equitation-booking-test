// Petites fonctions partagées entre les différentes fonctions techniques qui
// écrivent dans Google Agenda (update-calendar.js, update-calendar-fixe.js,
// update-calendar-event.js). Ce fichier n'est PAS lui-même une fonction
// Netlify (il est dans un sous-dossier "lib", Netlify ne déploie que les
// fichiers directement dans netlify/functions/) — c'est juste du code
// partagé, importé par les vraies fonctions.

// Vérifie que la requête vient bien d'une session admin connectée. Renvoie
// { ok: true } ou { ok: false, statusCode, body } à retourner tel quel.
async function checkAdminAuth(supabase, event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!accessToken) return { ok: false, statusCode: 401, body: 'Non autorisé' }
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) return { ok: false, statusCode: 401, body: 'Non autorisé' }
  return { ok: true }
}

// Récupère un jeton d'accès Google valide (le rafraîchit si besoin). Renvoie
// null si aucun compte Google n'est connecté.
async function getValidToken(supabase) {
  const { data } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('id', 'moniteur')
    .single()

  if (!data) return null

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

// Supprime un événement Google Agenda. 404/410 = déjà absent, traité comme
// un succès (résultat voulu dans les deux cas).
async function deleteGoogleEvent(token, gcalEventId) {
  if (!gcalEventId) return { ok: true }
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalEventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    return { ok: false }
  }
  return { ok: true }
}

module.exports = { checkAdminAuth, getValidToken, deleteGoogleEvent }

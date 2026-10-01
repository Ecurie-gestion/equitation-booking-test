const { createClient } = require('@supabase/supabase-js')

// Envoie un rappel par email aux familles inscrites à un stage ou un
// événement qui commence dans 2 à 3 jours, et qui n'ont pas encore reçu ce
// rappel (colonne event_inscriptions.rappel_envoye). Ne concerne pas les
// cours fixes hebdomadaires, pour ne pas spammer les mêmes familles chaque
// semaine.
//
// Déclenché automatiquement chaque jour par Netlify (voir netlify.toml).
// Réutilise le même service d'envoi d'email (EmailJS) que le reste du site
// (notifications de modif/annulation de cours), donc les rappels partent
// bien de la même adresse déjà configurée dans EmailJS.

const EMAILJS_SERVICE_ID = 'service_oa63ggp'
const EMAILJS_TEMPLATE_ID = 'template_uj4ylsf'
const EMAILJS_PUBLIC_KEY = '2N9uGy2kH6-dCAWF5'

function toLocalISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function envoyerEmail(to_email, subject, message) {
  const privateKey = process.env.EMAILJS_PRIVATE_KEY
  if (!privateKey) {
    console.error('EMAILJS_PRIVATE_KEY manquante dans les variables d\'environnement Netlify.')
    return false
  }
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: privateKey,
        template_params: { to_email, subject, message }
      })
    })
    if (!res.ok) {
      console.error('Erreur EmailJS:', res.status, await res.text())
      return false
    }
    return true
  } catch (error) {
    console.error('Erreur envoi email:', error)
    return false
  }
}

function formatDateFr(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

exports.handler = async () => {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Fenêtre de 2 à 3 jours avant le début de l'événement. On vérifie les
  // deux jours (plutôt qu'un seul "aujourd'hui + 2") pour rattraper le coup
  // si la fonction n'a pas pu tourner un jour donné — rappel_envoye évite
  // les doublons.
  const dansDeuxJours = new Date(); dansDeuxJours.setDate(dansDeuxJours.getDate() + 2)
  const dansTroisJours = new Date(); dansTroisJours.setDate(dansTroisJours.getDate() + 3)
  const dateMin = toLocalISODate(dansDeuxJours)
  const dateMax = toLocalISODate(dansTroisJours)

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, date_start, date_end')
    .gte('date_start', dateMin)
    .lte('date_start', dateMax)

  if (eventsError) {
    console.error('Erreur lecture events:', eventsError)
    return { statusCode: 500, body: 'Erreur lecture events' }
  }
  if (!events || events.length === 0) {
    return { statusCode: 200, body: 'Aucun stage/événement dans la fenêtre de rappel.' }
  }

  let envoyes = 0
  let echecs = 0

  for (const ev of events) {
    const { data: inscriptions, error: inscrError } = await supabase
      .from('event_inscriptions')
      .select('id, email, child_name, child_nom, rappel_envoye')
      .eq('event_id', ev.id)
      .eq('rappel_envoye', false)

    if (inscrError) {
      console.error('Erreur lecture inscriptions pour', ev.id, inscrError)
      continue
    }

    for (const insc of inscriptions || []) {
      if (!insc.email) continue

      const subject = `Rappel : ${ev.title} approche — Écurie de Groynne`
      const message = `Bonjour,\n\nPetit rappel : ${insc.child_name || 'votre enfant'} est inscrit(e) à "${ev.title}", qui commence ${formatDateFr(ev.date_start)}.\n\nÀ bientôt !\nÉcurie de Groynne`

      const ok = await envoyerEmail(insc.email, subject, message)
      if (ok) {
        envoyes++
        await supabase.from('event_inscriptions').update({ rappel_envoye: true }).eq('id', insc.id)
      } else {
        echecs++
      }
    }
  }

  return { statusCode: 200, body: `Rappels envoyés : ${envoyes}, échecs : ${echecs}` }
}

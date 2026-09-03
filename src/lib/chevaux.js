import { supabase } from './supabase'

// Vérifie si un cheval est déjà assigné à un autre cavalier sur un cours
// (fixe ou libre) qui a lieu le même jour et dont l'horaire chevauche celui
// donné. Interroge la base directement (plutôt que l'état local d'un
// composant) pour rester fiable même si l'admin n'a pas ouvert tous les
// cours du jour dans l'écran courant.
//
// Retourne soit `null` (pas de conflit), soit un objet décrivant le conflit
// { nom, label, heure } à afficher dans un message d'erreur.
export async function chevalDejaAssigne({ date, heureDebut, heureFin, chevalId, excluerTable, excluerId }) {
  if (!chevalId || !date || !heureDebut) return null
  const fin = heureFin || heureDebut

  function seChevauchent(debut, finAutre) {
    const f = finAutre || debut
    return debut === heureDebut || (debut < fin && heureDebut < f)
  }

  // Cours fixes (séances) ce jour-là
  const { data: seances } = await supabase
    .from('seances')
    .select('id, creneaux_fixes(heure_debut, heure_fin, niveaux)')
    .eq('date', date)
    .eq('annulee', false)
  const seancesChevauchantes = (seances || []).filter(s => {
    const d = s.creneaux_fixes?.heure_debut?.slice(0, 5)
    return d && seChevauchent(d, s.creneaux_fixes?.heure_fin?.slice(0, 5))
  })
  if (seancesChevauchantes.length > 0) {
    const { data: presences } = await supabase
      .from('presences')
      .select('id, cheval_id, seance_id, cavaliers(prenom, nom)')
      .in('seance_id', seancesChevauchantes.map(s => s.id))
      .eq('cheval_id', chevalId)
    const conflit = (presences || []).find(p => !(excluerTable === 'presences' && p.id === excluerId))
    if (conflit) {
      const seance = seancesChevauchantes.find(s => s.id === conflit.seance_id)
      return {
        nom: `${conflit.cavaliers?.prenom || ''} ${conflit.cavaliers?.nom || ''}`.trim() || 'un(e) élève',
        label: seance?.creneaux_fixes?.niveaux || 'Cours fixe',
        heure: seance?.creneaux_fixes?.heure_debut?.slice(0, 5) || ''
      }
    }
  }

  // Créneaux libres ce jour-là
  const { data: slots } = await supabase
    .from('slots')
    .select('id, title, time_start, time_end')
    .eq('date', date)
  const slotsChevauchants = (slots || []).filter(s => {
    const d = s.time_start?.slice(0, 5)
    return d && seChevauchent(d, s.time_end?.slice(0, 5))
  })
  if (slotsChevauchants.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, cheval_id, slot_id, child_name, child_nom')
      .in('slot_id', slotsChevauchants.map(s => s.id))
      .eq('cheval_id', chevalId)
    const conflit = (bookings || []).find(b => !(excluerTable === 'bookings' && b.id === excluerId))
    if (conflit) {
      const slot = slotsChevauchants.find(s => s.id === conflit.slot_id)
      return {
        nom: `${conflit.child_name || ''} ${conflit.child_nom || ''}`.trim() || 'un(e) élève',
        label: slot?.title || 'Créneau libre',
        heure: slot?.time_start?.slice(0, 5) || ''
      }
    }
  }

  return null
}

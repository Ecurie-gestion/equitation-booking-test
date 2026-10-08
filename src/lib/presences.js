import { supabase } from './supabase'

// Enregistre la présence d'un élève à un cours passé (fixe ou libre), en
// reproduisant la même règle que l'écran "Mes cours" : pour un abonnement
// "10 leçons", une présence consomme une leçon et une absence n'en consomme
// aucune (on rend la leçon si on corrige une présence déjà pointée).
//
// kind : 'fixe' (table presences) ou 'libre' (table bookings)
// Retourne { error } si la base a refusé la mise à jour, sinon {}.
export async function enregistrerPresence({ kind, rowId, cavalierId, creneauFixeId, ancien, nouveau }) {
  const table = kind === 'fixe' ? 'presences' : 'bookings'
  const { error } = await supabase.from(table).update({ present: nouveau }).eq('id', rowId)
  if (error) return { error }

  if (kind === 'fixe' && cavalierId && creneauFixeId) {
    const consommaitAvant = ancien === true
    const consommeMaintenant = nouveau === true
    if (consommaitAvant !== consommeMaintenant) {
      const { data: abo } = await supabase
        .from('abonnements')
        .select('id, lecons_restantes')
        .eq('cavalier_id', cavalierId)
        .eq('creneau_fixe_id', creneauFixeId)
        .eq('type', 'dix_lecons')
        .eq('actif', true)
        .limit(1)
        .maybeSingle()
      if (abo) {
        const delta = consommeMaintenant ? -1 : 1
        const restantes = Math.max(0, (abo.lecons_restantes || 0) + delta)
        await supabase.from('abonnements').update({ lecons_restantes: restantes }).eq('id', abo.id)
      }
    }
  }
  return {}
}

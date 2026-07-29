import { supabase } from './supabase'

// Quand un élève s'inscrit à un créneau libre (prénom+nom élève, parent
// optionnel), on s'assure qu'il existe aussi dans la liste des cavaliers de
// l'admin, pour avoir une liste unique quel que soit le type de créneau utilisé.
export async function upsertCavalierDepuisReservation({ child_name, child_nom, parent_name, email, phone }) {
  if (!child_name) return null

  const prenom = child_name
  const nom = child_nom || 'À compléter'

  const { data: existants } = await supabase
    .from('cavaliers')
    .select('id')
    .eq('prenom', prenom)
    .eq('nom', nom)

  if (existants && existants.length > 0) return existants[0].id // déjà enregistré

  const { data: cree } = await supabase.from('cavaliers').insert({
    prenom,
    nom,
    parent_nom: parent_name || '',
    email: email || '',
    telephone: phone || '',
    actif: true
  }).select().single()

  return cree?.id || null
}

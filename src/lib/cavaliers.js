import { supabase } from './supabase'

// Normalise un nom pour comparaison : insensible aux accents, à la casse,
// aux espaces superflus. C'est la clé d'identité d'un élève (nom + prénom) —
// l'email et le téléphone peuvent varier d'une réservation à l'autre, le nom non.
export function normalizeName(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Quand un élève s'inscrit (ou est inscrit par l'admin) à un créneau, un cours
// fixe ou un stage, on s'assure qu'il existe aussi dans la liste des cavaliers
// de l'admin, en le retrouvant par prénom+nom (normalisé) plutôt que par email
// ou téléphone qui peuvent différer d'une inscription à l'autre pour le même
// enfant. Ça garantit un historique unique et fiable par élève.
export async function upsertCavalierDepuisReservation({ child_name, child_nom, parent_name, email, phone }) {
  const prenom = (child_name || '').trim()
  if (!prenom) return null

  const nom = (child_nom || '').trim() || 'À compléter'

  const prenomNorm = normalizeName(prenom)
  const nomNorm = normalizeName(nom)

  const { data: existants } = await supabase
    .from('cavaliers')
    .select('id, prenom, nom')

  const trouve = (existants || []).find(
    c => normalizeName(c.prenom) === prenomNorm && normalizeName(c.nom) === nomNorm
  )
  if (trouve) return trouve.id

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

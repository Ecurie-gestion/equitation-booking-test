import { supabase } from './supabase'
import { TYPES_ABONNEMENT } from './theme'

// Échappe une valeur pour un CSV "point-virgule" (le séparateur attendu par
// Excel en français — la virgule y sert de séparateur décimal).
function csvEscape(value) {
  const str = String(value ?? '')
  if (/[;"\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
  return str
}

function telechargerCSV(nomFichier, lignes) {
  const contenu = lignes.map(ligne => ligne.map(csvEscape).join(';')).join('\r\n')
  // Le "﻿" (BOM) en tête permet à Excel de reconnaître les accents
  // correctement à l'ouverture, au lieu d'afficher des caractères bizarres.
  const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function labelPresent(present) {
  if (present === true) return 'Présent'
  if (present === false) return 'Absent'
  return 'Non pointé'
}

// Export détaillé : une ligne par élève et par cours fixe / créneau libre /
// stage-événement suivi (passé et à venir). cavaliers : la liste déjà
// chargée dans CavaliersManager (respecte le filtre "afficher les
// inactifs").
export async function exporterElevesCSV(cavaliers) {
  const ids = cavaliers.map(c => c.id)
  if (ids.length === 0) return

  const [
    { data: abonnements },
    { data: presencesFixe },
    { data: bookingsParId },
    { data: bookingsSansId },
    { data: stagesParId },
    { data: stagesSansId }
  ] = await Promise.all([
    supabase.from('abonnements').select('*, creneaux_fixes(niveaux)').in('cavalier_id', ids),
    supabase.from('presences').select('*, seances(date, creneaux_fixes(niveaux))').in('cavalier_id', ids),
    supabase.from('bookings').select('*, slots(title, date)').in('cavalier_id', ids),
    // Anciennes réservations/inscriptions migrées sans cavalier_id : on
    // rattrape par nom exact, comme ailleurs dans l'admin.
    supabase.from('bookings').select('*, slots(title, date)').is('cavalier_id', null),
    supabase.from('event_inscriptions').select('*, events(title, date_start, type)').in('cavalier_id', ids),
    supabase.from('event_inscriptions').select('*, events(title, date_start, type)').is('cavalier_id', null)
  ])

  const lignes = [['Prénom', 'Nom', 'Abonnement', 'Type', 'Cours / événement', 'Date', 'Statut']]

  cavaliers.forEach(cav => {
    const abosActifs = (abonnements || []).filter(a => a.cavalier_id === cav.id && a.actif)
    const abonnementLabel = abosActifs.length > 0
      ? abosActifs.map(a => {
        const type = TYPES_ABONNEMENT.find(t => t.value === a.type)?.label || a.type
        return a.creneaux_fixes?.niveaux ? `${type} – ${a.creneaux_fixes.niveaux}` : type
      }).join(' / ')
      : '—'

    const lignesCavalier = []

    ;(presencesFixe || []).filter(p => p.cavalier_id === cav.id && !p.exclu).forEach(p => {
      lignesCavalier.push([
        cav.prenom, cav.nom, abonnementLabel, 'Cours fixe',
        p.seances?.creneaux_fixes?.niveaux || 'Cours fixe', p.seances?.date || '', labelPresent(p.present)
      ])
    })

    const bookingsCavalier = [
      ...(bookingsParId || []).filter(b => b.cavalier_id === cav.id),
      ...(bookingsSansId || []).filter(b => b.child_name === cav.prenom && b.child_nom === cav.nom)
    ]
    bookingsCavalier.forEach(b => {
      lignesCavalier.push([
        cav.prenom, cav.nom, abonnementLabel, 'Créneau libre / privé',
        b.slots?.title || 'Créneau libre', b.slots?.date || '', labelPresent(b.present)
      ])
    })

    const stagesCavalier = [
      ...(stagesParId || []).filter(s => s.cavalier_id === cav.id),
      ...(stagesSansId || []).filter(s => s.child_name === cav.prenom && s.child_nom === cav.nom)
    ]
    stagesCavalier.forEach(s => {
      lignesCavalier.push([
        cav.prenom, cav.nom, abonnementLabel,
        s.events?.type === 'concours' ? 'Concours' : s.events?.type === 'stage' ? 'Stage' : 'Événement',
        s.events?.title || 'Stage/concours/événement', s.events?.date_start || '', 'Inscrit(e)'
      ])
    })

    if (lignesCavalier.length === 0) {
      lignesCavalier.push([cav.prenom, cav.nom, abonnementLabel, '', '', '', 'Aucune activité'])
    }

    lignes.push(...lignesCavalier)
  })

  const aujourdhui = new Date().toISOString().slice(0, 10)
  telechargerCSV(`eleves_ecurie_de_groynne_${aujourdhui}.csv`, lignes)
}

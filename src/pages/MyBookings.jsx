import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toLocalISODate } from '../lib/dates'
import { normalizeName } from '../lib/cavaliers'

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  beige: '#f5f0e8',
  beigeLight: '#faf7f2',
  textLight: '#7a6a5a'
}

// Un cavalier est-il attendu à cette séance fixe, selon son type d'abonnement ?
function estAttendu(abonnement, dateSeance) {
  if (abonnement.type === 'unite') return abonnement.date_debut === dateSeance
  if (abonnement.type === 'dix_lecons') return abonnement.date_debut <= dateSeance
  if (abonnement.type === 'vacances_a_vacances') {
    return abonnement.date_debut <= dateSeance && (!abonnement.date_fin || abonnement.date_fin >= dateSeance)
  }
  return false
}

function normalizeEmail(e) {
  return (e || '').trim().toLowerCase()
}
function normalizePhoneDigits(p) {
  return (p || '').replace(/\D/g, '')
}

// Vérifie que l'email ou le téléphone saisi correspond à celui enregistré.
// On compare les 9 derniers chiffres du téléphone pour tolérer les
// formats avec/sans indicatif (+33 6 12... vs 06 12...).
function contactCorrespond(saisie, email, telephone) {
  const s = (saisie || '').trim()
  if (!s) return false
  const sEmail = normalizeEmail(s)
  if (email && sEmail === normalizeEmail(email)) return true
  const digitsInput = normalizePhoneDigits(s)
  if (digitsInput.length >= 6 && telephone) {
    const lastInput = digitsInput.slice(-9)
    const lastStored = normalizePhoneDigits(telephone).slice(-9)
    if (lastInput.length === 9 && lastInput === lastStored) return true
  }
  return false
}

export default function MyBookings({ onBack }) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')

  // Recherche légère : uniquement la prochaine séance, accessible avec
  // juste prénom + nom (comme avant), sans exposer l'historique.
  const [prochaine, setProchaine] = useState(null) // { trouve, item } ou null si pas encore cherché
  const [loadingProchaine, setLoadingProchaine] = useState(false)
  const [errorProchaine, setErrorProchaine] = useState(null)

  // Historique complet : nécessite en plus l'email ou le téléphone
  // enregistré, pour éviter qu'un inconnu connaissant juste un nom puisse
  // voir tout le calendrier et les présences/absences d'un élève.
  const [afficherVerif, setAfficherVerif] = useState(false)
  const [contact, setContact] = useState('')
  const [resultat, setResultat] = useState(null)
  const [loadingHisto, setLoadingHisto] = useState(false)
  const [errorHisto, setErrorHisto] = useState(null)

  async function trouverCavalier() {
    const prenomN = normalizeName(prenom)
    const nomN = normalizeName(nom)
    const { data: tousCavaliers } = await supabase.from('cavaliers').select('id, prenom, nom, email, telephone')
    return (tousCavaliers || []).find(
      c => normalizeName(c.prenom) === prenomN && normalizeName(c.nom) === nomN
    )
  }

  async function fetchProchaineSeance() {
    if (!prenom || !nom) {
      setErrorProchaine("Veuillez entrer le prénom et le nom de l'élève.")
      return
    }
    setLoadingProchaine(true)
    setErrorProchaine(null)
    setAfficherVerif(false)
    setResultat(null)

    const cavalier = await trouverCavalier()
    const today = toLocalISODate(new Date())
    const dansTroisMois = new Date()
    dansTroisMois.setDate(dansTroisMois.getDate() + 90)
    const dateLimite = toLocalISODate(dansTroisMois)

    const candidats = []

    if (cavalier) {
      const { data: abosActifs } = await supabase
        .from('abonnements')
        .select('*, creneaux_fixes(niveaux, heure_debut, heure_fin)')
        .eq('cavalier_id', cavalier.id)
        .eq('actif', true)

      const idsCreneaux = [...new Set((abosActifs || []).map(a => a.creneau_fixe_id))]
      if (idsCreneaux.length > 0) {
        const { data: seancesProches } = await supabase
          .from('seances')
          .select('*, creneaux_fixes(niveaux, heure_debut, heure_fin)')
          .in('creneau_fixe_id', idsCreneaux)
          .gte('date', today)
          .lte('date', dateLimite)
          .eq('annulee', false)
          .order('date')

        const prochaineSeanceFixe = (seancesProches || []).find(s => {
          const abo = (abosActifs || []).find(a => a.creneau_fixe_id === s.creneau_fixe_id)
          return abo && estAttendu(abo, s.date)
        })
        if (prochaineSeanceFixe) {
          candidats.push({
            date: prochaineSeanceFixe.date,
            heureDebut: prochaineSeanceFixe.creneaux_fixes?.heure_debut?.slice(0, 5),
            heureFin: prochaineSeanceFixe.creneaux_fixes?.heure_fin?.slice(0, 5),
            titre: prochaineSeanceFixe.creneaux_fixes?.niveaux || 'Cours fixe',
            kind: 'fixe'
          })
        }
      }

      const { data: stages } = await supabase
        .from('event_inscriptions')
        .select('*, events(title, date_start, type)')
        .eq('cavalier_id', cavalier.id)
      const prochainStage = (stages || [])
        .filter(s => s.events?.date_start && s.events.date_start >= today)
        .sort((a, b) => a.events.date_start.localeCompare(b.events.date_start))[0]
      if (prochainStage) {
        candidats.push({
          date: prochainStage.events.date_start,
          heureDebut: null,
          heureFin: null,
          titre: prochainStage.events.title || (prochainStage.events.type === 'stage' ? 'Stage' : 'Événement'),
          kind: 'stage'
        })
      }
    }

    const { data: bookingsNom } = await supabase
      .from('bookings')
      .select('*, slots(title, date, time_start, time_end)')
      .ilike('child_name', prenom.trim())
      .ilike('child_nom', nom.trim())
    const prochainLibre = (bookingsNom || [])
      .filter(b => b.slots?.date && b.slots.date >= today)
      .sort((a, b) => a.slots.date.localeCompare(b.slots.date))[0]
    if (prochainLibre) {
      candidats.push({
        date: prochainLibre.slots.date,
        heureDebut: prochainLibre.slots.time_start?.slice(0, 5),
        heureFin: prochainLibre.slots.time_end?.slice(0, 5),
        titre: prochainLibre.slots.title || 'Créneau libre',
        kind: 'libre'
      })
    }

    candidats.sort((a, b) => (a.date + (a.heureDebut || '')).localeCompare(b.date + (b.heureDebut || '')))

    const aTrouveQuelqueChose = !!cavalier || (bookingsNom || []).length > 0
    setProchaine({ trouve: aTrouveQuelqueChose, item: candidats[0] || null })
    setLoadingProchaine(false)
  }

  async function trouverAccesVerifie() {
    const cavalier = await trouverCavalier()
    if (cavalier) {
      return contactCorrespond(contact, cavalier.email, cavalier.telephone)
        ? { cavalier, bookingsVerifies: null }
        : null
    }
    // Pas de fiche élève : on vérifie via les coordonnées saisies lors
    // d'une réservation de créneau libre portant ce nom.
    const { data: bookingsNom } = await supabase
      .from('bookings')
      .select('*, slots(title, date, time_start, time_end)')
      .ilike('child_name', prenom.trim())
      .ilike('child_nom', nom.trim())
    const bookingsVerifies = (bookingsNom || []).filter(b => contactCorrespond(contact, b.email, b.phone))
    return bookingsVerifies.length > 0 ? { cavalier: null, bookingsVerifies } : null
  }

  async function fetchHistoriqueComplet() {
    if (!prenom || !nom || !contact) {
      setErrorHisto("Veuillez renseigner le prénom, le nom, et l'email ou le téléphone utilisé lors de l'inscription.")
      return
    }
    setLoadingHisto(true)
    setErrorHisto(null)

    const acces = await trouverAccesVerifie()
    if (!acces) {
      // Message volontairement générique : on ne révèle pas si le nom
      // existe ou non, ni si c'est l'email/téléphone qui ne correspond pas.
      setErrorHisto("Informations non reconnues. Vérifiez le prénom, le nom, et l'email ou le téléphone utilisé lors de l'inscription. Pour toute question, contactez l'écurie.")
      setResultat(null)
      setLoadingHisto(false)
      return
    }

    const today = toLocalISODate(new Date())
    const dansDeuxMois = new Date()
    dansDeuxMois.setDate(dansDeuxMois.getDate() + 60)
    const dateLimite = toLocalISODate(dansDeuxMois)

    let coursFixesAVenir = []
    let coursFixesPasses = []
    let stagesAVenir = []
    let stagesPasses = []
    let bookingsLibres = []

    if (acces.cavalier) {
      const cavalier = acces.cavalier
      const { data: abosActifs } = await supabase
        .from('abonnements')
        .select('*, creneaux_fixes(niveaux, heure_debut, heure_fin)')
        .eq('cavalier_id', cavalier.id)
        .eq('actif', true)

      const idsCreneaux = [...new Set((abosActifs || []).map(a => a.creneau_fixe_id))]
      if (idsCreneaux.length > 0) {
        const { data: seancesProches } = await supabase
          .from('seances')
          .select('*, creneaux_fixes(niveaux, heure_debut, heure_fin)')
          .in('creneau_fixe_id', idsCreneaux)
          .gte('date', today)
          .lte('date', dateLimite)
          .eq('annulee', false)
          .order('date')

        coursFixesAVenir = (seancesProches || [])
          .filter(s => {
            const abo = (abosActifs || []).find(a => a.creneau_fixe_id === s.creneau_fixe_id)
            return abo && estAttendu(abo, s.date)
          })
          .map(s => ({
            id: `fixe-${s.id}`,
            date: s.date,
            heureDebut: s.creneaux_fixes?.heure_debut?.slice(0, 5),
            heureFin: s.creneaux_fixes?.heure_fin?.slice(0, 5),
            titre: s.creneaux_fixes?.niveaux || 'Cours fixe',
            kind: 'fixe'
          }))
      }

      const { data: presencesPassees } = await supabase
        .from('presences')
        .select('*, seances(date, creneaux_fixes(niveaux, heure_debut, heure_fin))')
        .eq('cavalier_id', cavalier.id)

      coursFixesPasses = (presencesPassees || [])
        .filter(p => p.seances?.date && p.seances.date < today)
        .map(p => ({
          id: `presence-${p.id}`,
          date: p.seances.date,
          heureDebut: p.seances.creneaux_fixes?.heure_debut?.slice(0, 5),
          heureFin: p.seances.creneaux_fixes?.heure_fin?.slice(0, 5),
          titre: p.seances.creneaux_fixes?.niveaux || 'Cours fixe',
          kind: 'fixe',
          present: p.present
        }))

      const { data: stages } = await supabase
        .from('event_inscriptions')
        .select('*, events(title, date_start, type)')
        .eq('cavalier_id', cavalier.id)

      stagesAVenir = (stages || [])
        .filter(s => s.events?.date_start && s.events.date_start >= today)
        .map(s => ({
          id: `stage-${s.id}`,
          date: s.events.date_start,
          heureDebut: null,
          heureFin: null,
          titre: s.events.title || (s.events.type === 'stage' ? 'Stage' : 'Événement'),
          kind: 'stage'
        }))
      stagesPasses = (stages || [])
        .filter(s => s.events?.date_start && s.events.date_start < today)
        .map(s => ({
          id: `stage-${s.id}`,
          date: s.events.date_start,
          heureDebut: null,
          heureFin: null,
          titre: s.events.title || (s.events.type === 'stage' ? 'Stage' : 'Événement'),
          kind: 'stage'
        }))

      const [{ data: bookingsParId }, { data: bookingsParNom }] = await Promise.all([
        supabase.from('bookings').select('*, slots(title, date, time_start, time_end)').eq('cavalier_id', cavalier.id),
        supabase.from('bookings').select('*, slots(title, date, time_start, time_end)').ilike('child_name', prenom.trim()).ilike('child_nom', nom.trim())
      ])
      const bookingsMap = new Map()
      ;[...(bookingsParId || []), ...(bookingsParNom || [])].forEach(b => bookingsMap.set(b.id, b))
      bookingsLibres = Array.from(bookingsMap.values())
    } else {
      // Accès vérifié uniquement via des réservations de créneaux libres
      // précises (dont l'email/téléphone correspond) : on ne montre que
      // celles-là, pas tout ce qui porte le même nom.
      bookingsLibres = acces.bookingsVerifies
    }

    const bookingsLibresFormates = bookingsLibres
      .filter(b => b.slots?.date)
      .map(b => ({
        id: `libre-${b.id}`,
        date: b.slots.date,
        heureDebut: b.slots.time_start?.slice(0, 5),
        heureFin: b.slots.time_end?.slice(0, 5),
        titre: b.slots.title || 'Créneau libre',
        kind: 'libre'
      }))

    const libreAVenir = bookingsLibresFormates.filter(b => b.date >= today)
    const librePassees = bookingsLibresFormates.filter(b => b.date < today)

    const aVenir = [...coursFixesAVenir, ...libreAVenir, ...stagesAVenir]
      .sort((a, b) => (a.date + (a.heureDebut || '')).localeCompare(b.date + (b.heureDebut || '')))
    const passees = [...coursFixesPasses, ...librePassees, ...stagesPasses]
      .sort((a, b) => (b.date + (b.heureDebut || '')).localeCompare(a.date + (a.heureDebut || '')))

    setResultat({ trouve: true, aVenir, passees })
    setLoadingHisto(false)
  }

  function CarteInscription({ item, passe }) {
    const icone = item.kind === 'fixe' ? '🔒' : item.kind === 'stage' ? '🏕️' : '🌐'
    return (
      <div style={{
        background: passe ? '#f2f2f2' : 'white',
        borderRadius: '16px',
        padding: '1.2rem 1.5rem',
        boxShadow: passe ? 'none' : '0 4px 20px rgba(26,39,68,0.06)',
        border: passe ? '1px solid #e5e5e5' : 'none',
        borderLeft: `5px solid ${passe ? '#ccc' : COLORS.sky}`,
        opacity: passe ? 0.7 : 1
      }}>
        <h3 style={{ color: passe ? '#888' : COLORS.navy, margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
          {icone} {item.titre}
        </h3>
        <p style={{ margin: '0.2rem 0', color: passe ? '#aaa' : COLORS.textLight, fontSize: '0.9rem' }}>
          📅 {item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        </p>
        {item.heureDebut && (
          <p style={{ margin: '0.2rem 0', color: passe ? '#aaa' : COLORS.textLight, fontSize: '0.9rem' }}>
            🕐 {item.heureDebut}{item.heureFin ? ` – ${item.heureFin}` : ''}
          </p>
        )}
        {passe && item.present === true && <p style={{ margin: '0.4rem 0 0 0', color: '#4a9d4a', fontSize: '0.85rem', fontWeight: 'bold' }}>✓ Présent(e)</p>}
        {passe && item.present === false && <p style={{ margin: '0.4rem 0 0 0', color: '#c0392b', fontSize: '0.85rem', fontWeight: 'bold' }}>✕ Absent(e)</p>}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: COLORS.beigeLight, minHeight: '100vh' }}>
      <header style={{
        background: COLORS.navy,
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)'
      }}>
        <img src="/logo-white.png" alt="Ecurie de Groynne" style={{ height: '60px' }} />
        <button onClick={onBack}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: 'white', cursor: 'pointer', fontSize: '0.9rem', padding: '0.4rem 1rem', borderRadius: '20px' }}>
          ← Retour
        </button>
      </header>

      <main style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
        <h1 style={{ color: COLORS.navy, fontSize: '1.8rem', marginBottom: '0.5rem' }}>📋 Mes inscriptions</h1>
        <p style={{ color: COLORS.textLight, marginBottom: '2rem' }}>
          Entrez le prénom et le nom de l'élève pour connaître sa prochaine séance.
        </p>

        <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <input
              placeholder="Prénom de l'élève"
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchProchaineSeance()}
              style={{ flex: 1, minWidth: '160px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
            />
            <input
              placeholder="Nom de l'élève"
              value={nom}
              onChange={e => setNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchProchaineSeance()}
              style={{ flex: 1, minWidth: '160px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
            />
            <button onClick={fetchProchaineSeance} disabled={loadingProchaine}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.7rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {loadingProchaine ? '⏳...' : 'Voir ma prochaine séance'}
            </button>
          </div>
          {errorProchaine && <p style={{ color: 'red', marginTop: '0.8rem', fontSize: '0.9rem' }}>{errorProchaine}</p>}
        </div>

        {prochaine !== null && (
          <div style={{ marginBottom: '2rem' }}>
            {!prochaine.trouve ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</p>
                <p style={{ color: COLORS.textLight }}>Aucune inscription trouvée pour ce nom.</p>
              </div>
            ) : prochaine.item ? (
              <CarteInscription item={prochaine.item} passe={false} />
            ) : (
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
                <p style={{ color: COLORS.textLight, margin: 0 }}>Aucune séance à venir programmée pour le moment.</p>
              </div>
            )}
          </div>
        )}

        {/* Historique complet : accès protégé par une vérification supplémentaire,
            pour que voir la prochaine séance reste simple tout en protégeant
            l'historique et les présences/absences d'un élève. */}
        {!afficherVerif ? (
          <button onClick={() => setAfficherVerif(true)}
            style={{ background: 'none', border: 'none', color: COLORS.sky, cursor: 'pointer', fontSize: '0.95rem', textDecoration: 'underline', padding: 0 }}>
            Voir tout l'historique (cours passés, présences...)
          </button>
        ) : (
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)', marginBottom: '2rem' }}>
            <p style={{ color: COLORS.navy, fontWeight: 'bold', marginTop: 0, marginBottom: '0.5rem' }}>Voir tout l'historique</p>
            <p style={{ color: COLORS.textLight, fontSize: '0.9rem', marginBottom: '1rem' }}>
              Pour protéger la confidentialité des élèves, merci de confirmer l'email ou le téléphone utilisé lors de l'inscription.
            </p>
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <input
                placeholder="Email ou téléphone enregistré"
                value={contact}
                onChange={e => setContact(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchHistoriqueComplet()}
                style={{ flex: 1, minWidth: '220px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
              />
              <button onClick={fetchHistoriqueComplet} disabled={loadingHisto}
                style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.7rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {loadingHisto ? '⏳...' : 'Voir tout mon historique'}
              </button>
            </div>
            {errorHisto && <p style={{ color: 'red', marginTop: '0.8rem', fontSize: '0.9rem' }}>{errorHisto}</p>}
          </div>
        )}

        {resultat !== null && (
          <div>
            <p style={{ color: COLORS.textLight, marginBottom: '1rem' }}>
              {resultat.aVenir.length + resultat.passees.length} inscription(s) trouvée(s)
            </p>

            {resultat.aVenir.length === 0 && resultat.passees.length === 0 && (
              <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
                <p style={{ color: COLORS.textLight }}>Aucun cours enregistré pour l'instant.</p>
              </div>
            )}

            {resultat.aVenir.length > 0 && (
              <div style={{ display: 'grid', gap: '1rem', marginBottom: resultat.passees.length > 0 ? '2rem' : 0 }}>
                {resultat.aVenir.map(item => <CarteInscription key={item.id} item={item} passe={false} />)}
              </div>
            )}

            {resultat.passees.length > 0 && (
              <div>
                <h4 style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.8rem' }}>📁 Passées</h4>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {resultat.passees.map(item => <CarteInscription key={item.id} item={item} passe={true} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

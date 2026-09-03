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

export default function MyBookings({ onBack }) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [resultat, setResultat] = useState(null) // { aVenir: [], passees: [] } ou null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchMesInscriptions() {
    if (!prenom || !nom) {
      setError("Veuillez entrer le prénom et le nom de l'élève.")
      return
    }
    setLoading(true)
    setError(null)

    const prenomN = normalizeName(prenom)
    const nomN = normalizeName(nom)

    // On retrouve le cavalier par prénom+nom (insensible aux accents/casse) —
    // c'est la même clé d'identité utilisée côté admin, ce qui permet de
    // retrouver aussi bien les cours fixes que les stages, pas seulement les
    // réservations sur créneaux libres.
    const { data: tousCavaliers } = await supabase.from('cavaliers').select('id, prenom, nom')
    const cavalier = (tousCavaliers || []).find(
      c => normalizeName(c.prenom) === prenomN && normalizeName(c.nom) === nomN
    )

    const today = toLocalISODate(new Date())
    const dansDeuxMois = new Date()
    dansDeuxMois.setDate(dansDeuxMois.getDate() + 60)
    const dateLimite = toLocalISODate(dansDeuxMois)

    let coursFixesAVenir = []
    let coursFixesPasses = []
    let stagesAVenir = []
    let stagesPasses = []

    if (cavalier) {
      // Cours fixes (abonnements actifs) : on prend les prochaines séances déjà
      // générées pour ces créneaux, et on ne garde que celles où le cavalier
      // est réellement attendu selon son type d'abonnement.
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

      // Historique des cours fixes déjà passés (présences déjà enregistrées)
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

      // Stages et événements
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
    }

    // Réservations sur créneaux libres : par cavalier_id si on a trouvé le
    // cavalier (lien fiable), avec un rattrapage par nom exact (anciennes
    // réservations migrées qui n'ont pas ce lien, ou cavalier introuvable).
    const [{ data: bookingsParId }, { data: bookingsParNom }] = await Promise.all([
      cavalier
        ? supabase.from('bookings').select('*, slots(title, date, time_start, time_end)').eq('cavalier_id', cavalier.id)
        : Promise.resolve({ data: [] }),
      supabase.from('bookings').select('*, slots(title, date, time_start, time_end)').ilike('child_name', prenom.trim()).ilike('child_nom', nom.trim())
    ])
    const bookingsMap = new Map()
    ;[...(bookingsParId || []), ...(bookingsParNom || [])].forEach(b => bookingsMap.set(b.id, b))
    const bookingsLibres = Array.from(bookingsMap.values())
      .filter(b => b.slots?.date)
      .map(b => ({
        id: `libre-${b.id}`,
        date: b.slots.date,
        heureDebut: b.slots.time_start?.slice(0, 5),
        heureFin: b.slots.time_end?.slice(0, 5),
        titre: b.slots.title || 'Créneau libre',
        kind: 'libre'
      }))

    const libreAVenir = bookingsLibres.filter(b => b.date >= today)
    const librePassees = bookingsLibres.filter(b => b.date < today)

    const aVenir = [...coursFixesAVenir, ...libreAVenir, ...stagesAVenir]
      .sort((a, b) => (a.date + (a.heureDebut || '')).localeCompare(b.date + (b.heureDebut || '')))
    const passees = [...coursFixesPasses, ...librePassees, ...stagesPasses]
      .sort((a, b) => (b.date + (b.heureDebut || '')).localeCompare(a.date + (a.heureDebut || '')))

    if (!cavalier && bookingsLibres.length === 0) {
      setResultat({ trouve: false, aVenir: [], passees: [] })
    } else {
      setResultat({ trouve: true, aVenir, passees })
    }
    setLoading(false)
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
          Entrez le prénom et le nom de l'élève pour voir ses cours (fixes, créneaux libres et stages).
        </p>

        <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <input
              placeholder="Prénom de l'élève"
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchMesInscriptions()}
              style={{ flex: 1, minWidth: '160px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
            />
            <input
              placeholder="Nom de l'élève"
              value={nom}
              onChange={e => setNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchMesInscriptions()}
              style={{ flex: 1, minWidth: '160px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
            />
            <button onClick={fetchMesInscriptions} disabled={loading}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.7rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {loading ? '⏳...' : 'Voir mes cours'}
            </button>
          </div>
          {error && <p style={{ color: 'red', marginTop: '0.8rem', fontSize: '0.9rem' }}>{error}</p>}
        </div>

        {resultat !== null && (
          <div>
            {!resultat.trouve ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</p>
                <p style={{ color: COLORS.textLight }}>Aucune inscription trouvée pour ce nom.</p>
              </div>
            ) : (
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
          </div>
        )}
      </main>
    </div>
  )
}

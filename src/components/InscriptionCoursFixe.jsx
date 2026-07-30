import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { upsertCavalierDepuisReservation } from '../lib/cavaliers'
import { toLocalISODate } from '../lib/dates'

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  skyLight: '#e8f4fd',
  textLight: '#7a6a5a',
  text: '#3d2b1f',
  green: '#2ecc71',
  red: '#e74c3c'
}

const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const FORMULES = [
  { value: 'unite', emoji: '1️⃣', label: 'Un seul cours', desc: 'Pour essayer, ou pour une fois ponctuellement.' },
  { value: 'dix_lecons', emoji: '🔟', label: 'Pack de 10 cours', desc: 'Un ou plusieurs cours réguliers, chaque semaine.' },
  { value: 'vacances_a_vacances', emoji: '📅', label: 'Toute la période', desc: "Inscrit chaque semaine jusqu'aux prochaines vacances." }
]

const EMPTY_CHILD = { parent_name: '', child_name: '', child_nom: '', email: '', phone: '' }

function estAttendu(abo, date) {
  if (abo.type === 'unite') return abo.date_debut === date
  if (abo.type === 'dix_lecons') return abo.date_debut <= date
  if (abo.type === 'vacances_a_vacances') return abo.date_debut <= date && (!abo.date_fin || abo.date_fin >= date)
  return false
}

export default function InscriptionCoursFixe({ onBack }) {
  const [formule, setFormule] = useState(null)
  const [creneaux, setCreneaux] = useState([])
  const [abonnementsActifs, setAbonnementsActifs] = useState([])
  const [vacancesScolaires, setVacancesScolaires] = useState([])
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)

  const [selectedCreneauIds, setSelectedCreneauIds] = useState([]) // vacances_a_vacances : multi
  const [selectedCreneauIdsDix, setSelectedCreneauIdsDix] = useState([]) // dix_lecons : multi aussi
  const [selectedSeanceId, setSelectedSeanceId] = useState('') // unite : une date précise

  const [child, setChild] = useState(EMPTY_CHILD)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [done, setDone] = useState(false)

  const today = toLocalISODate(new Date())

  useEffect(() => { fetchDonnees() }, [])

  async function fetchDonnees() {
    setLoading(true)
    const [{ data: cr }, { data: abos }, { data: vac }, { data: sea }] = await Promise.all([
      supabase.from('creneaux_fixes').select('*').eq('actif', true).order('jour_semaine').order('heure_debut'),
      supabase.from('abonnements').select('creneau_fixe_id, type, date_debut, date_fin').eq('actif', true),
      supabase.from('vacances_scolaires').select('*').order('date_debut'),
      supabase.from('seances').select('*').eq('annulee', false).gte('date', today).order('date')
    ])
    setCreneaux(cr || [])
    setAbonnementsActifs(abos || [])
    setVacancesScolaires(vac || [])
    setSeances(sea || [])
    setLoading(false)
  }

  function occupation(creneauId, date) {
    return abonnementsActifs.filter(a => a.creneau_fixe_id === creneauId && estAttendu(a, date)).length
  }

  function prochaineFinDePeriode() {
    const futures = vacancesScolaires.filter(v => v.date_debut > today).sort((a, b) => a.date_debut.localeCompare(b.date_debut))
    return futures.length > 0 ? futures[0].date_debut : null
  }

  function toggleCreneau(id) {
    setSelectedCreneauIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleCreneauDix(id) {
    setSelectedCreneauIdsDix(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function seancesPourCreneau(creneauId) {
    return seances.filter(s => s.creneau_fixe_id === creneauId)
  }

  function labelCreneau(cr) {
    return `${JOURS_SEMAINE[cr.jour_semaine]} ${cr.heure_debut.slice(0, 5)}–${cr.heure_fin.slice(0, 5)}${cr.niveaux ? ` · ${cr.niveaux}` : ''}`
  }

  function choisirFormule(f) {
    setFormule(f)
    setSelectedCreneauIds([])
    setSelectedCreneauIdsDix([])
    setSelectedSeanceId('')
    setMessage(null)
  }

  async function soumettre() {
    if (!child.child_name || !child.child_nom) {
      setMessage({ type: 'error', text: "Le prénom et le nom de l'élève sont obligatoires." })
      return
    }
    if (!child.email && !child.phone) {
      setMessage({ type: 'error', text: 'Indique au moins un email ou un numéro de téléphone pour te contacter.' })
      return
    }

    let rows = []
    if (formule === 'vacances_a_vacances') {
      if (selectedCreneauIds.length === 0) {
        setMessage({ type: 'error', text: 'Coche au moins un cours.' })
        return
      }
      const dateFin = prochaineFinDePeriode()
      rows = selectedCreneauIds.map(id => ({
        creneau_fixe_id: id, type: 'vacances_a_vacances', date_debut: today, date_fin: dateFin
      }))
    } else if (formule === 'dix_lecons') {
      if (selectedCreneauIdsDix.length === 0) {
        setMessage({ type: 'error', text: 'Coche au moins un cours.' })
        return
      }
      rows = selectedCreneauIdsDix.map(id => ({
        creneau_fixe_id: id, type: 'dix_lecons', date_debut: today, lecons_totales: 10, lecons_restantes: 10
      }))
    } else if (formule === 'unite') {
      if (!selectedSeanceId) {
        setMessage({ type: 'error', text: 'Choisis une date.' })
        return
      }
      const seance = seances.find(s => s.id === selectedSeanceId)
      rows = [{ creneau_fixe_id: seance.creneau_fixe_id, type: 'unite', date_debut: seance.date }]
    }

    setSubmitting(true)
    const cavalierId = await upsertCavalierDepuisReservation(child)
    if (!cavalierId) {
      setSubmitting(false)
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement de l'élève." })
      return
    }
    const payload = rows.map(r => ({ ...r, cavalier_id: cavalierId }))
    const { error } = await supabase.from('abonnements').insert(payload)
    setSubmitting(false)
    if (!error) {
      setDone(true)
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'inscription. Réessaie ou contacte-nous." })
    }
  }

  const inputStyle = { padding: '0.7rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box' }

  if (done) {
    return (
      <div style={{ background: 'white', borderRadius: '20px', padding: '3rem 2rem', boxShadow: '0 8px 40px rgba(26,39,68,0.1)', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
        <h2 style={{ color: COLORS.navy, marginBottom: '1rem', fontSize: '1.8rem' }}>Inscription confirmée !</h2>
        <p style={{ color: COLORS.textLight, marginBottom: '2rem', fontSize: '1.05rem', lineHeight: '1.8' }}>
          Merci ! L'inscription a bien été enregistrée.<br/>À très bientôt à l'Ecurie de Groynne ! 🐴
        </p>
        <button onClick={onBack}
          style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.8rem 2.5rem', borderRadius: '50px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
          ← Retour à l'accueil
        </button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={onBack}
        style={{ background: 'none', border: 'none', color: COLORS.navy, cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1rem' }}>
        ← Retour
      </button>

      <h2 style={{ color: COLORS.navy, fontSize: '1.5rem', marginBottom: '0.3rem' }}>📅 S'inscrire à un cours fixe</h2>
      <p style={{ color: COLORS.textLight, marginBottom: '1.5rem' }}>Un cours fixe revient chaque semaine, à la même heure, toute l'année.</p>

      {message && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.7rem 1rem', borderRadius: '8px', marginBottom: '1.2rem' }}>
          {message.text}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Chargement...</p>}

      {!loading && (
        <>
          {/* Étape 1 : formule */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {FORMULES.map(f => (
              <button key={f.value} onClick={() => choisirFormule(f.value)}
                style={{
                  background: formule === f.value ? COLORS.navy : 'white',
                  color: formule === f.value ? 'white' : COLORS.navy,
                  border: `2px solid ${COLORS.navy}`,
                  borderRadius: '16px',
                  padding: '1.3rem 1rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.06)'
                }}>
                <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>{f.emoji}</div>
                <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>{f.label}</div>
                <div style={{ fontSize: '0.82rem', opacity: 0.85 }}>{f.desc}</div>
              </button>
            ))}
          </div>

          {/* Étape 2 : choix du/des cours */}
          {formule === 'vacances_a_vacances' && (
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '1rem' }}>Coche un ou plusieurs cours</h4>
              <p style={{ color: COLORS.textLight, fontSize: '0.85rem', marginTop: '-0.5rem' }}>
                L'inscription court jusqu'aux prochaines vacances{prochaineFinDePeriode() ? ` (${new Date(prochaineFinDePeriode()).toLocaleDateString('fr-FR')})` : ''}, automatiquement.
              </p>
              {creneaux.length === 0 && <p style={{ color: '#888' }}>Aucun cours disponible pour le moment.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {creneaux.map(cr => {
                  const occ = occupation(cr.id, today)
                  const complet = occ >= cr.capacite_max
                  return (
                    <label key={cr.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                      cursor: complet ? 'not-allowed' : 'pointer', padding: '0.7rem 0.9rem', borderRadius: '10px',
                      background: selectedCreneauIds.includes(cr.id) ? COLORS.skyLight : '#f7f7f7', opacity: complet ? 0.5 : 1
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <input type="checkbox" disabled={complet} checked={selectedCreneauIds.includes(cr.id)} onChange={() => toggleCreneau(cr.id)}
                          style={{ width: '16px', height: '16px', cursor: complet ? 'not-allowed' : 'pointer', accentColor: COLORS.navy }} />
                        <strong style={{ color: COLORS.navy }}>{labelCreneau(cr)}</strong>
                      </span>
                      <span style={{ fontSize: '0.8rem', color: complet ? COLORS.red : '#888' }}>{complet ? 'Complet' : `${occ}/${cr.capacite_max} places prises`}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {formule === 'dix_lecons' && (
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '1rem' }}>Coche un ou plusieurs cours</h4>
              <p style={{ color: COLORS.textLight, fontSize: '0.85rem', marginTop: '-0.5rem' }}>Les 10 cours seront décomptés au fur et à mesure des présences.</p>
              {creneaux.length === 0 && <p style={{ color: '#888' }}>Aucun cours disponible pour le moment.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {creneaux.map(cr => {
                  const occ = occupation(cr.id, today)
                  const complet = occ >= cr.capacite_max
                  return (
                    <label key={cr.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                      cursor: complet ? 'not-allowed' : 'pointer', padding: '0.7rem 0.9rem', borderRadius: '10px',
                      background: selectedCreneauIdsDix.includes(cr.id) ? COLORS.skyLight : '#f7f7f7', opacity: complet ? 0.5 : 1
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <input type="checkbox" disabled={complet} checked={selectedCreneauIdsDix.includes(cr.id)} onChange={() => toggleCreneauDix(cr.id)}
                          style={{ width: '16px', height: '16px', cursor: complet ? 'not-allowed' : 'pointer', accentColor: COLORS.navy }} />
                        <strong style={{ color: COLORS.navy }}>{labelCreneau(cr)}</strong>
                      </span>
                      <span style={{ fontSize: '0.8rem', color: complet ? COLORS.red : '#888' }}>{complet ? 'Complet' : `${occ}/${cr.capacite_max} places prises`}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {formule === 'unite' && (
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '1rem' }}>Choisis une date</h4>
              {seances.length === 0 && <p style={{ color: '#888' }}>Aucune date disponible pour le moment — contacte-nous directement.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
                {seances.map(s => {
                  const cr = creneaux.find(c => c.id === s.creneau_fixe_id)
                  if (!cr) return null
                  const occ = occupation(cr.id, s.date)
                  const complet = occ >= cr.capacite_max
                  return (
                    <label key={s.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                      cursor: complet ? 'not-allowed' : 'pointer', padding: '0.7rem 0.9rem', borderRadius: '10px',
                      background: selectedSeanceId === s.id ? COLORS.skyLight : '#f7f7f7', opacity: complet ? 0.5 : 1
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <input type="radio" name="seance_unite" disabled={complet} checked={selectedSeanceId === s.id} onChange={() => setSelectedSeanceId(s.id)}
                          style={{ width: '16px', height: '16px', cursor: complet ? 'not-allowed' : 'pointer', accentColor: COLORS.navy }} />
                        <strong style={{ color: COLORS.navy }}>{new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · {cr.heure_debut.slice(0, 5)}</strong>
                        {cr.niveaux && <span style={{ color: '#888', fontSize: '0.85rem' }}>{cr.niveaux}</span>}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: complet ? COLORS.red : '#888' }}>{complet ? 'Complet' : `${occ}/${cr.capacite_max} places prises`}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Étape 3 : coordonnées */}
          {formule && (
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1.5rem', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '1rem' }}>Les coordonnées de l'élève</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                <input placeholder="Prénom de l'élève *" value={child.child_name} onChange={e => setChild({ ...child, child_name: e.target.value })} style={inputStyle} />
                <input placeholder="Nom de l'élève *" value={child.child_nom} onChange={e => setChild({ ...child, child_nom: e.target.value })} style={inputStyle} />
                <input placeholder="Nom et prénom du parent (optionnel si l'élève est majeur)" value={child.parent_name} onChange={e => setChild({ ...child, parent_name: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
                <input placeholder="Email" value={child.email} onChange={e => setChild({ ...child, email: e.target.value })} style={inputStyle} />
                <input placeholder="GSM" value={child.phone} onChange={e => setChild({ ...child, phone: e.target.value })} style={inputStyle} />
              </div>

              <p style={{ color: '#888', fontSize: '0.78rem', lineHeight: '1.6', margin: '1rem 0 0 0' }}>
                Les informations recueillies sont nécessaires à l'organisation des leçons et pour vous contacter en cas
                de besoin concernant votre enfant. Elles sont réservées à l'équipe de l'Écurie de Groynne et ne sont
                jamais transmises à des tiers. <a href="/confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.sky }}>En savoir plus</a>.
              </p>

              <button onClick={soumettre} disabled={submitting}
                style={{ marginTop: '0.8rem', background: COLORS.sky, color: 'white', border: 'none', padding: '0.9rem 2rem', borderRadius: '50px', cursor: submitting ? 'wait' : 'pointer', fontSize: '1rem', fontWeight: 'bold', width: '100%' }}>
                {submitting ? 'Envoi...' : "Confirmer l'inscription"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, JOURS_SEMAINE } from '../../lib/theme'

function prochainesDates(jourSemaine, nbSemaines) {
  const dates = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let jour = new Date(today)
  const diff = (jourSemaine - jour.getDay() + 7) % 7
  jour.setDate(jour.getDate() + diff)
  for (let i = 0; i < nbSemaines; i++) {
    dates.push(new Date(jour).toISOString().split('T')[0])
    jour.setDate(jour.getDate() + 7)
  }
  return dates
}

function estEnVacances(date, periodes) {
  return periodes.some(p => date >= p.date_debut && date <= p.date_fin)
}

// Un cavalier est-il attendu à cette séance, selon son type d'abonnement ?
function estAttendu(abonnement, dateSeance) {
  if (abonnement.type === 'unite') return abonnement.date_debut === dateSeance
  if (abonnement.type === 'dix_lecons') return abonnement.date_debut <= dateSeance
  if (abonnement.type === 'vacances_a_vacances') {
    return abonnement.date_debut <= dateSeance && (!abonnement.date_fin || abonnement.date_fin >= dateSeance)
  }
  return false
}

export default function PresencesManager() {
  const [creneaux, setCreneaux] = useState([])
  const [seances, setSeances] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [openSeance, setOpenSeance] = useState(null)
  const [presences, setPresences] = useState({}) // { seanceId: [...] }
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState(null)

  const [libres, setLibres] = useState([])
  const [openLibre, setOpenLibre] = useState(null)
  const [bookingsLibre, setBookingsLibre] = useState({}) // { slotId: [...] }

  const [periodesVacances, setPeriodesVacances] = useState([])
  const [showVacancesForm, setShowVacancesForm] = useState(false)
  const [newVacances, setNewVacances] = useState({ nom: '', date_debut: '', date_fin: '' })

  useEffect(() => {
    fetchCreneaux()
    fetchSeances()
    fetchChevaux()
    fetchLibres()
    fetchVacances()
  }, [])

  async function fetchVacances() {
    const { data } = await supabase.from('vacances_scolaires').select('*').order('date_debut')
    setPeriodesVacances(data || [])
  }

  async function ajouterVacances() {
    if (!newVacances.nom || !newVacances.date_debut || !newVacances.date_fin) {
      setMessage({ type: 'error', text: 'Remplis tous les champs.' })
      return
    }
    const { error } = await supabase.from('vacances_scolaires').insert(newVacances)
    if (!error) {
      // Supprime les séances déjà générées qui tombent dans cette période
      await supabase.from('seances').delete().gte('date', newVacances.date_debut).lte('date', newVacances.date_fin)
      setNewVacances({ nom: '', date_debut: '', date_fin: '' })
      setShowVacancesForm(false)
      fetchVacances()
      fetchSeances()
      setMessage({ type: 'success', text: 'Période de vacances ajoutée, séances existantes sur cette période supprimées.' })
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'ajout." })
    }
  }

  async function supprimerVacances(id) {
    if (!confirm('Supprimer cette période de vacances ?')) return
    await supabase.from('vacances_scolaires').delete().eq('id', id)
    fetchVacances()
  }

  async function fetchLibres() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('slots').select('*').gte('date', today).order('date')
    setLibres(data || [])
  }

  async function ouvrirLibre(slotId) {
    if (openLibre === slotId) {
      setOpenLibre(null)
      return
    }
    setOpenLibre(slotId)
    const { data } = await supabase.from('bookings').select('*, chevaux(nom)').eq('slot_id', slotId)
    setBookingsLibre(prev => ({ ...prev, [slotId]: data || [] }))
  }

  async function marquerPresenceLibre(bookingId, present, slotId) {
    await supabase.from('bookings').update({ present }).eq('id', bookingId)
    const { data } = await supabase.from('bookings').select('*, chevaux(nom)').eq('slot_id', slotId)
    setBookingsLibre(prev => ({ ...prev, [slotId]: data || [] }))
  }

  async function assignerChevalLibre(bookingId, chevalId, slotId) {
    await supabase.from('bookings').update({ cheval_id: chevalId || null }).eq('id', bookingId)
    const { data } = await supabase.from('bookings').select('*, chevaux(nom)').eq('slot_id', slotId)
    setBookingsLibre(prev => ({ ...prev, [slotId]: data || [] }))
  }

  async function fetchCreneaux() {
    const { data } = await supabase.from('creneaux_fixes').select('*').eq('actif', true)
    setCreneaux(data || [])
  }

  async function fetchChevaux() {
    const { data } = await supabase.from('chevaux').select('*').eq('actif', true).order('nom')
    setChevaux(data || [])
  }

  async function fetchSeances() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('seances')
      .select('*, creneaux_fixes(jour_semaine, heure_debut, heure_fin, niveaux)')
      .gte('date', today)
      .eq('annulee', false)
      .order('date')
    setSeances(data || [])
  }

  async function genererSeances() {
    setGenerating(true)
    const rows = []
    let sautees = 0
    for (const cr of creneaux) {
      const dates = prochainesDates(cr.jour_semaine, 8) // 8 prochaines semaines
      for (const date of dates) {
        if (estEnVacances(date, periodesVacances)) {
          sautees++
          continue
        }
        rows.push({ creneau_fixe_id: cr.id, date })
      }
    }
    const { error } = await supabase.from('seances').upsert(rows, { onConflict: 'creneau_fixe_id,date', ignoreDuplicates: true })
    setGenerating(false)
    if (!error) {
      setMessage({ type: 'success', text: `Séances générées pour les 8 prochaines semaines${sautees > 0 ? ` (${sautees} date(s) sautée(s) car en vacances)` : ''}.` })
      fetchSeances()
    } else {
      setMessage({ type: 'error', text: 'Erreur lors de la génération.' })
    }
  }

  async function ouvrirSeance(seance) {
    if (openSeance === seance.id) {
      setOpenSeance(null)
      return
    }
    setOpenSeance(seance.id)

    // 1. Récupérer les abonnements actifs pour ce créneau
    const { data: abos } = await supabase
      .from('abonnements')
      .select('*, cavaliers(prenom, nom)')
      .eq('creneau_fixe_id', seance.creneau_fixe_id)
      .eq('actif', true)

    const attendus = (abos || []).filter(a => estAttendu(a, seance.date))

    // 2. Récupérer les présences déjà créées pour cette séance
    const { data: existantes } = await supabase
      .from('presences')
      .select('*')
      .eq('seance_id', seance.id)

    const existantIds = new Set((existantes || []).map(p => p.cavalier_id))

    // 3. Créer les lignes manquantes
    const aCreer = attendus.filter(a => !existantIds.has(a.cavalier_id)).map(a => ({
      seance_id: seance.id,
      cavalier_id: a.cavalier_id,
      present: null
    }))
    if (aCreer.length > 0) {
      await supabase.from('presences').insert(aCreer)
    }

    // 4. Recharger complet avec infos cavalier + cheval + abonnement (pour affichage type d'abo)
    const { data: finales } = await supabase
      .from('presences')
      .select('*, cavaliers(prenom, nom)')
      .eq('seance_id', seance.id)

    const avecAbo = (finales || []).map(p => ({
      ...p,
      abonnement: attendus.find(a => a.cavalier_id === p.cavalier_id)
    }))

    setPresences(prev => ({ ...prev, [seance.id]: avecAbo }))
  }

  async function marquer(presence, present, seanceId) {
    await supabase.from('presences').update({ present }).eq('id', presence.id)

    // Si présent et abonnement "10 leçons" : décrémenter les leçons restantes
    if (present === true && presence.abonnement?.type === 'dix_lecons' && presence.present !== true) {
      const restantes = Math.max(0, (presence.abonnement.lecons_restantes || 0) - 1)
      await supabase.from('abonnements').update({ lecons_restantes: restantes }).eq('id', presence.abonnement.id)
    }
    // Si on annule une présence qui avait déjà été comptée, recréditer
    if (present !== true && presence.present === true && presence.abonnement?.type === 'dix_lecons') {
      const restantes = (presence.abonnement.lecons_restantes || 0) + 1
      await supabase.from('abonnements').update({ lecons_restantes: restantes }).eq('id', presence.abonnement.id)
    }

    const seance = seances.find(s => s.id === seanceId)
    if (seance) ouvrirSeanceRefresh(seance)
  }

  async function ouvrirSeanceRefresh(seance) {
    setOpenSeance(seance.id)
    const { data: abos } = await supabase
      .from('abonnements')
      .select('*, cavaliers(prenom, nom)')
      .eq('creneau_fixe_id', seance.creneau_fixe_id)
      .eq('actif', true)
    const attendus = (abos || []).filter(a => estAttendu(a, seance.date))
    const { data: finales } = await supabase
      .from('presences')
      .select('*, cavaliers(prenom, nom)')
      .eq('seance_id', seance.id)
    const avecAbo = (finales || []).map(p => ({ ...p, abonnement: attendus.find(a => a.cavalier_id === p.cavalier_id) }))
    setPresences(prev => ({ ...prev, [seance.id]: avecAbo }))
  }

  async function assignerCheval(presenceId, chevalId, seanceId) {
    await supabase.from('presences').update({ cheval_id: chevalId || null }).eq('id', presenceId)
    const seance = seances.find(s => s.id === seanceId)
    if (seance) ouvrirSeanceRefresh(seance)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>✅ Présences</h3>
        <button onClick={genererSeances} disabled={generating}
          style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: generating ? 'wait' : 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
          {generating ? '⏳ Génération...' : '🔄 Générer les séances'}
        </button>
      </div>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <h3 style={{ color: COLORS.navy, fontSize: '1rem' }}>📅 Séances à venir</h3>

      {seances.length === 0 && <p style={{ color: '#888' }}>Aucune séance à venir. Clique sur "Générer les séances" (il faut d'abord avoir créé des créneaux fixes).</p>}

      {seances.map(s => (
        <div key={s.id} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.6rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', border: `2px solid ${openSeance === s.id ? COLORS.sky : 'transparent'}` }}>
          <div onClick={() => ouvrirSeance(s)}
            style={{ padding: '0.7rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            <div>
              <span style={{ background: COLORS.skyLight, color: COLORS.navy, padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', marginRight: '0.5rem' }}>
                {new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <strong style={{ color: COLORS.navy }}>{s.creneaux_fixes?.heure_debut?.slice(0, 5)}</strong>
              {s.creneaux_fixes?.niveaux && <span style={{ color: '#888', marginLeft: '0.5rem', fontSize: '0.85rem' }}>{s.creneaux_fixes.niveaux}</span>}
            </div>
            <span style={{ color: COLORS.sky }}>{openSeance === s.id ? '▲' : '▼'}</span>
          </div>

          {openSeance === s.id && (
            <div style={{ borderTop: `2px solid ${COLORS.skyLight}`, padding: '0.8rem 1rem' }}>
              {(presences[s.id] || []).length === 0 && <p style={{ color: '#888', fontSize: '0.85rem' }}>Aucun cavalier attendu à cette séance.</p>}
              {(presences[s.id] || []).map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ fontWeight: 'bold', color: COLORS.navy, fontSize: '0.9rem' }}>{p.cavaliers?.prenom} {p.cavaliers?.nom}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <select value={p.cheval_id || ''} onChange={e => assignerCheval(p.id, e.target.value, s.id)}
                      style={{ padding: '0.3rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.82rem' }}>
                      <option value="">Cheval...</option>
                      {chevaux.map(ch => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                    </select>
                    <button onClick={() => marquer(p, true, s.id)}
                      style={{ background: p.present === true ? COLORS.green : '#eee', color: p.present === true ? 'white' : '#666', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      ✓ Présent
                    </button>
                    <button onClick={() => marquer(p, false, s.id)}
                      style={{ background: p.present === false ? COLORS.red : '#eee', color: p.present === false ? 'white' : '#666', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      ✕ Absent
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <h3 style={{ color: COLORS.navy, fontSize: '1rem', marginTop: '2rem' }}>🌐 Créneaux libres à venir</h3>

      {libres.length === 0 && <p style={{ color: '#888' }}>Aucun créneau libre à venir.</p>}

      {libres.map(s => (
        <div key={s.id} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.6rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', border: `2px solid ${openLibre === s.id ? COLORS.terracotta || '#b5764c' : 'transparent'}` }}>
          <div onClick={() => ouvrirLibre(s.id)}
            style={{ padding: '0.7rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            <div>
              <span style={{ background: '#f6ece2', color: COLORS.navy, padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', marginRight: '0.5rem' }}>
                {new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <strong style={{ color: COLORS.navy }}>{s.time_start?.slice(0, 5)}</strong>
              <span style={{ color: '#888', marginLeft: '0.5rem', fontSize: '0.85rem' }}>{s.title}</span>
            </div>
            <span style={{ color: COLORS.terracotta || '#b5764c' }}>{openLibre === s.id ? '▲' : '▼'}</span>
          </div>

          {openLibre === s.id && (
            <div style={{ borderTop: `2px solid ${COLORS.skyLight}`, padding: '0.8rem 1rem' }}>
              {(bookingsLibre[s.id] || []).length === 0 && <p style={{ color: '#888', fontSize: '0.85rem' }}>Aucun cavalier inscrit.</p>}
              {(bookingsLibre[s.id] || []).map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ fontWeight: 'bold', color: COLORS.navy, fontSize: '0.9rem' }}>{b.child_name} {b.child_nom}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <select value={b.cheval_id || ''} onChange={e => assignerChevalLibre(b.id, e.target.value, s.id)}
                      style={{ padding: '0.3rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.82rem' }}>
                      <option value="">Cheval...</option>
                      {chevaux.map(ch => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                    </select>
                    <button onClick={() => marquerPresenceLibre(b.id, true, s.id)}
                      style={{ background: b.present === true ? COLORS.green : '#eee', color: b.present === true ? 'white' : '#666', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      ✓ Présent
                    </button>
                    <button onClick={() => marquerPresenceLibre(b.id, false, s.id)}
                      style={{ background: b.present === false ? COLORS.red : '#eee', color: b.present === false ? 'white' : '#666', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      ✕ Absent
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{ background: 'white', borderRadius: '12px', padding: '1rem', marginTop: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: 0.9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h4 style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>🏖️ Périodes de vacances scolaires</h4>
          <button onClick={() => setShowVacancesForm(!showVacancesForm)}
            style={{ background: '#eee', color: COLORS.navy, border: 'none', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
            {showVacancesForm ? '✕ Fermer' : '➕ Ajouter une période'}
          </button>
        </div>
        <p style={{ color: '#aaa', fontSize: '0.78rem', margin: '0.4rem 0 0.6rem 0' }}>
          Les dates comprises dans ces périodes ne sont jamais utilisées pour générer des séances de cours fixes (les cours à l'année suivent le calendrier scolaire).
        </p>

        {showVacancesForm && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <input placeholder="Ex: Toussaint 2026" value={newVacances.nom} onChange={e => setNewVacances({ ...newVacances, nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input type="date" value={newVacances.date_debut} onChange={e => setNewVacances({ ...newVacances, date_debut: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input type="date" value={newVacances.date_fin} onChange={e => setNewVacances({ ...newVacances, date_fin: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <button onClick={ajouterVacances}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
              Ajouter
            </button>
          </div>
        )}

        {periodesVacances.length === 0 && <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Aucune période enregistrée.</p>}
        {periodesVacances.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #eee', fontSize: '0.85rem' }}>
            <span><strong>{p.nom}</strong> — du {new Date(p.date_debut).toLocaleDateString('fr-FR')} au {new Date(p.date_fin).toLocaleDateString('fr-FR')}</span>
            <button onClick={() => supprimerVacances(p.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  )
}

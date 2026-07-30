import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'
import { toLocalISODate } from '../../lib/dates'

// Un cavalier est-il attendu à cette séance fixe, selon son type d'abonnement ?
function estAttendu(abonnement, dateSeance) {
  if (abonnement.type === 'unite') return abonnement.date_debut === dateSeance
  if (abonnement.type === 'dix_lecons') return abonnement.date_debut <= dateSeance
  if (abonnement.type === 'vacances_a_vacances') {
    return abonnement.date_debut <= dateSeance && (!abonnement.date_fin || abonnement.date_fin >= dateSeance)
  }
  return false
}

export default function MesCours() {
  const [cours, setCours] = useState([]) // liste unifiée { id, kind, date, heure, label, riders }
  const [cavaliers, setCavaliers] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [ouvert, setOuvert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ajoutOuvert, setAjoutOuvert] = useState(null)
  const [ajoutId, setAjoutId] = useState('')
  const [message, setMessage] = useState(null)
  const [packsEpuises, setPacksEpuises] = useState([])

  useEffect(() => {
    fetchTout()
    fetchCavaliers()
    fetchChevaux()
    fetchPacksEpuises()
  }, [])

  async function fetchPacksEpuises() {
    const { data } = await supabase
      .from('abonnements')
      .select('id, cavaliers(prenom, nom), creneaux_fixes(niveaux, heure_debut)')
      .eq('type', 'dix_lecons')
      .eq('actif', true)
      .lte('lecons_restantes', 0)
    setPacksEpuises(data || [])
  }

  async function terminerPack(id) {
    await supabase.from('abonnements').update({ actif: false }).eq('id', id)
    fetchPacksEpuises()
  }

  async function fetchCavaliers() {
    const { data } = await supabase.from('cavaliers').select('*').eq('actif', true).order('nom')
    setCavaliers(data || [])
  }

  async function fetchChevaux() {
    const { data } = await supabase.from('chevaux').select('*').eq('actif', true).order('nom')
    setChevaux(data || [])
  }

  async function fetchTout() {
    setLoading(true)
    const today = toLocalISODate(new Date())
    const dansDeuxSemaines = new Date()
    dansDeuxSemaines.setDate(dansDeuxSemaines.getDate() + 14)
    const dateLimite = toLocalISODate(dansDeuxSemaines)

    // Séances des cours fixes
    const { data: seancesData } = await supabase
      .from('seances')
      .select('*, creneaux_fixes(heure_debut, niveaux)')
      .gte('date', today)
      .lte('date', dateLimite)
      .eq('annulee', false)
      .order('date')

    const seancesAvecRiders = await Promise.all((seancesData || []).map(async s => {
      const { data: abos } = await supabase
        .from('abonnements')
        .select('*, cavaliers(prenom, nom)')
        .eq('creneau_fixe_id', s.creneau_fixe_id)
        .eq('actif', true)
      const attendus = (abos || []).filter(a => estAttendu(a, s.date))

      const { data: existantes } = await supabase.from('presences').select('*').eq('seance_id', s.id)
      const existantIds = new Set((existantes || []).map(p => p.cavalier_id))
      const aCreer = attendus.filter(a => !existantIds.has(a.cavalier_id)).map(a => ({ seance_id: s.id, cavalier_id: a.cavalier_id, present: null }))
      if (aCreer.length > 0) await supabase.from('presences').insert(aCreer)

      const { data: presencesFinales } = await supabase.from('presences').select('*, cavaliers(prenom, nom)').eq('seance_id', s.id)

      return {
        id: `fixe-${s.id}`,
        rawId: s.id,
        kind: 'fixe',
        creneauFixeId: s.creneau_fixe_id,
        date: s.date,
        heure: s.creneaux_fixes?.heure_debut?.slice(0, 5) || '',
        label: s.creneaux_fixes?.niveaux || 'Cours fixe',
        riders: (presencesFinales || []).map(p => ({
          rowId: p.id,
          cavalier_id: p.cavalier_id,
          nom: `${p.cavaliers?.prenom || ''} ${p.cavaliers?.nom || ''}`.trim(),
          cheval_id: p.cheval_id,
          present: p.present
        }))
      }
    }))

    // Créneaux libres
    const { data: libresData } = await supabase
      .from('slots')
      .select('*')
      .gte('date', today)
      .lte('date', dateLimite)
      .order('date')

    const libresAvecRiders = await Promise.all((libresData || []).map(async s => {
      const { data: bookings } = await supabase.from('bookings').select('*').eq('slot_id', s.id)
      return {
        id: `libre-${s.id}`,
        rawId: s.id,
        kind: 'libre',
        date: s.date,
        heure: s.time_start?.slice(0, 5) || '',
        label: s.title || 'Créneau libre',
        riders: (bookings || []).map(b => ({
          rowId: b.id,
          nom: `${b.child_name || ''} ${b.child_nom || ''}`.trim(),
          cheval_id: b.cheval_id,
          present: b.present
        }))
      }
    }))

    const tous = [...seancesAvecRiders, ...libresAvecRiders].sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))
    setCours(tous)
    setLoading(false)
  }

  async function rafraichirUnCours(item) {
    if (item.kind === 'fixe') {
      const { data: presencesFinales } = await supabase.from('presences').select('*, cavaliers(prenom, nom)').eq('seance_id', item.rawId)
      const riders = (presencesFinales || []).map(p => ({
        rowId: p.id, cavalier_id: p.cavalier_id, nom: `${p.cavaliers?.prenom || ''} ${p.cavaliers?.nom || ''}`.trim(), cheval_id: p.cheval_id, present: p.present
      }))
      setCours(prev => prev.map(c => c.id === item.id ? { ...c, riders } : c))
    } else {
      const { data: bookings } = await supabase.from('bookings').select('*').eq('slot_id', item.rawId)
      const riders = (bookings || []).map(b => ({
        rowId: b.id, nom: `${b.child_name || ''} ${b.child_nom || ''}`.trim(), cheval_id: b.cheval_id, present: b.present
      }))
      setCours(prev => prev.map(c => c.id === item.id ? { ...c, riders } : c))
    }
  }

  async function marquerPresence(item, rider, present) {
    const table = item.kind === 'fixe' ? 'presences' : 'bookings'
    const ancienPresent = rider.present
    await supabase.from(table).update({ present }).eq('id', rider.rowId)

    // Pack de 10 leçons : une présence consomme une leçon, une absence ne consomme rien
    // (et on rend la leçon si on annule une présence déjà pointée).
    if (item.kind === 'fixe') {
      const consommaitAvant = ancienPresent === true
      const consommeMaintenant = present === true
      if (consommaitAvant !== consommeMaintenant) {
        const { data: abo } = await supabase
          .from('abonnements')
          .select('id, lecons_restantes')
          .eq('cavalier_id', rider.cavalier_id)
          .eq('creneau_fixe_id', item.creneauFixeId)
          .eq('type', 'dix_lecons')
          .eq('actif', true)
          .limit(1)
          .maybeSingle()
        if (abo) {
          const delta = consommeMaintenant ? -1 : 1
          const restantes = Math.max(0, (abo.lecons_restantes || 0) + delta)
          await supabase.from('abonnements').update({ lecons_restantes: restantes }).eq('id', abo.id)
          fetchPacksEpuises()
        }
      }
    }

    rafraichirUnCours(item)
  }

  async function assignerCheval(item, rider, chevalId) {
    const table = item.kind === 'fixe' ? 'presences' : 'bookings'
    await supabase.from(table).update({ cheval_id: chevalId || null }).eq('id', rider.rowId)
    rafraichirUnCours(item)
  }

  async function retirer(item, rider) {
    if (!confirm(`Retirer ${rider.nom} de ce cours ?`)) return
    const table = item.kind === 'fixe' ? 'presences' : 'bookings'
    await supabase.from(table).delete().eq('id', rider.rowId)
    rafraichirUnCours(item)
  }

  async function ajouterRemplacant(item) {
    if (!ajoutId) {
      setMessage({ type: 'error', text: 'Choisis un élève dans la liste.' })
      return
    }
    if (item.kind === 'fixe') {
      const { error } = await supabase.from('presences').insert({ seance_id: item.rawId, cavalier_id: ajoutId, present: true })
      if (error) { setMessage({ type: 'error', text: 'Cet élève est déjà dans ce cours.' }); return }
    } else {
      const cavalier = cavaliers.find(c => c.id === ajoutId)
      const { error } = await supabase.from('bookings').insert({ slot_id: item.rawId, child_name: cavalier?.prenom || '', child_nom: cavalier?.nom || '', parent_name: cavalier?.parent_nom || '', email: cavalier?.email || '', phone: cavalier?.telephone || '', present: true })
      if (error) { setMessage({ type: 'error', text: "Erreur lors de l'ajout." }); return }
    }
    setAjoutId('')
    setAjoutOuvert(null)
    rafraichirUnCours(item)
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00')
    const auj = toLocalISODate(new Date())
    const demain = new Date(); demain.setDate(demain.getDate() + 1)
    const demainStr = toLocalISODate(demain)
    if (dateStr === auj) return "Aujourd'hui"
    if (dateStr === demainStr) return 'Demain'
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  return (
    <div>
      <h3 style={{ color: COLORS.navy, fontSize: '1.1rem', marginBottom: '0.3rem' }}>📅 Mes cours (14 prochains jours)</h3>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '1.2rem' }}>
        Clique sur un cours pour voir qui vient, pointer les présences et choisir les chevaux.
      </p>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {packsEpuises.length > 0 && (
        <div style={{ background: '#fff3cd', color: '#856404', padding: '0.8rem 1rem', borderRadius: '10px', marginBottom: '1.2rem', border: '1px solid #ffe69c' }}>
          <strong style={{ display: 'block', marginBottom: '0.3rem' }}>⚠️ Pack de 10 leçons épuisé</strong>
          {packsEpuises.map(p => (
            <div key={p.id} style={{ fontSize: '0.88rem' }}>
              {p.cavaliers?.prenom} {p.cavaliers?.nom} — {p.creneaux_fixes?.niveaux || 'cours fixe'} ({p.creneaux_fixes?.heure_debut?.slice(0, 5)})
            </div>
          ))}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Chargement...</p>}

      {!loading && cours.length === 0 && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ color: '#888', margin: 0 }}>Aucun cours prévu dans les 14 prochains jours.</p>
        </div>
      )}

      {cours.map(item => (
        <div key={item.id} style={{ background: 'white', borderRadius: '14px', marginBottom: '0.8rem', boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflow: 'hidden', border: `2px solid ${ouvert === item.id ? COLORS.sky : 'transparent'}` }}>
          <div onClick={() => setOuvert(ouvert === item.id ? null : item.id)}
            style={{ padding: '1rem 1.1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ color: '#888', fontSize: '0.8rem', textTransform: 'capitalize', marginBottom: '0.15rem' }}>{formatDate(item.date)}</div>
              <strong style={{ color: COLORS.navy, fontSize: '1.05rem' }}>{item.heure}</strong>
              <span style={{ color: '#666', marginLeft: '0.6rem' }}>{item.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ color: '#888', fontSize: '0.85rem' }}>{item.riders.length} élève{item.riders.length > 1 ? 's' : ''}</span>
              <span style={{ color: COLORS.sky, fontSize: '1.2rem' }}>{ouvert === item.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {ouvert === item.id && (
            <div style={{ borderTop: `2px solid ${COLORS.skyLight}`, padding: '1rem 1.1rem' }}>
              {item.riders.length === 0 && <p style={{ color: '#888', fontSize: '0.9rem' }}>Personne d'inscrit pour ce cours.</p>}

              {item.riders.map(rider => (
                <div key={rider.rowId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', padding: '0.7rem 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ fontWeight: 'bold', color: COLORS.navy, fontSize: '1rem' }}>{rider.nom}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select value={rider.cheval_id || ''} onChange={e => assignerCheval(item, rider, e.target.value)}
                      style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
                      <option value="">🐴 Cheval...</option>
                      {chevaux.map(ch => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                    </select>
                    <button onClick={() => marquerPresence(item, rider, true)}
                      style={{ background: rider.present === true ? COLORS.green : '#eee', color: rider.present === true ? 'white' : '#666', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                      ✓ Présent
                    </button>
                    <button onClick={() => marquerPresence(item, rider, false)}
                      style={{ background: rider.present === false ? COLORS.red : '#eee', color: rider.present === false ? 'white' : '#666', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                      ✕ Absent
                    </button>
                    <button onClick={() => retirer(item, rider)} title="Retirer"
                      style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                  </div>
                </div>
              ))}

              {ajoutOuvert === item.id ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.8rem', flexWrap: 'wrap' }}>
                  <select value={ajoutId} onChange={e => setAjoutId(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
                    <option value="">Choisir un élève...</option>
                    {cavaliers.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                  </select>
                  <button onClick={() => ajouterRemplacant(item)}
                    style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    Ajouter
                  </button>
                  <button onClick={() => { setAjoutOuvert(null); setAjoutId('') }}
                    style={{ background: '#eee', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    Annuler
                  </button>
                </div>
              ) : (
                <button onClick={() => setAjoutOuvert(item.id)}
                  style={{ background: 'none', border: `1px dashed ${COLORS.sky}`, color: COLORS.sky, padding: '0.5rem 0.9rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.8rem' }}>
                  ➕ Ajouter un élève à ce cours
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'
import { toLocalISODate } from '../../lib/dates'
import { chevalDejaAssigne } from '../../lib/chevaux'
import { enregistrerPresence } from '../../lib/presences'

// Historique des cours passés sous forme de calendrier : cours fixes, créneaux
// libres/privés, stages, concours et événements, avec les élèves, leurs
// présences et les chevaux. Consultation libre ; on peut seulement corriger a
// posteriori une présence ou un cheval oublié (pas de suppression ici).

const TYPES = {
  fixe: { label: 'Cours fixe', color: COLORS.navy },
  libre: { label: 'Créneau libre / privé', color: COLORS.sky },
  stage: { label: 'Stage', color: COLORS.red },
  concours: { label: 'Concours', color: COLORS.green },
  evenement: { label: 'Événement', color: '#f1c40f' }
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function pad(n) { return String(n).padStart(2, '0') }
function isoDate(annee, mois, jour) { return `${annee}-${pad(mois + 1)}-${pad(jour)}` }
function formatJourLong(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function formatCourt(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export default function HistoriqueCalendrier() {
  const maintenant = new Date()
  const [annee, setAnnee] = useState(maintenant.getFullYear())
  const [mois, setMois] = useState(maintenant.getMonth())
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [jourOuvert, setJourOuvert] = useState(null)
  const [filtreType, setFiltreType] = useState('tous')
  const [filtreEleve, setFiltreEleve] = useState('')
  const [filtreCheval, setFiltreCheval] = useState('')
  const [cavaliers, setCavaliers] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [message, setMessage] = useState(null)

  const aujourdhui = toLocalISODate(new Date())
  const moisCourant = annee === maintenant.getFullYear() && mois === maintenant.getMonth()

  useEffect(() => {
    supabase.from('cavaliers').select('id, prenom, nom').order('nom').then(({ data }) => setCavaliers(data || []))
    supabase.from('chevaux').select('id, nom, note, actif').order('nom').then(({ data }) => setChevaux(data || []))
  }, [])

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true)
    const debut = isoDate(annee, mois, 1)
    const nbJours = new Date(annee, mois + 1, 0).getDate()
    const fin = isoDate(annee, mois, nbJours)

    const [{ data: seances }, { data: slots }, { data: events }] = await Promise.all([
      supabase.from('seances')
        .select('id, date, annulee, note, creneau_fixe_id, creneaux_fixes(heure_debut, heure_fin, niveaux)')
        .gte('date', debut).lte('date', fin),
      supabase.from('slots')
        .select('id, title, date, time_start, time_end, note')
        .gte('date', debut).lte('date', fin),
      supabase.from('events')
        .select('id, title, type, date_start, date_end, description')
        .lte('date_start', fin).gte('date_end', debut)
    ])

    const seanceIds = (seances || []).map(s => s.id)
    const slotIds = (slots || []).map(s => s.id)
    const eventIds = (events || []).map(e => e.id)

    const [presRes, bookRes, inscRes] = await Promise.all([
      seanceIds.length > 0
        ? supabase.from('presences').select('id, seance_id, cavalier_id, cheval_id, present, exclu, cavaliers(prenom, nom)').in('seance_id', seanceIds)
        : Promise.resolve({ data: [] }),
      slotIds.length > 0
        ? supabase.from('bookings').select('id, slot_id, cavalier_id, child_name, child_nom, cheval_id, present').in('slot_id', slotIds)
        : Promise.resolve({ data: [] }),
      eventIds.length > 0
        ? supabase.from('event_inscriptions').select('id, event_id, cavalier_id, child_name, child_nom').in('event_id', eventIds)
        : Promise.resolve({ data: [] })
    ])

    const liste = []

    ;(seances || []).forEach(s => {
      liste.push({
        key: `fixe-${s.id}`,
        kind: 'fixe',
        date: s.date,
        heure: s.creneaux_fixes?.heure_debut?.slice(0, 5) || '',
        heureFin: s.creneaux_fixes?.heure_fin?.slice(0, 5) || '',
        label: s.creneaux_fixes?.niveaux || 'Cours fixe',
        annulee: !!s.annulee,
        note: s.note || '',
        creneauFixeId: s.creneau_fixe_id,
        riders: (presRes.data || [])
          .filter(p => p.seance_id === s.id && !p.exclu)
          .map(p => ({
            rowId: p.id,
            cavalierId: p.cavalier_id,
            nom: `${p.cavaliers?.prenom || ''} ${p.cavaliers?.nom || ''}`.trim(),
            chevalId: p.cheval_id,
            present: p.present
          }))
      })
    })

    ;(slots || []).forEach(s => {
      liste.push({
        key: `libre-${s.id}`,
        kind: 'libre',
        date: s.date,
        heure: s.time_start?.slice(0, 5) || '',
        heureFin: s.time_end?.slice(0, 5) || '',
        label: s.title || 'Créneau libre',
        annulee: false,
        note: s.note || '',
        riders: (bookRes.data || [])
          .filter(b => b.slot_id === s.id)
          .map(b => ({
            rowId: b.id,
            cavalierId: b.cavalier_id || null,
            nom: `${b.child_name || ''} ${b.child_nom || ''}`.trim(),
            chevalId: b.cheval_id,
            present: b.present
          }))
      })
    })

    // Stages / concours / événements : une ligne par jour couvert dans le mois.
    ;(events || []).forEach(ev => {
      const kind = ev.type === 'stage' ? 'stage' : ev.type === 'concours' ? 'concours' : 'evenement'
      const inscrits = (inscRes.data || [])
        .filter(i => i.event_id === ev.id)
        .map(i => ({ rowId: i.id, cavalierId: i.cavalier_id || null, nom: `${i.child_name || ''} ${i.child_nom || ''}`.trim() }))
      const premier = ev.date_start > debut ? ev.date_start : debut
      const dernier = ev.date_end < fin ? ev.date_end : fin
      for (let d = new Date(premier + 'T12:00:00'); toLocalISODate(d) <= dernier; d.setDate(d.getDate() + 1)) {
        liste.push({
          key: `ev-${ev.id}-${toLocalISODate(d)}`,
          kind,
          date: toLocalISODate(d),
          heure: '',
          heureFin: '',
          label: ev.title,
          annulee: false,
          note: ev.description || '',
          periode: ev.date_start === ev.date_end ? formatCourt(ev.date_start) : `du ${formatCourt(ev.date_start)} au ${formatCourt(ev.date_end)}`,
          inscrits
        })
      }
    })

    setEntries(liste)
    setLoading(false)
  }, [annee, mois])

  useEffect(() => { charger() }, [charger])

  function moisPrecedent() {
    setJourOuvert(null)
    if (mois === 0) { setMois(11); setAnnee(annee - 1) } else setMois(mois - 1)
  }
  function moisSuivant() {
    if (moisCourant) return
    setJourOuvert(null)
    if (mois === 11) { setMois(0); setAnnee(annee + 1) } else setMois(mois + 1)
  }

  const eleveSel = cavaliers.find(c => c.id === filtreEleve)
  function estEleveFiltre(r) {
    if (!eleveSel) return false
    if (r.cavalierId) return r.cavalierId === eleveSel.id
    return r.nom.toLowerCase() === `${eleveSel.prenom} ${eleveSel.nom}`.toLowerCase()
  }

  const visibles = entries.filter(e => {
    if (e.date >= aujourdhui) return false
    if (filtreType !== 'tous' && e.kind !== filtreType) return false
    const gens = e.riders || e.inscrits || []
    if (filtreEleve && !gens.some(estEleveFiltre)) return false
    if (filtreCheval && !(e.riders || []).some(r => r.chevalId === filtreCheval)) return false
    return true
  })

  const parJour = {}
  visibles.forEach(e => { (parJour[e.date] = parJour[e.date] || []).push(e) })

  const nbJoursMois = new Date(annee, mois + 1, 0).getDate()
  const decalage = (new Date(annee, mois, 1).getDay() + 6) % 7
  const cases = []
  for (let i = 0; i < decalage; i++) cases.push(null)
  for (let j = 1; j <= nbJoursMois; j++) cases.push(j)

  const entreesDuJour = jourOuvert
    ? (parJour[jourOuvert] || []).slice().sort((a, b) => a.heure.localeCompare(b.heure))
    : []

  async function corrigerPresence(entry, rider, nouveau) {
    if (rider.present === nouveau) return
    const { error } = await enregistrerPresence({
      kind: entry.kind,
      rowId: rider.rowId,
      cavalierId: rider.cavalierId,
      creneauFixeId: entry.creneauFixeId,
      ancien: rider.present,
      nouveau
    })
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la modification de la présence.' })
      return
    }
    setMessage(null)
    charger(true)
  }

  async function corrigerCheval(entry, rider, chevalId) {
    const table = entry.kind === 'fixe' ? 'presences' : 'bookings'
    if (chevalId) {
      const conflit = await chevalDejaAssigne({
        date: entry.date,
        heureDebut: entry.heure,
        heureFin: entry.heureFin,
        chevalId,
        excluerTable: table,
        excluerId: rider.rowId
      })
      if (conflit) {
        const cheval = chevaux.find(ch => ch.id === chevalId)
        setMessage({ type: 'error', text: `${cheval?.nom || 'Ce cheval'} était déjà assigné à ${conflit.nom} sur "${conflit.label}" à ${conflit.heure} ce jour-là. Choisis un autre cheval.` })
        return
      }
    }
    const { error } = await supabase.from(table).update({ cheval_id: chevalId || null }).eq('id', rider.rowId)
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la modification du cheval.' })
      return
    }
    setMessage(null)
    charger(true)
  }

  const selectStyle = { padding: '0.45rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.85rem', background: 'white', maxWidth: '100%' }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h4 style={{ color: COLORS.navy, margin: '0 0 0.3rem 0', fontSize: '1rem' }}>📅 Historique des cours</h4>
      <p style={{ color: '#888', fontSize: '0.82rem', margin: '0 0 0.8rem 0' }}>
        Clique sur un jour passé pour voir les cours, les élèves, leurs présences et les chevaux. Tu peux corriger une présence ou un cheval oublié.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        <select value={filtreType} onChange={e => { setFiltreType(e.target.value); setJourOuvert(null) }} style={selectStyle}>
          <option value="tous">Tous les types</option>
          {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
        <select value={filtreEleve} onChange={e => { setFiltreEleve(e.target.value); setJourOuvert(null) }} style={selectStyle}>
          <option value="">Tous les élèves</option>
          {cavaliers.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
        <select value={filtreCheval} onChange={e => { setFiltreCheval(e.target.value); setJourOuvert(null) }} style={selectStyle}>
          <option value="">Tous les chevaux</option>
          {chevaux.map(ch => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
        </select>
        {(filtreType !== 'tous' || filtreEleve || filtreCheval) && (
          <button onClick={() => { setFiltreType('tous'); setFiltreEleve(''); setFiltreCheval(''); setJourOuvert(null) }}
            style={{ background: 'none', border: '1px solid #ccc', color: '#555', borderRadius: '8px', padding: '0.45rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            ✕ Effacer les filtres
          </button>
        )}
      </div>

      {message && (
        <div style={{ background: message.type === 'error' ? '#fdecea' : '#d4edda', color: message.type === 'error' ? '#721c24' : '#155724', padding: '0.7rem 1rem', borderRadius: '8px', marginBottom: '0.8rem', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <button onClick={moisPrecedent} aria-label="Mois précédent"
            style={{ background: COLORS.skyLight, color: COLORS.navy, border: 'none', borderRadius: '8px', padding: '0.4rem 0.9rem', cursor: 'pointer', fontWeight: 'bold' }}>‹</button>
          <strong style={{ color: COLORS.navy, textTransform: 'capitalize' }}>{MOIS[mois]} {annee}</strong>
          <button onClick={moisSuivant} disabled={moisCourant} aria-label="Mois suivant"
            style={{ background: COLORS.skyLight, color: COLORS.navy, border: 'none', borderRadius: '8px', padding: '0.4rem 0.9rem', cursor: moisCourant ? 'default' : 'pointer', fontWeight: 'bold', opacity: moisCourant ? 0.35 : 1 }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {JOURS_COURTS.map(j => (
            <div key={j} style={{ textAlign: 'center', fontSize: '0.72rem', color: '#999', fontWeight: 'bold' }}>{j}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', opacity: loading ? 0.5 : 1 }}>
          {cases.map((jour, idx) => {
            if (jour === null) return <div key={`vide-${idx}`} />
            const iso = isoDate(annee, mois, jour)
            const duJour = parJour[iso] || []
            const cliquable = duJour.length > 0
            const types = [...new Set(duJour.map(e => e.kind))]
            const ouvert = jourOuvert === iso
            return (
              <button key={iso} onClick={() => cliquable && setJourOuvert(ouvert ? null : iso)} disabled={!cliquable}
                style={{
                  minHeight: '54px', padding: '0.25rem 0.15rem', borderRadius: '8px', fontSize: '0.8rem',
                  border: ouvert ? `2px solid ${COLORS.navy}` : '1px solid #eee',
                  background: ouvert ? COLORS.skyLight : cliquable ? 'white' : '#fafafa',
                  color: iso >= aujourdhui ? '#ccc' : cliquable ? COLORS.navy : '#bbb',
                  cursor: cliquable ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '3px',
                  fontWeight: cliquable ? 'bold' : 'normal'
                }}>
                <span>{jour}</span>
                {cliquable && (
                  <>
                    <span style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {types.map(t => <span key={t} style={{ width: '7px', height: '7px', borderRadius: '50%', background: TYPES[t].color, display: 'inline-block' }} />)}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#888', fontWeight: 'normal' }}>{duJour.length}</span>
                  </>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginTop: '0.8rem', fontSize: '0.75rem', color: '#777' }}>
          {Object.entries(TYPES).map(([k, t]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: t.color, display: 'inline-block' }} />{t.label}
            </span>
          ))}
        </div>
        {!loading && visibles.length === 0 && (
          <p style={{ color: '#999', fontSize: '0.85rem', margin: '0.8rem 0 0 0' }}>Aucun cours passé trouvé pour ce mois{(filtreType !== 'tous' || filtreEleve || filtreCheval) ? ' avec ces filtres' : ''}.</p>
        )}
      </div>

      {jourOuvert && (
        <div style={{ marginTop: '1rem' }}>
          <h5 style={{ color: COLORS.navy, margin: '0 0 0.6rem 0', fontSize: '0.95rem', textTransform: 'capitalize' }}>{formatJourLong(jourOuvert)}</h5>
          {entreesDuJour.map(e => (
            <div key={e.key} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.7rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `5px solid ${TYPES[e.kind].color}`, padding: '0.8rem 1rem', opacity: e.annulee ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {e.heure && <strong style={{ color: COLORS.navy }}>{e.heure}{e.heureFin ? ` – ${e.heureFin}` : ''}</strong>}
                <strong style={{ color: COLORS.navy }}>{e.label}</strong>
                <span style={{ background: '#f2f2f2', color: '#666', borderRadius: '20px', padding: '0.1rem 0.6rem', fontSize: '0.74rem' }}>{TYPES[e.kind].label}</span>
                {e.annulee && <span style={{ background: '#fdecea', color: '#721c24', borderRadius: '20px', padding: '0.1rem 0.6rem', fontSize: '0.74rem', fontWeight: 'bold' }}>Annulé</span>}
              </div>
              {e.periode && <p style={{ margin: '0.3rem 0 0 0', color: '#777', fontSize: '0.82rem' }}>{e.periode}</p>}
              {e.note && <p style={{ margin: '0.3rem 0 0 0', color: '#a86a1a', fontSize: '0.82rem' }}>📝 {e.note}</p>}

              {e.riders && (
                e.riders.length === 0
                  ? <p style={{ margin: '0.6rem 0 0 0', color: '#999', fontSize: '0.85rem' }}>Aucun élève sur ce cours.</p>
                  : (
                    <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.4rem' }}>
                      {e.riders.map(r => {
                        const surligne = estEleveFiltre(r) || (filtreCheval && r.chevalId === filtreCheval)
                        return (
                          <div key={r.rowId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', background: surligne ? '#fff8e1' : '#fafafa', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
                            <span style={{ flex: '1 1 140px', color: COLORS.navy, fontWeight: 'bold', fontSize: '0.88rem' }}>{r.nom || '—'}</span>
                            <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                              <button onClick={() => corrigerPresence(e, r, true)}
                                style={{ border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', background: r.present === true ? COLORS.green : '#eee', color: r.present === true ? 'white' : '#666', fontWeight: 'bold' }}>✓ Présent</button>
                              <button onClick={() => corrigerPresence(e, r, false)}
                                style={{ border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem', background: r.present === false ? COLORS.red : '#eee', color: r.present === false ? 'white' : '#666', fontWeight: 'bold' }}>✕ Absent</button>
                              {r.present === null || r.present === undefined
                                ? <span style={{ color: COLORS.orange, fontSize: '0.75rem', fontWeight: 'bold' }}>non pointé</span>
                                : null}
                            </span>
                            <select value={r.chevalId || ''} onChange={ev => corrigerCheval(e, r, ev.target.value)} style={{ ...selectStyle, flex: '0 1 180px' }}>
                              <option value="">🐴 —</option>
                              {chevaux.filter(ch => ch.actif !== false || ch.id === r.chevalId).map(ch => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  )
              )}

              {e.inscrits && (
                e.inscrits.length === 0
                  ? <p style={{ margin: '0.6rem 0 0 0', color: '#999', fontSize: '0.85rem' }}>Aucun inscrit.</p>
                  : (
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {e.inscrits.map(i => (
                        <span key={i.rowId} style={{ background: estEleveFiltre(i) ? '#fff8e1' : COLORS.skyLight, color: COLORS.navy, borderRadius: '20px', padding: '0.25rem 0.7rem', fontSize: '0.82rem' }}>{i.nom || '—'}</span>
                      ))}
                    </div>
                  )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

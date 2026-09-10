import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, SOIN_TYPES } from '../../lib/theme'
import { toLocalISODate, getWeekRange } from '../../lib/dates'

const EMPTY = { nom: '', description: '', note: '' }
const EMPTY_SOIN = { type: 'vaccin', date: toLocalISODate(new Date()), note: '' }

// Durée en heures (décimal) entre deux heures "HH:MM:SS" (format Postgres time).
function dureeHeures(debut, fin) {
  if (!debut || !fin) return 0
  const [h1, m1] = debut.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60)
}

// Formate un nombre d'heures décimal en "2h" ou "2h30".
function formatHeures(h) {
  const totalMinutes = Math.round((h || 0) * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`
}

function VueHeuresParCheval({ chevaux, weekOffset, setWeekOffset, heuresParCheval, loading }) {
  const { lundiDate, dimancheDate } = getWeekRange(weekOffset)
  const chevauxActifs = [...chevaux.filter(c => c.actif)]
    .sort((a, b) => (heuresParCheval[a.id] || 0) - (heuresParCheval[b.id] || 0))
  const maxHeures = Math.max(1, ...chevauxActifs.map(c => heuresParCheval[c.id] || 0))

  return (
    <div style={{ background: 'white', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1.5rem', boxShadow: '0 4px 16px rgba(26,39,68,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, color: COLORS.navy, fontSize: '0.95rem' }}>⏱️ Heures travaillées par cheval</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setWeekOffset(w => w - 1)}
            style={{ background: COLORS.beige, border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.85rem' }}>◀</button>
          <span style={{ fontSize: '0.85rem', color: '#666', minWidth: '160px', textAlign: 'center' }}>
            {lundiDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {dimancheDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            {weekOffset === 0 && ' (en cours)'}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)}
            style={{ background: COLORS.beige, border: 'none', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.85rem' }}>▶</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)}
              style={{ background: 'none', border: 'none', color: COLORS.sky, cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>
              Semaine en cours
            </button>
          )}
        </div>
      </div>

      {loading && <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0 }}>Chargement...</p>}

      {!loading && chevauxActifs.length === 0 && (
        <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0 }}>Aucun cheval actif.</p>
      )}

      {!loading && chevauxActifs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {chevauxActifs.map(ch => {
            const heures = heuresParCheval[ch.id] || 0
            return (
              <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ width: '110px', flexShrink: 0, fontSize: '0.85rem', color: COLORS.navy, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.nom}
                </span>
                <div style={{ flex: 1, background: COLORS.beige, borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${(heures / maxHeures) * 100}%`, background: heures === 0 ? '#ddd' : COLORS.sky, height: '100%', borderRadius: '6px' }} />
                </div>
                <span style={{ width: '50px', flexShrink: 0, textAlign: 'right', fontSize: '0.82rem', color: '#666' }}>
                  {formatHeures(heures)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ChevauxManager() {
  const [chevaux, setChevaux] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [showInactifs, setShowInactifs] = useState(false)
  const [message, setMessage] = useState(null)

  // Soins (vaccins, vermifuges, ferrages, ...)
  const [ouvertSoins, setOuvertSoins] = useState(null)
  const [soinsParCheval, setSoinsParCheval] = useState({})
  const [formSoin, setFormSoin] = useState(EMPTY_SOIN)

  // Heures travaillées par cheval, sur une semaine navigable (0 = semaine en cours)
  const [weekOffset, setWeekOffset] = useState(0)
  const [heuresParCheval, setHeuresParCheval] = useState({})
  const [loadingHeures, setLoadingHeures] = useState(true)

  useEffect(() => { fetchChevaux() }, [showInactifs])
  useEffect(() => { fetchHeuresSemaine() }, [weekOffset])

  async function fetchHeuresSemaine() {
    setLoadingHeures(true)
    const { debut, fin } = getWeekRange(weekOffset)

    const totals = {}
    function ajouter(chevalId, heures) {
      if (!chevalId) return
      totals[chevalId] = (totals[chevalId] || 0) + heures
    }

    // Cours fixes : on additionne les cours où le cheval a été présent
    const { data: seancesData } = await supabase
      .from('seances')
      .select('date, annulee, creneaux_fixes(heure_debut, heure_fin), presences(cheval_id, present)')
      .gte('date', debut)
      .lte('date', fin)
      .eq('annulee', false)

    ;(seancesData || []).forEach(s => {
      const duree = dureeHeures(s.creneaux_fixes?.heure_debut, s.creneaux_fixes?.heure_fin)
      ;(s.presences || []).forEach(p => { if (p.present) ajouter(p.cheval_id, duree) })
    })

    // Créneaux libres : même logique
    const { data: slotsData } = await supabase
      .from('slots')
      .select('date, time_start, time_end, bookings(cheval_id, present)')
      .gte('date', debut)
      .lte('date', fin)

    ;(slotsData || []).forEach(s => {
      const duree = dureeHeures(s.time_start, s.time_end)
      ;(s.bookings || []).forEach(b => { if (b.present) ajouter(b.cheval_id, duree) })
    })

    setHeuresParCheval(totals)
    setLoadingHeures(false)
  }

  async function fetchChevaux() {
    let query = supabase.from('chevaux').select('*').order('nom')
    if (!showInactifs) query = query.eq('actif', true)
    const { data } = await query
    setChevaux(data || [])
    if (data && data.length > 0) fetchDerniersSoins(data.map(c => c.id))
  }

  // Charge juste le dernier soin de chaque cheval, pour l'aperçu sur la carte (sans tout ouvrir)
  async function fetchDerniersSoins(chevalIds) {
    const { data } = await supabase.from('soins_chevaux').select('*').in('cheval_id', chevalIds).order('date', { ascending: false })
    if (!data) return
    setSoinsParCheval(prev => {
      const next = { ...prev }
      chevalIds.forEach(id => {
        if (!next[id]) {
          const dernier = data.find(s => s.cheval_id === id)
          next[id] = dernier ? [dernier] : []
        }
      })
      return next
    })
  }

  async function fetchSoins(chevalId) {
    const { data } = await supabase.from('soins_chevaux').select('*').eq('cheval_id', chevalId).order('date', { ascending: false })
    setSoinsParCheval(prev => ({ ...prev, [chevalId]: data || [] }))
  }

  function toggleSoins(chevalId) {
    if (ouvertSoins === chevalId) {
      setOuvertSoins(null)
    } else {
      setOuvertSoins(chevalId)
      setFormSoin(EMPTY_SOIN)
      fetchSoins(chevalId)
    }
  }

  async function ajouterSoin(chevalId) {
    if (!formSoin.date) {
      setMessage({ type: 'error', text: 'Indique une date.' })
      return
    }
    const { error } = await supabase.from('soins_chevaux').insert({ ...formSoin, cheval_id: chevalId })
    if (!error) {
      setFormSoin(EMPTY_SOIN)
      fetchSoins(chevalId)
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement du soin." })
    }
  }

  async function supprimerSoin(soinId, chevalId) {
    if (!confirm('Supprimer ce soin ?')) return
    await supabase.from('soins_chevaux').delete().eq('id', soinId)
    fetchSoins(chevalId)
  }

  function startAdd() {
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(cheval) {
    setForm({ nom: cheval.nom, description: cheval.description || '', note: cheval.note || '' })
    setEditingId(cheval.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.nom) {
      setMessage({ type: 'error', text: 'Le nom du cheval est obligatoire.' })
      return
    }
    const { error } = editingId
      ? await supabase.from('chevaux').update(form).eq('id', editingId)
      : await supabase.from('chevaux').insert(form)

    if (!error) {
      setMessage({ type: 'success', text: editingId ? 'Cheval modifié.' : 'Cheval ajouté.' })
      setShowForm(false)
      setForm(EMPTY)
      setEditingId(null)
      fetchChevaux()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement." })
    }
  }

  async function toggleActif(cheval) {
    await supabase.from('chevaux').update({ actif: !cheval.actif }).eq('id', cheval.id)
    fetchChevaux()
  }

  async function supprimerDefinitivement(cheval) {
    if (!confirm(`Supprimer définitivement ${cheval.nom} ? Cette action est irréversible.`)) return
    await supabase.from('chevaux').delete().eq('id', cheval.id)
    fetchChevaux()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>🐴 Chevaux</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input type="checkbox" checked={showInactifs} onChange={e => setShowInactifs(e.target.checked)} />
            Afficher les inactifs
          </label>
          <button onClick={startAdd}
            style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
            ➕ Ajouter un cheval
          </button>
        </div>
      </div>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <VueHeuresParCheval
        chevaux={chevaux}
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
        heuresParCheval={heuresParCheval}
        loading={loadingHeures}
      />

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: `0 4px 16px rgba(74,168,216,0.15)`, border: `2px solid ${COLORS.sky}` }}>
          <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '0.95rem' }}>{editingId ? '✏️ Modifier le cheval' : '➕ Nouveau cheval'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <input placeholder="Nom *" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Description (optionnel)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
          </div>
          <div style={{ marginBottom: '0.8rem' }}>
            <input placeholder="Note visible par les cavaliers (ex: cloches + guêtres, ne pas monter...)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} />
            <p style={{ margin: '0.3rem 0 0 0', color: '#aaa', fontSize: '0.75rem' }}>
              Affichée sous le nom du cheval dans "Aujourd'hui &amp; demain". Laisse vide pour ne rien afficher.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={save}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
              Enregistrer
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setEditingId(null) }}
              style={{ background: '#ccc', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {chevaux.length === 0 && <p style={{ color: '#888' }}>Aucun cheval enregistré.</p>}
      {chevaux.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.6rem' }}>
          {chevaux.map(ch => {
            const soins = soinsParCheval[ch.id] || []
            const dernierSoin = soins[0]
            return (
              <div key={ch.id} style={{ background: 'white', borderRadius: '10px', padding: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: ch.actif ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <strong style={{ color: COLORS.navy }}>🐴 {ch.nom}</strong>
                    {ch.description && <p style={{ margin: '0.2rem 0 0 0', color: '#888', fontSize: '0.8rem' }}>{ch.description}</p>}
                    {ch.note && (
                      <p style={{ margin: '0.3rem 0 0 0', color: '#a86a1a', background: '#fff3cd', display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        ⚠️ {ch.note}
                      </p>
                    )}
                    {ouvertSoins !== ch.id && dernierSoin && (
                      <p style={{ margin: '0.3rem 0 0 0', color: '#aaa', fontSize: '0.75rem' }}>
                        Dernier soin : {SOIN_TYPES.find(t => t.value === dernierSoin.type)?.label || dernierSoin.type} le {new Date(dernierSoin.date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  <button onClick={() => startEdit(ch)}
                    style={{ background: COLORS.orange, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                  <button onClick={() => toggleActif(ch)}
                    style={{ background: ch.actif ? '#999' : COLORS.green, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>
                    {ch.actif ? '⏸️' : '▶️'}
                  </button>
                  <button onClick={() => supprimerDefinitivement(ch)}
                    style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                  <button onClick={() => toggleSoins(ch.id)}
                    style={{ background: ouvertSoins === ch.id ? COLORS.navy : COLORS.sky, color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    🩺 Soins
                  </button>
                </div>

                {ouvertSoins === ch.id && (
                  <div style={{ marginTop: '0.8rem', borderTop: '1px solid #eee', paddingTop: '0.8rem' }}>
                    {soins.length === 0 && <p style={{ color: '#aaa', fontSize: '0.8rem' }}>Aucun soin enregistré.</p>}
                    {soins.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.8rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {soins.map(s => (
                          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', background: '#f7f7f7', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
                            <span style={{ fontSize: '0.8rem' }}>
                              <strong style={{ color: COLORS.navy }}>{SOIN_TYPES.find(t => t.value === s.type)?.label || s.type}</strong>
                              {' · '}{new Date(s.date).toLocaleDateString('fr-FR')}
                              {s.note && <span style={{ color: '#888' }}> — {s.note}</span>}
                            </span>
                            <button onClick={() => supprimerSoin(s.id, ch.id)}
                              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <select value={formSoin.type} onChange={e => setFormSoin({ ...formSoin, type: e.target.value })}
                        style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.82rem' }}>
                        {SOIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <input type="date" value={formSoin.date} onChange={e => setFormSoin({ ...formSoin, date: e.target.value })}
                        style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.82rem' }} />
                    </div>
                    <input placeholder="Note (optionnel)" value={formSoin.note} onChange={e => setFormSoin({ ...formSoin, note: e.target.value })}
                      style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.82rem', width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem' }} />
                    <button onClick={() => ajouterSoin(ch.id)}
                      style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      ➕ Ajouter ce soin
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

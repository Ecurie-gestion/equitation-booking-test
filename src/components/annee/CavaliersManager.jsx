import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, NIVEAUX, TYPES_ABONNEMENT, JOURS_SEMAINE } from '../../lib/theme'
import { toLocalISODate } from '../../lib/dates'

const EMPTY = { prenom: '', nom: '', parent_nom: '', email: '', telephone: '', niveau: '' }

export default function CavaliersManager() {
  const [cavaliers, setCavaliers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [showInactifs, setShowInactifs] = useState(false)
  const [message, setMessage] = useState(null)

  // Historique (abonnements + leçons prises)
  const [historiqueOuvert, setHistoriqueOuvert] = useState(null)
  const [historique, setHistorique] = useState({})

  // Déplacement d'un abonnement vers un autre créneau fixe
  const [creneauxFixes, setCreneauxFixes] = useState([])
  const [movingAboId, setMovingAboId] = useState(null)
  const [moveTargetCreneauId, setMoveTargetCreneauId] = useState('')

  useEffect(() => { fetchCavaliers() }, [showInactifs])
  useEffect(() => { fetchCreneauxFixes() }, [])

  async function fetchCreneauxFixes() {
    const { data } = await supabase.from('creneaux_fixes').select('*').eq('actif', true)
      .order('jour_semaine').order('heure_debut')
    setCreneauxFixes(data || [])
  }

  async function fetchCavaliers() {
    let query = supabase.from('cavaliers').select('*').order('nom')
    if (!showInactifs) query = query.eq('actif', true)
    const { data } = await query
    setCavaliers(data || [])
  }

  async function fetchHistorique(cavalier) {
    const { data: abonnements } = await supabase
      .from('abonnements')
      .select('*, creneaux_fixes(jour_semaine, heure_debut, heure_fin, niveaux)')
      .eq('cavalier_id', cavalier.id)
      .order('date_debut', { ascending: false })

    const { data: presencesFixe } = await supabase
      .from('presences')
      .select('*, seances(date, creneaux_fixes(niveaux, heure_debut))')
      .eq('cavalier_id', cavalier.id)

    // Réservations sur créneaux libres : d'abord par cavalier_id (lien fiable,
    // mis en place pour toutes les nouvelles réservations), avec un
    // rattrapage par nom exact pour les anciennes réservations migrées qui
    // n'ont pas ce lien.
    const [{ data: bookingsParId }, { data: bookingsParNom }] = await Promise.all([
      supabase.from('bookings').select('*, slots(title, date, time_start)').eq('cavalier_id', cavalier.id),
      supabase.from('bookings').select('*, slots(title, date, time_start)').is('cavalier_id', null).eq('child_name', cavalier.prenom).eq('child_nom', cavalier.nom)
    ])
    const bookingsLibre = [...(bookingsParId || []), ...(bookingsParNom || [])]

    const [{ data: stagesParId }, { data: stagesParNom }] = await Promise.all([
      supabase.from('event_inscriptions').select('*, events(title, date_start, type)').eq('cavalier_id', cavalier.id),
      supabase.from('event_inscriptions').select('*, events(title, date_start, type)').is('cavalier_id', null).eq('child_name', cavalier.prenom).eq('child_nom', cavalier.nom)
    ])
    const stages = [...(stagesParId || []), ...(stagesParNom || [])]

    const lecons = [
      ...(presencesFixe || []).map(p => ({
        id: `p-${p.id}`,
        date: p.seances?.date,
        label: p.seances?.creneaux_fixes?.niveaux || 'Cours fixe',
        heure: p.seances?.creneaux_fixes?.heure_debut?.slice(0, 5),
        present: p.present,
        kind: 'fixe'
      })),
      ...bookingsLibre.map(b => ({
        id: `b-${b.id}`,
        date: b.slots?.date,
        label: b.slots?.title || 'Créneau libre',
        heure: b.slots?.time_start?.slice(0, 5),
        present: b.present,
        kind: 'libre'
      })),
      ...stages.map(s => ({
        id: `s-${s.id}`,
        date: s.events?.date_start,
        label: s.events?.title || (s.events?.type === 'stage' ? 'Stage' : 'Événement'),
        heure: null,
        present: null,
        kind: 'stage'
      }))
    ]
      .filter(l => l.date)
      .sort((a, b) => b.date.localeCompare(a.date))

    setHistorique(prev => ({ ...prev, [cavalier.id]: { abonnements: abonnements || [], lecons } }))
  }

  function toggleHistorique(cavalier) {
    if (historiqueOuvert === cavalier.id) {
      setHistoriqueOuvert(null)
    } else {
      setHistoriqueOuvert(cavalier.id)
      fetchHistorique(cavalier)
    }
  }

  // Change le créneau fixe d'un abonnement pour toute sa durée (garde le
  // type, les dates et le solde de leçons — seul le créneau change). Nettoie
  // aussi les présences déjà générées pour les prochaines séances de
  // l'ancien créneau, pour que le cavalier n'y apparaisse plus.
  async function deplacerAbonnement(cavalier, abonnement) {
    if (!moveTargetCreneauId) {
      setMessage({ type: 'error', text: 'Choisis le nouveau créneau.' })
      return
    }
    const { error } = await supabase.from('abonnements').update({ creneau_fixe_id: moveTargetCreneauId }).eq('id', abonnement.id)
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors du déplacement.' })
      return
    }

    const today = toLocalISODate(new Date())
    const { data: seancesFutures } = await supabase
      .from('seances')
      .select('id')
      .eq('creneau_fixe_id', abonnement.creneau_fixe_id)
      .gte('date', today)
    const idsSeancesFutures = (seancesFutures || []).map(s => s.id)
    if (idsSeancesFutures.length > 0) {
      await supabase.from('presences').delete().eq('cavalier_id', cavalier.id).in('seance_id', idsSeancesFutures)
    }

    setMessage({ type: 'success', text: `${cavalier.prenom} déplacé(e) vers le nouveau créneau pour toute la durée de son abonnement.` })
    setMovingAboId(null)
    setMoveTargetCreneauId('')
    fetchHistorique(cavalier)
  }

  function startAdd() {
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(cavalier) {
    setForm({
      prenom: cavalier.prenom,
      nom: cavalier.nom,
      parent_nom: cavalier.parent_nom || '',
      email: cavalier.email || '',
      telephone: cavalier.telephone || '',
      niveau: cavalier.niveau || ''
    })
    setEditingId(cavalier.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.prenom || !form.nom) {
      setMessage({ type: 'error', text: 'Le prénom et le nom sont obligatoires.' })
      return
    }
    const { error } = editingId
      ? await supabase.from('cavaliers').update(form).eq('id', editingId)
      : await supabase.from('cavaliers').insert(form)

    if (!error) {
      setMessage({ type: 'success', text: editingId ? 'Cavalier modifié.' : 'Cavalier ajouté.' })
      setShowForm(false)
      setForm(EMPTY)
      setEditingId(null)
      fetchCavaliers()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement." })
    }
  }

  async function toggleActif(cavalier) {
    await supabase.from('cavaliers').update({ actif: !cavalier.actif }).eq('id', cavalier.id)
    fetchCavaliers()
  }

  async function supprimerDefinitivement(cavalier) {
    if (!confirm(`Supprimer définitivement ${cavalier.prenom} ${cavalier.nom} et toutes ses données (abonnements, présences) ? Cette action est irréversible.`)) return
    await supabase.from('cavaliers').delete().eq('id', cavalier.id)
    fetchCavaliers()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>🧑 Cavaliers</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input type="checkbox" checked={showInactifs} onChange={e => setShowInactifs(e.target.checked)} />
            Afficher les inactifs
          </label>
          <button onClick={startAdd}
            style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
            ➕ Ajouter un cavalier
          </button>
        </div>
      </div>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: `0 4px 16px rgba(74,168,216,0.15)`, border: `2px solid ${COLORS.sky}` }}>
          <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '0.95rem' }}>{editingId ? '✏️ Modifier le cavalier' : '➕ Nouveau cavalier'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <input placeholder="Prénom *" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Nom *" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Nom du parent" value={form.parent_nom} onChange={e => setForm({ ...form, parent_nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Téléphone" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <select value={form.niveau} onChange={e => setForm({ ...form, niveau: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
              <option value="">Niveau (optionnel)</option>
              {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
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

      {cavaliers.length === 0 && <p style={{ color: '#888' }}>Aucun cavalier enregistré.</p>}
      {cavaliers.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: COLORS.skyLight }}>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Prénom</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Nom</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Parent</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Niveau</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Email</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Téléphone</th>
                <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cavaliers.map(c => {
                const hist = historique[c.id]
                return (
                <Fragment key={c.id}>
                <tr style={{ opacity: c.actif ? 1 : 0.5, borderBottom: historiqueOuvert === c.id ? 'none' : '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{c.prenom}</td>
                  <td style={{ padding: '0.5rem' }}>{c.nom}</td>
                  <td style={{ padding: '0.5rem' }}>{c.parent_nom || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{c.niveau || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{c.email || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{c.telephone || '—'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => toggleHistorique(c)} title="Historique"
                      style={{ background: historiqueOuvert === c.id ? COLORS.navy : COLORS.sky, color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', marginRight: '0.3rem', whiteSpace: 'nowrap' }}>📜 Historique</button>
                    <button onClick={() => startEdit(c)} title="Modifier"
                      style={{ background: COLORS.orange, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', marginRight: '0.3rem' }}>✏️</button>
                    <button onClick={() => toggleActif(c)} title={c.actif ? 'Désactiver' : 'Réactiver'}
                      style={{ background: c.actif ? '#999' : COLORS.green, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', marginRight: '0.3rem' }}>
                      {c.actif ? '⏸️' : '▶️'}
                    </button>
                    <button onClick={() => supprimerDefinitivement(c)} title="Supprimer définitivement"
                      style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                  </td>
                </tr>
                {historiqueOuvert === c.id && (
                  <tr style={{ borderBottom: '1px solid #eee' }}>
                    <td colSpan={7} style={{ padding: '1rem', background: '#f7fafc' }}>
                      <h4 style={{ color: COLORS.navy, margin: '0 0 0.6rem 0', fontSize: '0.9rem' }}>📜 Historique de {c.prenom} {c.nom}</h4>

                      <h5 style={{ color: '#666', margin: '0 0 0.4rem 0', fontSize: '0.82rem' }}>Abonnements</h5>
                      {!hist && <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Chargement...</p>}
                      {hist && hist.abonnements.length === 0 && <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Aucun abonnement enregistré.</p>}
                      {hist && hist.abonnements.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem' }}>
                          {hist.abonnements.map(a => (
                            <Fragment key={a.id}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'white', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.82rem', opacity: a.actif ? 1 : 0.6 }}>
                                <strong style={{ color: COLORS.navy }}>{TYPES_ABONNEMENT.find(t => t.value === a.type)?.label || a.type}</strong>
                                {a.creneaux_fixes && (
                                  <span style={{ color: '#888' }}>
                                    {JOURS_SEMAINE[a.creneaux_fixes.jour_semaine]} {a.creneaux_fixes.heure_debut?.slice(0, 5)} · {a.creneaux_fixes.niveaux}
                                  </span>
                                )}
                                <span style={{ color: '#888' }}>
                                  {a.type === 'dix_lecons' && `${a.lecons_restantes}/${a.lecons_totales} restantes`}
                                  {a.type === 'vacances_a_vacances' && `du ${new Date(a.date_debut).toLocaleDateString('fr-FR')}${a.date_fin ? ` au ${new Date(a.date_fin).toLocaleDateString('fr-FR')}` : ''}`}
                                  {a.type === 'unite' && `le ${new Date(a.date_debut).toLocaleDateString('fr-FR')}`}
                                </span>
                                {!a.actif && <span style={{ color: '#aaa', fontStyle: 'italic' }}>(terminé)</span>}
                                {a.actif && a.creneau_fixe_id && (
                                  <button onClick={() => { setMovingAboId(movingAboId === a.id ? null : a.id); setMoveTargetCreneauId('') }}
                                    title="Déplacer vers un autre créneau (pour toute la durée de l'abonnement)"
                                    style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${COLORS.sky}`, color: COLORS.sky, padding: '0.2rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>↔️ Déplacer</button>
                                )}
                              </div>
                              {movingAboId === a.id && (
                                <div style={{ background: COLORS.skyLight, borderRadius: '6px', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.82rem', color: COLORS.navy }}>Nouveau créneau :</span>
                                    <select value={moveTargetCreneauId} onChange={e => setMoveTargetCreneauId(e.target.value)}
                                      style={{ padding: '0.35rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.82rem' }}>
                                      <option value="">Choisir un créneau...</option>
                                      {creneauxFixes.filter(cf => cf.id !== a.creneau_fixe_id).map(cf => (
                                        <option key={cf.id} value={cf.id}>
                                          {JOURS_SEMAINE[cf.jour_semaine]} {cf.heure_debut.slice(0, 5)}–{cf.heure_fin.slice(0, 5)}{cf.niveaux ? ` (${cf.niveaux})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                    <button onClick={() => deplacerAbonnement(c, a)}
                                      style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.35rem 0.7rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}>
                                      Confirmer
                                    </button>
                                    <button onClick={() => { setMovingAboId(null); setMoveTargetCreneauId('') }}
                                      style={{ background: '#ccc', border: 'none', padding: '0.35rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}>
                                      Annuler
                                    </button>
                                  </div>
                                  <p style={{ margin: 0, color: '#666', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                    {c.prenom} gardera son type d'abonnement et son solde de leçons — seul le créneau change, pour toute la durée restante.
                                  </p>
                                </div>
                              )}
                            </Fragment>
                          ))}
                        </div>
                      )}

                      <h5 style={{ color: '#666', margin: '0 0 0.4rem 0', fontSize: '0.82rem' }}>Leçons prises</h5>
                      {hist && hist.lecons.length === 0 && <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Aucune leçon enregistrée.</p>}
                      {hist && hist.lecons.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '220px', overflowY: 'auto' }}>
                          {hist.lecons.map(l => (
                            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'white', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}>
                              <span style={{ color: COLORS.navy, fontWeight: 'bold' }}>{new Date(l.date + 'T12:00:00').toLocaleDateString('fr-FR')}</span>
                              <span style={{ color: '#888' }}>{l.heure}</span>
                              <span style={{ color: '#555' }}>{l.label}</span>
                              <span style={{ color: '#aaa' }}>{l.kind === 'fixe' ? '🔒 fixe' : l.kind === 'stage' ? '🏕️ stage' : '🌐 libre'}</span>
                              {l.present === true && <span style={{ color: COLORS.green, fontWeight: 'bold' }}>✓ présent</span>}
                              {l.present === false && <span style={{ color: COLORS.red, fontWeight: 'bold' }}>✕ absent</span>}
                              {l.present === null && <span style={{ color: '#ccc' }}>—</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

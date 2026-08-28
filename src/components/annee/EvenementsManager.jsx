import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, EVENT_TYPES } from '../../lib/theme'
import { upsertCavalierDepuisReservation } from '../../lib/cavaliers'
import EleveSelector from '../admin/EleveSelector'

const EMPTY_EVENT = { title: '', type: 'stage', date_start: '', date_end: '', description: '', capacite_max: '', inscriptible: false }
const EMPTY_INSCRIT = { parent_name: '', child_name: '', child_nom: '', email: '', phone: '' }

export default function EvenementsManager() {
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT)
  const [message, setMessage] = useState(null)
  const [cavaliers, setCavaliers] = useState([])

  // Inscriptions aux stages
  const [ouvertInscriptions, setOuvertInscriptions] = useState(null)
  const [inscriptionsParEvent, setInscriptionsParEvent] = useState({})
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [nouvelInscrit, setNouvelInscrit] = useState(EMPTY_INSCRIT)

  useEffect(() => { fetchEvents(); fetchCavaliers() }, [])

  async function fetchEvents() {
    const { data } = await supabase.from('events').select('*').order('date_start')
    setEvents(data || [])
  }

  async function fetchCavaliers() {
    const { data } = await supabase.from('cavaliers').select('*').eq('actif', true).order('nom')
    setCavaliers(data || [])
  }

  async function fetchInscriptions(eventId) {
    const { data } = await supabase.from('event_inscriptions').select('*').eq('event_id', eventId).order('created_at')
    setInscriptionsParEvent(prev => ({ ...prev, [eventId]: data || [] }))
  }

  function toggleInscriptions(eventId) {
    if (ouvertInscriptions === eventId) {
      setOuvertInscriptions(null)
    } else {
      setOuvertInscriptions(eventId)
      setAjoutOuvert(false)
      setNouvelInscrit(EMPTY_INSCRIT)
      fetchInscriptions(eventId)
    }
  }

  async function ajouterInscrit(eventId) {
    if (!nouvelInscrit.child_name || !nouvelInscrit.child_nom) {
      setMessage({ type: 'error', text: "Le prénom et le nom de l'élève sont obligatoires." })
      return
    }
    const cavalierId = await upsertCavalierDepuisReservation(nouvelInscrit)
    const { error } = await supabase.from('event_inscriptions').insert({ ...nouvelInscrit, event_id: eventId, cavalier_id: cavalierId })
    if (!error) {
      setNouvelInscrit(EMPTY_INSCRIT)
      setAjoutOuvert(false)
      fetchInscriptions(eventId)
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'ajout." })
    }
  }

  async function supprimerInscrit(id, eventId) {
    if (!confirm('Retirer cet élève de cet événement ?')) return
    await supabase.from('event_inscriptions').delete().eq('id', id)
    fetchInscriptions(eventId)
  }

  async function createEvent() {
    if (!newEvent.title || !newEvent.date_start || !newEvent.date_end) {
      setMessage({ type: 'error', text: 'Remplis tous les champs obligatoires !' })
      return
    }
    const payload = { ...newEvent, capacite_max: newEvent.capacite_max ? parseInt(newEvent.capacite_max) : null }
    const { error } = await supabase.from('events').insert(payload)
    if (!error) {
      setMessage({ type: 'success', text: `${newEvent.type === 'stage' ? 'Stage' : 'Concours'} créé !` })
      setNewEvent(EMPTY_EVENT)
      setShowForm(false)
      fetchEvents()
    } else {
      setMessage({ type: 'error', text: 'Erreur lors de la création.' })
    }
  }

  async function deleteEvent(id) {
    if (!confirm('Supprimer cet événement ? Les inscriptions liées seront aussi supprimées.')) return
    await supabase.from('events').delete().eq('id', id)
    fetchEvents()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>📌 Stages, concours & événements</h3>
        <button onClick={() => setShowForm(!showForm)}
          style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
          {showForm ? '✕ Fermer' : '➕ Stage/Concours'}
        </button>
      </div>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: '0 4px 16px rgba(231,76,60,0.15)', border: `2px solid ${COLORS.red}` }}>
          <h4 style={{ color: COLORS.navy, marginTop: 0, fontSize: '1rem' }}>➕ Nouveau stage ou concours</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Type *</label>
              <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem' }}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Titre *</label>
              <input placeholder="Ex: Stage vacances été" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Date de début *</label>
              <input type="date" value={newEvent.date_start} onChange={e => setNewEvent({ ...newEvent, date_start: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Date de fin *</label>
              <input type="date" value={newEvent.date_end} onChange={e => setNewEvent({ ...newEvent, date_end: e.target.value })}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Description (optionnel)</label>
              <textarea placeholder="Ex: Stage 3 jours, tous niveaux..." value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} rows={2}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          </div>

          {newEvent.type !== 'concours' && (
            <div style={{ marginTop: '1rem', background: COLORS.skyLight, borderRadius: '10px', padding: '0.8rem 1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 'bold', color: COLORS.navy, fontSize: '0.9rem' }}>
                <input type="checkbox" checked={newEvent.inscriptible} onChange={e => setNewEvent({ ...newEvent, inscriptible: e.target.checked })}
                  style={{ width: '17px', height: '17px', cursor: 'pointer', accentColor: COLORS.navy }} />
                🔓 Permettre l'inscription en ligne des parents
              </label>
              {newEvent.inscriptible && (
                <div style={{ marginTop: '0.6rem', maxWidth: '260px' }}>
                  <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.85rem' }}>Places max (optionnel)</label>
                  <input type="number" min="1" placeholder="Illimité si vide" value={newEvent.capacite_max} onChange={e => setNewEvent({ ...newEvent, capacite_max: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
          )}
          <button onClick={createEvent}
            style={{ marginTop: '1rem', background: COLORS.red, color: 'white', border: 'none', padding: '0.7rem 2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
            Créer
          </button>
        </div>
      )}

      {events.length === 0 && <p style={{ color: '#888' }}>Aucun événement pour le moment.</p>}
      {events.map(event => {
        const inscrits = inscriptionsParEvent[event.id] || []
        const estInscriptible = event.inscriptible
        return (
          <div key={event.id} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', borderLeft: `5px solid ${event.type === 'stage' ? COLORS.red : event.type === 'concours' ? COLORS.green : '#f1c40f'}` }}>
            <div style={{ padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong style={{ color: COLORS.navy, fontSize: '0.95rem' }}>
                  {event.type === 'stage' ? '🏕️' : event.type === 'concours' ? '🏆' : '📌'} {event.title}
                </strong>
                <p style={{ margin: '0.2rem 0', color: '#555', fontSize: '0.85rem' }}>
                  Du {new Date(event.date_start + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(event.date_end + 'T12:00:00').toLocaleDateString('fr-FR')}
                  {estInscriptible && ` · ${event.capacite_max ? `${(inscriptionsParEvent[event.id] || []).length}/${event.capacite_max} places` : 'places illimitées'}`}
                </p>
                {event.description && <p style={{ margin: '0.1rem 0', color: '#888', fontSize: '0.8rem' }}>{event.description}</p>}
                {!estInscriptible && event.type !== 'concours' && (
                  <p style={{ margin: '0.2rem 0 0 0', color: '#aaa', fontSize: '0.75rem', fontStyle: 'italic' }}>Inscription en ligne désactivée pour cet événement.</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {estInscriptible && (
                  <button onClick={() => toggleInscriptions(event.id)}
                    style={{ background: ouvertInscriptions === event.id ? COLORS.navy : COLORS.sky, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold' }}>
                    👥 Inscrits ({inscrits.length})
                  </button>
                )}
                <button onClick={() => deleteEvent(event.id)}
                  style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>
                  🗑️ Supprimer
                </button>
              </div>
            </div>

            {estInscriptible && ouvertInscriptions === event.id && (
              <div style={{ borderTop: `2px solid ${COLORS.skyLight}`, padding: '0.8rem 1rem' }}>
                {inscrits.length === 0 && <p style={{ color: '#888', fontSize: '0.85rem' }}>Aucun inscrit pour ce stage.</p>}
                {inscrits.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: COLORS.skyLight }}>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Parent</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Enfant</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Email</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Tél.</th>
                        <th style={{ padding: '0.4rem', textAlign: 'center' }}>❌</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inscrits.map(i => (
                        <tr key={i.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '0.4rem' }}>{i.parent_name || '—'}</td>
                          <td style={{ padding: '0.4rem' }}>{i.child_name} {i.child_nom}</td>
                          <td style={{ padding: '0.4rem' }}>{i.email ? <a href={`mailto:${i.email}`} style={{ color: COLORS.sky }}>{i.email}</a> : '—'}</td>
                          <td style={{ padding: '0.4rem' }}>{i.phone || '—'}</td>
                          <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                            <button onClick={() => supprimerInscrit(i.id, event.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {ajoutOuvert ? (
                  <div style={{ background: COLORS.skyLight, borderRadius: '8px', padding: '0.8rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      <EleveSelector cavaliers={cavaliers} value={nouvelInscrit} onChange={setNouvelInscrit} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => ajouterInscrit(event.id)} style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Confirmer</button>
                      <button onClick={() => { setAjoutOuvert(false); setNouvelInscrit(EMPTY_INSCRIT) }} style={{ background: '#ccc', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAjoutOuvert(true)} style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>➕ Ajouter un élève</button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

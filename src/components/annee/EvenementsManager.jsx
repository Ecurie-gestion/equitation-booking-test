import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, EVENT_TYPES } from '../../lib/theme'

const EMPTY_EVENT = { title: '', type: 'stage', date_start: '', date_end: '', description: '' }

export default function EvenementsManager() {
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT)
  const [message, setMessage] = useState(null)

  useEffect(() => { fetchEvents() }, [])

  async function fetchEvents() {
    const { data } = await supabase.from('events').select('*').order('date_start')
    setEvents(data || [])
  }

  async function createEvent() {
    if (!newEvent.title || !newEvent.date_start || !newEvent.date_end) {
      setMessage({ type: 'error', text: 'Remplis tous les champs obligatoires !' })
      return
    }
    const { error } = await supabase.from('events').insert(newEvent)
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
    if (!confirm('Supprimer cet événement ?')) return
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
          <button onClick={createEvent}
            style={{ marginTop: '1rem', background: COLORS.red, color: 'white', border: 'none', padding: '0.7rem 2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
            Créer
          </button>
        </div>
      )}

      {events.length === 0 && <p style={{ color: '#888' }}>Aucun événement pour le moment.</p>}
      {events.map(event => (
        <div key={event.id} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderLeft: `5px solid ${event.type === 'stage' ? COLORS.red : event.type === 'concours' ? COLORS.green : '#f1c40f'}` }}>
          <div>
            <strong style={{ color: COLORS.navy, fontSize: '0.95rem' }}>
              {event.type === 'stage' ? '🏕️' : event.type === 'concours' ? '🏆' : '📌'} {event.title}
            </strong>
            <p style={{ margin: '0.2rem 0', color: '#555', fontSize: '0.85rem' }}>
              Du {new Date(event.date_start + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(event.date_end + 'T12:00:00').toLocaleDateString('fr-FR')}
            </p>
            {event.description && <p style={{ margin: '0.1rem 0', color: '#888', fontSize: '0.8rem' }}>{event.description}</p>}
          </div>
          <button onClick={() => deleteEvent(event.id)}
            style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>
            🗑️ Supprimer
          </button>
        </div>
      ))}
    </div>
  )
}

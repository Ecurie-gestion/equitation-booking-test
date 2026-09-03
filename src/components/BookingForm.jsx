import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { upsertCavalierDepuisReservation } from '../lib/cavaliers'
import { toLocalISODate } from '../lib/dates'

export default function BookingForm({ slot, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    parent_name: '', child_name: '', child_nom: '', email: '', phone: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = e =>
    setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: check } = await supabase
      .from('slots_with_availability')
      .select('places_remaining, date')
      .eq('id', slot.id)
      .single()

    if (!check || check.places_remaining <= 0) {
      setError('Désolé, ce créneau vient d\'être complet.')
      setLoading(false)
      return
    }

    if (check.date < toLocalISODate(new Date())) {
      setError('Ce créneau est déjà passé, il n\'est plus possible de s\'y inscrire.')
      setLoading(false)
      return
    }

    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('slot_id', slot.id)
      .eq('child_name', form.child_name)
      .eq('child_nom', form.child_nom)

    if (existing && existing.length > 0) {
      setError(`${form.child_name} est déjà inscrit(e) à ce créneau !`)
      setLoading(false)
      return
    }

    const cavalierId = await upsertCavalierDepuisReservation(form)

    const { error: insertError } = await supabase
      .from('bookings')
      .insert({ ...form, slot_id: slot.id, cavalier_id: cavalierId })

    if (insertError) {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } else {
      onSuccess()
    }
    setLoading(false)
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '2rem',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
    }}>
      <h3 style={{ color: '#1a2744', marginBottom: '0.3rem' }}>Inscription</h3>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>
        {slot.title} — {new Date(slot.date).toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long'
        })} — {slot.time_start.slice(0,5)} à {slot.time_end.slice(0,5)}
      </p>

      {error && (
        <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', color: '#1a2744', marginBottom: '0.3rem', fontWeight: 'bold' }}>
            Nom et prénom du parent <span style={{ fontWeight: 'normal', color: '#888' }}>(optionnel si l'élève est majeur)</span>
          </label>
          <input
            name="parent_name"
            placeholder="Ex: Marie Dupont"
            value={form.parent_name}
            onChange={handleChange}
            style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', color: '#1a2744', marginBottom: '0.3rem', fontWeight: 'bold' }}>
              Prénom de l'élève *
            </label>
            <input
              name="child_name"
              placeholder="Ex: Emma"
              required
              value={form.child_name}
              onChange={handleChange}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#1a2744', marginBottom: '0.3rem', fontWeight: 'bold' }}>
              Nom de l'élève *
            </label>
            <input
              name="child_nom"
              placeholder="Ex: Dupont"
              required
              value={form.child_nom}
              onChange={handleChange}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', color: '#1a2744', marginBottom: '0.3rem', fontWeight: 'bold' }}>
            Email *
          </label>
          <input
            name="email"
            type="email"
            placeholder="Ex: marie@gmail.com"
            required
            value={form.email}
            onChange={handleChange}
            style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', color: '#1a2744', marginBottom: '0.3rem', fontWeight: 'bold' }}>
            GSM
          </label>
          <input
            name="phone"
            type="tel"
            placeholder="Ex: 0478/12.34.56"
            value={form.phone}
            onChange={handleChange}
            style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </div>

        <p style={{ color: '#888', fontSize: '0.78rem', lineHeight: '1.6', margin: '0.3rem 0' }}>
          Les informations recueillies sont nécessaires à l'organisation des leçons et pour vous contacter en cas
          de besoin concernant votre enfant. Elles sont réservées à l'équipe de l'Écurie de Groynne et ne sont
          jamais transmises à des tiers. <a href="/confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: '#4aa8d8' }}>En savoir plus</a>.
        </p>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#1a2744',
              color: 'white',
              border: 'none',
              padding: '0.8rem 2rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              flex: 1
            }}>
            {loading ? 'Inscription en cours...' : 'Confirmer mon inscription'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              padding: '0.8rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              color: '#555'
            }}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
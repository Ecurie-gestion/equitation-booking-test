import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toLocalISODate } from '../lib/dates'

const COURS_TYPES = [
  'Tous',
  'Licol Blanc',
  'Prépa Bronze/Argent',
  'Prépa Or',
  'Prépa Diamant',
  'Prépa Degré 1',
  'Prépa Degré 2',
  'Prépa Degré 3'
]

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  red: '#e74c3c',
  beige: '#f5f0e8',
  textLight: '#7a6a5a'
}

export default function SlotList({ onSelectSlot }) {
  const [slots, setSlots] = useState([])
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('Tous')

  useEffect(() => {
    fetchSlots()
    fetchStages()
  }, [])

  async function fetchSlots() {
    const today = toLocalISODate(new Date())
    const { data, error } = await supabase
      .from('slots_with_availability')
      .select('*')
      .gte('date', today)
      .order('date', { ascending: true })
    if (!error) setSlots(data)
    setLoading(false)
  }

  // "stages" ici désigne tout événement (stage OU événement libre) pour lequel
  // le moniteur a activé l'inscription en ligne.
  async function fetchStages() {
    const today = toLocalISODate(new Date())
    const { data: stagesData } = await supabase
      .from('events')
      .select('*')
      .eq('inscriptible', true)
      .gte('date_end', today)
      .order('date_start', { ascending: true })

    const stagesAvecPlaces = await Promise.all((stagesData || []).map(async s => {
      let places_remaining = null
      if (s.capacite_max) {
        const { count } = await supabase
          .from('event_inscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', s.id)
        places_remaining = s.capacite_max - (count || 0)
      }
      return { ...s, kind: 'evenement', places_remaining }
    }))
    setStages(stagesAvecPlaces)
  }

  const slotsFiltres = filtre === 'Tous'
    ? slots
    : slots.filter(s => s.title.includes(filtre))

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: COLORS.textLight }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🐴</div>
      <p>Chargement des créneaux...</p>
    </div>
  )

  if (slots.length === 0 && stages.length === 0) return (
    <div style={{ textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '20px', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐴</div>
      <p style={{ color: COLORS.textLight, fontSize: '1.1rem' }}>Aucun créneau disponible pour le moment.</p>
      <p style={{ color: COLORS.textLight }}>Revenez bientôt !</p>
    </div>
  )

  return (
    <div>
      {stages.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: COLORS.navy, fontSize: '1.05rem', marginBottom: '0.8rem' }}>🏕️ Stages & événements</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {stages.map(stage => {
              const complet = stage.places_remaining !== null && stage.places_remaining <= 0
              const icone = stage.type === 'stage' ? '🏕️' : '📌'
              return (
                <div key={stage.id} style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '1.2rem 1.5rem',
                  boxShadow: '0 4px 20px rgba(26,39,68,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  borderLeft: `5px solid ${complet ? '#ddd' : COLORS.red}`,
                  opacity: complet ? 0.6 : 1
                }}>
                  <div>
                    <h3 style={{ color: COLORS.navy, margin: '0 0 0.4rem 0', fontSize: '1rem' }}>{icone} {stage.title}</h3>
                    <p style={{ margin: '0.2rem 0', color: COLORS.textLight, fontSize: '0.9rem' }}>
                      📅 Du {new Date(stage.date_start + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au {new Date(stage.date_end + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </p>
                    {stage.description && <p style={{ margin: '0.2rem 0', color: COLORS.textLight, fontSize: '0.85rem' }}>{stage.description}</p>}
                    <span style={{
                      display: 'inline-block',
                      marginTop: '0.4rem',
                      background: complet ? '#fdecea' : '#e8f4fd',
                      color: complet ? '#721c24' : '#155724',
                      padding: '0.2rem 0.8rem',
                      borderRadius: '50px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      {stage.places_remaining === null ? '✅ Places illimitées' : complet ? '❌ Complet' : `✅ ${stage.places_remaining} place(s) disponible(s)`}
                    </span>
                  </div>
                  <button
                    disabled={complet}
                    onClick={() => onSelectSlot(stage)}
                    style={{
                      background: complet ? '#ccc' : COLORS.navy,
                      color: 'white',
                      border: 'none',
                      padding: '0.8rem 1.5rem',
                      borderRadius: '50px',
                      cursor: complet ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      boxShadow: complet ? 'none' : '0 4px 12px rgba(26,39,68,0.2)'
                    }}>
                    {complet ? 'Complet' : "M'inscrire →"}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {slots.length > 0 && (
      <>
      <h3 style={{ color: COLORS.navy, fontSize: '1.05rem', marginBottom: '0.8rem' }}>📋 Créneaux libres</h3>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {COURS_TYPES.map(type => (
          <button
            key={type}
            onClick={() => setFiltre(type)}
            style={{
              background: filtre === type ? COLORS.navy : 'white',
              color: filtre === type ? 'white' : COLORS.navy,
              border: `2px solid ${filtre === type ? COLORS.navy : '#ddd'}`,
              padding: '0.4rem 1rem',
              borderRadius: '50px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: filtre === type ? 'bold' : 'normal',
              boxShadow: filtre === type ? '0 2px 8px rgba(26,39,68,0.2)' : 'none',
              transition: 'all 0.2s'
            }}>
            {type}
          </button>
        ))}
      </div>

      {slotsFiltres.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'white', borderRadius: '16px' }}>
          <p style={{ color: COLORS.textLight }}>Aucun créneau pour ce niveau.</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {slotsFiltres.map(slot => (
          <div key={slot.id} style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.2rem 1.5rem',
            boxShadow: '0 4px 20px rgba(26,39,68,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            borderLeft: `5px solid ${slot.places_remaining > 0 ? COLORS.sky : '#ddd'}`,
            opacity: slot.places_remaining > 0 ? 1 : 0.6
          }}>
            <div>
              <h3 style={{ color: COLORS.navy, margin: '0 0 0.4rem 0', fontSize: '1rem' }}>{slot.title}</h3>
              <p style={{ margin: '0.2rem 0', color: COLORS.textLight, fontSize: '0.9rem' }}>
                📅 {new Date(slot.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p style={{ margin: '0.2rem 0', color: COLORS.textLight, fontSize: '0.9rem' }}>
                🕐 {slot.time_start.slice(0,5)} – {slot.time_end.slice(0,5)}
              </p>
              <span style={{
                display: 'inline-block',
                marginTop: '0.4rem',
                background: slot.places_remaining > 0 ? '#e8f4fd' : '#fdecea',
                color: slot.places_remaining > 0 ? '#155724' : '#721c24',
                padding: '0.2rem 0.8rem',
                borderRadius: '50px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                {slot.places_remaining > 0 ? `✅ ${slot.places_remaining} place(s) disponible(s)` : '❌ Complet'}
              </span>
            </div>

            <button
              disabled={slot.places_remaining <= 0}
              onClick={() => onSelectSlot({ ...slot, kind: 'libre' })}
              style={{
                background: slot.places_remaining > 0 ? COLORS.navy : '#ccc',
                color: 'white',
                border: 'none',
                padding: '0.8rem 1.5rem',
                borderRadius: '50px',
                cursor: slot.places_remaining > 0 ? 'pointer' : 'not-allowed',
                fontSize: '0.95rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: slot.places_remaining > 0 ? '0 4px 12px rgba(26,39,68,0.2)' : 'none'
              }}>
              {slot.places_remaining > 0 ? "M'inscrire →" : 'Complet'}
            </button>
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  )
}
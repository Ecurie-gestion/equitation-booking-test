import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toLocalISODate } from '../lib/dates'

const COLORS = {
  navy: '#1a2744',
  cours: '#4aa8d8',
  stage: '#e74c3c',
  concours: '#2ecc71',
  libre: '#f1c40f'
}

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function Calendar({ onSelectSlot }) {
  const [slots, setSlots] = useState([])
  const [events, setEvents] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: slotsData } = await supabase
      .from('slots_with_availability')
      .select('*')
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')

    const eventsAvecPlaces = await Promise.all((eventsData || []).map(async e => {
      if (!e.inscriptible || !e.capacite_max) return { ...e, places_remaining: null }
      const { count } = await supabase
        .from('event_inscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', e.id)
      return { ...e, places_remaining: e.capacite_max - (count || 0) }
    }))

    setSlots(slotsData || [])
    setEvents(eventsAvecPlaces)
  }

  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate()
  }

  function getFirstDayOfMonth(year, month) {
    let day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1
  }

  function getEventsForDate(dateStr) {
    const result = []
    slots.forEach(s => {
      if (s.date === dateStr) result.push({ type: 'cours', ...s })
    })
    events.forEach(e => {
      if (dateStr >= e.date_start && dateStr <= e.date_end) {
        result.push({ type: e.type, ...e })
      }
    })
    return result
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = toLocalISODate(new Date())

  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  function formatDate(day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const selectedDateStr = selectedDate ? formatDate(selectedDate) : null
  const selectedEvents = selectedDateStr ? getEventsForDate(selectedDateStr) : []

  return (
    <div style={{ fontFamily: 'Georgia, serif' }}>

      {/* Légende */}
      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginBottom: '1.2rem', justifyContent: 'center' }}>
       {[['cours', 'Cours'], ['stage', 'Stage'], ['concours', 'Concours'], ['libre', 'Événement']].map(([type, label]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#555' }}>
            <span style={{ width: '24px', height: '8px', borderRadius: '4px', background: COLORS[type], display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      {/* Navigation mois */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>
          ◀
        </button>
        <strong style={{ color: COLORS.navy, fontSize: '1.1rem' }}>{MOIS[month]} {year}</strong>
        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem' }}>
          ▶
        </button>
      </div>

      {/* En-têtes jours */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '3px' }}>
        {JOURS.map(j => (
          <div key={j} style={{ textAlign: 'center', fontWeight: 'bold', color: COLORS.navy, fontSize: '0.75rem', padding: '0.3rem 0' }}>
            {j}
          </div>
        ))}
      </div>

      {/* Grille calendrier */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {days.map((day, i) => {
          const dateStr = day ? formatDate(day) : null
          const dayEvents = day ? getEventsForDate(dateStr) : []
          const isToday = dateStr === today
          const isSelected = day === selectedDate

          return (
            <div key={i}
              onClick={() => day && setSelectedDate(day === selectedDate ? null : day)}
              style={{
                minHeight: '52px',
                borderRadius: '6px',
                background: isSelected ? '#e8f4fd' : day ? 'white' : 'transparent',
                cursor: day ? 'pointer' : 'default',
                border: isSelected ? `2px solid ${COLORS.navy}` : isToday ? `2px solid ${COLORS.navy}` : '1px solid #eee',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                overflow: 'hidden'
              }}>
              {day && (
                <>
                  <span style={{
                    fontSize: '0.82rem',
                    color: COLORS.navy,
                    fontWeight: isToday ? 'bold' : 'normal',
                    padding: '0.25rem 0 0.2rem 0'
                  }}>
                    {day}
                  </span>

                  {/* Bandeaux colorés */}
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 2px 3px 2px' }}>
                    {dayEvents.map((e, idx) => (
                      <div key={idx} style={{
                        width: '100%',
                        height: '7px',
                        borderRadius: '3px',
                        background: COLORS[e.type]
                      }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Détail date sélectionnée */}
      {selectedDate && (
        <div style={{ background: '#f9f9f9', borderRadius: '12px', padding: '1rem', marginTop: '1rem', border: `1px solid #eee` }}>
          <h3 style={{ color: COLORS.navy, marginTop: 0, fontSize: '1rem' }}>
            📅 {new Date(selectedDateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          {selectedEvents.length === 0 && <p style={{ color: '#888', fontSize: '0.9rem' }}>Rien de prévu ce jour.</p>}
          {selectedEvents.map((e, i) => (
            <div key={i} style={{
              borderLeft: `5px solid ${COLORS[e.type]}`,
              padding: '0.6rem 0.8rem',
              marginBottom: '0.5rem',
              borderRadius: '0 8px 8px 0',
              background: 'white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
            }}>
              {e.type === 'cours' && (
                <>
                  <strong style={{ color: COLORS.navy }}>{e.title}</strong>
                  <p style={{ margin: '0.2rem 0', color: '#555', fontSize: '0.9rem' }}>
                    🕐 {e.time_start.slice(0,5)} – {e.time_end.slice(0,5)}
                  </p>
                  <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: e.places_remaining > 0 ? '#2ecc71' : '#e74c3c' }}>
                    {e.places_remaining > 0 ? `✅ ${e.places_remaining} place(s) disponible(s)` : '❌ Complet'}
                  </p>
                  {e.places_remaining > 0 && (
                    <button onClick={() => onSelectSlot({ ...e, kind: 'libre' })}
                      style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                      M'inscrire
                    </button>
                  )}
                </>
              )}
              {e.type === 'stage' && (
                <>
                  <strong style={{ color: COLORS.stage }}>🏕️ Stage — {e.title}</strong>
                  <p style={{ margin: '0.3rem 0', color: '#555', fontSize: '0.9rem' }}>
                    Du {new Date(e.date_start + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(e.date_end + 'T12:00:00').toLocaleDateString('fr-FR')}
                  </p>
                  {e.description && <p style={{ margin: '0.2rem 0', color: '#555', fontSize: '0.85rem' }}>{e.description}</p>}
                  {e.inscriptible && e.places_remaining !== null && (
                    <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: e.places_remaining > 0 ? '#2ecc71' : '#e74c3c' }}>
                      {e.places_remaining > 0 ? `✅ ${e.places_remaining} place(s) disponible(s)` : '❌ Complet'}
                    </p>
                  )}
                  {e.inscriptible && (e.places_remaining === null || e.places_remaining > 0) && (
                    <button onClick={() => onSelectSlot({ ...e, kind: 'evenement' })}
                      style={{ background: COLORS.stage, color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                      M'inscrire
                    </button>
                  )}
                </>
              )}
              {e.type === 'concours' && (
                <>
                  <strong style={{ color: COLORS.concours }}>🏆 Concours — {e.title}</strong>
                  <p style={{ margin: '0.3rem 0', color: '#555', fontSize: '0.9rem' }}>
                    Du {new Date(e.date_start + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(e.date_end + 'T12:00:00').toLocaleDateString('fr-FR')}
                  </p>
                  {e.description && <p style={{ margin: '0.2rem 0', color: '#555', fontSize: '0.85rem' }}>{e.description}</p>}
                </>
              )}
              {e.type === 'libre' && (
                <>
                  <strong style={{ color: '#b7950b' }}>📌 {e.title}</strong>
                  <p style={{ margin: '0.3rem 0', color: '#555', fontSize: '0.9rem' }}>
                    Du {new Date(e.date_start + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(e.date_end + 'T12:00:00').toLocaleDateString('fr-FR')}
                  </p>
                  {e.description && <p style={{ margin: '0.2rem 0', color: '#555', fontSize: '0.85rem' }}>{e.description}</p>}
                  {e.inscriptible && e.places_remaining !== null && (
                    <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: e.places_remaining > 0 ? '#2ecc71' : '#e74c3c' }}>
                      {e.places_remaining > 0 ? `✅ ${e.places_remaining} place(s) disponible(s)` : '❌ Complet'}
                    </p>
                  )}
                  {e.inscriptible && (e.places_remaining === null || e.places_remaining > 0) && (
                    <button onClick={() => onSelectSlot({ ...e, kind: 'evenement' })}
                      style={{ background: '#b7950b', color: 'white', border: 'none', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                      M'inscrire
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
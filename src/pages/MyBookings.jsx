import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toLocalISODate } from '../lib/dates'

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  beige: '#f5f0e8',
  beigeLight: '#faf7f2',
  textLight: '#7a6a5a'
}

export default function MyBookings({ onBack }) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [bookings, setBookings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchMyBookings() {
    if (!prenom || !nom) {
      setError("Veuillez entrer le prénom et le nom de l'élève.")
      return
    }
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select('*, slots(title, date, time_start, time_end)')
      .ilike('child_name', prenom.trim())
      .ilike('child_nom', nom.trim())

    if (fetchError) {
      setError('Une erreur est survenue.')
    } else {
      setBookings(data)
    }
    setLoading(false)
  }

  const today = toLocalISODate(new Date())
  const aVenir = (bookings || [])
    .filter(b => b.slots?.date >= today)
    .sort((a, b) => (a.slots?.date || '').localeCompare(b.slots?.date || ''))
  const passees = (bookings || [])
    .filter(b => b.slots?.date < today)
    .sort((a, b) => (b.slots?.date || '').localeCompare(a.slots?.date || ''))

  function CarteReservation({ b, passe }) {
    return (
      <div style={{
        background: passe ? '#f2f2f2' : 'white',
        borderRadius: '16px',
        padding: '1.2rem 1.5rem',
        boxShadow: passe ? 'none' : '0 4px 20px rgba(26,39,68,0.06)',
        border: passe ? '1px solid #e5e5e5' : 'none',
        borderLeft: `5px solid ${passe ? '#ccc' : COLORS.sky}`,
        opacity: passe ? 0.7 : 1
      }}>
        <h3 style={{ color: passe ? '#888' : COLORS.navy, margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
          {b.slots?.title}
        </h3>
        <p style={{ margin: '0.2rem 0', color: passe ? '#aaa' : COLORS.textLight, fontSize: '0.9rem' }}>
          📅 {b.slots?.date ? new Date(b.slots.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        </p>
        <p style={{ margin: '0.2rem 0', color: passe ? '#aaa' : COLORS.textLight, fontSize: '0.9rem' }}>
          🕐 {b.slots?.time_start?.slice(0,5)} – {b.slots?.time_end?.slice(0,5)}
        </p>
        <p style={{ margin: '0.4rem 0 0 0', color: passe ? '#999' : COLORS.navy, fontSize: '0.9rem' }}>
          🐴 Enfant : <strong>{b.child_name}</strong>
        </p>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: COLORS.beigeLight, minHeight: '100vh' }}>
      <header style={{
        background: COLORS.navy,
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)'
      }}>
        <img src="/logo.png" alt="Ecurie de Groynne" style={{ height: '60px', mixBlendMode: 'screen', filter: 'invert(1)' }} />
        <button onClick={onBack}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: 'white', cursor: 'pointer', fontSize: '0.9rem', padding: '0.4rem 1rem', borderRadius: '20px' }}>
          ← Retour
        </button>
      </header>

      <main style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
        <h1 style={{ color: COLORS.navy, fontSize: '1.8rem', marginBottom: '0.5rem' }}>📋 Mes inscriptions</h1>
        <p style={{ color: COLORS.textLight, marginBottom: '2rem' }}>
          Entrez le prénom et le nom de l'élève pour voir ses cours réservés.
        </p>

        <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <input
              placeholder="Prénom de l'élève"
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchMyBookings()}
              style={{ flex: 1, minWidth: '160px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
            />
            <input
              placeholder="Nom de l'élève"
              value={nom}
              onChange={e => setNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchMyBookings()}
              style={{ flex: 1, minWidth: '160px', padding: '0.7rem 1rem', borderRadius: '8px', border: `2px solid #ddd`, fontSize: '1rem', outline: 'none' }}
            />
            <button onClick={fetchMyBookings} disabled={loading}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.7rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {loading ? '⏳...' : 'Voir mes cours'}
            </button>
          </div>
          {error && <p style={{ color: 'red', marginTop: '0.8rem', fontSize: '0.9rem' }}>{error}</p>}
        </div>

        {bookings !== null && (
          <div>
            {bookings.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</p>
                <p style={{ color: COLORS.textLight }}>Aucune inscription trouvée pour ce nom.</p>
              </div>
            ) : (
              <div>
                <p style={{ color: COLORS.textLight, marginBottom: '1rem' }}>
                  {bookings.length} inscription(s) trouvée(s)
                </p>

                {aVenir.length > 0 && (
                  <div style={{ display: 'grid', gap: '1rem', marginBottom: passees.length > 0 ? '2rem' : 0 }}>
                    {aVenir.map(b => <CarteReservation key={b.id} b={b} passe={false} />)}
                  </div>
                )}

                {passees.length > 0 && (
                  <div>
                    <h4 style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.8rem' }}>📁 Passées</h4>
                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                      {passees.map(b => <CarteReservation key={b.id} b={b} passe={true} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
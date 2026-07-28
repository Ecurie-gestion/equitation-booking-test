import { useState } from 'react'
import SlotList from '../components/SlotList'
import BookingForm from '../components/BookingForm'
import Calendar from '../components/Calendar'
import MyBookings from './MyBookings'
import Demain from './Demain'

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  beige: '#f5f0e8',
  beigeLight: '#faf7f2',
  white: '#ffffff',
  text: '#3d2b1f',
  textLight: '#7a6a5a'
}

export default function Home() {
  const [showSlots, setShowSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [showMyBookings, setShowMyBookings] = useState(false)
  const [showDemain, setShowDemain] = useState(false)

  if (showMyBookings) {
    return <MyBookings onBack={() => setShowMyBookings(false)} />
  }

  if (showDemain) {
    return <Demain onBack={() => setShowDemain(false)} />
  }

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: COLORS.beigeLight, minHeight: '100vh' }}>

      <header style={{
        background: COLORS.navy,
        padding: '0.8rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)'
      }}>
        <nav style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button onClick={() => { setShowSlots(false); setSelectedSlot(null); setConfirmed(false) }}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.8, whiteSpace: 'nowrap' }}>
            Accueil
          </button>
          <button onClick={() => setShowMyBookings(true)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: 'white', cursor: 'pointer', fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: '20px', whiteSpace: 'nowrap' }}>
            Mes inscriptions
          </button>
          <button onClick={() => setShowDemain(true)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: 'white', cursor: 'pointer', fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: '20px', whiteSpace: 'nowrap' }}>
            🐴 Demain
          </button>
          <button onClick={() => setShowSlots(true)}
            style={{ background: COLORS.sky, border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: '20px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            Réserver
          </button>
        </nav>
      </header>

      {!showSlots && !selectedSlot && !confirmed && (
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.navy} 0%, #2d4270 50%, #1a3a5c 100%)`,
          padding: '4rem 2rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)', backgroundSize: '20px 20px' }} />
         <img src="/logo.png" alt="Ecurie de Groynne" style={{ height: '80px', mixBlendMode: 'screen', filter: 'invert(1)', marginBottom: '1rem' }} />
          <p style={{ color: COLORS.sky, fontSize: '0.9rem', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Bienvenue à l'
          </p>
          <h1 style={{ color: 'white', fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: '0 0 1rem 0', letterSpacing: '2px', fontWeight: 'bold' }}>
            Ecurie de Groynne
          </h1>
          <div style={{ width: '80px', height: '3px', background: COLORS.sky, margin: '0 auto 1.5rem auto', borderRadius: '2px' }} />
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', maxWidth: '600px', margin: '0 auto 2rem auto', lineHeight: '1.8' }}>
            Réservez votre leçon d'équitation durant les congés scolaires. Les places sont limitées !
          </p>
        
        </div>
      )}

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>

        {confirmed ? (
          <div style={{ background: 'white', borderRadius: '20px', padding: '3rem 2rem', boxShadow: '0 8px 40px rgba(26,39,68,0.1)', textAlign: 'center', marginTop: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
            <h2 style={{ color: COLORS.navy, marginBottom: '1rem', fontSize: '1.8rem' }}>Inscription confirmée !</h2>
            <p style={{ color: COLORS.textLight, marginBottom: '2rem', fontSize: '1.05rem', lineHeight: '1.8' }}>
              Merci ! Votre inscription a bien été enregistrée.<br/>À très bientôt à l'Ecurie de Groynne ! 🐴
            </p>
            <button onClick={() => { setConfirmed(false); setSelectedSlot(null); setShowSlots(false) }}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.8rem 2.5rem', borderRadius: '50px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
              ← Retour à l'accueil
            </button>
          </div>

        ) : selectedSlot ? (
          <div>
            <button onClick={() => setSelectedSlot(null)}
              style={{ background: 'none', border: 'none', color: COLORS.navy, cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1rem' }}>
              ← Retour aux créneaux
            </button>
            <BookingForm slot={selectedSlot} onSuccess={() => setConfirmed(true)} onCancel={() => setSelectedSlot(null)} />
          </div>

        ) : showSlots ? (
          <div>
            <button onClick={() => setShowSlots(false)}
              style={{ background: 'none', border: 'none', color: COLORS.navy, cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              ← Retour à l'accueil
            </button>
            <h2 style={{ color: COLORS.navy, fontSize: '1.5rem', marginBottom: '1.5rem' }}>📋 Créneaux disponibles</h2>
            <SlotList onSelectSlot={setSelectedSlot} />
          </div>

        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem', marginTop: '2rem' }}>
              {[
                { icon: '📅', title: 'Congés scolaires', desc: 'Cours disponibles pendant toutes les vacances' },
                { icon: '🐴', title: 'Tous niveaux', desc: 'Du licol blanc au degré 3' },
                { icon: '👥', title: 'Places limitées', desc: 'Inscrivez-vous vite !' }
              ].map((item, i) => (
                <div key={i} style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  boxShadow: '0 4px 20px rgba(26,39,68,0.06)',
                  borderTop: `4px solid ${COLORS.sky}`
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{item.icon}</div>
                  <h3 style={{ color: COLORS.navy, margin: '0 0 0.3rem 0', fontSize: '1rem' }}>{item.title}</h3>
                  <p style={{ color: COLORS.textLight, margin: 0, fontSize: '0.85rem' }}>{item.desc}</p>
                </div>
              ))}
            </div>

            <div style={{ background: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)', marginBottom: '2rem' }}>
              <h2 style={{ color: COLORS.navy, marginTop: 0, fontSize: '1.3rem' }}>📅 Agenda de l'écurie</h2>
              <Calendar onSelectSlot={setSelectedSlot} />
            </div>

            <div style={{ background: `linear-gradient(135deg, ${COLORS.navy}, #2d4270)`, borderRadius: '20px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 8px 40px rgba(26,39,68,0.2)' }}>
              <h2 style={{ color: 'white', marginTop: 0, fontSize: '1.5rem' }}>Prêt à monter en selle ? 🐴</h2>
              <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '1.5rem' }}>
                Choisissez votre créneau et inscrivez-vous en quelques clics !
              </p>
              <button onClick={() => setShowSlots(true)}
                style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '1rem 3rem', fontSize: '1.1rem', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold' }}>
                Voir les créneaux disponibles →
              </button>
            </div>
          </div>
        )}
      </main>

      <footer style={{ background: COLORS.navy, color: 'white', padding: '3rem 2rem', marginTop: '3rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
          <div>
            <img src="/logo.png" alt="Ecurie de Groynne" style={{ height: '50px', mixBlendMode: 'screen', filter: 'invert(1)', marginBottom: '1rem' }} />
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: '1.8' }}>
              Votre écurie de confiance pour des cours d'équitation de qualité.
            </p>
          </div>
          <div>
            <h3 style={{ color: COLORS.sky, marginTop: 0, fontSize: '1rem', letterSpacing: '1px' }}>CONTACT</h3>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', lineHeight: '2' }}>
              François Jadot<br/>
              Rue de Groynne 28<br/>
              5300 Andenne<br/>
              📞 0478/60.56.89
            </p>
          </div>
          <div>
            <h3 style={{ color: COLORS.sky, marginTop: 0, fontSize: '1rem', letterSpacing: '1px' }}>RÉSERVATION</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: '1.8' }}>
              Inscription en ligne pour les cours durant les congés scolaires.<br/>
              Pour les stages, contactez-nous par SMS.
            </p>
          </div>
        </div>
        <div style={{ maxWidth: '900px', margin: '2rem auto 0 auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: 0 }}>
            © 2026 Ecurie de Groynne — Tous droits réservés — Avec ❤️ par l'équipe Ecurie de Groynne
          </p>
        </div>
      </footer>

    </div>
  )
}
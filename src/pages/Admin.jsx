import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import MesCours from '../components/annee/MesCours'
import CreneauxManager from '../components/annee/CreneauxManager'
import EvenementsManager from '../components/annee/EvenementsManager'
import CavaliersManager from '../components/annee/CavaliersManager'
import ChevauxManager from '../components/annee/ChevauxManager'

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  skyLight: '#e8f4fd',
  green: '#2ecc71',
  red: '#e74c3c',
  terracotta: '#b5764c',
  terracottaLight: '#f6ece2',
  bg: '#f0f7ff'
}

const TABS_PRINCIPAUX = [
  { key: 'mes-cours', label: '📅 Mes cours', Component: MesCours },
  { key: 'cavaliers', label: '🧑 Élèves', Component: CavaliersManager },
  { key: 'chevaux', label: '🐴 Chevaux', Component: ChevauxManager },
  { key: 'evenements', label: '📌 Stages & événements', Component: EvenementsManager }
]

const TAB_GESTION = { key: 'gestion', label: '⚙️ Gestion des créneaux', Component: CreneauxManager }

const TABS = [...TABS_PRINCIPAUX, TAB_GESTION]

export default function Admin() {
  const [session, setSession] = useState(undefined) // undefined = pas encore vérifié, null = pas connecté
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('mes-cours')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function seConnecter() {
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMessage({ type: 'error', text: "Email ou mot de passe incorrect." })
    setLoading(false)
  }

  async function seDeconnecter() {
    await supabase.auth.signOut()
  }

  const Header = () => (
    <header style={{ background: COLORS.navy, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src="/logo.png" alt="Ecurie de Groynne" style={{ height: '60px', mixBlendMode: 'screen', filter: 'invert(1)' }} />
    </header>
  )

  // Vérification de session en cours : on évite d'afficher le formulaire de connexion par erreur
  if (session === undefined) return (
    <div style={{ fontFamily: 'Georgia, serif', background: COLORS.bg, minHeight: '100vh' }}>
      <Header />
    </div>
  )

  if (!session) return (
    <div style={{ fontFamily: 'Georgia, serif', background: COLORS.bg, minHeight: '100vh' }}>
      <Header />
      <div style={{ maxWidth: '400px', margin: '3rem auto', padding: '1rem' }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 20px rgba(26,39,68,0.12)', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
          <h2 style={{ color: COLORS.navy, marginBottom: '1.5rem', fontSize: '1.3rem' }}>Espace Moniteurs</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && seConnecter()}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '2px solid #ddd', fontSize: '1rem', marginBottom: '0.8rem', boxSizing: 'border-box' }}
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && seConnecter()}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '2px solid #ddd', fontSize: '1rem', marginBottom: '1rem', boxSizing: 'border-box' }}
          />
          <button
            onClick={seConnecter}
            disabled={loading}
            style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', width: '100%' }}>
            {loading ? 'Connexion...' : 'Connexion'}
          </button>
          {message && <p style={{ color: 'red', marginTop: '1rem' }}>{message.text}</p>}
        </div>
      </div>
    </div>
  )

  const ActiveComponent = TABS.find(t => t.key === activeTab).Component

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: COLORS.bg, minHeight: '100vh' }}>
      <Header />

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '1rem' }}>

        <h1 style={{ color: COLORS.navy, margin: '0 0 0.3rem 0', fontSize: 'clamp(1.1rem, 4vw, 1.6rem)', textAlign: 'center' }}>🧑‍🏫 Espace Moniteurs</h1>

        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button onClick={seDeconnecter}
            style={{ background: 'none', border: 'none', color: '#999', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}>
            Se déconnecter ({session.user.email})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {TABS_PRINCIPAUX.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                background: activeTab === t.key ? COLORS.navy : 'white',
                color: activeTab === t.key ? 'white' : COLORS.navy,
                border: `1px solid ${COLORS.navy}`,
                padding: '0.7rem 1.1rem',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 'bold'
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
          <button onClick={() => setActiveTab(TAB_GESTION.key)}
            style={{
              background: 'none',
              color: activeTab === TAB_GESTION.key ? COLORS.navy : '#999',
              border: 'none',
              textDecoration: activeTab === TAB_GESTION.key ? 'none' : 'underline',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: activeTab === TAB_GESTION.key ? 'bold' : 'normal'
            }}>
            {TAB_GESTION.label}
          </button>
        </div>

        <ActiveComponent />

      </main>
    </div>
  )
}

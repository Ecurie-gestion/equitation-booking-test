const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  beigeLight: '#faf7f2',
  textLight: '#7a6a5a',
  text: '#3d2b1f'
}

const CONTACT_EMAIL = 'ecuriedegroynne1@gmail.com'

export default function PrivacyPolicy({ onBack }) {
  return (
    <div style={{ fontFamily: "'Georgia', serif", background: COLORS.beigeLight, minHeight: '100vh' }}>
      <header style={{ background: COLORS.navy, padding: '0.9rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 20px rgba(0,0,0,0.3)' }}>
        <img src="/logo.png" alt="Ecurie de Groynne" style={{ height: '48px', mixBlendMode: 'screen', filter: 'invert(1)' }} />
      </header>
      <main style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem 3rem 1rem' }}>
        {onBack && (
          <button onClick={onBack}
            style={{ background: 'none', border: 'none', color: COLORS.navy, cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            ← Retour
          </button>
        )}

        <h1 style={{ color: COLORS.navy, fontSize: '1.6rem', marginBottom: '1.5rem' }}>Politique de confidentialité</h1>

        <div style={{ background: 'white', borderRadius: '16px', padding: '1.8rem', boxShadow: '0 4px 20px rgba(26,39,68,0.08)', color: COLORS.text, lineHeight: '1.8', fontSize: '0.95rem' }}>

          <h3 style={{ color: COLORS.navy, marginTop: 0 }}>Pourquoi recueillons-nous ces informations ?</h3>
          <p>
            Lorsque vous inscrivez un cavalier à un cours, un stage ou un événement, nous vous demandons son
            nom, son prénom, ainsi que le nom, l'email et le numéro de téléphone d'un parent ou responsable.
            Ces informations sont nécessaires pour organiser les leçons et pour vous contacter en cas de besoin
            ou d'urgence concernant votre enfant.
          </p>

          <h3 style={{ color: COLORS.navy }}>Qui a accès à ces données ?</h3>
          <p>
            Ces informations sont réservées à l'usage exclusif de l'équipe pédagogique (moniteurs) et de la
            direction de l'Écurie de Groynne. Elles ne sont jamais transmises à des tiers.
          </p>

          <h3 style={{ color: COLORS.navy }}>Combien de temps sont-elles conservées ?</h3>
          <p>
            Les données sont conservées pendant toute la durée de la saison sportive, puis supprimées un an
            après le dernier cours suivi.
          </p>

          <h3 style={{ color: COLORS.navy }}>Vos droits</h3>
          <p>
            Vous pouvez à tout moment demander à consulter, corriger ou supprimer les informations vous
            concernant (ou concernant votre enfant), en écrivant à :{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: COLORS.sky }}>{CONTACT_EMAIL}</a>.
          </p>

          <h3 style={{ color: COLORS.navy }}>Sécurité</h3>
          <p>
            L'accès à l'espace de gestion est réservé aux moniteurs, via un identifiant et un mot de passe
            individuels. Les échanges entre votre appareil et le site sont chiffrés (protocole HTTPS).
          </p>
        </div>
      </main>
    </div>
  )
}

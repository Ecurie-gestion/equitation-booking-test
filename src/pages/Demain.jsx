import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toLocalISODate } from '../lib/dates'

const COLORS = {
  navy: '#1a2744',
  sky: '#4aa8d8',
  skyLight: '#e8f4fd',
  beige: '#f5f0e8',
  beigeLight: '#faf7f2',
  white: '#ffffff',
  text: '#3d2b1f',
  textLight: '#7a6a5a'
}

async function fetchJour(dateStr) {
  const { data: seancesData } = await supabase
    .from('seances')
    .select('*, creneaux_fixes(heure_debut, heure_fin, niveaux)')
    .eq('date', dateStr)
    .eq('annulee', false)

  const avecPresences = await Promise.all((seancesData || []).map(async s => {
    const { data: presencesData } = await supabase
      .from('presences')
      .select('*, cavaliers(prenom, nom), chevaux(nom)')
      .eq('seance_id', s.id)
    return { ...s, presences: presencesData || [] }
  }))

  const { data: libresData } = await supabase
    .from('slots')
    .select('*')
    .eq('date', dateStr)

  const avecBookings = await Promise.all((libresData || []).map(async s => {
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*, chevaux(nom)')
      .eq('slot_id', s.id)
    return { ...s, bookings: bookingsData || [] }
  }))

  // On fusionne cours fixes et créneaux libres dans une seule liste, triée par
  // heure de début — sinon les cours fixes s'affichaient tous avant les
  // créneaux libres (et les cours fixes n'étaient pas triés par heure), ce qui
  // donnait un ordre incohérent (ex: 19h30 avant 17h30).
  const cours = [
    ...avecPresences.map(s => ({
      id: `fixe-${s.id}`,
      heure: s.creneaux_fixes?.heure_debut?.slice(0, 5) || '',
      label: s.creneaux_fixes?.niveaux || '',
      kind: 'fixe',
      rows: s.presences.map(p => ({ id: p.id, cavalier: p.cavaliers?.prenom, cheval: p.chevaux?.nom })),
      messageVide: 'Liste des cavaliers pas encore disponible.'
    })),
    ...avecBookings.map(s => ({
      id: `libre-${s.id}`,
      heure: s.time_start?.slice(0, 5) || '',
      label: s.title,
      kind: 'libre',
      rows: s.bookings.map(b => ({ id: b.id, cavalier: b.child_name, cheval: b.chevaux?.nom })),
      messageVide: 'Aucun cavalier inscrit pour ce créneau.'
    }))
  ].sort((a, b) => a.heure.localeCompare(b.heure))

  return cours
}

function SectionJour({ titre, dateAffichee, cours, messageVide }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ color: COLORS.navy, fontSize: '1.5rem', marginBottom: '0.3rem' }}>{titre}</h2>
      {dateAffichee && <p style={{ color: COLORS.textLight, marginBottom: '1.2rem', textTransform: 'capitalize' }}>{dateAffichee}</p>}

      {cours.length === 0 && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
          <p style={{ color: COLORS.textLight, margin: 0 }}>{messageVide}</p>
        </div>
      )}

      {cours.map(c => (
        <div key={c.id} style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span style={{ background: c.kind === 'fixe' ? COLORS.skyLight : '#f6ece2', color: COLORS.navy, padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
              {c.heure}
            </span>
            {c.label && <span style={{ color: COLORS.textLight, fontSize: '0.9rem' }}>{c.label}</span>}
          </div>

          {c.rows.length === 0 && <p style={{ color: '#aaa', fontSize: '0.9rem', fontStyle: 'italic' }}>{c.messageVide}</p>}

          {c.rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${COLORS.beige}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', color: COLORS.navy }}>Cavalier</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', color: COLORS.navy }}>Cheval</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.beige}` }}>
                    <td style={{ padding: '0.4rem 0', color: COLORS.text }}>{r.cavalier}</td>
                    <td style={{ padding: '0.4rem 0', color: COLORS.text }}>{r.cheval || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Demain({ onBack }) {
  const [loading, setLoading] = useState(true)
  const [aujourdhui, setAujourdhui] = useState({ cours: [], dateAffichee: '' })
  const [demain, setDemain] = useState({ cours: [], dateAffichee: '' })

  useEffect(() => { fetchToutes() }, [])

  async function fetchToutes() {
    setLoading(true)

    const jourJ = new Date()
    const jourJ1 = new Date()
    jourJ1.setDate(jourJ1.getDate() + 1)

    const dateJourJ = toLocalISODate(jourJ)
    const dateJourJ1 = toLocalISODate(jourJ1)

    const [coursJourJ, coursJourJ1] = await Promise.all([fetchJour(dateJourJ), fetchJour(dateJourJ1)])

    setAujourdhui({
      cours: coursJourJ,
      dateAffichee: jourJ.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    })
    setDemain({
      cours: coursJourJ1,
      dateAffichee: jourJ1.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    })

    setLoading(false)
  }

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: COLORS.beigeLight, minHeight: '100vh' }}>
      <header style={{ background: COLORS.navy, padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <button onClick={onBack}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: 'white', cursor: 'pointer', fontSize: '0.85rem', padding: '0.4rem 0.9rem', borderRadius: '20px' }}>
          ← Retour
        </button>
      </header>

      <main style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem 1rem' }}>
        {loading && <p style={{ color: COLORS.textLight }}>Chargement...</p>}

        {!loading && (
          <>
            <SectionJour
              titre="🐴 Les cours d'aujourd'hui"
              dateAffichee={aujourdhui.dateAffichee}
              cours={aujourdhui.cours}
              messageVide="Aucun cours prévu aujourd'hui."
            />
            <SectionJour
              titre="🐴 Les cours de demain"
              dateAffichee={demain.dateAffichee}
              cours={demain.cours}
              messageVide="Aucun cours prévu demain."
            />
          </>
        )}
      </main>
    </div>
  )
}

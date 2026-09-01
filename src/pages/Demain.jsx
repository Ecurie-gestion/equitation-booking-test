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
    .order('creneau_fixe_id')

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

  return { seances: avecPresences, libres: avecBookings }
}

function SectionJour({ titre, dateAffichee, seances, libres, messageVide }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ color: COLORS.navy, fontSize: '1.5rem', marginBottom: '0.3rem' }}>{titre}</h2>
      {dateAffichee && <p style={{ color: COLORS.textLight, marginBottom: '1.2rem', textTransform: 'capitalize' }}>{dateAffichee}</p>}

      {seances.length === 0 && libres.length === 0 && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
          <p style={{ color: COLORS.textLight, margin: 0 }}>{messageVide}</p>
        </div>
      )}

      {seances.map(s => (
        <div key={s.id} style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span style={{ background: COLORS.skyLight, color: COLORS.navy, padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
              {s.creneaux_fixes?.heure_debut?.slice(0, 5)}
            </span>
            {s.creneaux_fixes?.niveaux && <span style={{ color: COLORS.textLight, fontSize: '0.9rem' }}>{s.creneaux_fixes.niveaux}</span>}
          </div>

          {s.presences.length === 0 && <p style={{ color: '#aaa', fontSize: '0.9rem', fontStyle: 'italic' }}>Liste des cavaliers pas encore disponible.</p>}

          {s.presences.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${COLORS.beige}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', color: COLORS.navy }}>Cavalier</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', color: COLORS.navy }}>Cheval</th>
                </tr>
              </thead>
              <tbody>
                {s.presences.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${COLORS.beige}` }}>
                    <td style={{ padding: '0.4rem 0', color: COLORS.text }}>{p.cavaliers?.prenom}</td>
                    <td style={{ padding: '0.4rem 0', color: COLORS.text }}>{p.chevaux?.nom || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {libres.map(s => (
        <div key={s.id} style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1rem', boxShadow: '0 4px 20px rgba(26,39,68,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span style={{ background: '#f6ece2', color: COLORS.navy, padding: '0.3rem 0.7rem', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
              {s.time_start?.slice(0, 5)}
            </span>
            <span style={{ color: COLORS.textLight, fontSize: '0.9rem' }}>{s.title}</span>
          </div>

          {s.bookings.length === 0 && <p style={{ color: '#aaa', fontSize: '0.9rem', fontStyle: 'italic' }}>Aucun cavalier inscrit pour ce créneau.</p>}

          {s.bookings.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${COLORS.beige}` }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', color: COLORS.navy }}>Cavalier</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0', color: COLORS.navy }}>Cheval</th>
                </tr>
              </thead>
              <tbody>
                {s.bookings.map(b => (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${COLORS.beige}` }}>
                    <td style={{ padding: '0.4rem 0', color: COLORS.text }}>{b.child_name}</td>
                    <td style={{ padding: '0.4rem 0', color: COLORS.text }}>{b.chevaux?.nom || '—'}</td>
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
  const [aujourdhui, setAujourdhui] = useState({ seances: [], libres: [], dateAffichee: '' })
  const [demain, setDemain] = useState({ seances: [], libres: [], dateAffichee: '' })

  useEffect(() => { fetchToutes() }, [])

  async function fetchToutes() {
    setLoading(true)

    const jourJ = new Date()
    const jourJ1 = new Date()
    jourJ1.setDate(jourJ1.getDate() + 1)

    const dateJourJ = toLocalISODate(jourJ)
    const dateJourJ1 = toLocalISODate(jourJ1)

    const [dataJourJ, dataJourJ1] = await Promise.all([fetchJour(dateJourJ), fetchJour(dateJourJ1)])

    setAujourdhui({
      ...dataJourJ,
      dateAffichee: jourJ.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    })
    setDemain({
      ...dataJourJ1,
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
              seances={aujourdhui.seances}
              libres={aujourdhui.libres}
              messageVide="Aucun cours prévu aujourd'hui."
            />
            <SectionJour
              titre="🐴 Les cours de demain"
              dateAffichee={demain.dateAffichee}
              seances={demain.seances}
              libres={demain.libres}
              messageVide="Aucun cours prévu demain."
            />
          </>
        )}
      </main>
    </div>
  )
}

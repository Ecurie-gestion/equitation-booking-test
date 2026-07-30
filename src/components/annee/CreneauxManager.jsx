import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { sendEmailsToAll } from '../../lib/email'
import { COLORS, JOURS_SEMAINE, TYPES_ABONNEMENT, COURS_TYPES } from '../../lib/theme'
import { upsertCavalierDepuisReservation } from '../../lib/cavaliers'
import { toLocalISODate } from '../../lib/dates'

const EMPTY_FIXE = { jour_semaine: 1, heure_debut: '18:00', heure_fin: '19:00', niveaux: '', capacite_max: 8 }
const EMPTY_LIBRE = { title: '', date: '', time_start: '', max_places: 6 }
const EMPTY_ABO = { cavalier_id: '', type: 'unite', date_debut: toLocalISODate(new Date()), date_fin: '', lecons_totales: 10 }
const EMPTY_ELEVE = { parent_name: '', child_name: '', child_nom: '', email: '', phone: '' }
const EMPTY_VACANCES = { nom: '', date_debut: '', date_fin: '' }

function prochainesDates(jourSemaine, nbSemaines) {
  const dates = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let jour = new Date(today)
  const diff = (jourSemaine - jour.getDay() + 7) % 7
  jour.setDate(jour.getDate() + diff)
  for (let i = 0; i < nbSemaines; i++) {
    dates.push(toLocalISODate(jour))
    jour.setDate(jour.getDate() + 7)
  }
  return dates
}

function estEnVacances(date, periodes) {
  return periodes.some(p => date >= p.date_debut && date <= p.date_fin)
}

export default function CreneauxManager() {
  // Données
  const [creneauxFixes, setCreneauxFixes] = useState([])
  const [creneauxLibres, setCreneauxLibres] = useState([])
  const [cavaliers, setCavaliers] = useState([])
  const [chevaux, setChevaux] = useState([])
  const [abonnements, setAbonnements] = useState({})
  const [bookings, setBookings] = useState({})

  // Nouveau créneau (formulaire unique avec choix du type)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState(null) // 'fixe' | 'libre'
  const [formFixe, setFormFixe] = useState(EMPTY_FIXE)
  const [formLibre, setFormLibre] = useState(EMPTY_LIBRE)

  // Édition
  const [editingFixeId, setEditingFixeId] = useState(null)
  const [editFormFixe, setEditFormFixe] = useState({})
  const [editingLibreId, setEditingLibreId] = useState(null)
  const [editFormLibre, setEditFormLibre] = useState({})

  // Ouverture / sous-formulaires
  const [openItem, setOpenItem] = useState(null) // `fixe-<id>` ou `libre-<id>`
  const [showAboForm, setShowAboForm] = useState(null)
  const [aboForm, setAboForm] = useState(EMPTY_ABO)
  const [addingEleve, setAddingEleve] = useState(null)
  const [newEleve, setNewEleve] = useState(EMPTY_ELEVE)

  const [message, setMessage] = useState(null)

  // Séances & vacances scolaires (gestion avancée)
  const [generating, setGenerating] = useState(false)
  const [periodesVacances, setPeriodesVacances] = useState([])
  const [showVacancesForm, setShowVacancesForm] = useState(false)
  const [newVacances, setNewVacances] = useState(EMPTY_VACANCES)

  useEffect(() => {
    fetchCreneauxFixes()
    fetchCreneauxLibres()
    fetchCavaliers()
    fetchChevaux()
    fetchVacances()
  }, [])

  async function fetchVacances() {
    const { data } = await supabase.from('vacances_scolaires').select('*').order('date_debut')
    setPeriodesVacances(data || [])
  }

  async function ajouterVacances() {
    if (!newVacances.nom || !newVacances.date_debut || !newVacances.date_fin) {
      setMessage({ type: 'error', text: 'Remplis tous les champs.' })
      return
    }
    const { error } = await supabase.from('vacances_scolaires').insert(newVacances)
    if (!error) {
      await supabase.from('seances').delete().gte('date', newVacances.date_debut).lte('date', newVacances.date_fin)
      setNewVacances(EMPTY_VACANCES)
      setShowVacancesForm(false)
      fetchVacances()
      setMessage({ type: 'success', text: 'Période de vacances ajoutée.' })
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'ajout." })
    }
  }

  async function supprimerVacances(id) {
    if (!confirm('Supprimer cette période de vacances ?')) return
    await supabase.from('vacances_scolaires').delete().eq('id', id)
    fetchVacances()
  }

  async function genererSeances() {
    setGenerating(true)
    const rows = []
    let sautees = 0
    for (const cr of creneauxFixes) {
      const dates = prochainesDates(cr.jour_semaine, 8)
      for (const date of dates) {
        if (estEnVacances(date, periodesVacances)) { sautees++; continue }
        rows.push({ creneau_fixe_id: cr.id, date })
      }
    }
    const { error } = await supabase.from('seances').upsert(rows, { onConflict: 'creneau_fixe_id,date', ignoreDuplicates: true })
    setGenerating(false)
    if (!error) {
      setMessage({ type: 'success', text: `Séances générées${sautees > 0 ? ` (${sautees} date(s) sautée(s) car en vacances)` : ''}.` })
    } else {
      setMessage({ type: 'error', text: 'Erreur lors de la génération.' })
    }
  }

  async function fetchChevaux() {
    const { data } = await supabase.from('chevaux').select('*').eq('actif', true).order('nom')
    setChevaux(data || [])
  }

  async function fetchCreneauxFixes() {
    const { data } = await supabase.from('creneaux_fixes').select('*').eq('actif', true)
      .order('jour_semaine').order('heure_debut')
    setCreneauxFixes(data || [])
  }

  async function fetchCreneauxLibres() {
    const { data } = await supabase.from('slots_with_availability').select('*').order('date')
    setCreneauxLibres(data || [])
  }

  async function fetchCavaliers() {
    const { data } = await supabase.from('cavaliers').select('*').eq('actif', true).order('nom')
    setCavaliers(data || [])
  }

  async function fetchAbonnements(creneauId) {
    const { data } = await supabase
      .from('abonnements')
      .select('*, cavaliers(prenom, nom)')
      .eq('creneau_fixe_id', creneauId)
      .eq('actif', true)
    setAbonnements(prev => ({ ...prev, [creneauId]: data || [] }))
  }

  async function fetchBookings(slotId) {
    const { data } = await supabase.from('bookings').select('*').eq('slot_id', slotId)
    setBookings(prev => ({ ...prev, [slotId]: data || [] }))
  }

  // --- Création ---

  function openNewForm() {
    setShowForm(true)
    setFormType(null)
    setFormFixe(EMPTY_FIXE)
    setFormLibre(EMPTY_LIBRE)
  }

  async function saveFixe() {
    if (!formFixe.heure_debut || !formFixe.heure_fin) {
      setMessage({ type: 'error', text: 'Les heures sont obligatoires.' })
      return
    }
    const payload = { ...formFixe, jour_semaine: parseInt(formFixe.jour_semaine), capacite_max: parseInt(formFixe.capacite_max) }
    const { error } = await supabase.from('creneaux_fixes').insert(payload)
    if (!error) {
      setMessage({ type: 'success', text: 'Créneau fixe créé.' })
      setShowForm(false)
      fetchCreneauxFixes()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de la création." })
    }
  }

  function toggleCoursLibre(cours, target = 'formLibre') {
    const state = target === 'formLibre' ? formLibre : editFormLibre
    const setState = target === 'formLibre' ? setFormLibre : setEditFormLibre
    const selected = state.title ? state.title.split(' + ') : []
    if (selected.includes(cours)) {
      setState({ ...state, title: selected.filter(x => x !== cours).join(' + ') })
    } else {
      setState({ ...state, title: [...selected, cours].join(' + ') })
    }
  }

  async function saveLibre() {
    if (!formLibre.title || !formLibre.date || !formLibre.time_start) {
      setMessage({ type: 'error', text: 'Remplis tous les champs !' })
      return
    }
    const startHour = parseInt(formLibre.time_start.slice(0, 2))
    const startMin = formLibre.time_start.slice(3, 5)
    const endHour = startHour === 23 ? 0 : startHour + 1
    const time_end = `${String(endHour).padStart(2, '0')}:${startMin}`
    const { data, error } = await supabase.from('slots').insert({ ...formLibre, time_end }).select().single()
    if (!error && data) {
      let syncOk = false
      try {
        const res = await fetch('/.netlify/functions/update-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot_id: data.id, action: 'create' })
        })
        syncOk = res.ok
      } catch {
        syncOk = false
      }
      setMessage({
        type: 'success',
        text: syncOk ? 'Créneau libre créé et ajouté à Google Agenda !' : 'Créneau libre créé (non synchronisé avec Google Agenda — vérifie la connexion du compte Google).'
      })
      setShowForm(false)
      fetchCreneauxLibres()
    } else {
      setMessage({ type: 'error', text: 'Erreur lors de la création.' })
    }
  }

  // --- Créneaux fixes : édition / désactivation / inscriptions ---

  function startEditFixe(cr) {
    setEditFormFixe({
      jour_semaine: cr.jour_semaine,
      heure_debut: cr.heure_debut.slice(0, 5),
      heure_fin: cr.heure_fin.slice(0, 5),
      niveaux: cr.niveaux || '',
      capacite_max: cr.capacite_max
    })
    setEditingFixeId(cr.id)
  }

  async function updateFixe() {
    const payload = { ...editFormFixe, jour_semaine: parseInt(editFormFixe.jour_semaine), capacite_max: parseInt(editFormFixe.capacite_max) }
    const { error } = await supabase.from('creneaux_fixes').update(payload).eq('id', editingFixeId)
    if (!error) {
      setMessage({ type: 'success', text: 'Créneau modifié.' })
      setEditingFixeId(null)
      fetchCreneauxFixes()
    } else {
      setMessage({ type: 'error', text: 'Erreur lors de la modification.' })
    }
  }

  async function desactiverFixe(id) {
    if (!confirm("Désactiver ce créneau fixe ? Les inscriptions en cours resteront visibles dans l'historique.")) return
    await supabase.from('creneaux_fixes').update({ actif: false }).eq('id', id)
    fetchCreneauxFixes()
  }

  async function supprimerFixe(id) {
    if (!confirm('Supprimer définitivement ce créneau fixe, ainsi que toutes ses inscriptions, séances et présences ? Cette action est irréversible.')) return
    await supabase.from('creneaux_fixes').delete().eq('id', id)
    setOpenItem(null)
    fetchCreneauxFixes()
  }

  async function inscrire(creneauId) {
    if (!aboForm.cavalier_id) {
      setMessage({ type: 'error', text: 'Choisis un cavalier.' })
      return
    }
    const payload = {
      cavalier_id: aboForm.cavalier_id,
      creneau_fixe_id: creneauId,
      type: aboForm.type,
      date_debut: aboForm.date_debut,
      date_fin: aboForm.type === 'vacances_a_vacances' ? (aboForm.date_fin || null) : null,
      lecons_totales: aboForm.type === 'dix_lecons' ? parseInt(aboForm.lecons_totales) : null,
      lecons_restantes: aboForm.type === 'dix_lecons' ? parseInt(aboForm.lecons_totales) : null
    }
    const { error } = await supabase.from('abonnements').insert(payload)
    if (!error) {
      setMessage({ type: 'success', text: 'Cavalier inscrit.' })
      setAboForm(EMPTY_ABO)
      setShowAboForm(null)
      fetchAbonnements(creneauId)
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'inscription." })
    }
  }

  async function desinscrire(aboId, creneauId) {
    if (!confirm('Désinscrire ce cavalier de ce créneau ?')) return
    await supabase.from('abonnements').update({ actif: false }).eq('id', aboId)
    fetchAbonnements(creneauId)
  }

  // --- Créneaux libres : édition / suppression / réservations ---

  function startEditLibre(slot) {
    setEditFormLibre({ title: slot.title, date: slot.date, time_start: slot.time_start.slice(0, 5), max_places: slot.max_places })
    setEditingLibreId(slot.id)
  }

  async function updateLibre() {
    const startHour = parseInt(editFormLibre.time_start.slice(0, 2))
    const startMin = editFormLibre.time_start.slice(3, 5)
    const endHour = startHour === 23 ? 0 : startHour + 1
    const time_end = `${String(endHour).padStart(2, '0')}:${startMin}`
    const slotBefore = creneauxLibres.find(s => s.id === editingLibreId)

    const { error } = await supabase.from('slots').update({ ...editFormLibre, time_end }).eq('id', editingLibreId)
    if (!error) {
      const { data: inscrits } = await supabase.from('bookings').select('email, child_name').eq('slot_id', editingLibreId).neq('email', '')
      if (inscrits && inscrits.length > 0) {
        const emails = inscrits.map(b => b.email).filter(Boolean)
        if (emails.length > 0) {
          const sent = await sendEmailsToAll(emails, 'Modification de votre cours — Ecurie de Groynne',
            `Bonjour,\n\nVotre cours ${slotBefore.title} a été modifié :\n\nNouvelle date : ${new Date(editFormLibre.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}\nNouvel horaire : ${editFormLibre.time_start} – ${time_end}\nNiveau : ${editFormLibre.title}\n\nEn cas de question, contactez François au 0478/60.56.89.\n\nÀ bientôt à l'Ecurie de Groynne !`)
          setMessage({ type: 'success', text: `Créneau modifié — ${sent} email(s) envoyé(s).` })
        }
      } else {
        setMessage({ type: 'success', text: 'Créneau modifié !' })
      }
      setEditingLibreId(null)
      fetchCreneauxLibres()
    } else {
      setMessage({ type: 'error', text: 'Erreur lors de la modification.' })
    }
  }

  async function deleteLibre(slotId) {
    if (!confirm('Supprimer ce créneau et toutes ses inscriptions ?')) return
    const slot = creneauxLibres.find(s => s.id === slotId)
    const { data: inscrits } = await supabase.from('bookings').select('email, child_name').eq('slot_id', slotId).neq('email', '')
    await supabase.from('slots').delete().eq('id', slotId)
    if (inscrits && inscrits.length > 0) {
      const emails = inscrits.map(b => b.email).filter(Boolean)
      if (emails.length > 0) {
        const sent = await sendEmailsToAll(emails, 'Annulation de votre cours — Ecurie de Groynne',
          `Bonjour,\n\nNous vous informons que le cours ${slot.title} prévu le ${new Date(slot.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${slot.time_start.slice(0, 5)} a été annulé.\n\nNous nous excusons pour la gêne occasionnée. N'hésitez pas à vous inscrire sur un autre créneau ou à contacter François au 0478/60.56.89.\n\nÀ bientôt à l'Ecurie de Groynne !`)
        setMessage({ type: 'success', text: `Créneau supprimé — ${sent} email(s) envoyé(s).` })
      }
    }
    setOpenItem(null)
    fetchCreneauxLibres()
  }

  async function assignerChevalBooking(bookingId, chevalId, slotId) {
    await supabase.from('bookings').update({ cheval_id: chevalId || null }).eq('id', bookingId)
    fetchBookings(slotId)
  }

  async function deleteBooking(bookingId, slotId) {
    if (!confirm('Supprimer cet élève du créneau ?')) return
    await supabase.from('bookings').delete().eq('id', bookingId)
    fetchBookings(slotId)
    fetchCreneauxLibres()
  }

  async function addEleve(slotId) {
    if (!newEleve.child_name) {
      setMessage({ type: 'error', text: "Le nom et prénom de l'élève sont obligatoires." })
      return
    }
    const { error } = await supabase.from('bookings').insert({ ...newEleve, slot_id: slotId })
    if (!error) {
      await upsertCavalierDepuisReservation(newEleve)
      setMessage({ type: 'success', text: 'Élève ajouté !' })
      setNewEleve(EMPTY_ELEVE)
      setAddingEleve(null)
      fetchBookings(slotId)
      fetchCreneauxLibres()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'ajout." })
    }
  }

  function toggleOpen(key, isFixe) {
    if (openItem === key) {
      setOpenItem(null)
    } else {
      setOpenItem(key)
      if (isFixe) fetchAbonnements(key.replace('fixe-', ''))
      else fetchBookings(key.replace('libre-', ''))
    }
  }

  const today = toLocalISODate(new Date())
  const libresAVenir = creneauxLibres.filter(s => s.date >= today)
  const libresPasses = creneauxLibres.filter(s => s.date < today)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>📆 Créneaux</h3>
        <button onClick={openNewForm}
          style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
          ➕ Nouveau créneau
        </button>
      </div>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: '0 4px 16px rgba(74,168,216,0.15)', border: `2px solid ${COLORS.sky}` }}>
          <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '1rem' }}>➕ Nouveau créneau</h4>

          {!formType && (
            <div>
              <p style={{ color: '#666', fontSize: '0.9rem', marginTop: 0 }}>Comment les cavaliers s'inscrivent-ils à ce créneau ?</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
                <button onClick={() => setFormType('fixe')}
                  style={{ background: COLORS.skyLight, border: `2px solid ${COLORS.sky}`, borderRadius: '12px', padding: '1rem', cursor: 'pointer', textAlign: 'left' }}>
                  <strong style={{ color: COLORS.navy, display: 'block', marginBottom: '0.3rem' }}>🔒 Créneau fixe</strong>
                  <span style={{ color: '#555', fontSize: '0.85rem' }}>Cours récurrent toute l'année — c'est moi (le moniteur) qui inscris les cavaliers.</span>
                </button>
                <button onClick={() => setFormType('libre')}
                  style={{ background: COLORS.terracottaLight || '#f6ece2', border: `2px solid ${COLORS.terracotta || '#b5764c'}`, borderRadius: '12px', padding: '1rem', cursor: 'pointer', textAlign: 'left' }}>
                  <strong style={{ color: COLORS.navy, display: 'block', marginBottom: '0.3rem' }}>🌐 Créneau libre</strong>
                  <span style={{ color: '#555', fontSize: '0.85rem' }}>Séance ponctuelle — les parents s'inscrivent eux-mêmes en ligne.</span>
                </button>
              </div>
            </div>
          )}

          {formType === 'fixe' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
                <select value={formFixe.jour_semaine} onChange={e => setFormFixe({ ...formFixe, jour_semaine: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
                  {JOURS_SEMAINE.map((j, i) => <option key={i} value={i}>{j}</option>)}
                </select>
                <input type="time" value={formFixe.heure_debut} onChange={e => setFormFixe({ ...formFixe, heure_debut: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                <input type="time" value={formFixe.heure_fin} onChange={e => setFormFixe({ ...formFixe, heure_fin: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                <input placeholder="Niveaux (ex: Degré 1 + Degré 2)" value={formFixe.niveaux} onChange={e => setFormFixe({ ...formFixe, niveaux: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                <input type="number" min="1" max="20" placeholder="Capacité max" value={formFixe.capacite_max} onChange={e => setFormFixe({ ...formFixe, capacite_max: e.target.value })}
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveFixe} style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>Créer le créneau fixe</button>
                <button onClick={() => { setShowForm(false); setFormType(null) }} style={{ background: '#ccc', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>Annuler</button>
              </div>
            </div>
          )}

          {formType === 'libre' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '0.8rem' }}>
                <div>
                  <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>Niveaux *</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {COURS_TYPES.map(c => (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: '6px', background: formLibre.title.split(' + ').includes(c) ? COLORS.skyLight : 'transparent' }}>
                        <input type="checkbox" checked={formLibre.title.split(' + ').includes(c)} onChange={() => toggleCoursLibre(c)}
                          style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: COLORS.navy }} />
                        <span style={{ color: COLORS.navy, fontSize: '0.9rem' }}>{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <input type="date" value={formLibre.date} onChange={e => setFormLibre({ ...formLibre, date: e.target.value })}
                    style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem' }} />
                  <input type="time" value={formLibre.time_start} onChange={e => setFormLibre({ ...formLibre, time_start: e.target.value })}
                    style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem' }} />
                  <input type="number" min="1" max="20" placeholder="Nb places" value={formLibre.max_places} onChange={e => setFormLibre({ ...formLibre, max_places: parseInt(e.target.value) })}
                    style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.95rem' }} />
                  <button onClick={saveLibre} style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.7rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>Créer le créneau libre</button>
                  <button onClick={() => { setShowForm(false); setFormType(null) }} style={{ background: '#ccc', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>Annuler</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Liste : créneaux fixes --- */}
      <h4 style={{ color: COLORS.navy, fontSize: '0.95rem', marginTop: '1.5rem' }}>🔒 Créneaux fixes (inscription par le moniteur)</h4>
      {creneauxFixes.length === 0 && <p style={{ color: '#888', fontSize: '0.9rem' }}>Aucun créneau fixe créé.</p>}
      {creneauxFixes.map(cr => {
        const key = `fixe-${cr.id}`
        const isEditing = editingFixeId === cr.id
        return (
          <div key={key} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', border: `2px solid ${openItem === key ? COLORS.sky : 'transparent'}` }}>
            {isEditing ? (
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
                  <select value={editFormFixe.jour_semaine} onChange={e => setEditFormFixe({ ...editFormFixe, jour_semaine: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
                    {JOURS_SEMAINE.map((j, i) => <option key={i} value={i}>{j}</option>)}
                  </select>
                  <input type="time" value={editFormFixe.heure_debut} onChange={e => setEditFormFixe({ ...editFormFixe, heure_debut: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                  <input type="time" value={editFormFixe.heure_fin} onChange={e => setEditFormFixe({ ...editFormFixe, heure_fin: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                  <input value={editFormFixe.niveaux} onChange={e => setEditFormFixe({ ...editFormFixe, niveaux: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                  <input type="number" value={editFormFixe.capacite_max} onChange={e => setEditFormFixe({ ...editFormFixe, capacite_max: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={updateFixe} style={{ background: 'orange', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sauvegarder</button>
                  <button onClick={() => setEditingFixeId(null)} style={{ background: '#ccc', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Annuler</button>
                </div>
              </div>
            ) : (
              <>
                <div onClick={() => toggleOpen(key, true)}
                  style={{ padding: '0.8rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ background: COLORS.skyLight, color: COLORS.navy, padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', marginRight: '0.5rem' }}>
                      {JOURS_SEMAINE[cr.jour_semaine]}
                    </span>
                    <strong style={{ color: COLORS.navy }}>{cr.heure_debut.slice(0, 5)} – {cr.heure_fin.slice(0, 5)}</strong>
                    {cr.niveaux && <span style={{ color: '#888', marginLeft: '0.5rem', fontSize: '0.85rem' }}>{cr.niveaux}</span>}
                  </div>
                  <span style={{ color: COLORS.sky }}>{openItem === key ? '▲' : '▼'}</span>
                </div>

                {openItem === key && (
                  <div style={{ borderTop: `2px solid ${COLORS.skyLight}`, padding: '0.8rem 1rem' }}>
                    <div style={{ marginBottom: '0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button onClick={() => startEditFixe(cr)} style={{ background: 'orange', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>✏️ Modifier</button>
                      <button onClick={() => desactiverFixe(cr.id)} style={{ background: '#999', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>⏸️ Désactiver</button>
                      <button onClick={() => supprimerFixe(cr.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️ Supprimer</button>
                    </div>

                    <h5 style={{ color: COLORS.navy, fontSize: '0.9rem', margin: '0.5rem 0' }}>
                      Cavaliers inscrits ({(abonnements[cr.id] || []).length}/{cr.capacite_max})
                    </h5>

                    {(abonnements[cr.id] || []).length === 0 && <p style={{ color: '#888', fontSize: '0.85rem' }}>Aucun cavalier inscrit.</p>}
                    {(abonnements[cr.id] || []).length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: COLORS.skyLight }}>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Cavalier</th>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Abonnement</th>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Détail</th>
                            <th style={{ padding: '0.4rem', textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(abonnements[cr.id] || []).map(a => (
                            <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '0.4rem' }}>{a.cavaliers?.prenom} {a.cavaliers?.nom}</td>
                              <td style={{ padding: '0.4rem' }}>{TYPES_ABONNEMENT.find(t => t.value === a.type)?.label}</td>
                              <td style={{ padding: '0.4rem' }}>
                                {a.type === 'dix_lecons' && `${a.lecons_restantes}/${a.lecons_totales} restantes`}
                                {a.type === 'vacances_a_vacances' && `Du ${new Date(a.date_debut).toLocaleDateString('fr-FR')}${a.date_fin ? ` au ${new Date(a.date_fin).toLocaleDateString('fr-FR')}` : ''}`}
                                {a.type === 'unite' && `Le ${new Date(a.date_debut).toLocaleDateString('fr-FR')}`}
                              </td>
                              <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                <button onClick={() => desinscrire(a.id, cr.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {showAboForm === cr.id ? (
                      <div style={{ background: COLORS.skyLight, borderRadius: '8px', padding: '0.8rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.6rem' }}>
                          <select value={aboForm.cavalier_id} onChange={e => setAboForm({ ...aboForm, cavalier_id: e.target.value })}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
                            <option value="">Choisir un cavalier...</option>
                            {cavaliers.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                          </select>
                          <select value={aboForm.type} onChange={e => setAboForm({ ...aboForm, type: e.target.value })}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
                            {TYPES_ABONNEMENT.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <input type="date" value={aboForm.date_debut} onChange={e => setAboForm({ ...aboForm, date_debut: e.target.value })}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          {aboForm.type === 'unite' && (
                            <p style={{ gridColumn: '1 / -1', margin: 0, color: '#666', fontSize: '0.78rem', fontStyle: 'italic' }}>
                              La date choisie est celle du cours de remplacement (ex : un cavalier qui prend la place d'un absent, un cours d'essai). Le cavalier n'apparaîtra que pour cette séance-là.
                            </p>
                          )}
                          {aboForm.type === 'vacances_a_vacances' && (
                            <input type="date" value={aboForm.date_fin} onChange={e => setAboForm({ ...aboForm, date_fin: e.target.value })}
                              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          )}
                          {aboForm.type === 'dix_lecons' && (
                            <input type="number" min="1" value={aboForm.lecons_totales} onChange={e => setAboForm({ ...aboForm, lecons_totales: e.target.value })}
                              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => inscrire(cr.id)} style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Inscrire</button>
                          <button onClick={() => { setShowAboForm(null); setAboForm(EMPTY_ABO) }} style={{ background: '#ccc', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowAboForm(cr.id)} style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>➕ Inscrire un cavalier</button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {/* --- Liste : créneaux libres --- */}
      <h4 style={{ color: COLORS.navy, fontSize: '0.95rem', marginTop: '2rem' }}>🌐 Créneaux libres à venir (inscription par les parents)</h4>
      {libresAVenir.length === 0 && <p style={{ color: '#888', fontSize: '0.9rem' }}>Aucun créneau libre à venir.</p>}
      {libresAVenir.map(slot => {
        const key = `libre-${slot.id}`
        const isEditing = editingLibreId === slot.id
        return (
          <div key={key} style={{ background: 'white', borderRadius: '12px', marginBottom: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', border: `2px solid ${openItem === key ? COLORS.terracotta || '#b5764c' : 'transparent'}` }}>
            {isEditing ? (
              <div style={{ padding: '1rem' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', color: COLORS.navy, marginBottom: '0.3rem', fontWeight: 'bold', fontSize: '0.85rem' }}>Niveaux</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {COURS_TYPES.map(c => (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                        <input type="checkbox" checked={editFormLibre.title ? editFormLibre.title.split(' + ').includes(c) : false} onChange={() => toggleCoursLibre(c, 'editFormLibre')} />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <input type="date" value={editFormLibre.date || ''} onChange={e => setEditFormLibre({ ...editFormLibre, date: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                  <input type="time" value={editFormLibre.time_start || ''} onChange={e => setEditFormLibre({ ...editFormLibre, time_start: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                  <input type="number" value={editFormLibre.max_places || 6} onChange={e => setEditFormLibre({ ...editFormLibre, max_places: parseInt(e.target.value) })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={updateLibre} style={{ background: 'orange', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Sauvegarder</button>
                  <button onClick={() => setEditingLibreId(null)} style={{ background: '#ccc', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Annuler</button>
                </div>
              </div>
            ) : (
              <>
                <div onClick={() => toggleOpen(key, false)}
                  style={{ padding: '0.8rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span style={{ background: COLORS.terracottaLight || '#f6ece2', color: COLORS.navy, padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', marginRight: '0.5rem' }}>
                      {new Date(slot.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <strong style={{ color: COLORS.navy, fontSize: '0.9rem' }}>{slot.title}</strong>
                    <span style={{ color: '#888', marginLeft: '0.4rem', fontSize: '0.85rem' }}>à {slot.time_start.slice(0, 5)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ background: slot.places_remaining > 0 ? '#d4edda' : '#f8d7da', color: slot.places_remaining > 0 ? '#155724' : '#721c24', padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {slot.booked_count}/{slot.max_places}
                    </span>
                    <span style={{ color: COLORS.terracotta || '#b5764c' }}>{openItem === key ? '▲' : '▼'}</span>
                  </div>
                </div>

                {openItem === key && (
                  <div style={{ borderTop: `2px solid ${COLORS.skyLight}`, padding: '0.8rem 1rem' }}>
                    {bookings[slot.id] && bookings[slot.id].length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: COLORS.skyLight }}>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Parent</th>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Enfant</th>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Email</th>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Tél.</th>
                            <th style={{ padding: '0.4rem', textAlign: 'left' }}>Cheval</th>
                            <th style={{ padding: '0.4rem', textAlign: 'center' }}>❌</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookings[slot.id].map(b => (
                            <tr key={b.id}>
                              <td style={{ padding: '0.4rem' }}>{b.parent_name || '—'}</td>
                              <td style={{ padding: '0.4rem' }}>{b.child_name} {b.child_nom}</td>
                              <td style={{ padding: '0.4rem' }}>{b.email ? <a href={`mailto:${b.email}`} style={{ color: COLORS.sky }}>{b.email}</a> : '—'}</td>
                              <td style={{ padding: '0.4rem' }}>{b.phone || '—'}</td>
                              <td style={{ padding: '0.4rem' }}>
                                <select value={b.cheval_id || ''} onChange={e => assignerChevalBooking(b.id, e.target.value, slot.id)}
                                  style={{ padding: '0.25rem', borderRadius: '5px', border: '1px solid #ddd', fontSize: '0.8rem' }}>
                                  <option value="">—</option>
                                  {chevaux.map(ch => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                <button onClick={() => deleteBooking(b.id, slot.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {bookings[slot.id] && bookings[slot.id].length === 0 && <p style={{ color: '#888', fontSize: '0.9rem' }}>Aucun inscrit.</p>}

                    {addingEleve === slot.id ? (
                      <div style={{ background: COLORS.skyLight, borderRadius: '8px', padding: '0.8rem', marginBottom: '0.8rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.4rem', marginBottom: '0.5rem' }}>
                          <input placeholder="Prénom élève *" value={newEleve.child_name} onChange={e => setNewEleve({ ...newEleve, child_name: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          <input placeholder="Nom élève *" value={newEleve.child_nom} onChange={e => setNewEleve({ ...newEleve, child_nom: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          <input placeholder="Nom prénom parent (optionnel)" value={newEleve.parent_name} onChange={e => setNewEleve({ ...newEleve, parent_name: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          <input placeholder="Email (optionnel)" value={newEleve.email} onChange={e => setNewEleve({ ...newEleve, email: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                          <input placeholder="Tél. (optionnel)" value={newEleve.phone} onChange={e => setNewEleve({ ...newEleve, phone: e.target.value })} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => addEleve(slot.id)} style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Confirmer</button>
                          <button onClick={() => { setAddingEleve(null); setNewEleve(EMPTY_ELEVE) }} style={{ background: '#ccc', border: 'none', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingEleve(slot.id)} style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', marginBottom: '0.5rem' }}>➕ Ajouter un élève</button>
                    )}

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      <button onClick={() => startEditLibre(slot)} style={{ background: 'orange', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>✏️ Modifier</button>
                      <button onClick={() => deleteLibre(slot.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>🗑️ Supprimer</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {libresPasses.length > 0 && (
        <>
          <h4 style={{ color: '#888', marginTop: '1.5rem', fontSize: '0.9rem' }}>📁 Créneaux libres passés</h4>
          {libresPasses.map(slot => (
            <div key={slot.id} style={{ background: '#f9f9f9', borderRadius: '12px', marginBottom: '0.6rem', border: '1px solid #eee', padding: '0.6rem 1rem', opacity: 0.85, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.9rem' }}>
                <span style={{ color: '#888', marginRight: '0.5rem' }}>{new Date(slot.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <strong style={{ color: '#555' }}>{slot.title}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: '#aaa', fontSize: '0.82rem' }}>{slot.booked_count} inscrits</span>
                <button onClick={() => deleteLibre(slot.id)}
                  style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️ Supprimer</button>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ background: '#f5f5f5', borderRadius: '14px', padding: '1.2rem', marginTop: '2.5rem', border: '1px dashed #ccc' }}>
        <h4 style={{ color: '#666', margin: '0 0 0.3rem 0', fontSize: '0.95rem' }}>⚙️ Réglages avancés</h4>
        <p style={{ color: '#999', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
          À utiliser occasionnellement : générer les dates des cours fixes à venir, et déclarer les périodes de vacances scolaires (les cours fixes ne sont jamais générés pendant ces périodes).
        </p>

        <div style={{ marginBottom: '1.2rem' }}>
          <button onClick={genererSeances} disabled={generating}
            style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: generating ? 'wait' : 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
            {generating ? '⏳ Génération...' : '🔄 Générer les prochaines dates de cours fixes'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h5 style={{ color: '#666', margin: 0, fontSize: '0.88rem' }}>🏖️ Périodes de vacances scolaires</h5>
          <button onClick={() => setShowVacancesForm(!showVacancesForm)}
            style={{ background: '#ddd', color: COLORS.navy, border: 'none', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
            {showVacancesForm ? '✕ Fermer' : '➕ Ajouter une période'}
          </button>
        </div>

        {showVacancesForm && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', margin: '0.6rem 0' }}>
            <input placeholder="Ex: Toussaint 2026" value={newVacances.nom} onChange={e => setNewVacances({ ...newVacances, nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input type="date" value={newVacances.date_debut} onChange={e => setNewVacances({ ...newVacances, date_debut: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input type="date" value={newVacances.date_fin} onChange={e => setNewVacances({ ...newVacances, date_fin: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <button onClick={ajouterVacances}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
              Ajouter
            </button>
          </div>
        )}

        {periodesVacances.length === 0 && <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Aucune période enregistrée.</p>}
        {periodesVacances.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid #e5e5e5', fontSize: '0.85rem' }}>
            <span><strong>{p.nom}</strong> — du {new Date(p.date_debut).toLocaleDateString('fr-FR')} au {new Date(p.date_fin).toLocaleDateString('fr-FR')}</span>
            <button onClick={() => supprimerVacances(p.id)} style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  )
}

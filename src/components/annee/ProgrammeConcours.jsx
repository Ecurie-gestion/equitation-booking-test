import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

// Programme d'un concours : pour chaque cavalier inscrit, une ou plusieurs
// épreuves (avec heure facultative) et le cheval de chaque épreuve.
//
// Les familles ne voient RIEN tant que le programme n'est pas publié, et
// même publié, chacune ne voit que les lignes de son propre cavalier (la
// vérification est faite côté base de données, voir
// supabase/phase8_programme_concours.sql).

const AUTRE = '__autre__'
const FORM_VIDE = { ligneId: null, epreuve: '', heure: '', chevalChoix: '', chevalLibre: '' }

const MESSAGE_BASE_PAS_PRETE = "La base de données n'est pas encore prête pour cette fonction : le script « phase8_programme_concours.sql » doit d'abord être exécuté dans Supabase."

function estErreurBasePasPrete(error) {
  if (!error) return false
  const txt = `${error.code || ''} ${error.message || ''}`.toLowerCase()
  return txt.includes('42p01') || txt.includes('pgrst205') || txt.includes('concours_programme') || txt.includes('programme_publie') || txt.includes('42703')
}

export default function ProgrammeConcours({ event, inscrits, chevaux, onPublicationChange }) {
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [formPour, setFormPour] = useState(null) // id de l'inscription dont le formulaire est ouvert
  const [form, setForm] = useState(FORM_VIDE)
  const [enCours, setEnCours] = useState(false)

  const publie = !!event.programme_publie

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('concours_programme')
      .select('*')
      .eq('event_id', event.id)
      .order('ordre')
      .order('created_at')
    if (error) {
      setMessage({ type: 'error', text: estErreurBasePasPrete(error) ? MESSAGE_BASE_PAS_PRETE : 'Erreur lors du chargement du programme.' })
    } else {
      setLignes(data || [])
    }
    setLoading(false)
  }, [event.id])

  useEffect(() => { charger() }, [charger])

  function nomCheval(ligne) {
    if (ligne.cheval_id) {
      const c = chevaux.find(ch => ch.id === ligne.cheval_id)
      if (c) return c.nom
    }
    return ligne.cheval_libre || null
  }

  function ouvrirFormulaire(inscriptionId, ligne = null) {
    setMessage(null)
    setFormPour(inscriptionId)
    if (!ligne) {
      setForm(FORM_VIDE)
      return
    }
    setForm({
      ligneId: ligne.id,
      epreuve: ligne.epreuve || '',
      heure: ligne.heure ? ligne.heure.slice(0, 5) : '',
      chevalChoix: ligne.cheval_id ? ligne.cheval_id : (ligne.cheval_libre ? AUTRE : ''),
      chevalLibre: ligne.cheval_libre || ''
    })
  }

  async function enregistrer(inscriptionId) {
    if (!form.epreuve.trim()) {
      setMessage({ type: 'error', text: "Indique le nom de l'épreuve." })
      return
    }
    if (form.chevalChoix === AUTRE && !form.chevalLibre.trim()) {
      setMessage({ type: 'error', text: 'Indique le nom du cheval (ou choisis-en un dans la liste).' })
      return
    }
    setEnCours(true)
    const payload = {
      epreuve: form.epreuve.trim(),
      heure: form.heure || null,
      cheval_id: form.chevalChoix && form.chevalChoix !== AUTRE ? form.chevalChoix : null,
      cheval_libre: form.chevalChoix === AUTRE ? form.chevalLibre.trim() : null
    }
    let error
    if (form.ligneId) {
      ;({ error } = await supabase.from('concours_programme').update(payload).eq('id', form.ligneId))
    } else {
      const nbDeja = lignes.filter(l => l.inscription_id === inscriptionId).length
      ;({ error } = await supabase.from('concours_programme').insert({ ...payload, event_id: event.id, inscription_id: inscriptionId, ordre: nbDeja + 1 }))
    }
    setEnCours(false)
    if (error) {
      setMessage({ type: 'error', text: estErreurBasePasPrete(error) ? MESSAGE_BASE_PAS_PRETE : "Erreur lors de l'enregistrement (session expirée ? déconnecte-toi puis reconnecte-toi)." })
      return
    }
    setFormPour(null)
    setForm(FORM_VIDE)
    setMessage(null)
    charger()
  }

  async function supprimerLigne(ligne) {
    if (!confirm('Retirer cette épreuve du programme de ce cavalier ? (Le cavalier reste inscrit au concours.)')) return
    const { error } = await supabase.from('concours_programme').delete().eq('id', ligne.id)
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression.' })
      return
    }
    charger()
  }

  async function changerPublication(valeur) {
    const texte = valeur
      ? 'Publier le programme ? Chaque famille pourra voir son cheval et ses épreuves (et uniquement les siens) dans « Mes inscriptions ».'
      : 'Dépublier le programme ? Les familles ne verront plus rien.'
    if (!confirm(texte)) return
    const { error } = await supabase.from('events').update({ programme_publie: valeur }).eq('id', event.id)
    if (error) {
      setMessage({ type: 'error', text: estErreurBasePasPrete(error) ? MESSAGE_BASE_PAS_PRETE : 'Erreur lors de la mise à jour.' })
      return
    }
    setMessage({ type: 'success', text: valeur ? 'Programme publié.' : 'Programme dépublié : plus rien n\'est visible pour les familles.' })
    onPublicationChange()
  }

  const sansProgramme = inscrits.filter(i => !lignes.some(l => l.inscription_id === i.id)).length
  const inputStyle = { padding: '0.4rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.85rem', boxSizing: 'border-box' }

  return (
    <div style={{ marginTop: '1rem', border: `2px solid ${COLORS.skyLight}`, borderRadius: '10px', padding: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <strong style={{ color: COLORS.navy, fontSize: '0.95rem' }}>🐴 Chevaux & épreuves</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            padding: '0.2rem 0.7rem', borderRadius: '50px', fontSize: '0.78rem', fontWeight: 'bold',
            background: publie ? '#d4edda' : '#fff3cd', color: publie ? '#155724' : '#a86a1a'
          }}>
            {publie ? '✅ Publié : visible par chaque famille (son propre programme)' : '🔒 Non publié : invisible pour les familles'}
          </span>
          <button onClick={() => changerPublication(!publie)}
            style={{ background: publie ? '#999' : COLORS.navy, color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
            {publie ? 'Dépublier' : 'Publier'}
          </button>
        </div>
      </div>

      {message && (
        <p style={{
          padding: '0.5rem 0.7rem', borderRadius: '6px', fontSize: '0.85rem', margin: '0 0 0.6rem 0',
          background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24'
        }}>{message.text}</p>
      )}

      {loading && <p style={{ color: '#888', fontSize: '0.85rem' }}>Chargement...</p>}

      {!loading && inscrits.length === 0 && (
        <p style={{ color: '#888', fontSize: '0.85rem' }}>Aucun inscrit : ajoute d'abord des cavaliers au concours.</p>
      )}

      {!loading && inscrits.length > 0 && sansProgramme > 0 && (
        <p style={{ color: '#a86a1a', fontSize: '0.8rem', margin: '0 0 0.6rem 0' }}>
          {sansProgramme} cavalier(s) sur {inscrits.length} sans épreuve pour l'instant.
        </p>
      )}

      {!loading && inscrits.map(insc => {
        const sesLignes = lignes.filter(l => l.inscription_id === insc.id)
        const formOuvert = formPour === insc.id
        return (
          <div key={insc.id} style={{ borderTop: '1px solid #eee', padding: '0.6rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ color: COLORS.navy, fontSize: '0.9rem' }}>{insc.child_name} {insc.child_nom}</strong>
              {!formOuvert && (
                <button onClick={() => ouvrirFormulaire(insc.id)}
                  style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}>
                  ➕ Épreuve
                </button>
              )}
            </div>

            {sesLignes.length === 0 && !formOuvert && (
              <p style={{ margin: '0.2rem 0 0 0', color: '#aaa', fontSize: '0.8rem', fontStyle: 'italic' }}>Pas encore d'épreuve attribuée.</p>
            )}

            {sesLignes.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.25rem 0', fontSize: '0.85rem' }}>
                <span style={{ flex: '1 1 180px' }}>
                  {l.heure && <strong style={{ color: COLORS.navy }}>{l.heure.slice(0, 5)} </strong>}
                  {l.epreuve}
                </span>
                <span style={{ color: '#555' }}>{nomCheval(l) ? `🐴 ${nomCheval(l)}` : <em style={{ color: '#aaa' }}>cheval à définir</em>}</span>
                <button onClick={() => ouvrirFormulaire(insc.id, l)} title="Modifier"
                  style={{ background: '#eee', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                <button onClick={() => supprimerLigne(l)} title="Retirer cette épreuve"
                  style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
              </div>
            ))}

            {formOuvert && (
              <div style={{ background: COLORS.skyLight, borderRadius: '8px', padding: '0.6rem', marginTop: '0.4rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <input placeholder="Épreuve (ex: Épreuve 80 cm)" value={form.epreuve}
                    onChange={e => setForm({ ...form, epreuve: e.target.value })} style={inputStyle} />
                  <input type="time" value={form.heure} title="Heure (facultatif)"
                    onChange={e => setForm({ ...form, heure: e.target.value })} style={inputStyle} />
                  <select value={form.chevalChoix} onChange={e => setForm({ ...form, chevalChoix: e.target.value })} style={inputStyle}>
                    <option value="">🐴 Cheval : à définir</option>
                    {chevaux.filter(c => c.actif !== false || c.id === form.chevalChoix).map(c => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                    <option value={AUTRE}>✏️ Autre (écrire le nom)…</option>
                  </select>
                  {form.chevalChoix === AUTRE && (
                    <input placeholder="Nom du cheval" value={form.chevalLibre}
                      onChange={e => setForm({ ...form, chevalLibre: e.target.value })} style={inputStyle} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button disabled={enCours} onClick={() => enregistrer(insc.id)}
                    style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>
                    {form.ligneId ? 'Enregistrer' : 'Ajouter'}
                  </button>
                  <button onClick={() => { setFormPour(null); setForm(FORM_VIDE); setMessage(null) }}
                    style={{ background: '#ccc', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

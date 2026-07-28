import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS } from '../../lib/theme'

const EMPTY = { nom: '', description: '' }

export default function ChevauxManager() {
  const [chevaux, setChevaux] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [showInactifs, setShowInactifs] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => { fetchChevaux() }, [showInactifs])

  async function fetchChevaux() {
    let query = supabase.from('chevaux').select('*').order('nom')
    if (!showInactifs) query = query.eq('actif', true)
    const { data } = await query
    setChevaux(data || [])
  }

  function startAdd() {
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(cheval) {
    setForm({ nom: cheval.nom, description: cheval.description || '' })
    setEditingId(cheval.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.nom) {
      setMessage({ type: 'error', text: 'Le nom du cheval est obligatoire.' })
      return
    }
    const { error } = editingId
      ? await supabase.from('chevaux').update(form).eq('id', editingId)
      : await supabase.from('chevaux').insert(form)

    if (!error) {
      setMessage({ type: 'success', text: editingId ? 'Cheval modifié.' : 'Cheval ajouté.' })
      setShowForm(false)
      setForm(EMPTY)
      setEditingId(null)
      fetchChevaux()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement." })
    }
  }

  async function toggleActif(cheval) {
    await supabase.from('chevaux').update({ actif: !cheval.actif }).eq('id', cheval.id)
    fetchChevaux()
  }

  async function supprimerDefinitivement(cheval) {
    if (!confirm(`Supprimer définitivement ${cheval.nom} ? Cette action est irréversible.`)) return
    await supabase.from('chevaux').delete().eq('id', cheval.id)
    fetchChevaux()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>🐴 Chevaux</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input type="checkbox" checked={showInactifs} onChange={e => setShowInactifs(e.target.checked)} />
            Afficher les inactifs
          </label>
          <button onClick={startAdd}
            style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
            ➕ Ajouter un cheval
          </button>
        </div>
      </div>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '1.2rem', marginBottom: '1.5rem', boxShadow: `0 4px 16px rgba(74,168,216,0.15)`, border: `2px solid ${COLORS.sky}` }}>
          <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '0.95rem' }}>{editingId ? '✏️ Modifier le cheval' : '➕ Nouveau cheval'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <input placeholder="Nom *" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Description (optionnel)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={save}
              style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
              Enregistrer
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setEditingId(null) }}
              style={{ background: '#ccc', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {chevaux.length === 0 && <p style={{ color: '#888' }}>Aucun cheval enregistré.</p>}
      {chevaux.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
          {chevaux.map(ch => (
            <div key={ch.id} style={{ background: 'white', borderRadius: '10px', padding: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: ch.actif ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <strong style={{ color: COLORS.navy }}>🐴 {ch.nom}</strong>
                  {ch.description && <p style={{ margin: '0.2rem 0 0 0', color: '#888', fontSize: '0.8rem' }}>{ch.description}</p>}
                </div>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.3rem' }}>
                <button onClick={() => startEdit(ch)}
                  style={{ background: COLORS.orange, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                <button onClick={() => toggleActif(ch)}
                  style={{ background: ch.actif ? '#999' : COLORS.green, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>
                  {ch.actif ? '⏸️' : '▶️'}
                </button>
                <button onClick={() => supprimerDefinitivement(ch)}
                  style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

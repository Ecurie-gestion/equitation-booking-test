import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, NIVEAUX } from '../../lib/theme'

const EMPTY = { prenom: '', nom: '', parent_nom: '', email: '', telephone: '', niveau: '' }

export default function CavaliersManager() {
  const [cavaliers, setCavaliers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [showInactifs, setShowInactifs] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => { fetchCavaliers() }, [showInactifs])

  async function fetchCavaliers() {
    let query = supabase.from('cavaliers').select('*').order('nom')
    if (!showInactifs) query = query.eq('actif', true)
    const { data } = await query
    setCavaliers(data || [])
  }

  function startAdd() {
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(cavalier) {
    setForm({
      prenom: cavalier.prenom,
      nom: cavalier.nom,
      parent_nom: cavalier.parent_nom || '',
      email: cavalier.email || '',
      telephone: cavalier.telephone || '',
      niveau: cavalier.niveau || ''
    })
    setEditingId(cavalier.id)
    setShowForm(true)
  }

  async function save() {
    if (!form.prenom || !form.nom) {
      setMessage({ type: 'error', text: 'Le prénom et le nom sont obligatoires.' })
      return
    }
    const { error } = editingId
      ? await supabase.from('cavaliers').update(form).eq('id', editingId)
      : await supabase.from('cavaliers').insert(form)

    if (!error) {
      setMessage({ type: 'success', text: editingId ? 'Cavalier modifié.' : 'Cavalier ajouté.' })
      setShowForm(false)
      setForm(EMPTY)
      setEditingId(null)
      fetchCavaliers()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement." })
    }
  }

  async function toggleActif(cavalier) {
    await supabase.from('cavaliers').update({ actif: !cavalier.actif }).eq('id', cavalier.id)
    fetchCavaliers()
  }

  async function supprimerDefinitivement(cavalier) {
    if (!confirm(`Supprimer définitivement ${cavalier.prenom} ${cavalier.nom} et toutes ses données (abonnements, présences) ? Cette action est irréversible.`)) return
    await supabase.from('cavaliers').delete().eq('id', cavalier.id)
    fetchCavaliers()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ color: COLORS.navy, margin: 0, fontSize: '1rem' }}>🧑 Cavaliers</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: '#666', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input type="checkbox" checked={showInactifs} onChange={e => setShowInactifs(e.target.checked)} />
            Afficher les inactifs
          </label>
          <button onClick={startAdd}
            style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
            ➕ Ajouter un cavalier
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
          <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '0.95rem' }}>{editingId ? '✏️ Modifier le cavalier' : '➕ Nouveau cavalier'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <input placeholder="Prénom *" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Nom *" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Nom du parent" value={form.parent_nom} onChange={e => setForm({ ...form, parent_nom: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <input placeholder="Téléphone" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }} />
            <select value={form.niveau} onChange={e => setForm({ ...form, niveau: e.target.value })}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}>
              <option value="">Niveau (optionnel)</option>
              {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
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

      {cavaliers.length === 0 && <p style={{ color: '#888' }}>Aucun cavalier enregistré.</p>}
      {cavaliers.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: COLORS.skyLight }}>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Prénom</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Nom</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Parent</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Niveau</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Email</th>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>Téléphone</th>
                <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cavaliers.map(c => (
                <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.5, borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{c.prenom}</td>
                  <td style={{ padding: '0.5rem' }}>{c.nom}</td>
                  <td style={{ padding: '0.5rem' }}>{c.parent_nom || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{c.niveau || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{c.email || '—'}</td>
                  <td style={{ padding: '0.5rem' }}>{c.telephone || '—'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(c)} title="Modifier"
                      style={{ background: COLORS.orange, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', marginRight: '0.3rem' }}>✏️</button>
                    <button onClick={() => toggleActif(c)} title={c.actif ? 'Désactiver' : 'Réactiver'}
                      style={{ background: c.actif ? '#999' : COLORS.green, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', marginRight: '0.3rem' }}>
                      {c.actif ? '⏸️' : '▶️'}
                    </button>
                    <button onClick={() => supprimerDefinitivement(c)} title="Supprimer définitivement"
                      style={{ background: COLORS.red, color: 'white', border: 'none', padding: '0.3rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

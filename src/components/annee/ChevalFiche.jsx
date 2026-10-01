import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, SOIN_TYPES, SEXE_CHEVAL } from '../../lib/theme'
import { toLocalISODate } from '../../lib/dates'

const EMPTY_SOIN = { type: 'vaccin', date: toLocalISODate(new Date()), note: '' }

const inputStyle = { padding: '0.55rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem', boxSizing: 'border-box', width: '100%' }
const labelStyle = { display: 'block', color: COLORS.navy, fontWeight: 'bold', fontSize: '0.82rem', marginBottom: '0.25rem' }

// Fiche complète d'un cheval : photo, infos, historique de soins. On y arrive
// en cliquant sur un cheval dans la liste (ChevauxManager) — toutes les
// actions (modifier, pause, supprimer, soins) sont ici plutôt que sur la
// carte de la liste, qui reste volontairement simple (nom + remarque).
export default function ChevalFiche({ cheval, onBack, onChange }) {
  const [form, setForm] = useState({
    nom: cheval.nom || '',
    description: cheval.description || '',
    note: cheval.note || '',
    annee_naissance: cheval.annee_naissance || '',
    sexe: cheval.sexe || ''
  })
  const [photoUrl, setPhotoUrl] = useState(cheval.photo_url || '')
  const [actif, setActif] = useState(cheval.actif)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const fileInputRef = useRef(null)

  const [soins, setSoins] = useState([])
  const [formSoin, setFormSoin] = useState(EMPTY_SOIN)

  useEffect(() => { fetchSoins() }, [])

  async function fetchSoins() {
    const { data } = await supabase.from('soins_chevaux').select('*').eq('cheval_id', cheval.id).order('date', { ascending: false })
    setSoins(data || [])
  }

  async function ajouterSoin() {
    if (!formSoin.date) {
      setMessage({ type: 'error', text: 'Indique une date.' })
      return
    }
    const { error } = await supabase.from('soins_chevaux').insert({ ...formSoin, cheval_id: cheval.id })
    if (!error) {
      setFormSoin(EMPTY_SOIN)
      fetchSoins()
    } else {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement du soin." })
    }
  }

  async function supprimerSoin(soinId) {
    if (!confirm('Supprimer ce soin ?')) return
    await supabase.from('soins_chevaux').delete().eq('id', soinId)
    fetchSoins()
  }

  async function choisirPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage(null)
    // Un nom de fichier unique à chaque envoi (plutôt que d'écraser le même
    // nom) évite que le navigateur affiche une ancienne version mise en
    // cache de la photo après un changement.
    const ext = file.name.split('.').pop()
    const path = `${cheval.id}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('chevaux-photos').upload(path, file)
    if (uploadError) {
      setMessage({ type: 'error', text: "Erreur lors de l'envoi de la photo." })
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from('chevaux-photos').getPublicUrl(path)
    const { error } = await supabase.from('chevaux').update({ photo_url: data.publicUrl }).eq('id', cheval.id)
    if (error) {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement de la photo." })
    } else {
      setPhotoUrl(data.publicUrl)
      onChange()
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function enregistrer() {
    if (!form.nom.trim()) {
      setMessage({ type: 'error', text: 'Le nom du cheval est obligatoire.' })
      return
    }
    setSaving(true)
    const payload = {
      nom: form.nom.trim(),
      description: form.description || null,
      note: form.note || null,
      annee_naissance: form.annee_naissance ? Number(form.annee_naissance) : null,
      sexe: form.sexe || null
    }
    const { error } = await supabase.from('chevaux').update(payload).eq('id', cheval.id)
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: "Erreur lors de l'enregistrement." })
    } else {
      setMessage({ type: 'success', text: 'Fiche mise à jour.' })
      onChange()
    }
  }

  async function togglePause() {
    const nouveau = !actif
    const { error } = await supabase.from('chevaux').update({ actif: nouveau }).eq('id', cheval.id)
    if (!error) {
      setActif(nouveau)
      onChange()
    }
  }

  async function supprimer() {
    if (!confirm(`Supprimer définitivement ${cheval.nom} ? Cette action est irréversible.`)) return
    await supabase.from('chevaux').delete().eq('id', cheval.id)
    onChange()
    onBack()
  }

  const age = form.annee_naissance ? new Date().getFullYear() - Number(form.annee_naissance) : null

  return (
    <div>
      <button onClick={onBack}
        style={{ background: 'none', border: 'none', color: COLORS.sky, cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem', padding: 0 }}>
        ← Retour à la liste
      </button>

      {message && (
        <div style={{ background: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.9rem' }}>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', marginBottom: '1.2rem', boxShadow: '0 4px 16px rgba(26,39,68,0.06)', opacity: actif ? 1 : 0.6 }}>
        <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
          <div style={{ flexShrink: 0 }}>
            {photoUrl ? (
              <img src={photoUrl} alt={form.nom} style={{ width: '140px', height: '140px', borderRadius: '12px', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '140px', height: '140px', borderRadius: '12px', background: COLORS.skyLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                🐴
              </div>
            )}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ marginTop: '0.5rem', width: '140px', background: COLORS.beige || '#f5f0e8', border: 'none', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: COLORS.navy }}>
              {uploading ? 'Envoi...' : (photoUrl ? '📷 Changer' : '📷 Ajouter une photo')}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={choisirPhoto} style={{ display: 'none' }} />
          </div>

          <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div>
              <label style={labelStyle}>Nom *</label>
              <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div>
                <label style={labelStyle}>Année de naissance</label>
                <input type="number" placeholder="Ex: 2015" value={form.annee_naissance}
                  onChange={e => setForm({ ...form, annee_naissance: e.target.value })} style={inputStyle} />
                {age !== null && <p style={{ margin: '0.25rem 0 0 0', color: '#888', fontSize: '0.78rem' }}>{age} ans</p>}
              </div>
              <div>
                <label style={labelStyle}>Sexe</label>
                <select value={form.sexe} onChange={e => setForm({ ...form, sexe: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {SEXE_CHEVAL.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '0.7rem' }}>
          <label style={labelStyle}>Description (interne)</label>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Remarque visible par les élèves</label>
          <input placeholder="Ex: cloches + guêtres, ne pas monter..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={inputStyle} />
          <p style={{ margin: '0.3rem 0 0 0', color: '#aaa', fontSize: '0.75rem' }}>
            Affichée sous le nom du cheval dans "Aujourd'hui &amp; demain" et dans la liste. Laisse vide pour ne rien afficher.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={enregistrer} disabled={saving}
            style={{ background: COLORS.navy, color: 'white', border: 'none', padding: '0.55rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
            {saving ? 'Enregistrement...' : '💾 Enregistrer'}
          </button>
          <button onClick={togglePause}
            style={{ background: actif ? '#999' : COLORS.green, color: 'white', border: 'none', padding: '0.55rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
            {actif ? '⏸️ Mettre en pause' : '▶️ Réactiver'}
          </button>
          <button onClick={supprimer}
            style={{ background: 'none', border: `1px solid ${COLORS.red}`, color: COLORS.red, padding: '0.55rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
            🗑️ Supprimer définitivement
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', padding: '1.3rem', boxShadow: '0 4px 16px rgba(26,39,68,0.06)' }}>
        <h4 style={{ marginTop: 0, color: COLORS.navy, fontSize: '0.95rem' }}>🩺 Historique de soins</h4>

        {soins.length === 0 && <p style={{ color: '#aaa', fontSize: '0.85rem' }}>Aucun soin enregistré.</p>}
        {soins.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
            {soins.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', background: '#f7f7f7', borderRadius: '8px', padding: '0.5rem 0.8rem' }}>
                <span style={{ fontSize: '0.85rem' }}>
                  <strong style={{ color: COLORS.navy }}>{SOIN_TYPES.find(t => t.value === s.type)?.label || s.type}</strong>
                  {' · '}{new Date(s.date).toLocaleDateString('fr-FR')}
                  {s.note && <span style={{ color: '#888' }}> — {s.note}</span>}
                </span>
                <button onClick={() => supprimerSoin(s.id)}
                  style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '0.9rem' }}>🗑️</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid #eee', paddingTop: '0.9rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <select value={formSoin.type} onChange={e => setFormSoin({ ...formSoin, type: e.target.value })} style={inputStyle}>
              {SOIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="date" value={formSoin.date} onChange={e => setFormSoin({ ...formSoin, date: e.target.value })} style={inputStyle} />
          </div>
          <input placeholder="Note (optionnel)" value={formSoin.note} onChange={e => setFormSoin({ ...formSoin, note: e.target.value })}
            style={{ ...inputStyle, marginBottom: '0.6rem' }} />
          <button onClick={ajouterSoin}
            style={{ background: COLORS.sky, color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
            ➕ Ajouter ce soin
          </button>
        </div>
      </div>
    </div>
  )
}

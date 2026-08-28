import { useState } from 'react'

const inputStyle = { padding: '0.5rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }

// Champ réutilisable pour ajouter un élève à un créneau/stage côté admin.
// Au lieu de retaper le prénom/nom à chaque fois (avec le risque de fautes de
// frappe qui créent un doublon), on choisit l'élève dans la liste des
// cavaliers déjà enregistrés — ou on saisit un nouvel élève si besoin.
export default function EleveSelector({ cavaliers, value, onChange }) {
  const [selectedId, setSelectedId] = useState('')

  function handleSelect(e) {
    const id = e.target.value
    setSelectedId(id)
    if (!id) return
    const c = cavaliers.find(c => c.id === id)
    if (!c) return
    onChange({
      ...value,
      child_name: c.prenom,
      child_nom: c.nom === 'À compléter' ? '' : c.nom,
      parent_name: c.parent_nom || value.parent_name,
      email: c.email || value.email,
      phone: c.telephone || value.phone
    })
  }

  return (
    <>
      <select value={selectedId} onChange={handleSelect}
        style={{ ...inputStyle, gridColumn: '1 / -1' }}>
        <option value="">🆕 Nouvel élève (pas encore dans la liste)</option>
        {cavaliers.map(c => (
          <option key={c.id} value={c.id}>
            {c.prenom} {c.nom !== 'À compléter' ? c.nom : ''}{c.parent_nom ? ` — parent : ${c.parent_nom}` : ''}
          </option>
        ))}
      </select>
      <input placeholder="Prénom élève *" value={value.child_name} onChange={e => onChange({ ...value, child_name: e.target.value })} style={inputStyle} />
      <input placeholder="Nom élève *" value={value.child_nom} onChange={e => onChange({ ...value, child_nom: e.target.value })} style={inputStyle} />
      <input placeholder="Nom prénom parent (optionnel)" value={value.parent_name} onChange={e => onChange({ ...value, parent_name: e.target.value })} style={inputStyle} />
      <input placeholder="Email (optionnel)" value={value.email} onChange={e => onChange({ ...value, email: e.target.value })} style={inputStyle} />
      <input placeholder="Tél. (optionnel)" value={value.phone} onChange={e => onChange({ ...value, phone: e.target.value })} style={inputStyle} />
    </>
  )
}

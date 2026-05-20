import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ManageBranches() {
  const [branches, setBranches] = useState([])
  const [newName, setNewName]   = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('branches')
      .select('id, name, created_at')
      .order('name')
    setBranches(data || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return

    setSaving(true)
    const { error } = await supabase.from('branches').insert({ name })

    if (error) {
      setMessage({
        type: 'error',
        text: error.code === '23505'
          ? `Ya existe una sucursal con el nombre "${name}".`
          : error.message
      })
    } else {
      setMessage({ type: 'success', text: `Sucursal "${name}" creada correctamente.` })
      setNewName('')
      load()
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="page-title">Sucursales</div>
      <div className="page-subtitle">
        Las sucursales se crean automáticamente al subir datos, pero puedes agregar nuevas manualmente.
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {/* Add form */}
      <div className="card mb-5">
        <div className="fw-600 mb-3">Agregar sucursal manualmente</div>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 12 }}>
          <input
            className="form-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Ej: Puerto Montt"
            maxLength={80}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !newName.trim()}>
            {saving ? 'Guardando...' : 'Agregar'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="card">
        <div className="chart-title">Sucursales registradas ({branches.length})</div>
        {loading ? (
          <div className="empty-state">Cargando...</div>
        ) : branches.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏢</div>
            No hay sucursales registradas.<br />
            Se crean automáticamente al subir el primer Excel.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Registrada</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b, i) => (
                  <tr key={b.id}>
                    <td className="text-muted">{i + 1}</td>
                    <td><span style={{ fontSize: 15 }}>🏢</span> <strong>{b.name}</strong></td>
                    <td className="text-muted text-sm">
                      {new Date(b.created_at).toLocaleDateString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

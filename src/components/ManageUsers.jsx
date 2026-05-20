import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ManageUsers() {
  const [users, setUsers]         = useState([])
  const [branches, setBranches]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [message, setMessage]     = useState(null)

  const [form, setForm] = useState({
    email: '', password: '', display_name: '',
    role: 'viewer', branch_id: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: profiles }, { data: brs }] = await Promise.all([
      supabase.from('profiles').select('*, branches(name)').order('role'),
      supabase.from('branches').select('id, name').order('name'),
    ])
    setUsers(profiles || [])
    setBranches(brs || [])
    setLoading(false)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.rpc('create_app_user', {
        p_email:        form.email,
        p_password:     form.password,
        p_display_name: form.display_name,
        p_role:         form.role,
        p_branch_id:    form.role === 'viewer' ? form.branch_id : null,
      })

      if (error) throw new Error(error.message)

      setMessage({ type: 'success', text: `Usuario ${form.email} creado correctamente.` })
      setForm({ email: '', password: '', display_name: '', role: 'viewer', branch_id: '' })
      setShowForm(false)
      loadData()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function updateUserBranch(userId, branchId) {
    await supabase.from('profiles').update({ branch_id: branchId || null }).eq('id', userId)
    loadData()
  }

  async function updateUserRole(userId, role) {
    await supabase.from('profiles')
      .update({ role, branch_id: role === 'admin' ? null : undefined })
      .eq('id', userId)
    loadData()
  }

  return (
    <div>
      <div className="page-title">Usuarios</div>
      <div className="page-subtitle">Gestiona las cuentas de acceso por sucursal.</div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Create user button */}
      <div className="flex-between mb-5">
        <div className="text-muted text-sm">
          💡 Los usuarios viewer solo ven datos de su sucursal asignada.
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nuevo Usuario'}
        </button>
      </div>

      {/* Create user form */}
      {showForm && (
        <div className="card mb-5">
          <div className="fw-600 mb-4">Crear nuevo usuario</div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Nombre / Descripción</label>
                <input
                  name="display_name"
                  value={form.display_name}
                  onChange={handleFormChange}
                  placeholder="Ej: Sucursal Alto Bio Bio"
                  required
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleFormChange}
                  placeholder="sucursal@empresa.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Contraseña inicial</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleFormChange}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select name="role" value={form.role} onChange={handleFormChange}>
                  <option value="viewer">Viewer (solo su sucursal)</option>
                  <option value="admin">Admin (acceso total)</option>
                </select>
              </div>
              {form.role === 'viewer' && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Sucursal asignada</label>
                  <select name="branch_id" value={form.branch_id} onChange={handleFormChange} required>
                    <option value="">— Seleccionar sucursal —</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || (form.role === 'viewer' && !form.branch_id)}
            >
              {saving ? 'Creando...' : 'Crear Usuario'}
            </button>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="card">
        <div className="chart-title">Usuarios registrados ({users.length})</div>
        {loading ? (
          <div className="empty-state">Cargando...</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            No hay usuarios registrados aún.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Sucursal</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="fw-600">{u.display_name || '—'}</div>
                    </td>
                    <td>
                      <span className={`badge badge-${u.role}`}>{u.role}</span>
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <span className="text-muted text-sm">Acceso total</span>
                      ) : (
                        <select
                          className="form-select"
                          style={{ maxWidth: 220 }}
                          value={u.branch_id || ''}
                          onChange={e => updateUserBranch(u.id, e.target.value)}
                        >
                          <option value="">Sin asignar</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {u.role === 'viewer' ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => updateUserRole(u.id, 'admin')}
                        >
                          Hacer admin
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => updateUserRole(u.id, 'viewer')}
                        >
                          Hacer viewer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="alert alert-info" style={{ marginTop: 20 }}>
        <strong>Nota:</strong> El primer usuario administrador debe crearse manualmente en el
        Dashboard de Supabase → Authentication → Users, y luego actualizar su rol en la tabla
        <code> profiles</code> con <code>role = 'admin'</code>.
      </div>
    </div>
  )
}

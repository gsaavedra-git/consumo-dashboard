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
    role: 'viewer', branch_ids: [],
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: profiles }, { data: brs }, { data: ub }] = await Promise.all([
      supabase.from('profiles').select('*').order('role'),
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('user_branches').select('user_id, branch_id, branches(name)'),
    ])
    // Attach branch info to each profile
    const ubMap = {}
    ;(ub || []).forEach(r => {
      if (!ubMap[r.user_id]) ubMap[r.user_id] = []
      ubMap[r.user_id].push(r)
    })
    const enriched = (profiles || []).map(p => ({
      ...p,
      user_branches: ubMap[p.id] || [],
    }))
    setUsers(enriched)
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
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email:        form.email,
          password:     form.password,
          display_name: form.display_name,
          role:         form.role,
          branch_ids:   form.role === 'viewer' ? form.branch_ids : [],
        }
      })

      if (error) {
        let errorMsg = error.message
        if (error.context) {
          try {
            const body = await error.context.json()
            if (body && body.error) {
              errorMsg = body.error
            }
          } catch (_) {}
        }
        throw new Error(errorMsg)
      }

      setMessage({ type: 'success', text: `Usuario ${form.email} creado correctamente.` })
      setForm({ email: '', password: '', display_name: '', role: 'viewer', branch_ids: [] })
      setShowForm(false)
      loadData()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function toggleUserBranch(userId, branchId, isChecked) {
    if (isChecked) {
      await supabase.from('user_branches').insert({ user_id: userId, branch_id: branchId })
    } else {
      await supabase.from('user_branches').delete().eq('user_id', userId).eq('branch_id', branchId)
    }
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
          💡 Los usuarios viewer solo ven datos de sus sucursales asignadas.
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
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
                  <label>Sucursales asignadas</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 4 }}>
                    {branches.map(b => (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={form.branch_ids.includes(b.id)}
                          onChange={e => {
                            setForm(prev => ({
                              ...prev,
                              branch_ids: e.target.checked
                                ? [...prev.branch_ids, b.id]
                                : prev.branch_ids.filter(id => id !== b.id)
                            }))
                          }}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                  {branches.length === 0 && <span className="text-muted text-sm">No hay sucursales registradas.</span>}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || (form.role === 'viewer' && form.branch_ids.length === 0)}
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
          <>
          {/* Desktop table */}
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
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                          {branches.map(b => {
                            const assigned = u.user_branches.some(ub => ub.branch_id === b.id)
                            return (
                              <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                                <input
                                  type="checkbox"
                                  checked={assigned}
                                  onChange={e => toggleUserBranch(u.id, b.id, e.target.checked)}
                                />
                                {b.name}
                              </label>
                            )
                          })}
                          {u.user_branches.length === 0 && <span className="text-muted text-sm">Sin asignar</span>}
                        </div>
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

          {/* Mobile card list */}
          <div className="mobile-card-list">
            {users.map(u => (
              <div className="mobile-card-item" key={u.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="fw-600" style={{ fontSize: 15 }}>{u.display_name || '—'}</div>
                  <span className={`badge badge-${u.role}`}>{u.role}</span>
                </div>

                {u.role === 'admin' ? (
                  <div className="text-muted text-sm" style={{ marginBottom: 10 }}>Acceso total a todas las sucursales</div>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Sucursales</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
                      {branches.map(b => {
                        const assigned = u.user_branches.some(ub => ub.branch_id === b.id)
                        return (
                          <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, minHeight: 32 }}>
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={e => toggleUserBranch(u.id, b.id, e.target.checked)}
                              style={{ width: 18, height: 18 }}
                            />
                            {b.name}
                          </label>
                        )
                      })}
                      {u.user_branches.length === 0 && branches.length === 0 && (
                        <span className="text-muted text-sm">Sin sucursales disponibles</span>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  {u.role === 'viewer' ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateUserRole(u.id, 'admin')}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Hacer admin
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => updateUserRole(u.id, 'viewer')}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Hacer viewer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
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

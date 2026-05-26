import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import BranchLogo from './BranchLogo'
import { IconUpload } from './Icons'

export default function ManageBranches() {
  const [branches, setBranches] = useState([])
  const [newName, setNewName]   = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(null) // branch id being uploaded
  const [message, setMessage]   = useState(null)
  const fileRef = useRef(null)
  const uploadBranchRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('branches')
      .select('id, name, logo_url, created_at')
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

  function triggerUpload(branch) {
    uploadBranchRef.current = branch
    fileRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file || !uploadBranchRef.current) return

    const branch = uploadBranchRef.current
    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      setMessage({ type: 'error', text: 'El logo debe pesar menos de 2 MB.' })
      e.target.value = ''
      return
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Formato no válido. Usa PNG, JPG, WebP o SVG.' })
      e.target.value = ''
      return
    }

    setUploading(branch.id)
    setMessage(null)

    try {
      const ext = file.name.split('.').pop()
      const path = `${branch.id}.${ext}`

      // Upload (upsert)
      const { error: uploadErr } = await supabase.storage
        .from('branch-logos')
        .upload(path, file, { upsert: true })

      if (uploadErr) throw uploadErr

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('branch-logos')
        .getPublicUrl(path)

      // Add cache-buster so browser reloads the image
      const logoUrl = `${publicUrl}?t=${Date.now()}`

      // Update branch record
      const { error: updateErr } = await supabase
        .from('branches')
        .update({ logo_url: logoUrl })
        .eq('id', branch.id)

      if (updateErr) throw updateErr

      setMessage({ type: 'success', text: `Logo de "${branch.name}" actualizado.` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: `Error subiendo logo: ${err.message}` })
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  async function removeLogo(branch) {
    setUploading(branch.id)
    try {
      // Try to remove from storage (best effort, file name might vary)
      const extensions = ['png', 'jpg', 'jpeg', 'webp', 'svg']
      await supabase.storage
        .from('branch-logos')
        .remove(extensions.map(ext => `${branch.id}.${ext}`))

      await supabase
        .from('branches')
        .update({ logo_url: null })
        .eq('id', branch.id)

      setMessage({ type: 'success', text: `Logo de "${branch.name}" eliminado.` })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setUploading(null)
    }
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

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileRef}
        onChange={handleFileChange}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        style={{ display: 'none' }}
      />

      {/* Add form */}
      <div className="card mb-5">
        <div className="fw-600 mb-3">Agregar sucursal manualmente</div>
        <form onSubmit={handleAdd} className="mobile-stack-form" style={{ display: 'flex', gap: 12 }}>
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
          <>
          {/* Desktop table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Logo</th>
                  <th>Nombre</th>
                  <th>Registrada</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(b => (
                  <tr key={b.id}>
                    <td style={{ width: 60 }}>
                      <BranchLogo name={b.name} logoUrl={b.logo_url} size={40} />
                    </td>
                    <td><strong>{b.name}</strong></td>
                    <td className="text-muted text-sm">
                      {new Date(b.created_at).toLocaleDateString('es-CL')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => triggerUpload(b)}
                          disabled={uploading === b.id}
                        >
                          <IconUpload size={14} />
                          {uploading === b.id ? 'Subiendo...' : b.logo_url ? 'Cambiar logo' : 'Subir logo'}
                        </button>
                        {b.logo_url && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => removeLogo(b)}
                            disabled={uploading === b.id}
                            style={{ color: 'var(--danger)' }}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="mobile-card-list">
            {branches.map(b => (
              <div className="mobile-card-item" key={b.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <BranchLogo name={b.name} logoUrl={b.logo_url} size={44} />
                  <div>
                    <div className="fw-600" style={{ fontSize: 15 }}>{b.name}</div>
                    <div className="text-muted text-sm">
                      Registrada {new Date(b.created_at).toLocaleDateString('es-CL')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => triggerUpload(b)}
                    disabled={uploading === b.id}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <IconUpload size={14} />
                    {uploading === b.id ? 'Subiendo...' : b.logo_url ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {b.logo_url && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => removeLogo(b)}
                      disabled={uploading === b.id}
                      style={{ color: 'var(--danger)' }}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  )
}

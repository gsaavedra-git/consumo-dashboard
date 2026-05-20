import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseExcelFile, formatData } from '../lib/excelParser'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

const now = new Date()

export default function UploadExcel() {
  const [dragover, setDragover]       = useState(false)
  const [file, setFile]               = useState(null)
  const [preview, setPreview]         = useState(null)   // rows parsed
  const [selectedYear, setYear]       = useState(now.getFullYear())
  const [selectedMonth, setMonth]     = useState(now.getMonth() + 1)
  const [uploading, setUploading]     = useState(false)
  const [message, setMessage]         = useState(null)
  const fileRef                        = useRef()

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  // ── File handling ────────────────────────────────────────────────
  async function processFile(f) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setMessage({ type: 'error', text: 'Solo se aceptan archivos .xlsx' })
      return
    }
    setMessage(null)
    setFile(f)
    try {
      const rows = await parseExcelFile(f)
      setPreview(rows)
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
      setFile(null)
      setPreview(null)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragover(false)
    processFile(e.dataTransfer.files[0])
  }

  function reset() {
    setFile(null)
    setPreview(null)
    setMessage(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Upload to Supabase ───────────────────────────────────────────
  async function handleUpload() {
    if (!preview || preview.length === 0) return
    setUploading(true)
    setMessage(null)

    try {
      // 1. Crear o reutilizar período
      let periodId
      const { data: existing } = await supabase
        .from('periods')
        .select('id')
        .eq('year', selectedYear)
        .eq('month', selectedMonth)
        .single()

      if (existing) {
        // Reemplazar: borrar líneas anteriores
        await supabase.from('consumption_lines').delete().eq('period_id', existing.id)
        periodId = existing.id
      } else {
        const { data: newPeriod, error: pErr } = await supabase
          .from('periods')
          .insert({ year: selectedYear, month: selectedMonth })
          .select()
          .single()
        if (pErr) throw pErr
        periodId = newPeriod.id
      }

      // 2. Resolver sucursales (get or create)
      const branchNames = [...new Set(preview.map(r => r.branch_name))]
      const branchMap = {}

      for (const name of branchNames) {
        const { data: bExist } = await supabase
          .from('branches').select('id').eq('name', name).single()

        if (bExist) {
          branchMap[name] = bExist.id
        } else {
          const { data: bNew, error: bErr } = await supabase
            .from('branches').insert({ name }).select().single()
          if (bErr) throw bErr
          branchMap[name] = bNew.id
        }
      }

      // 3. Insertar líneas en lotes de 200
      const rows = preview.map(r => ({
        period_id: periodId,
        branch_id: branchMap[r.branch_name],
        linea:     r.linea,
        alias:     r.alias || null,
        plan:      r.plan  || null,
        desc_plan: r.desc_plan || null,
        datos_mb:  r.datos_mb,
        voz_min:   r.voz_min,
        sms_count: r.sms_count,
      }))

      const BATCH = 200
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase
          .from('consumption_lines')
          .insert(rows.slice(i, i + BATCH))
        if (error) throw error
      }

      setMessage({
        type: 'success',
        text: `✅ ${rows.length} líneas cargadas para ${MONTHS[selectedMonth - 1]} ${selectedYear}. ${branchNames.length} sucursal(es) procesadas.`
      })
      reset()
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar: ' + err.message })
    } finally {
      setUploading(false)
    }
  }

  // ── Branch summary from preview ──────────────────────────────────
  const branchSummary = preview
    ? Object.values(preview.reduce((acc, r) => {
        const k = r.branch_name
        if (!acc[k]) acc[k] = { name: k, count: 0, datos_mb: 0 }
        acc[k].count++
        acc[k].datos_mb += r.datos_mb
        return acc
      }, {})).sort((a, b) => b.datos_mb - a.datos_mb)
    : []

  return (
    <div>
      <div className="page-title">Subir Datos</div>
      <div className="page-subtitle">Carga el resumen de consumo mensual exportado desde el portal del operador (.xlsx)</div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {/* Period selection */}
      <div className="card mb-5">
        <div className="fw-600 mb-3">1. Selecciona el período del reporte</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label>Mes</label>
            <select
              className="form-select"
              value={selectedMonth}
              onChange={e => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label>Año</label>
            <select
              className="form-select"
              value={selectedYear}
              onChange={e => setYear(Number(e.target.value))}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      {!preview && (
        <>
          <div className="fw-600 mb-3">2. Selecciona el archivo</div>
          <div
            className={`upload-area ${dragover ? 'dragover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragover(true) }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="upload-icon">📁</div>
            <div className="fw-600" style={{ marginBottom: 6 }}>
              Arrastra el archivo aquí
            </div>
            <div className="text-muted">o haz clic para buscar</div>
            <div className="text-muted text-sm" style={{ marginTop: 8 }}>
              Formato aceptado: .xlsx
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={e => processFile(e.target.files[0])}
          />
        </>
      )}

      {/* Preview */}
      {preview && (
        <div className="card">
          <div className="flex-between mb-4">
            <div>
              <div className="fw-600">📄 {file?.name}</div>
              <div className="text-muted text-sm">{preview.length} líneas detectadas</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={reset}>
              Cambiar archivo
            </button>
          </div>

          {/* Branch chips */}
          <div className="mb-4">
            <div className="fw-600 text-sm mb-3">Sucursales detectadas:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {branchSummary.map(b => (
                <span key={b.name} className="chip">
                  🏢 {b.name}
                  <span className="text-muted" style={{ fontWeight: 400 }}>
                    &nbsp;· {b.count} líneas · {formatData(b.datos_mb)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Preview table (first 25 rows) */}
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 20 }}>
            <table>
              <thead>
                <tr>
                  <th>Línea</th>
                  <th>Alias</th>
                  <th>Sucursal</th>
                  <th>Datos</th>
                  <th>Voz</th>
                  <th>SMS</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.linea}</td>
                    <td>{r.alias || <span className="text-muted">—</span>}</td>
                    <td>{r.branch_name}</td>
                    <td>{formatData(r.datos_mb)}</td>
                    <td>{r.voz_min > 0 ? `${r.voz_min} min` : <span className="text-muted">0</span>}</td>
                    <td>{r.sms_count || <span className="text-muted">0</span>}</td>
                  </tr>
                ))}
                {preview.length > 25 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      … y {preview.length - 25} líneas más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Confirm */}
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            ⚠️ Si ya existe data para <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong>, será reemplazada.
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading
                ? '⏳ Cargando...'
                : `✅ Confirmar — ${MONTHS[selectedMonth - 1]} ${selectedYear}`}
            </button>
            <button className="btn btn-secondary" onClick={reset} disabled={uploading}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

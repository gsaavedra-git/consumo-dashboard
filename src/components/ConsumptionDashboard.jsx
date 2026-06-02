import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { formatData, formatNumber } from '../lib/excelParser'
import { IconWifi, IconPhone, IconMessage, IconActivity, IconArrowLeft, IconCalendar } from './Icons'
import BranchLogo from './BranchLogo'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            {p.dataKey === 'datos_mb' ? formatData(p.value) : p.dataKey === 'voz_min' ? `${formatNumber(p.value)} min` : formatNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}


// Tooltip para series cuyos valores son tráfico de datos (MB) — formatea con formatData
function DataTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].sort((a, b) => b.value - a.value)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      {sorted.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{formatData(p.value)}</span>
        </div>
      ))}
    </div>
  )
}


// ── Variación mes a mes ──────────────────────────────────────────────
// % de cambio respecto al período anterior. null = sin dato anterior;
// Infinity = no existía antes y ahora sí (línea/consumo nuevo).
function pctChange(curr, prev) {
  if (prev == null) return null
  if (prev === 0) return curr > 0 ? Infinity : 0
  return ((curr - prev) / prev) * 100
}

// ¿Salto anómalo de datos? Duplica el consumo y sube ≥1 GB, o aparece de cero
// con ≥1 GB. Filtra el ruido de variaciones pequeñas.
function isDataSpike(curr, prev) {
  if (prev == null) return false
  if (prev === 0) return curr >= 1024
  return curr >= prev * 2 && (curr - prev) >= 1024
}

// Delta bajo el valor de una KPI: "▲ 12% vs Abr 2026"
function KpiDelta({ curr, prev, prevLabel }) {
  const pct = pctChange(curr, prev)
  if (pct == null || !isFinite(pct)) return null
  const up = pct >= 0
  return (
    <div className="kpi-delta" style={{ color: up ? 'var(--warning)' : 'var(--success)' }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
      <span className="text-muted" style={{ fontWeight: 400 }}>&nbsp;vs {prevLabel}</span>
    </div>
  )
}

// Badge de % con flecha para la tabla histórica.
function PctBadge({ pct }) {
  if (pct == null || !isFinite(pct)) return <span className="text-muted">—</span>
  const up = pct >= 0
  return (
    <span style={{ color: up ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

// Delta compacto de datos por línea (en la tabla de detalle). Oculta cambios
// menores a ±10% para no saturar; resalta anomalías en rojo con ⚠.
function DataDelta({ curr, prev }) {
  const pct = pctChange(curr, prev)
  if (pct == null) return null
  const spike = isDataSpike(curr, prev)
  const isNew = !isFinite(pct)
  if (!spike && !isNew && Math.abs(pct) < 10) return null
  const up = pct >= 0
  const color = spike ? 'var(--danger)' : up ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color }}>
      {spike && '⚠ '}{up ? '▲' : '▼'} {isNew ? 'nuevo' : `${Math.abs(pct).toFixed(0)}%`}
    </div>
  )
}


export default function ConsumptionDashboard({ isAdmin, branchIds = [], branchId, branchName }) {
  // Support both legacy single branchId and new branchIds array
  const filterIds = branchIds.length > 0 ? branchIds : (branchId ? [branchId] : [])
  const [view, setView]               = useState('period')   // 'period' | 'historical'
  const [periods, setPeriods]         = useState([])
  const [selectedId, setSelectedId]   = useState(null)
  const [lines, setLines]             = useState([])
  const [historical, setHistorical]   = useState([])
  const [histBranchSeries, setHistBranchSeries] = useState([])  // por período × sucursal
  const [branchNames, setBranchNames] = useState([])
  const [lineHist, setLineHist]       = useState({})        // linea → { linea, alias, total, periods:{key:mb} }
  const [selectedLine, setSelectedLine] = useState(null)    // linea seleccionada en modo 'line'
  const [histMode, setHistMode]       = useState('total')   // 'total' | 'branch' | 'line'
  const [loading, setLoading]         = useState(true)
  const [loadingLines, setLoadingLines] = useState(false)
  const [drillBranch, setDrillBranch]   = useState(null)  // { name } for drill-down
  const [prevLinesMap, setPrevLinesMap] = useState({})    // linea → datos_mb del período anterior

  // ── Load periods ───────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('periods')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      setPeriods(data || [])
      if (data?.length > 0) setSelectedId(data[0].id)
      setLoading(false)
    }
    load()
  }, [])

  // ── Load lines for selected period ────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    setLoadingLines(true)

    async function load() {
      let q = supabase
        .from('consumption_lines')
        .select('*, branches(name, logo_url)')
        .eq('period_id', selectedId)
        .order('datos_mb', { ascending: false })

      if (!isAdmin && filterIds.length > 0) q = q.in('branch_id', filterIds)

      const { data } = await q
      setLines(data || [])
      setLoadingLines(false)
    }
    load()
  }, [selectedId, isAdmin, filterIds.join(',')])

  // ── Load historical data ───────────────────────────────────────────
  useEffect(() => {
    async function load() {
      let q = supabase
        .from('consumption_lines')
        .select('datos_mb, voz_min, sms_count, linea, alias, periods(year, month), branches(name, logo_url)')

      if (!isAdmin && filterIds.length > 0) q = q.in('branch_id', filterIds)

      const { data } = await q
      if (!data) return

      // Agrupar por período (totales), por período × sucursal y por línea (datos)
      const map = {}
      const branchMap = {}
      const namesSet = new Set()
      const lineMap = {}
      data.forEach(l => {
        if (!l.periods) return
        const key = `${l.periods.year}-${String(l.periods.month).padStart(2,'0')}`
        const label = `${MONTHS[l.periods.month - 1]} ${l.periods.year}`
        if (!map[key]) {
          map[key] = { key, label, datos_mb: 0, voz_min: 0, sms_count: 0 }
        }
        map[key].datos_mb  += l.datos_mb  || 0
        map[key].voz_min   += l.voz_min   || 0
        map[key].sms_count += l.sms_count || 0

        const bname = l.branches?.name || 'Sin Sucursal'
        namesSet.add(bname)
        if (!branchMap[key]) branchMap[key] = { key, label }
        branchMap[key][bname] = (branchMap[key][bname] || 0) + (l.datos_mb || 0)

        if (l.linea) {
          if (!lineMap[l.linea]) lineMap[l.linea] = { linea: l.linea, alias: l.alias || '', total: 0, periods: {} }
          lineMap[l.linea].periods[key] = (lineMap[l.linea].periods[key] || 0) + (l.datos_mb || 0)
          lineMap[l.linea].total += l.datos_mb || 0
          if (!lineMap[l.linea].alias && l.alias) lineMap[l.linea].alias = l.alias
        }
      })

      const names = [...namesSet]
      // Rellenar con 0 las sucursales ausentes en cada período (líneas continuas)
      const series = Object.values(branchMap)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(p => {
          names.forEach(n => { if (p[n] == null) p[n] = 0 })
          return p
        })

      setHistorical(Object.values(map).sort((a, b) => a.key.localeCompare(b.key)))
      setHistBranchSeries(series)
      setBranchNames(names)
      setLineHist(lineMap)
    }
    load()
  }, [isAdmin, filterIds.join(',')])

  // ── Período anterior (para variación mes a mes) ───────────────────
  const selectedPeriod = periods.find(p => p.id === selectedId)
  const selKey = selectedPeriod ? `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2,'0')}` : null
  const histIdx = selKey ? historical.findIndex(h => h.key === selKey) : -1
  const prevHist = histIdx > 0 ? historical[histIdx - 1] : null

  // Cargar líneas del período anterior para comparar línea por línea
  useEffect(() => {
    if (!prevHist) { setPrevLinesMap({}); return }
    const prevPeriod = periods.find(
      p => `${p.year}-${String(p.month).padStart(2,'0')}` === prevHist.key
    )
    if (!prevPeriod) { setPrevLinesMap({}); return }

    async function load() {
      let q = supabase
        .from('consumption_lines')
        .select('linea, datos_mb, branch_id')
        .eq('period_id', prevPeriod.id)
      if (!isAdmin && filterIds.length > 0) q = q.in('branch_id', filterIds)
      const { data } = await q
      const m = {}
      ;(data || []).forEach(l => { m[l.linea] = (m[l.linea] || 0) + (l.datos_mb || 0) })
      setPrevLinesMap(m)
    }
    load()
  }, [prevHist?.key, isAdmin, filterIds.join(',')])

  // ── Derived KPIs ───────────────────────────────────────────────────
  const totalDatos  = lines.reduce((s, l) => s + (l.datos_mb  || 0), 0)
  const totalVoz    = lines.reduce((s, l) => s + (l.voz_min   || 0), 0)
  const totalSMS    = lines.reduce((s, l) => s + (l.sms_count || 0), 0)
  const activeLines = lines.filter(l => l.datos_mb > 0 || l.voz_min > 0 || l.sms_count > 0).length

  // Show branch-level view when admin OR viewer with multiple branches
  const multiBranch = isAdmin || filterIds.length > 1

  // Variación de datos de cada período histórico vs el anterior (key → %)
  const histDeltaMap = {}
  historical.forEach((h, i) => {
    histDeltaMap[h.key] = i > 0 ? pctChange(h.datos_mb, historical[i - 1].datos_mb) : null
  })

  // Histórico por línea: opciones (ordenadas por consumo total) y serie del seleccionado
  const lineOptions = Object.values(lineHist).sort((a, b) => b.total - a.total)
  const effectiveLine = (selectedLine && lineHist[selectedLine]) ? selectedLine : (lineOptions[0]?.linea || null)
  const lineLabel = effectiveLine
    ? (lineHist[effectiveLine].alias ? `${lineHist[effectiveLine].alias} · ${effectiveLine}` : effectiveLine)
    : ''
  const lineSeries = effectiveLine
    ? historical.map(h => ({ label: h.label, datos_mb: lineHist[effectiveLine].periods[h.key] || 0 }))
    : []

  // ── Bar chart: by branch (multi) or by line alias (single branch) ──
  const barData = multiBranch
    ? Object.values(
        lines.reduce((acc, l) => {
          const name = l.branches?.name || 'Sin Sucursal'
          if (!acc[name]) acc[name] = { name, datos_mb: 0, voz_min: 0 }
          acc[name].datos_mb += l.datos_mb || 0
          acc[name].voz_min  += l.voz_min  || 0
          return acc
        }, {})
      ).sort((a, b) => b.datos_mb - a.datos_mb)
    : lines
        .filter(l => l.alias)
        .map(l => ({ name: l.alias, datos_mb: l.datos_mb || 0, voz_min: l.voz_min || 0 }))
        .slice(0, 15)

  // ── Drill-down: lines filtered to selected branch ──────────────────
  const drillLines = drillBranch
    ? lines.filter(l => (l.branches?.name || 'Sin Sucursal') === drillBranch.name)
    : []

  const drillBarData = drillBranch
    ? drillLines
        .filter(l => l.alias)
        .map(l => ({ name: l.alias, datos_mb: l.datos_mb || 0, voz_min: l.voz_min || 0 }))
        .sort((a, b) => b.datos_mb - a.datos_mb)
        .slice(0, 15)
    : []

  const drillKpis = drillBranch ? {
    datos: drillLines.reduce((s, l) => s + (l.datos_mb || 0), 0),
    voz:   drillLines.reduce((s, l) => s + (l.voz_min || 0), 0),
    sms:   drillLines.reduce((s, l) => s + (l.sms_count || 0), 0),
    active: drillLines.filter(l => l.datos_mb > 0 || l.voz_min > 0 || l.sms_count > 0).length,
    total:  drillLines.length,
  } : null

  // Build a map of branch name → logo_url from lines data
  const branchLogoMap = {}
  lines.forEach(l => {
    if (l.branches?.name && l.branches?.logo_url) {
      branchLogoMap[l.branches.name] = l.branches.logo_url
    }
  })

  function handleBarClick(data) {
    if (multiBranch && !drillBranch && data?.name) {
      setDrillBranch({ name: data.name, logoUrl: branchLogoMap[data.name] || null })
    }
  }

  if (loading) return (
    <div className="empty-state"><div className="empty-icon">⏳</div>Cargando...</div>
  )

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex-between mb-4">
        <div>
          <div className="page-title">{isAdmin ? 'Dashboard General' : branchName}</div>
          <div className="page-subtitle">Resumen de consumo de líneas móviles corporativas</div>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn ${view === 'period' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('period')}
          >
            Por Período
          </button>
          <button
            className={`btn ${view === 'historical' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('historical')}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          VISTA POR PERÍODO
      ════════════════════════════════════════════════════ */}
      {view === 'period' && (
        <>
          {/* Period selector */}
          <div className="card period-bar mb-5">
            <label>Período:</label>
            {periods.length === 0 ? (
              <span className="text-muted">No hay datos cargados aún.</span>
            ) : (
              <select value={selectedId || ''} onChange={e => setSelectedId(e.target.value)}>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    {MONTHS[p.month - 1]} {p.year}
                  </option>
                ))}
              </select>
            )}
            {selectedPeriod && (
              <span className="text-muted text-sm">
                Cargado el {new Date(selectedPeriod.uploaded_at).toLocaleDateString('es-CL')}
              </span>
            )}
          </div>

          {/* KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card blue">
              <div className="kpi-header">
                <div className="kpi-label">Total Datos</div>
                <div className="kpi-icon blue"><IconWifi size={20} /></div>
              </div>
              <div className="kpi-value">{formatData(totalDatos)}</div>
              <KpiDelta curr={totalDatos} prev={prevHist?.datos_mb} prevLabel={prevHist?.label} />
            </div>
            <div className="kpi-card green">
              <div className="kpi-header">
                <div className="kpi-label">Total Voz</div>
                <div className="kpi-icon green"><IconPhone size={20} /></div>
              </div>
              <div className="kpi-value">{formatNumber(totalVoz)}<span className="kpi-unit">min</span></div>
              <KpiDelta curr={totalVoz} prev={prevHist?.voz_min} prevLabel={prevHist?.label} />
            </div>
            <div className="kpi-card orange">
              <div className="kpi-header">
                <div className="kpi-label">Total SMS</div>
                <div className="kpi-icon orange"><IconMessage size={20} /></div>
              </div>
              <div className="kpi-value">{formatNumber(totalSMS)}</div>
              <KpiDelta curr={totalSMS} prev={prevHist?.sms_count} prevLabel={prevHist?.label} />
            </div>
            <div className="kpi-card purple">
              <div className="kpi-header">
                <div className="kpi-label">Líneas Activas</div>
                <div className="kpi-icon purple"><IconActivity size={20} /></div>
              </div>
              <div className="kpi-value">
                {activeLines}
                <span className="kpi-unit">/ {lines.length}</span>
              </div>
            </div>
          </div>

          {/* ── Drill-down view ─────────────────────────────── */}
          {drillBranch && (
            <>
              <div className="card mb-5" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setDrillBranch(null)}>
                  <IconArrowLeft size={14} /> Volver
                </button>
                <BranchLogo name={drillBranch.name} logoUrl={drillBranch.logoUrl} size={32} />
                <span className="fw-600" style={{ fontSize: 16 }}>{drillBranch.name}</span>
                <span className="text-muted text-sm">({drillKpis.total} líneas)</span>
              </div>

              <div className="kpi-grid">
                <div className="kpi-card blue">
                  <div className="kpi-header">
                    <div className="kpi-label">Datos</div>
                    <div className="kpi-icon blue"><IconWifi size={20} /></div>
                  </div>
                  <div className="kpi-value">{formatData(drillKpis.datos)}</div>
                </div>
                <div className="kpi-card green">
                  <div className="kpi-header">
                    <div className="kpi-label">Voz</div>
                    <div className="kpi-icon green"><IconPhone size={20} /></div>
                  </div>
                  <div className="kpi-value">{formatNumber(drillKpis.voz)}<span className="kpi-unit">min</span></div>
                </div>
                <div className="kpi-card orange">
                  <div className="kpi-header">
                    <div className="kpi-label">SMS</div>
                    <div className="kpi-icon orange"><IconMessage size={20} /></div>
                  </div>
                  <div className="kpi-value">{formatNumber(drillKpis.sms)}</div>
                </div>
                <div className="kpi-card purple">
                  <div className="kpi-header">
                    <div className="kpi-label">Líneas Activas</div>
                    <div className="kpi-icon purple"><IconActivity size={20} /></div>
                  </div>
                  <div className="kpi-value">{drillKpis.active}<span className="kpi-unit">/ {drillKpis.total}</span></div>
                </div>
              </div>

              {drillBarData.length > 0 && (
                <div className="chart-card">
                  <div className="chart-title">Consumo por Línea — {drillBranch.name}</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={drillBarData} margin={{ top: 10, right: 20, bottom: 56, left: 10 }} barCategoryGap="20%">
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.4 }} />
                      <Legend wrapperStyle={{ paddingTop: 16 }} iconType="circle" iconSize={10} />
                      <Bar dataKey="datos_mb" name="Datos" fill="#3b82f6" radius={[6,6,0,0]} animationDuration={800} />
                      <Bar dataKey="voz_min" name="Voz (min)" fill="#22c55e" radius={[6,6,0,0]} animationDuration={800} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="card">
                <div className="chart-title">Detalle de Líneas — {drillBranch.name}</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Línea</th>
                        <th>Alias</th>
                        <th>Plan</th>
                        <th>Datos</th>
                        <th>Voz</th>
                        <th>SMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillLines.map(l => (
                        <tr key={l.id}>
                          <td className="mono">{l.linea}</td>
                          <td>{l.alias || <span className="text-muted">—</span>}</td>
                          <td className="text-muted text-sm">{l.desc_plan}</td>
                          <td style={{ fontWeight: l.datos_mb > 0 ? 600 : 400, color: l.datos_mb > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                            {formatData(l.datos_mb)}
                            <DataDelta curr={l.datos_mb} prev={prevLinesMap[l.linea]} />
                          </td>
                          <td style={{ color: l.voz_min > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                            {l.voz_min > 0 ? `${formatNumber(l.voz_min)} min` : '0'}
                          </td>
                          <td style={{ color: l.sms_count > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                            {formatNumber(l.sms_count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile card list */}
                <div className="mobile-card-list">
                  {drillLines.map(l => (
                    <div className="mobile-card-item" key={l.id}>
                      <div style={{ marginBottom: 8 }}>
                        <div className="fw-600" style={{ fontSize: 14 }}>{l.alias || l.linea}</div>
                        {l.alias && <div className="mono" style={{ marginTop: 2 }}>{l.linea}</div>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Datos</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: l.datos_mb > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{formatData(l.datos_mb)}<DataDelta curr={l.datos_mb} prev={prevLinesMap[l.linea]} /></div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Voz</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: l.voz_min > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{l.voz_min > 0 ? `${formatNumber(l.voz_min)}m` : '0'}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>SMS</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: l.sms_count > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{formatNumber(l.sms_count)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Main view (no drill-down) ─────────────────── */}
          {!drillBranch && (
            <>
              {/* Bar chart */}
              {barData.length > 0 && (
                <div className="chart-card">
                  <div className="flex-between">
                    <div className="chart-title">
                      {multiBranch ? 'Consumo por Sucursal' : 'Consumo por Línea'}
                    </div>
                    {multiBranch && <span className="text-muted text-sm">Haz clic en una barra para ver el detalle</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 56, left: 10 }} barCategoryGap="20%" style={multiBranch ? { cursor: 'pointer' } : undefined}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        angle={-35}
                        textAnchor="end"
                        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.4 }} />
                      <Legend wrapperStyle={{ paddingTop: 16 }} iconType="circle" iconSize={10} />
                      <Bar dataKey="datos_mb" name="Datos" fill="#3b82f6" radius={[6,6,0,0]} onClick={handleBarClick} animationDuration={800} />
                      <Bar dataKey="voz_min" name="Voz (min)" fill="#22c55e" radius={[6,6,0,0]} onClick={handleBarClick} animationDuration={800} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Detail table */}
              <div className="card">
                <div className="chart-title">Detalle de Líneas</div>

                {loadingLines ? (
                  <div className="empty-state" style={{ padding: 24 }}>Cargando líneas...</div>
                ) : lines.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    No hay datos para este período.
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Línea</th>
                            <th>Alias</th>
                            {multiBranch && <th>Sucursal</th>}
                            <th>Plan</th>
                            <th>Datos</th>
                            <th>Voz</th>
                            <th>SMS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map(l => (
                            <tr key={l.id}>
                              <td className="mono">{l.linea}</td>
                              <td>{l.alias || <span className="text-muted">—</span>}</td>
                              {multiBranch && (
                                <td>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <BranchLogo name={l.branches?.name || '—'} logoUrl={l.branches?.logo_url} size={24} style={{ borderRadius: 5 }} />
                                    {l.branches?.name || '—'}
                                  </span>
                                </td>
                              )}
                              <td className="text-muted text-sm">{l.desc_plan}</td>
                              <td style={{ fontWeight: l.datos_mb > 0 ? 600 : 400, color: l.datos_mb > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                                {formatData(l.datos_mb)}
                                <DataDelta curr={l.datos_mb} prev={prevLinesMap[l.linea]} />
                              </td>
                              <td style={{ color: l.voz_min > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                                {l.voz_min > 0 ? `${formatNumber(l.voz_min)} min` : '0'}
                              </td>
                              <td style={{ color: l.sms_count > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                                {formatNumber(l.sms_count)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile card list */}
                    <div className="mobile-card-list">
                      {lines.map(l => (
                        <div className="mobile-card-item" key={l.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div>
                              <div className="fw-600" style={{ fontSize: 14 }}>{l.alias || l.linea}</div>
                              {l.alias && <div className="mono" style={{ marginTop: 2 }}>{l.linea}</div>}
                            </div>
                            {multiBranch && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                                <BranchLogo name={l.branches?.name || '—'} logoUrl={l.branches?.logo_url} size={20} style={{ borderRadius: 4 }} />
                                {l.branches?.name}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Datos</div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: l.datos_mb > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>{formatData(l.datos_mb)}<DataDelta curr={l.datos_mb} prev={prevLinesMap[l.linea]} /></div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Voz</div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: l.voz_min > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{l.voz_min > 0 ? `${formatNumber(l.voz_min)}m` : '0'}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>SMS</div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: l.sms_count > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{formatNumber(l.sms_count)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
          VISTA HISTÓRICA
      ════════════════════════════════════════════════════ */}
      {view === 'historical' && (
        <>
          {/* Historical KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card blue">
              <div className="kpi-header">
                <div className="kpi-label">Períodos Registrados</div>
                <div className="kpi-icon blue"><IconCalendar size={20} /></div>
              </div>
              <div className="kpi-value">{historical.length}</div>
            </div>
            <div className="kpi-card green">
              <div className="kpi-header">
                <div className="kpi-label">Datos Acumulados</div>
                <div className="kpi-icon green"><IconWifi size={20} /></div>
              </div>
              <div className="kpi-value">{formatData(historical.reduce((s, d) => s + d.datos_mb, 0))}</div>
            </div>
            <div className="kpi-card orange">
              <div className="kpi-header">
                <div className="kpi-label">Voz Acumulada</div>
                <div className="kpi-icon orange"><IconPhone size={20} /></div>
              </div>
              <div className="kpi-value">
                {formatNumber(historical.reduce((s, d) => s + d.voz_min, 0))}
                <span className="kpi-unit">min</span>
              </div>
            </div>
          </div>

          {historical.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-icon">📈</div>
              Aún no hay suficientes períodos para ver la evolución histórica.
            </div>
          ) : (
            <>
              {/* Area/Line chart — Datos */}
              <div className="chart-card">
                <div className="flex-between">
                  <div className="chart-title">Evolución de Consumo de Datos</div>
                  <div className="flex gap-2">
                    <button
                      className={`btn btn-sm ${histMode === 'total' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setHistMode('total')}
                    >
                      Total
                    </button>
                    {multiBranch && branchNames.length > 1 && (
                      <button
                        className={`btn btn-sm ${histMode === 'branch' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setHistMode('branch')}
                      >
                        Por Sucursal
                      </button>
                    )}
                    {lineOptions.length > 0 && (
                      <button
                        className={`btn btn-sm ${histMode === 'line' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setHistMode('line')}
                      >
                        Por Línea
                      </button>
                    )}
                  </div>
                </div>

                {histMode === 'line' && lineOptions.length > 0 && (
                  <div className="period-bar" style={{ marginTop: 12 }}>
                    <label>Línea:</label>
                    <select value={effectiveLine || ''} onChange={e => setSelectedLine(e.target.value)}>
                      {lineOptions.map(o => (
                        <option key={o.linea} value={o.linea}>
                          {o.alias ? `${o.alias} · ${o.linea}` : o.linea} — {formatData(o.total)} acum.
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={260}>
                  {histMode === 'branch' && multiBranch ? (
                    <LineChart data={histBranchSeries} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} axisLine={false} tickLine={false} />
                      <Tooltip content={<DataTooltip />} />
                      <Legend wrapperStyle={{ paddingTop: 16 }} iconType="circle" iconSize={10} />
                      {branchNames.map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          name={name}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          animationDuration={800}
                        />
                      ))}
                    </LineChart>
                  ) : histMode === 'line' && effectiveLine ? (
                    <AreaChart data={lineSeries} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="datos_mb"
                        name={lineLabel}
                        stroke="#7c3aed"
                        strokeWidth={2.5}
                        fill="#7c3aed"
                        fillOpacity={0.15}
                        dot={{ r: 4, fill: '#fff', stroke: '#7c3aed', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
                        animationDuration={1000}
                      />
                    </AreaChart>
                  ) : (
                    <AreaChart data={historical} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="datos_mb"
                        name="Datos"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        fill="#3b82f6"
                        fillOpacity={0.15}
                        dot={{ r: 4, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                        animationDuration={1000}
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Area chart — Voz */}
              <div className="chart-card">
                <div className="chart-title">Evolución de Consumo de Voz (min)</div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={historical} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="voz_min"
                      name="Voz"
                      stroke="#22c55e"
                      strokeWidth={2.5}
                      fill="#22c55e"
                      fillOpacity={0.15}
                      dot={{ r: 4, fill: '#fff', stroke: '#22c55e', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                      animationDuration={1000}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Historical summary table */}
              <div className="card">
                <div className="chart-title">Resumen por Período</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Total Datos</th>
                        <th>Variación</th>
                        <th>Total Voz</th>
                        <th>Total SMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...historical].reverse().map(d => (
                        <tr key={d.key}>
                          <td className="fw-600">{d.label}</td>
                          <td>{formatData(d.datos_mb)}</td>
                          <td><PctBadge pct={histDeltaMap[d.key]} /></td>
                          <td>{formatNumber(d.voz_min)} min</td>
                          <td>{formatNumber(d.sms_count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile card list */}
                <div className="mobile-card-list">
                  {[...historical].reverse().map(d => (
                    <div className="mobile-card-item" key={d.key}>
                      <div className="fw-600" style={{ fontSize: 14, marginBottom: 8 }}>{d.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Datos</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--primary)' }}>{formatData(d.datos_mb)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Voz</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--success)' }}>{formatNumber(d.voz_min)}m</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>SMS</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--warning)' }}>{formatNumber(d.sms_count)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

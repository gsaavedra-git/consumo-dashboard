import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { formatData, formatNumber } from '../lib/excelParser'
import BranchLogo from './BranchLogo'
import { IconWifi, IconPhone, IconMessage, IconActivity, IconArrowLeft } from './Icons'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function pctChange(curr, prev) {
  if (prev == null) return null
  if (prev === 0) return curr > 0 ? Infinity : 0
  return ((curr - prev) / prev) * 100
}

function isDataSpike(curr, prev) {
  if (prev == null) return false
  if (prev === 0) return curr >= 1024
  return curr >= prev * 2 && (curr - prev) >= 1024
}

function Delta({ curr, prev }) {
  const pct = pctChange(curr, prev)
  if (pct == null) return null
  const spike = isDataSpike(curr, prev)
  const isNew = !isFinite(pct)
  if (!spike && !isNew && Math.abs(pct) < 10) return null
  const up = pct >= 0
  const color = spike ? 'var(--danger)' : up ? 'var(--warning)' : 'var(--success)'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, color }}>
      {spike && '⚠ '}{up ? '▲' : '▼'} {isNew ? 'nuevo' : `${Math.abs(pct).toFixed(0)}%`}
    </span>
  )
}

// Mini-tendencia del consumo de datos de una línea a lo largo de los períodos
function Sparkline({ data }) {
  const hasTrend = data.filter(d => d.v > 0).length >= 2
  if (!hasTrend) return <span className="text-muted">—</span>
  return (
    <LineChart width={96} height={28} data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
      <Line type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  )
}

function DataTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i}>{p.name}: <strong>{p.dataKey === 'voz_min' ? `${formatNumber(p.value)} min` : formatData(p.value)}</strong></div>
      ))}
    </div>
  )
}

export default function BranchReport({ branchId, name, logoUrl, periodId, onClose }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState(null)
  const [state, setState]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setErr(null)
      const { data, error } = await supabase
        .from('consumption_lines')
        .select('linea, alias, plan, desc_plan, datos_mb, voz_min, sms_count, period_id, periods(year, month)')
        .eq('branch_id', branchId)

      if (cancelled) return
      if (error) { setErr(error.message); setLoading(false); return }

      // Períodos presentes
      const periodMap = {}
      data.forEach(r => {
        if (!r.periods) return
        const key = `${r.periods.year}-${String(r.periods.month).padStart(2,'0')}`
        if (!periodMap[r.period_id]) {
          periodMap[r.period_id] = { id: r.period_id, year: r.periods.year, month: r.periods.month, key,
            label: `${MONTHS[r.periods.month - 1].slice(0,3)} ${r.periods.year}` }
        }
      })
      const periodsList = Object.values(periodMap).sort((a, b) => a.key.localeCompare(b.key))
      const idx = periodsList.findIndex(p => p.id === periodId)
      const currentP = periodsList[idx] || null
      const prevP = idx > 0 ? periodsList[idx - 1] : null

      // Líneas del mes actual y mapa del mes anterior
      const currentLines = data
        .filter(r => r.period_id === periodId)
        .sort((a, b) => (b.datos_mb || 0) - (a.datos_mb || 0))
      const prevMap = {}
      data.filter(r => prevP && r.period_id === prevP.id)
        .forEach(r => { prevMap[r.linea] = (prevMap[r.linea] || 0) + (r.datos_mb || 0) })

      // Histórico por línea (sparklines) y totales de la sucursal por período
      const lineHist = {}
      const totalsByKey = {}
      data.forEach(r => {
        if (!r.periods) return
        const key = `${r.periods.year}-${String(r.periods.month).padStart(2,'0')}`
        if (!lineHist[r.linea]) lineHist[r.linea] = {}
        lineHist[r.linea][key] = (lineHist[r.linea][key] || 0) + (r.datos_mb || 0)
        if (!totalsByKey[key]) totalsByKey[key] = { key, label: periodMap[r.period_id].label, datos_mb: 0, voz_min: 0, sms_count: 0 }
        totalsByKey[key].datos_mb  += r.datos_mb  || 0
        totalsByKey[key].voz_min   += r.voz_min   || 0
        totalsByKey[key].sms_count += r.sms_count || 0
      })
      const branchHist = Object.values(totalsByKey).sort((a, b) => a.key.localeCompare(b.key))

      setState({ periodsList, currentP, prevP, currentLines, prevMap, lineHist, branchHist })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [branchId, periodId])

  const totals = state ? {
    datos: state.currentLines.reduce((s, l) => s + (l.datos_mb || 0), 0),
    voz:   state.currentLines.reduce((s, l) => s + (l.voz_min || 0), 0),
    sms:   state.currentLines.reduce((s, l) => s + (l.sms_count || 0), 0),
    active: state.currentLines.filter(l => l.datos_mb > 0 || l.voz_min > 0 || l.sms_count > 0).length,
  } : null

  const prevTotals = state && state.prevP
    ? state.branchHist.find(h => h.key === state.prevP.key)
    : null

  const barData = state ? state.currentLines
    .filter(l => l.alias || l.linea)
    .slice(0, 15)
    .map(l => ({ name: l.alias || l.linea, datos_mb: l.datos_mb || 0, voz_min: l.voz_min || 0 })) : []

  const periodLabel = state?.currentP
    ? `${MONTHS[state.currentP.month - 1]} ${state.currentP.year}`
    : ''

  return createPortal(
    <div className="report-overlay">
      <div className="report-toolbar no-print">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          <IconArrowLeft size={14} /> Volver
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          🖨 Imprimir / Guardar PDF
        </button>
      </div>

      <div className="report-page">
        <header className="report-header">
          <BranchLogo name={name} logoUrl={logoUrl} size={52} />
          <div style={{ flex: 1 }}>
            <h1 className="report-title">{name}</h1>
            <div className="report-subtitle">Informe de consumo · {periodLabel}</div>
          </div>
          <div className="report-meta">
            Generado el {new Date().toLocaleDateString('es-CL')}
          </div>
        </header>

        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div>Generando informe...</div>
        ) : err ? (
          <div className="alert alert-error">No se pudo cargar el informe: {err}</div>
        ) : !state?.currentP ? (
          <div className="empty-state"><div className="empty-icon">📭</div>No hay datos para este período.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="kpi-grid report-kpis">
              <div className="kpi-card blue">
                <div className="kpi-header"><div className="kpi-label">Total Datos</div><div className="kpi-icon blue"><IconWifi size={18} /></div></div>
                <div className="kpi-value">{formatData(totals.datos)}</div>
                <ReportKpiDelta curr={totals.datos} prev={prevTotals?.datos_mb} prevLabel={state.prevP?.label} />
              </div>
              <div className="kpi-card green">
                <div className="kpi-header"><div className="kpi-label">Total Voz</div><div className="kpi-icon green"><IconPhone size={18} /></div></div>
                <div className="kpi-value">{formatNumber(totals.voz)}<span className="kpi-unit">min</span></div>
                <ReportKpiDelta curr={totals.voz} prev={prevTotals?.voz_min} prevLabel={state.prevP?.label} />
              </div>
              <div className="kpi-card orange">
                <div className="kpi-header"><div className="kpi-label">Total SMS</div><div className="kpi-icon orange"><IconMessage size={18} /></div></div>
                <div className="kpi-value">{formatNumber(totals.sms)}</div>
                <ReportKpiDelta curr={totals.sms} prev={prevTotals?.sms_count} prevLabel={state.prevP?.label} />
              </div>
              <div className="kpi-card purple">
                <div className="kpi-header"><div className="kpi-label">Líneas Activas</div><div className="kpi-icon purple"><IconActivity size={18} /></div></div>
                <div className="kpi-value">{totals.active}<span className="kpi-unit">/ {state.currentLines.length}</span></div>
              </div>
            </div>

            {/* Rendimiento por línea (mes) */}
            {barData.length > 0 && (
              <div className="chart-card report-block">
                <div className="chart-title">Rendimiento por Línea — {periodLabel}</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 60, left: 10 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} />
                    <Tooltip content={<DataTooltip />} />
                    <Bar dataKey="datos_mb" name="Datos" fill="#2563eb" radius={[5,5,0,0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Evolución histórica de la sucursal */}
            {state.branchHist.length >= 2 && (
              <div className="chart-card report-block">
                <div className="chart-title">Evolución de Consumo de Datos</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={state.branchHist} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => (v ? formatData(v) : '0')} />
                    <Tooltip content={<DataTooltip />} />
                    <Area type="monotone" dataKey="datos_mb" name="Datos" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.12} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Detalle por línea con tendencia */}
            <div className="card report-block">
              <div className="chart-title">Detalle de Líneas</div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Línea</th>
                    <th>Alias</th>
                    <th>Plan</th>
                    <th>Datos</th>
                    <th>Voz</th>
                    <th>SMS</th>
                    <th>Tendencia datos</th>
                  </tr>
                </thead>
                <tbody>
                  {state.currentLines.map((l, i) => {
                    const spark = state.periodsList.map(p => ({ v: state.lineHist[l.linea]?.[p.key] || 0 }))
                    return (
                      <tr key={i}>
                        <td className="mono">{l.linea}</td>
                        <td>{l.alias || <span className="text-muted">—</span>}</td>
                        <td className="text-muted text-sm">{l.desc_plan}</td>
                        <td style={{ fontWeight: l.datos_mb > 0 ? 600 : 400 }}>
                          {formatData(l.datos_mb)}
                          <Delta curr={l.datos_mb} prev={state.prevMap[l.linea]} />
                        </td>
                        <td>{l.voz_min > 0 ? `${formatNumber(l.voz_min)} min` : '0'}</td>
                        <td>{formatNumber(l.sms_count)}</td>
                        <td><Sparkline data={spark} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <footer className="report-footer">
              Informe generado automáticamente · Consumo Móvil Dashboard · {new Date().toLocaleString('es-CL')}
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function ReportKpiDelta({ curr, prev, prevLabel }) {
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

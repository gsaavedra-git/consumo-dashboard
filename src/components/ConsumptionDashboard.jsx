import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { formatData } from '../lib/excelParser'
import { IconWifi, IconPhone, IconMessage, IconActivity, IconArrowLeft, IconCalendar } from './Icons'
import BranchLogo from './BranchLogo'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#65a30d']

export default function ConsumptionDashboard({ isAdmin, branchIds = [], branchId, branchName }) {
  // Support both legacy single branchId and new branchIds array
  const filterIds = branchIds.length > 0 ? branchIds : (branchId ? [branchId] : [])
  const [view, setView]               = useState('period')   // 'period' | 'historical'
  const [periods, setPeriods]         = useState([])
  const [selectedId, setSelectedId]   = useState(null)
  const [lines, setLines]             = useState([])
  const [historical, setHistorical]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingLines, setLoadingLines] = useState(false)
  const [drillBranch, setDrillBranch]   = useState(null)  // { name } for drill-down

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
        .select('datos_mb, voz_min, sms_count, periods(year, month), branches(name, logo_url)')

      if (!isAdmin && filterIds.length > 0) q = q.in('branch_id', filterIds)

      const { data } = await q
      if (!data) return

      // Agrupar por período
      const map = {}
      data.forEach(l => {
        if (!l.periods) return
        const key = `${l.periods.year}-${String(l.periods.month).padStart(2,'0')}`
        if (!map[key]) {
          map[key] = {
            key,
            label: `${MONTHS[l.periods.month - 1]} ${l.periods.year}`,
            datos_mb: 0, voz_min: 0, sms_count: 0
          }
        }
        map[key].datos_mb  += l.datos_mb  || 0
        map[key].voz_min   += l.voz_min   || 0
        map[key].sms_count += l.sms_count || 0
      })

      setHistorical(Object.values(map).sort((a, b) => a.key.localeCompare(b.key)))
    }
    load()
  }, [isAdmin, filterIds.join(',')])

  // ── Derived KPIs ───────────────────────────────────────────────────
  const totalDatos  = lines.reduce((s, l) => s + (l.datos_mb  || 0), 0)
  const totalVoz    = lines.reduce((s, l) => s + (l.voz_min   || 0), 0)
  const totalSMS    = lines.reduce((s, l) => s + (l.sms_count || 0), 0)
  const activeLines = lines.filter(l => l.datos_mb > 0 || l.voz_min > 0).length

  // Show branch-level view when admin OR viewer with multiple branches
  const multiBranch = isAdmin || filterIds.length > 1

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
    active: drillLines.filter(l => l.datos_mb > 0 || l.voz_min > 0).length,
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

  const selectedPeriod = periods.find(p => p.id === selectedId)

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
            </div>
            <div className="kpi-card green">
              <div className="kpi-header">
                <div className="kpi-label">Total Voz</div>
                <div className="kpi-icon green"><IconPhone size={20} /></div>
              </div>
              <div className="kpi-value">{totalVoz}<span className="kpi-unit">min</span></div>
            </div>
            <div className="kpi-card orange">
              <div className="kpi-header">
                <div className="kpi-label">Total SMS</div>
                <div className="kpi-icon orange"><IconMessage size={20} /></div>
              </div>
              <div className="kpi-value">{totalSMS}</div>
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
                  <div className="kpi-value">{drillKpis.voz}<span className="kpi-unit">min</span></div>
                </div>
                <div className="kpi-card orange">
                  <div className="kpi-header">
                    <div className="kpi-label">SMS</div>
                    <div className="kpi-icon orange"><IconMessage size={20} /></div>
                  </div>
                  <div className="kpi-value">{drillKpis.sms}</div>
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
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={drillBarData} margin={{ top: 5, right: 20, bottom: 56, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                      <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 12 }} interval={0} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v} MB`} />
                      <Tooltip formatter={(val, name) => name === 'datos_mb' ? [formatData(val), 'Datos'] : [`${val} min`, 'Voz']} />
                      <Legend wrapperStyle={{ paddingTop: 16 }} />
                      <Bar dataKey="datos_mb" name="Datos" fill="#2563eb" radius={[4,4,0,0]} />
                      <Bar dataKey="voz_min" name="Voz (min)" fill="#16a34a" radius={[4,4,0,0]} />
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
                          </td>
                          <td style={{ color: l.voz_min > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                            {l.voz_min > 0 ? `${l.voz_min} min` : '0'}
                          </td>
                          <td style={{ color: l.sms_count > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                            {l.sms_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 56, left: 10 }} style={multiBranch ? { cursor: 'pointer' } : undefined}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                      <XAxis
                        dataKey="name"
                        angle={-35}
                        textAnchor="end"
                        tick={{ fontSize: 12 }}
                        interval={0}
                      />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v} MB`} />
                      <Tooltip
                        formatter={(val, name) =>
                          name === 'datos_mb'
                            ? [formatData(val), 'Datos']
                            : [`${val} min`, 'Voz']
                        }
                      />
                      <Legend wrapperStyle={{ paddingTop: 16 }} />
                      <Bar dataKey="datos_mb" name="Datos"     fill="#2563eb" radius={[4,4,0,0]} onClick={handleBarClick} />
                      <Bar dataKey="voz_min"  name="Voz (min)" fill="#16a34a" radius={[4,4,0,0]} onClick={handleBarClick} />
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
                            </td>
                            <td style={{ color: l.voz_min > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                              {l.voz_min > 0 ? `${l.voz_min} min` : '0'}
                            </td>
                            <td style={{ color: l.sms_count > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                              {l.sms_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                {historical.reduce((s, d) => s + d.voz_min, 0)}
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
              {/* Line chart — Datos */}
              <div className="chart-card">
                <div className="chart-title">Evolución de Consumo de Datos (MB)</div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={historical} margin={{ top: 5, right: 20, bottom: 40, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                    <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `${v} MB`} />
                    <Tooltip formatter={val => [formatData(val), 'Datos']} />
                    <Line
                      type="monotone"
                      dataKey="datos_mb"
                      name="Datos"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: '#2563eb' }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Line chart — Voz */}
              <div className="chart-card">
                <div className="chart-title">Evolución de Consumo de Voz (min)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={historical} margin={{ top: 5, right: 20, bottom: 40, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                    <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={val => [`${val} min`, 'Voz']} />
                    <Line
                      type="monotone"
                      dataKey="voz_min"
                      name="Voz"
                      stroke="#16a34a"
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: '#16a34a' }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
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
                        <th>Total Voz</th>
                        <th>Total SMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...historical].reverse().map(d => (
                        <tr key={d.key}>
                          <td className="fw-600">{d.label}</td>
                          <td>{formatData(d.datos_mb)}</td>
                          <td>{d.voz_min} min</td>
                          <td>{d.sms_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

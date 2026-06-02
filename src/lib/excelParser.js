import * as XLSX from 'xlsx'

// Normaliza un token numérico que puede venir en formato es-CL ("1.234,56"),
// US ("1,234.56") o decimal simple ("1.3" / "1,5") → Number.
// Regla: si hay coma y punto, el separador que aparece más a la derecha es el
// decimal y el otro es de miles. Si solo hay uno, se asume decimal.
function normalizeDecimal(raw) {
  let s = String(raw).trim()
  const lastComma = s.lastIndexOf(',')
  const lastDot   = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.') // coma decimal
    else                     s = s.replace(/,/g, '')                    // punto decimal
  } else if (lastComma !== -1) {
    s = s.replace(',', '.')
  }
  // solo punto o sin separador: el punto se trata como decimal
  return parseFloat(s)
}

const DATA_RE = /([\d.,]+)\s*(GB|MB|KB)/i

// "1.3 GB" / "1,5 GB" / "1.234,56 GB" / "512 MB" / "0 KB" → MB como float
export function parseTraficoData(str) {
  if (str == null || String(str).trim() === '') return 0
  const match = String(str).match(DATA_RE)
  if (!match) return 0
  const val = normalizeDecimal(match[1])
  if (isNaN(val)) return 0
  const unit = match[2].toUpperCase()
  if (unit === 'GB') return Math.round(val * 1024 * 100) / 100
  if (unit === 'MB') return Math.round(val * 100) / 100
  if (unit === 'KB') return Math.round((val / 1024) * 100) / 100
  return 0
}

// "30 min." / "1.234 min" → entero. Voz y SMS son enteros en el reporte del
// operador, así que cualquier "." o "," se interpreta como separador de miles.
function parseInteger(str) {
  if (str == null) return 0
  const digits = String(str).replace(/[^\d]/g, '')
  return digits === '' ? 0 : parseInt(digits, 10)
}

export const parseVoz = parseInteger
export const parseSMS = parseInteger

// ¿La celda tiene contenido pero NO se pudo interpretar como número?
// Sirve para distinguir un "0" real de un fallo de parseo silencioso.
function isUnparsedData(raw) {
  const s = raw == null ? '' : String(raw).trim()
  return s !== '' && !DATA_RE.test(s)
}
function isUnparsedInteger(raw) {
  const s = raw == null ? '' : String(raw).trim()
  return s !== '' && !/\d/.test(s)
}

// Columna Sucursal directa del Excel, fallback a alias sin número final
export function extractBranch(sucursal, alias) {
  if (sucursal && String(sucursal).trim() !== '') return String(sucursal).trim()
  if (alias && String(alias).trim() !== '') return String(alias).replace(/\s+\d+$/, '').trim()
  return 'Sin Sucursal'
}

// Entero con separador de miles es-CL: 12345 → "12.345"
export function formatNumber(n) {
  return (n || 0).toLocaleString('es-CL')
}

// MB → string legible: "1.51 GB" / "512 MB" / "0 KB"
export function formatData(mb) {
  if (mb == null || mb === 0) return '0 KB'
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 1)    return `${mb.toFixed(0)} MB`
  return `${(mb * 1024).toFixed(0)} KB`
}

// Lee la primera fila para resolver una columna por cualquiera de sus alias.
function pick(row, names) {
  for (const n of names) {
    if (row[n] !== undefined) return row[n]
  }
  return ''
}

const COLUMNS = {
  linea:  ['Linea', 'linea', 'LINEA', 'Línea', 'línea'],
  alias:  ['Alias', 'alias', 'ALIAS'],
  suc:    ['Sucursal', 'sucursal', 'SUCURSAL'],
  plan:   ['Plan', 'plan', 'PLAN'],
  dplan:  ['Desc Plan', 'desc_plan', 'DESC PLAN'],
  datos:  ['Trafico Datos', 'trafico_datos', 'TRAFICO DATOS', 'Tráfico Datos'],
  voz:    ['Trafico Voz', 'trafico_voz', 'TRAFICO VOZ', 'Tráfico Voz'],
  sms:    ['Trafico SMS', 'trafico_sms', 'TRAFICO SMS', 'Tráfico SMS'],
}

// Normaliza las filas crudas de la hoja (salida de sheet_to_json) a
// { rows, stats }. Función pura: testeable sin FileReader ni XLSX.
export function normalizeRows(sheetRows) {
  // Detectar columnas esenciales ausentes (a partir de las claves reales).
  const headerKeys = new Set(Object.keys(sheetRows[0] || {}))
  const missingColumns = []
  if (!COLUMNS.linea.some(n => headerKeys.has(n))) missingColumns.push('Linea')
  if (!COLUMNS.datos.some(n => headerKeys.has(n))) missingColumns.push('Trafico Datos')

  const stats = {
    sheetRows: sheetRows.length,
    parsed: 0,
    skippedNoLinea: 0,
    dataUnparsed: 0,   // celdas de datos con contenido no interpretable → contadas como 0
    vozUnparsed: 0,
    smsUnparsed: 0,
    duplicateLineas: 0,
    missingColumns,
  }

  const seen = new Set()
  const rows = []

  for (const row of sheetRows) {
    const linea = String(pick(row, COLUMNS.linea)).trim()
    if (linea === '') { stats.skippedNoLinea++; continue }

    const rawDatos = pick(row, COLUMNS.datos)
    const rawVoz   = pick(row, COLUMNS.voz)
    const rawSms   = pick(row, COLUMNS.sms)

    if (isUnparsedData(rawDatos))    stats.dataUnparsed++
    if (isUnparsedInteger(rawVoz))   stats.vozUnparsed++
    if (isUnparsedInteger(rawSms))   stats.smsUnparsed++
    if (seen.has(linea))             stats.duplicateLineas++
    seen.add(linea)

    const alias    = String(pick(row, COLUMNS.alias)).trim()
    const sucursal = pick(row, COLUMNS.suc)

    rows.push({
      linea,
      alias,
      plan:        String(pick(row, COLUMNS.plan)).trim(),
      desc_plan:   String(pick(row, COLUMNS.dplan)).trim(),
      datos_mb:    parseTraficoData(rawDatos),
      voz_min:     parseVoz(rawVoz),
      sms_count:   parseSMS(rawSms),
      branch_name: extractBranch(sucursal, alias),
    })
  }

  stats.parsed = rows.length
  return { rows, stats }
}

// Lee el archivo .xlsx y retorna { rows, stats }.
// `rows`  → filas normalizadas listas para insertar.
// `stats` → resumen de calidad para advertir al usuario antes de confirmar.
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const sheetRows = XLSX.utils.sheet_to_json(ws)

        if (sheetRows.length === 0) {
          reject(new Error('El archivo no contiene datos'))
          return
        }

        resolve(normalizeRows(sheetRows))
      } catch (err) {
        reject(new Error('Error al leer el archivo: ' + err.message))
      }
    }

    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

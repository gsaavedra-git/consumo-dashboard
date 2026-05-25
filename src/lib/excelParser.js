import * as XLSX from 'xlsx'

// "1.3 GB" o "1,5 GB" / "512 MB" / "0 KB" → MB como float
export function parseTraficoData(str) {
  if (!str || str.trim() === '') return 0
  const cleanStr = String(str).replace(',', '.')
  const match = cleanStr.match(/([\d.]+)\s*(GB|MB|KB)/i)
  if (!match) return 0
  const val = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  if (unit === 'GB') return Math.round(val * 1024 * 100) / 100
  if (unit === 'MB') return Math.round(val * 100) / 100
  if (unit === 'KB') return Math.round((val / 1024) * 100) / 100
  return 0
}

// "30 min." → 30
export function parseVoz(str) {
  if (!str) return 0
  const match = String(str).match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

// "1 SMS" → 1
export function parseSMS(str) {
  if (!str) return 0
  const match = String(str).match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

// "Alto Bio Bio 1" → "Alto Bio Bio" | "" → "Sin Sucursal"
export function extractBranch(alias) {
  if (!alias || String(alias).trim() === '') return 'Sin Sucursal'
  return String(alias).replace(/\s+\d+$/, '').trim()
}

// MB → string legible: "1.51 GB" / "512 MB" / "0 KB"
export function formatData(mb) {
  if (mb == null || mb === 0) return '0 KB'
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 1)    return `${mb.toFixed(0)} MB`
  return `${(mb * 1024).toFixed(0)} KB`
}

// Lee el archivo .xlsx y retorna filas normalizadas
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws)

        if (rows.length === 0) {
          reject(new Error('El archivo no contiene datos'))
          return
        }

        const parsed = rows.map((row) => {
          // Tolerante a variaciones de nombre de columna
          const alias = row['Alias'] ?? row['alias'] ?? row['ALIAS'] ?? ''
          return {
            linea:       String(row['Linea']       ?? row['linea']       ?? row['LINEA']       ?? '').trim(),
            alias:       String(alias).trim(),
            plan:        String(row['Plan']         ?? row['plan']         ?? row['PLAN']         ?? '').trim(),
            desc_plan:   String(row['Desc Plan']    ?? row['desc_plan']    ?? row['DESC PLAN']    ?? '').trim(),
            datos_mb:    parseTraficoData(row['Trafico Datos'] ?? row['trafico_datos'] ?? row['TRAFICO DATOS'] ?? ''),
            voz_min:     parseVoz(row['Trafico Voz']  ?? row['trafico_voz']  ?? row['TRAFICO VOZ']  ?? ''),
            sms_count:   parseSMS(row['Trafico SMS']  ?? row['trafico_sms']  ?? row['TRAFICO SMS']  ?? ''),
            branch_name: extractBranch(alias),
          }
        }).filter(r => r.linea !== '')  // descartar filas vacías

        resolve(parsed)
      } catch (err) {
        reject(new Error('Error al leer el archivo: ' + err.message))
      }
    }

    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

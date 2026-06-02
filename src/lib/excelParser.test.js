import { describe, it, expect } from 'vitest'
import {
  parseTraficoData,
  parseVoz,
  parseSMS,
  extractBranch,
  formatData,
  formatNumber,
  normalizeRows,
} from './excelParser'

describe('parseTraficoData (tráfico → MB)', () => {
  it('GB con punto decimal', () => {
    expect(parseTraficoData('1.3 GB')).toBe(1331.2)   // 1.3 * 1024
  })
  it('GB con coma decimal (es-CL)', () => {
    expect(parseTraficoData('1,5 GB')).toBe(1536)
  })
  it('GB con separador de miles y coma decimal (1.234,56 GB)', () => {
    // 1234.56 * 1024 = 1264189.44 — antes se truncaba a ~1.2 GB
    expect(parseTraficoData('1.234,56 GB')).toBe(1264189.44)
  })
  it('GB estilo US (1,234.56 GB)', () => {
    expect(parseTraficoData('1,234.56 GB')).toBe(1264189.44)
  })
  it('MB directo', () => {
    expect(parseTraficoData('512 MB')).toBe(512)
  })
  it('KB se convierte a MB', () => {
    expect(parseTraficoData('512 KB')).toBe(0.5)
  })
  it('cero', () => {
    expect(parseTraficoData('0 KB')).toBe(0)
  })
  it('vacío o nulo → 0', () => {
    expect(parseTraficoData('')).toBe(0)
    expect(parseTraficoData(null)).toBe(0)
    expect(parseTraficoData(undefined)).toBe(0)
  })
  it('texto sin unidad reconocible → 0', () => {
    expect(parseTraficoData('basura')).toBe(0)
    expect(parseTraficoData('N/A')).toBe(0)
  })
  it('unidad en minúsculas', () => {
    expect(parseTraficoData('2 gb')).toBe(2048)
  })
})

describe('parseVoz / parseSMS (enteros con separador de miles)', () => {
  it('minutos simples', () => {
    expect(parseVoz('30 min.')).toBe(30)
  })
  it('miles con punto (1.234 min) — antes daba 1', () => {
    expect(parseVoz('1.234 min')).toBe(1234)
  })
  it('miles con coma (1,234 min)', () => {
    expect(parseVoz('1,234 min')).toBe(1234)
  })
  it('SMS', () => {
    expect(parseSMS('5 SMS')).toBe(5)
    expect(parseSMS('1.500 SMS')).toBe(1500)
  })
  it('vacío / sin dígitos → 0', () => {
    expect(parseVoz('')).toBe(0)
    expect(parseVoz(null)).toBe(0)
    expect(parseVoz('N/A')).toBe(0)
  })
})

describe('extractBranch', () => {
  it('usa la columna Sucursal cuando existe', () => {
    expect(extractBranch('Centro', 'Juan 1')).toBe('Centro')
  })
  it('cae al alias sin el número final', () => {
    expect(extractBranch('', 'Sucursal Norte 12')).toBe('Sucursal Norte')
  })
  it('sin sucursal ni alias → Sin Sucursal', () => {
    expect(extractBranch('', '')).toBe('Sin Sucursal')
    expect(extractBranch(null, null)).toBe('Sin Sucursal')
  })
})

describe('formatData / formatNumber', () => {
  it('formatData escala a GB/MB/KB', () => {
    expect(formatData(0)).toBe('0 KB')
    expect(formatData(512)).toBe('512 MB')
    expect(formatData(2048)).toBe('2.00 GB')
    expect(formatData(0.5)).toBe('512 KB')
  })
  it('formatNumber agrega separador de miles', () => {
    expect(formatNumber(12345)).toBe('12.345')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(null)).toBe('0')
  })
})

describe('normalizeRows (pipeline completo de calidad)', () => {
  it('normaliza filas y arma branch_name', () => {
    const { rows, stats } = normalizeRows([
      { Linea: '5691', Alias: 'Juan 1', Sucursal: 'Centro', 'Trafico Datos': '1,5 GB', 'Trafico Voz': '30 min', 'Trafico SMS': '2 SMS' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ linea: '5691', alias: 'Juan 1', branch_name: 'Centro', datos_mb: 1536, voz_min: 30, sms_count: 2 })
    expect(stats.parsed).toBe(1)
  })

  it('omite filas sin número de línea y lo reporta', () => {
    const { rows, stats } = normalizeRows([
      { Linea: '111', 'Trafico Datos': '1 GB' },
      { Linea: '',    'Trafico Datos': '1 GB' },
      {               'Trafico Datos': '1 GB' },
    ])
    expect(rows).toHaveLength(1)
    expect(stats.skippedNoLinea).toBe(2)
  })

  it('cuenta celdas de datos no interpretables (contadas como 0)', () => {
    const { rows, stats } = normalizeRows([
      { Linea: '111', 'Trafico Datos': 'sin servicio' },
    ])
    expect(rows[0].datos_mb).toBe(0)
    expect(stats.dataUnparsed).toBe(1)
  })

  it('detecta líneas duplicadas', () => {
    const { stats } = normalizeRows([
      { Linea: '111', 'Trafico Datos': '1 GB' },
      { Linea: '111', 'Trafico Datos': '2 GB' },
    ])
    expect(stats.duplicateLineas).toBe(1)
  })

  it('reporta columnas esenciales faltantes', () => {
    const { stats } = normalizeRows([
      { Foo: 'bar', Alias: 'x' },
    ])
    expect(stats.missingColumns).toContain('Linea')
    expect(stats.missingColumns).toContain('Trafico Datos')
  })

  it('acepta encabezados en mayúsculas y con acento', () => {
    const { rows } = normalizeRows([
      { LINEA: '999', 'Tráfico Datos': '2 GB' },
    ])
    expect(rows[0].linea).toBe('999')
    expect(rows[0].datos_mb).toBe(2048)
  })
})

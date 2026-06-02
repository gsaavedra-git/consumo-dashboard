# 📊 Consumo Móvil Dashboard

Dashboard para visualizar el consumo mensual de líneas móviles corporativas, con histórico por sucursal.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Backend / DB | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | Vercel (frontend) + Supabase cloud |
| Charts | Recharts (AreaChart + BarChart) |
| Excel parsing | SheetJS (xlsx) |

---

## Instalación paso a paso

### 1. Supabase — Crear proyecto

1. Ve a [supabase.com](https://supabase.com) → New Project
2. Guarda la URL y la `anon key` (Dashboard → Settings → API)

### 2. Supabase — Ejecutar schema

En el **SQL Editor** del Dashboard, ejecuta el contenido de:

```
supabase/schema.sql
```

Esto crea las tablas, las políticas RLS y los índices.

Luego ejecuta también, en orden, los archivos de `supabase/migrations/` (`002_…`, `003_…`, `004_…`). El `004_atomic_upload.sql` crea la función `replace_period_lines`, que hace la carga mensual de forma transaccional (si falla a mitad, no deja el período corrupto).

### 2b. Supabase — Crear bucket de logos

En el Dashboard → **Storage** → "New bucket":

- Nombre: `branch-logos`
- Public: ✅

### 3. Supabase — Crear primer usuario administrador

En el Dashboard → **Authentication → Users** → "Add user":

- Email: `admin@tuempresa.com`
- Password: (el que prefieras)
- Email confirmed: ✅

Luego en SQL Editor:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com'
);
```

### 4. Supabase — Desplegar Edge Function (para crear usuarios desde la app)

Instala [Supabase CLI](https://supabase.com/docs/guides/cli) y ejecuta:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy create-user
```

### 5. Frontend — Variables de entorno

Copia `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus valores de Supabase:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 6. Instalar dependencias y levantar en desarrollo

```bash
npm install
npm run dev
```

### 7. Deploy en Vercel

```bash
npm install -g vercel
vercel
```

O conecta el repositorio en [vercel.com](https://vercel.com) y configura las variables de entorno ahí.

---

## Flujo de uso

### Administrador

1. Ingresar con la cuenta admin
2. **Subir Datos** → Seleccionar mes/año → Arrastrar Excel → Confirmar
3. Las sucursales se detectan automáticamente del campo "Alias"
4. **Usuarios** → Crear cuentas viewer asignadas a cada sucursal

### Sucursales (viewers)

1. Ingresar con la cuenta genérica de su sucursal
2. Ver dashboard propio con datos del período actual (un viewer puede tener múltiples sucursales asignadas)
3. Navegar al histórico para ver evolución mes a mes

---

## Estructura de carpetas

```
consumo-dashboard/
├── src/
│   ├── lib/
│   │   ├── supabase.js        ← cliente Supabase
│   │   └── excelParser.js     ← parsing de xlsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── AdminPage.jsx
│   │   └── ViewerPage.jsx
│   ├── components/
│   │   ├── ConsumptionDashboard.jsx  ← gráficos (AreaChart/BarChart) + tabla
│   │   ├── UploadExcel.jsx           ← carga mensual
│   │   ├── ManageBranches.jsx        ← CRUD sucursales + logos
│   │   ├── ManageUsers.jsx           ← CRUD usuarios (multi-branch)
│   │   ├── BranchLogo.jsx            ← avatar/logo de sucursal
│   │   └── Icons.jsx                 ← iconos SVG del dashboard
│   ├── App.jsx                ← routing por rol
│   ├── main.jsx
│   └── index.css
├── supabase/
│   ├── schema.sql             ← ejecutar en Supabase SQL Editor
│   └── functions/
│       └── create-user/
│           └── index.ts       ← Edge Function para crear usuarios
├── .github/
│   └── workflows/
│       └── keep-supabase-alive.yml  ← ping periódico para evitar pausa
├── .env.example
├── vite.config.js
└── package.json
```

---

## Notas importantes

- **Row Level Security**: habilitado en todas las tablas. Un viewer no puede ver datos de otra sucursal, ni siquiera directamente contra la API.
- **Reemplazo de datos**: subir datos de un período ya existente reemplaza los anteriores (no duplica). El reemplazo es atómico vía la función `replace_period_lines` (migración 004).
- **Validación de carga**: antes de confirmar, la vista previa advierte sobre celdas no interpretables (contadas como 0), líneas duplicadas, columnas faltantes y filas sin número de línea.
- **Variación mes a mes**: los KPIs del período muestran el cambio % vs el período anterior, la tabla de detalle resalta líneas con saltos anómalos de datos (⚠), y el resumen histórico incluye una columna de variación.
- **Histórico por sucursal / por línea**: en la vista histórica, el gráfico de datos permite alternar entre Total, Por Sucursal (una línea por sucursal) y Por Línea (selector para ver la evolución de una línea/alias específica).
- **Sucursales automáticas**: al subir un Excel, las sucursales se crean a partir de la columna "Sucursal". Si no existe, se deriva del campo "Alias" como fallback.
- **Multi-branch**: un usuario viewer puede tener múltiples sucursales asignadas vía la tabla `user_branches`.
- **Logos de sucursal**: se pueden subir desde la sección Sucursales. Se almacenan en el bucket `branch-logos` de Supabase Storage.
- **Keep-alive**: un GitHub Action hace ping periódico a Supabase para evitar que el proyecto free-tier entre en pausa.

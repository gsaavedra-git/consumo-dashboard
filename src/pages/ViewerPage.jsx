import { supabase } from '../lib/supabase'
import ConsumptionDashboard from '../components/ConsumptionDashboard'

export default function ViewerPage({ profile }) {
  const branchNames = profile?.branch_names || []
  const branchLabel = branchNames.length > 0 ? branchNames.join(', ') : 'Sin sucursal'

  return (
    <div className="app-layout">
      <nav className="navbar">
        <span className="navbar-brand">
          <span>📊</span> Consumo Móvil
        </span>
        <div className="navbar-user">
          <span>🏢 {branchLabel}</span>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </nav>

      <div className="main-content">
        <ConsumptionDashboard
          isAdmin={false}
          branchIds={profile?.branch_ids || []}
          branchName={branchLabel}
        />
      </div>
    </div>
  )
}

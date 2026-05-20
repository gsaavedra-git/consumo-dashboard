import { supabase } from '../lib/supabase'
import ConsumptionDashboard from '../components/ConsumptionDashboard'

export default function ViewerPage({ profile }) {
  const branchName = profile?.branches?.name || 'Sucursal'

  return (
    <div className="app-layout">
      <nav className="navbar">
        <span className="navbar-brand">
          <span>📊</span> Consumo Móvil
        </span>
        <div className="navbar-user">
          <span>🏢 {branchName}</span>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </nav>

      <div className="main-content">
        <ConsumptionDashboard
          isAdmin={false}
          branchId={profile?.branch_id}
          branchName={branchName}
        />
      </div>
    </div>
  )
}

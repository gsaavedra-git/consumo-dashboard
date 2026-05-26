import { supabase } from '../lib/supabase'
import ConsumptionDashboard from '../components/ConsumptionDashboard'
import BranchLogo from '../components/BranchLogo'
import { IconSignal, IconLogOut } from '../components/Icons'

export default function ViewerPage({ profile }) {
  const branchNames = profile?.branch_names || []
  const branchLabel = branchNames.length > 0 ? branchNames.join(', ') : 'Sin sucursal'
  const firstBranch = branchNames[0] || ''
  const firstLogo = profile?.branch_logos?.[firstBranch] || null

  return (
    <div className="app-layout">
      <nav className="navbar">
        <span className="navbar-brand">
          <IconSignal size={22} />
          Consumo Móvil
        </span>
        <div className="navbar-user">
          <span className="navbar-user-info">
            <BranchLogo
              name={firstBranch}
              logoUrl={firstLogo}
              size={28}
              style={{ borderRadius: 6 }}
            />
            {branchLabel}
          </span>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            <IconLogOut size={15} />
            <span className="logout-text">Salir</span>
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

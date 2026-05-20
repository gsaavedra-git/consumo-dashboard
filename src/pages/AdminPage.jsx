import { useState } from 'react'
import { supabase } from '../lib/supabase'
import ConsumptionDashboard from '../components/ConsumptionDashboard'
import UploadExcel from '../components/UploadExcel'
import ManageBranches from '../components/ManageBranches'
import ManageUsers from '../components/ManageUsers'

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'upload',    label: '📤 Subir Datos' },
  { id: 'branches',  label: '🏢 Sucursales' },
  { id: 'users',     label: '👥 Usuarios' },
]

export default function AdminPage({ profile }) {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="app-layout">
      <nav className="navbar">
        <span className="navbar-brand">
          <span>📊</span> Consumo Móvil
        </span>
        <div className="navbar-user">
          <span className="badge badge-admin">Admin</span>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            Salir
          </button>
        </div>
      </nav>

      <div className="main-content">
        <div className="tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && <ConsumptionDashboard isAdmin={true} />}
        {activeTab === 'upload'    && <UploadExcel />}
        {activeTab === 'branches'  && <ManageBranches />}
        {activeTab === 'users'     && <ManageUsers />}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import ConsumptionDashboard from '../components/ConsumptionDashboard'
import UploadExcel from '../components/UploadExcel'
import ManageBranches from '../components/ManageBranches'
import ManageUsers from '../components/ManageUsers'
import { IconChart, IconUpload, IconBuilding, IconUsers, IconSignal, IconLogOut } from '../components/Icons'

const TABS = [
  { id: 'dashboard', label: 'Dashboard',    Icon: IconChart },
  { id: 'upload',    label: 'Subir Datos',  Icon: IconUpload },
  { id: 'branches',  label: 'Sucursales',   Icon: IconBuilding },
  { id: 'users',     label: 'Usuarios',     Icon: IconUsers },
]

export default function AdminPage({ profile }) {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="app-layout">
      <nav className="navbar">
        <span className="navbar-brand">
          <IconSignal size={22} />
          Consumo Móvil
        </span>
        <div className="navbar-user">
          <span className="badge badge-admin">Admin</span>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            <IconLogOut size={15} />
            <span className="logout-text">Salir</span>
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
              <tab.Icon size={16} />
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

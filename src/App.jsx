import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import AdminPage from './pages/AdminPage'
import ViewerPage from './pages/ViewerPage'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Cambios de sesión (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const [{ data: prof, error }, { data: ub }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_branches').select('branch_id, branches(name, logo_url)').eq('user_id', userId),
    ])

    if (!error && prof) {
      prof.user_branches = ub || []
      prof.branch_ids = (ub || []).map(r => r.branch_id)
      prof.branch_names = (ub || []).map(r => r.branches?.name).filter(Boolean)
      prof.branch_logos = (ub || []).reduce((acc, r) => {
        if (r.branches?.name && r.branches?.logo_url) acc[r.branches.name] = r.branches.logo_url
        return acc
      }, {})
    }
    if (!error) setProfile(prof)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="loading-center">
        <div className="loading-spinner" />
        <span>Cargando...</span>
      </div>
    )
  }

  if (!session) return <Login />

  if (profile?.role === 'admin') return <AdminPage profile={profile} />

  return <ViewerPage profile={profile} />
}

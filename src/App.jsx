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
    const { data, error } = await supabase
      .from('profiles')
      .select('*, branches(*)')
      .eq('id', userId)
      .single()

    if (!error) setProfile(data)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="loading-center">
        <span>Cargando...</span>
      </div>
    )
  }

  if (!session) return <Login />

  if (profile?.role === 'admin') return <AdminPage profile={profile} />

  return <ViewerPage profile={profile} />
}

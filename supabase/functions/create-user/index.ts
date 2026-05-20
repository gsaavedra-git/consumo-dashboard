// supabase/functions/create-user/index.ts
// Deploy: supabase functions deploy create-user
// Esta función usa service_role para crear usuarios desde el panel de admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    // Cliente con service_role (tiene permisos totales, solo para esta función)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verificar que quien llama es admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Sin permisos de administrador' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Crear el nuevo usuario
    const { email, password, role, branch_id, branch_ids, display_name } = await req.json()

    // Support both legacy branch_id and new branch_ids
    const resolvedBranchIds: string[] = branch_ids?.length > 0
      ? branch_ids
      : (branch_id ? [branch_id] : [])

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (role === 'viewer' && resolvedBranchIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Un viewer debe tener al menos una sucursal asignada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // confirmar email automáticamente
      user_metadata: { display_name }
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Actualizar perfil con role y display_name
    await supabaseAdmin
      .from('profiles')
      .update({ role, display_name })
      .eq('id', newUser.user.id)

    // Insertar sucursales asignadas
    if (resolvedBranchIds.length > 0) {
      await supabaseAdmin.from('user_branches').insert(
        resolvedBranchIds.map((bid: string) => ({
          user_id: newUser.user.id,
          branch_id: bid,
        }))
      )
    }

    return new Response(JSON.stringify({ user: { id: newUser.user.id, email } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

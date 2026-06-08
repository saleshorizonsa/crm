import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password, fullName, role, companyId, supervisorId } = await req.json();

    if (!email || !password || !fullName || !role || !companyId) {
      return json({ error: 'Missing required fields.' }, 400);
    }

    // Service role key — bypasses RLS and email confirmation
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Step 1 — create the auth user (no confirmation email sent)
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      return json({ error: authError.message }, 400);
    }

    // Step 2 — create the user profile row
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id:            authUser.user.id,
      email,
      full_name:     fullName,
      role,
      company_id:    companyId,
      supervisor_id: supervisorId || null,
      is_active:     true,
      created_at:    new Date().toISOString(),
    });

    if (profileError) {
      // Rollback the auth user so we don't orphan it
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return json({ error: profileError.message }, 400);
    }

    return json({ success: true, userId: authUser.user.id }, 200);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

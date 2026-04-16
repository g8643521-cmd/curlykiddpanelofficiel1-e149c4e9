import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Server configuration is incomplete.' }, 500);
    }
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization header.' }, 401);
    }

    const body = BodySchema.safeParse(await req.json());
    if (!body.success) {
      return json({ error: 'Invalid email.' }, 400);
    }

    // Verify caller
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user: caller }, error: callerError } = await authClient.auth.getUser();
    if (callerError || !caller) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    // Check caller is admin or owner
    const { data: callerRoles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    const roles = new Set((callerRoles ?? []).map((r: any) => r.role));
    if (!roles.has('admin') && !roles.has('owner')) {
      return json({ error: 'Only admins can transfer ownership.' }, 403);
    }

    // Find target user
    const { email } = body.data;
    const targetUser = await findUserByEmail(serviceClient, email);
    if (!targetUser?.id) {
      return json({ error: 'No account found for that email.' }, 404);
    }
    if (targetUser.id === caller.id) {
      return json({ error: 'Cannot transfer ownership to yourself.' }, 400);
    }

    // Find current owner(s) and downgrade to admin
    const { data: currentOwners } = await serviceClient
      .from('user_roles')
      .select('id, user_id')
      .eq('role', 'owner');

    for (const owner of currentOwners ?? []) {
      await serviceClient.from('user_roles').delete().eq('id', owner.id);
      // Give them admin role instead
      await serviceClient.from('user_roles').upsert(
        { user_id: owner.user_id, role: 'admin' },
        { onConflict: 'user_id,role' }
      );
    }

    // Remove existing roles for target, then assign owner
    await serviceClient.from('user_roles').delete().eq('user_id', targetUser.id);
    const { error: insertError } = await serviceClient
      .from('user_roles')
      .insert({ user_id: targetUser.id, role: 'owner' });

    if (insertError) {
      console.error('Insert failed:', insertError);
      return json({ error: 'Could not assign owner role.' }, 500);
    }

    return json({ success: true, message: `Ownership transferred to ${email}. Previous owner(s) downgraded to admin.` });
  } catch (error) {
    console.error('transfer-ownership error:', error);
    return json({ error: 'Internal server error.' }, 500);
  }
});

async function findUserByEmail(serviceClient: ReturnType<typeof createClient>, email: string) {
  const normalized = email.toLowerCase();
  let page = 1;
  while (page <= 10) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return match;
    if (users.length < 200) break;
    page++;
  }
  return null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(['admin', 'moderator', 'user', 'mod_creator', 'owner', 'integrations_manager']),
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
      return jsonResponse({ error: 'Server configuration is incomplete.' }, 500);
    }

    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing authorization header.' }, 401);
    }

    const body = BodySchema.safeParse(await req.json());
    if (!body.success) {
      return jsonResponse({ error: 'Invalid email or role.' }, 400);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await authClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: 'Unauthorized request.' }, 401);
    }

    const { data: callerRoles, error: roleLookupError } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (roleLookupError) {
      console.error('Role lookup failed:', roleLookupError);
      return jsonResponse({ error: 'Unable to verify permissions.' }, 500);
    }

    const allowedRoles = new Set((callerRoles ?? []).map(({ role }) => role));
    if (!allowedRoles.has('admin') && !allowedRoles.has('owner')) {
      return jsonResponse({ error: 'Only admins can assign roles.' }, 403);
    }

    const { email, role } = body.data;
    const targetUser = await findUserByEmail(serviceClient, email);

    if (!targetUser?.id) {
      return jsonResponse({ error: 'No account found for that email.' }, 404);
    }

    // Remove all existing roles for target user, then insert the new one
    const { error: deleteError } = await serviceClient
      .from('user_roles')
      .delete()
      .eq('user_id', targetUser.id);

    if (deleteError) {
      console.error('Role delete failed:', deleteError);
      return jsonResponse({ error: 'Could not update role.' }, 500);
    }

    const { error: insertError } = await serviceClient
      .from('user_roles')
      .insert({ user_id: targetUser.id, role });

    if (insertError) {
      console.error('Role insert failed:', insertError);
      return jsonResponse({ error: 'Could not assign role.' }, 500);
    }

    return jsonResponse({ success: true, message: `${role} assigned to ${email}.` });
  } catch (error) {
    console.error('assign-role error:', error);
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
});

async function findUserByEmail(serviceClient: ReturnType<typeof createClient>, email: string) {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      console.error('User lookup failed:', error);
      throw error;
    }

    const users = data.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === normalizedEmail);

    if (match) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
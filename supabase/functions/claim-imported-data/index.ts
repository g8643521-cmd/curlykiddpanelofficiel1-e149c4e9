import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user?.id || !user.email) {
      return jsonResponse({ error: 'Unauthorized request.' }, 401);
    }

    const { data: legacyProfiles, error: legacyProfilesError } = await serviceClient
      .from('profiles')
      .select('user_id')
      .eq('email', user.email)
      .neq('user_id', user.id);

    if (legacyProfilesError) {
      console.error('Legacy profile lookup failed:', legacyProfilesError);
      return jsonResponse({ error: 'Unable to look up imported data ownership.' }, 500);
    }

    const legacyUserIds = [...new Set((legacyProfiles ?? []).map((profile) => profile.user_id).filter(Boolean))];

    if (legacyUserIds.length === 0) {
      return jsonResponse({
        success: true,
        claimed: false,
        legacyUserIds: [],
        updated: { servers: 0, scans: 0, sharesOwned: 0, sharesReceived: 0 },
      });
    }

    const totals = {
      servers: 0,
      scans: 0,
      sharesOwned: 0,
      sharesReceived: 0,
    };

    for (const legacyUserId of legacyUserIds) {
      const [serversRes, scansRes, sharesOwnedRes, sharesReceivedRes] = await Promise.all([
        serviceClient
          .from('discord_bot_servers')
          .update({ user_id: user.id })
          .eq('user_id', legacyUserId)
          .select('id'),
        serviceClient
          .from('scan_history')
          .update({ user_id: user.id })
          .eq('user_id', legacyUserId)
          .select('id'),
        serviceClient
          .from('server_shares')
          .update({ shared_by: user.id })
          .eq('shared_by', legacyUserId)
          .select('id'),
        serviceClient
          .from('server_shares')
          .update({ shared_with: user.id })
          .eq('shared_with', legacyUserId)
          .select('id'),
      ]);

      const firstError = [serversRes.error, scansRes.error, sharesOwnedRes.error, sharesReceivedRes.error].find(Boolean);

      if (firstError) {
        console.error('Ownership claim failed:', firstError);
        return jsonResponse({ error: 'Unable to claim imported data for the current account.' }, 500);
      }

      totals.servers += serversRes.data?.length ?? 0;
      totals.scans += scansRes.data?.length ?? 0;
      totals.sharesOwned += sharesOwnedRes.data?.length ?? 0;
      totals.sharesReceived += sharesReceivedRes.data?.length ?? 0;
    }

    return jsonResponse({
      success: true,
      claimed: true,
      legacyUserIds,
      matchedEmail: user.email,
      updated: totals,
    });
  } catch (error) {
    console.error('claim-imported-data error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error.' },
      500,
    );
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

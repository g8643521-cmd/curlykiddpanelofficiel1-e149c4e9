import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, discord_id, type } = await req.json();

    // Fast ping mode - respond immediately, no DB or external calls
    if (query === 'ping' && type === 'discord') {
      return new Response(
        JSON.stringify({ success: true, ping: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get API keys from admin_settings
    const { data: settings } = await supabase
      .from("admin_settings")
      .select("key, value")
      .in("key", ["screensharex_api_key", "discord_bot_token"]);

    const apiKey = settings?.find((s: any) => s.key === "screensharex_api_key")?.value;
    const botToken = settings?.find((s: any) => s.key === "discord_bot_token")?.value;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "CurlyKidd API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!discord_id && !query) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing discord_id or query" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchId = discord_id || query;

    // Fetch external data and Discord user data in parallel
    const sxPromise = fetch(
      `https://screensharex.ac/api/search?token=${encodeURIComponent(apiKey)}&user_id=${encodeURIComponent(searchId)}`,
      { method: "GET" }
    );

    // Fetch Discord user profile if we have a bot token and a discord ID
    const isDiscordId = /^\d{17,19}$/.test(searchId);
    const discordPromise = (botToken && isDiscordId)
      ? fetch(`https://discord.com/api/v10/users/${searchId}`, {
          headers: { Authorization: `Bot ${botToken}` },
        }).catch(() => null)
      : Promise.resolve(null);

    const [sxResponse, discordResponse] = await Promise.all([sxPromise, discordPromise]);

    if (!sxResponse.ok) {
      const text = await sxResponse.text();
      return new Response(
        JSON.stringify({ success: false, error: `API error [${sxResponse.status}]: ${text}` }),
        { status: sxResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await sxResponse.json();

    let discordUser = null;
    if (discordResponse && discordResponse.ok) {
      discordUser = await discordResponse.json();
    }

    return new Response(
      JSON.stringify({ success: true, data, discord_user: discordUser }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

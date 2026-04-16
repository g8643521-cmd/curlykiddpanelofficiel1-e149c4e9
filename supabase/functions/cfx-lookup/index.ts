import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CFX_API = "https://servers-frontend.fivem.net/api/servers/single";

const replaceVars = (text: string, vars: Record<string, string>): string => {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
};

async function sendServerLookupWebhook(result: any, serverCode: string, searchedBy: string, searchedByEmail: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['server_lookup_webhook_url', 'discord_webhook_enabled', 'embed_config_server_lookup']);

    const settingsMap = new Map(settings?.map((s: any) => [s.key, s.value]) || []);
    const webhookUrl = settingsMap.get('server_lookup_webhook_url');
    const enabled = settingsMap.get('discord_webhook_enabled');

    if (!webhookUrl || enabled !== 'true') return;

    let embedConfig: any = null;
    const rawConfig = settingsMap.get('embed_config_server_lookup');
    if (rawConfig) {
      try { embedConfig = JSON.parse(rawConfig); } catch { /* use defaults */ }
    }

    const serverName = result.hostname || 'Unknown Server';
    const playerCount = result.playerCount ?? result.players?.length ?? 0;
    const maxPlayers = result.maxPlayers ?? 48;
    const gametype = result.gametype || 'N/A';
    const mapname = result.mapname || 'N/A';
    const ownerName = result.ownerName || 'N/A';
    const locale = result.locale || 'N/A';
    const premium = result.premiumTier || 'none';
    const upvotes = result.upvotePower ?? 0;
    const ip = result.ip || 'N/A';
    const onesync = result.onesyncEnabled ? '✅ Enabled' : '❌ Disabled';
    const txAdmin = result.txAdmin || 'N/A';
    const gameBuild = result.enforceGameBuild || 'Default';
    const scriptHook = result.scriptHookAllowed ? '✅ Allowed' : '❌ Blocked';
    const pureLevel = result.pureLevel || 'N/A';
    const tags = result.tags || 'None';
    const serverVersion = result.server || 'Unknown';
    const resourceCount = result.resources?.length ?? 0;
    const projectDesc = result.projectDesc || 'N/A';
    const discordGuildId = result.discordGuildId || 'N/A';
    const queueCount = result.queueCount ?? 'N/A';

    const vars: Record<string, string> = {
      server_name: serverName,
      server_code: serverCode,
      players: String(playerCount),
      player_count: String(playerCount),
      max_players: String(maxPlayers),
      searched_by: searchedBy,
      searched_by_email: searchedByEmail,
      gametype,
      mapname,
      owner: ownerName,
      owner_name: ownerName,
      locale,
      premium,
      premium_tier: premium,
      upvotes: String(upvotes),
      upvote_power: String(upvotes),
      ip,
      server_ip: ip,
      onesync,
      txadmin: txAdmin,
      game_build: gameBuild,
      script_hook: scriptHook,
      pure_level: pureLevel,
      tags,
      server_version: serverVersion,
      resource_count: String(resourceCount),
      project_desc: projectDesc,
      discord_guild_id: discordGuildId,
      queue_count: String(queueCount),
      timestamp: new Date().toISOString(),
    };

    let embed: any;
    let content: string | undefined;

    if (embedConfig && (embedConfig.title || embedConfig.description || embedConfig.fields?.length)) {
      const color = parseInt((embedConfig.color || '#16A34A').replace('#', ''), 16);
      embed = {
        title: replaceVars(embedConfig.title, vars) || '🖥️ Server Lookup',
        color,
        timestamp: new Date().toISOString(),
      };
      if (embedConfig.description) embed.description = replaceVars(embedConfig.description, vars);
      embed.footer = { text: replaceVars(embedConfig.footer || 'CurlyKiddPanel • Server Lookup', vars) };
      if (embedConfig.author_name) {
        embed.author = { name: replaceVars(embedConfig.author_name, vars) };
        if (embedConfig.author_icon_url) embed.author.icon_url = embedConfig.author_icon_url;
      }
      if (embedConfig.thumbnail_url) embed.thumbnail = { url: replaceVars(embedConfig.thumbnail_url, vars) };
      if (embedConfig.image_url) embed.image = { url: replaceVars(embedConfig.image_url, vars) };
      if (embedConfig.fields?.length) {
        embed.fields = embedConfig.fields.map((f: any) => ({
          name: replaceVars(f.name, vars),
          value: replaceVars(f.value, vars),
          inline: f.inline ?? false,
        }));
      } else {
        embed.fields = buildServerFields(vars);
      }
      if (embedConfig.content) content = replaceVars(embedConfig.content, vars);
    } else {
      embed = {
        title: '🖥️ Server Lookup',
        description: `**${serverName}**\nCode: \`${serverCode}\``,
        color: 0x16A34A,
        fields: buildServerFields(vars),
        timestamp: new Date().toISOString(),
        footer: { text: 'CurlyKiddPanel • Server Lookup' },
      };
    }

    const payload: any = {
      username: 'CurlyKiddPanel',
      avatar_url: 'https://svmulnlysrsmxolvgxnw.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png',
      embeds: [embed],
    };
    if (content?.trim()) payload.content = content.trim();

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Server lookup webhook error:', err);
  }
}

function buildServerFields(vars: Record<string, string>) {
  return [
    { name: '🖥️ Server Code', value: `\`${vars.server_code}\``, inline: true },
    { name: '👥 Players', value: `${vars.players}/${vars.max_players}`, inline: true },
    { name: '🎮 Gametype', value: vars.gametype, inline: true },
    { name: '🗺️ Map', value: vars.mapname, inline: true },
    { name: '👑 Owner', value: vars.owner, inline: true },
    { name: '🌍 Locale', value: vars.locale, inline: true },
    { name: '⭐ Premium', value: vars.premium, inline: true },
    { name: '🔺 Upvotes', value: vars.upvotes, inline: true },
    { name: '🔗 IP', value: vars.ip, inline: true },
    { name: '🔄 OneSync', value: vars.onesync, inline: true },
    { name: '🛡️ txAdmin', value: vars.txadmin, inline: true },
    { name: '🏗️ Game Build', value: vars.game_build, inline: true },
    { name: '📦 Resources', value: vars.resource_count, inline: true },
    { name: '🎫 Script Hook', value: vars.script_hook, inline: true },
    { name: '📋 Queue', value: vars.queue_count, inline: true },
    { name: '🔍 Searched By', value: vars.searched_by, inline: true },
    { name: '📧 Email', value: vars.searched_by_email, inline: true },
    { name: '⏰ Timestamp', value: vars.timestamp, inline: true },
    { name: '🔗 Connect', value: `[cfx.re/join/${vars.server_code}](https://cfx.re/join/${vars.server_code})`, inline: false },
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { serverCode, skipWebhook, searchedBy, searchedByEmail } = await req.json();

    if (!serverCode || typeof serverCode !== "string" || serverCode.length < 2) {
      return new Response(
        JSON.stringify({ error: "Invalid server code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitized = serverCode.replace(/[^a-zA-Z0-9]/g, "");

    // Fetch from CFX API
    const cfxRes = await fetch(`${CFX_API}/${sanitized}`, {
      headers: { "User-Agent": "CurlyKiddPanel/1.0" },
    });

    if (!cfxRes.ok) {
      const status = cfxRes.status;
      if (status === 404) {
        return new Response(
          JSON.stringify({ error: "Server not found. Check the server code and try again." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `CFX API returned ${status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const raw = await cfxRes.json();
    const d = raw?.Data || raw;

    // Extract IP and port from connectEndPoints or addr
    let ip: string | null = null;
    let port: number | undefined;
    const endpoints: string[] = d.connectEndPoints || [];
    if (endpoints.length > 0) {
      const ep = endpoints[0];
      const m = ep.match(/^([\d.]+):(\d+)$/);
      if (m) {
        ip = m[1];
        port = parseInt(m[2], 10);
      }
    }
    if (!ip && d.addr) {
      const m2 = String(d.addr).match(/^([\d.]+):(\d+)$/);
      if (m2) {
        ip = m2[1];
        port = parseInt(m2[2], 10);
      }
    }

    const vars = d.vars || {};
    const players = (d.players || []).map((p: any, i: number) => ({
      id: p.id ?? i,
      name: p.name || `Player ${i + 1}`,
      ping: p.ping ?? 0,
      identifiers: p.identifiers || [],
    }));

    // Try fetching direct endpoints for extra data
    let directInfo: any = null;
    let directDynamic: any = null;
    let queueCount: number | null = null;
    let endpointCapabilities = { infoJson: false, dynamicJson: false, playersJson: false };

    if (ip && port) {
      const base = `http://${ip}:${port}`;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);

      try {
        const [infoRes, dynRes] = await Promise.allSettled([
          fetch(`${base}/info.json`, { signal: ctrl.signal }),
          fetch(`${base}/dynamic.json`, { signal: ctrl.signal }),
        ]);

        if (infoRes.status === "fulfilled" && infoRes.value.ok) {
          directInfo = await infoRes.value.json();
          endpointCapabilities.infoJson = true;
        }
        if (dynRes.status === "fulfilled" && dynRes.value.ok) {
          directDynamic = await dynRes.value.json();
          endpointCapabilities.dynamicJson = true;
          if (typeof directDynamic?.queue === "number") queueCount = directDynamic.queue;
        }
      } catch {
        // direct endpoints are optional
      } finally {
        clearTimeout(timeout);
      }
    }

    const result = {
      hostname: d.hostname || vars.sv_projectName || "Unknown Server",
      players,
      playerCount: d.clients ?? d.selfReportedClients ?? players.length,
      maxPlayers: d.sv_maxclients ?? d.svMaxclients ?? 48,
      resources: d.resources || [],
      server: vars.sv_version || d.server || "Unknown",
      vars,
      ip,
      port,
      gametype: d.gametype || vars.gametype || null,
      mapname: d.mapname || null,
      enhancedHostSupport: !!vars.sv_enhancedHostSupport,
      ownerName: d.ownerName || null,
      ownerProfile: d.ownerProfile || null,
      ownerAvatar: d.ownerAvatar || null,
      iconVersion: d.iconVersion ?? null,
      private: !!d.private,
      fallback: !!d.fallback,
      upvotePower: d.upvotePower ?? 0,
      burstPower: d.burstPower ?? 0,
      supportStatus: d.support_status || "unknown",
      lastSeen: d.lastSeen || null,
      locale: vars.locale || null,
      projectName: vars.sv_projectName || null,
      projectDesc: vars.sv_projectDesc || null,
      scriptHookAllowed: vars.sv_scriptHookAllowed === "1",
      enforceGameBuild: vars.sv_enforceGameBuild || null,
      pureLevel: vars.sv_pureLevel || null,
      onesyncEnabled: (vars.onesync_enabled === "true" || vars.sv_onesync === "on"),
      premiumTier: d.premium || "none",
      discordGuildId: vars.discord || null,
      banner: d.bannerDetail || d.banner || null,
      tags: vars.tags || "",
      licenseKeyToken: vars.sv_licenseKeyToken || null,
      txAdmin: vars["txAdmin-version"] || null,
      endpointCapabilities,
      directInfo,
      directDynamic,
      queueCount,
      svMaxclientsRuntime: directDynamic?.sv_maxclients ?? null,
      clientsRuntime: directDynamic?.clients ?? null,
    };

    // Fire webhook in background (don't block response)
    if (!skipWebhook) {
      sendServerLookupWebhook(result, sanitized, searchedBy || 'Unknown', searchedByEmail || 'Unknown')
        .catch(e => console.error('Webhook fire failed:', e));
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

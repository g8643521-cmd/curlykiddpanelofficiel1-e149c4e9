import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";
const SCREENSHAREX_API = "https://screensharex.ac/api/search";
const BATCH_SIZE = 2000;
const FIRST_BATCH_SIZE = 50; // Keep the first visible batch small so real numbers appear fast
const CONCURRENCY = 100;
const FIRST_BATCH_CONCURRENCY = 25;
const STOP_CHECK_INTERVAL = 200; // Check stop every 200 members
const SX_TIMEOUT_MS = 2000;
const SX_MAX_RETRIES = 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DiscordMember {
  joined_at: string;
  user?: {
    id?: string;
    username?: string;
    global_name?: string;
    avatar?: string;
    bot?: boolean;
  };
}

// ── Retry with exponential backoff ──
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const retryAfter = ((body as any).retry_after || 2 ** attempt) * 1000;
        console.log(`Rate limited (attempt ${attempt + 1}), waiting ${retryAfter}ms`);
        await sleep(retryAfter);
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries - 1) {
        const wait = 2 ** attempt * 1000 + Math.random() * 500;
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep(2 ** attempt * 1000 + Math.random() * 500);
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchMemberPage(
  guildId: string,
  botToken: string,
  after: string,
): Promise<DiscordMember[]> {
  const res = await fetchWithRetry(
    `${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`,
    { headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" } },
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error(`Failed to fetch members: ${res.status} ${errText}`);
    return [];
  }
  return await res.json();
}

async function fetchGuildInfo(
  guildId: string,
  botToken: string,
): Promise<{ memberCount: number; icon: string | null }> {
  try {
    const res = await fetchWithRetry(
      `${DISCORD_API}/guilds/${guildId}?with_counts=true`,
      { headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" } },
    );
    if (res.ok) {
      const data = await res.json();
      return { memberCount: data.approximate_member_count || 0, icon: data.icon || null };
    }
  } catch {}
  return { memberCount: 0, icon: null };
}

async function sendWebhookWithRetry(
  webhookUrl: string,
  payload: any,
  maxRetries = 3,
  shouldAbort: (() => Promise<boolean>) | null = null,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (shouldAbort && await shouldAbort()) return false;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok || res.status === 204) return true;
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const retryAfter = ((body as any).retry_after || 2) * 1000;
      await sleep(retryAfter);
      continue;
    }
    console.error(`Webhook failed: ${res.status}`);
    return false;
  }
  return false;
}

async function fetchAllMembers(
  guildId: string,
  botToken: string,
): Promise<DiscordMember[]> {
  const allMembers: DiscordMember[] = [];
  let after = "0";
  while (true) {
    const members = await fetchMemberPage(guildId, botToken, after);
    if (!members || members.length === 0) break;
    allMembers.push(...members);
    after = members[members.length - 1].user!.id!;
    if (members.length < 1000) break;
  }
  return allMembers;
}

async function checkScreenShareX(
  discordId: string,
  apiKey: string,
): Promise<any> {
  for (let attempt = 0; attempt <= SX_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SX_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${SCREENSHAREX_API}?token=${encodeURIComponent(apiKey)}&user_id=${encodeURIComponent(discordId)}`,
        { signal: controller.signal },
      );

      if (res.ok) return await res.json();

      if ((res.status === 429 || res.status >= 500) && attempt < SX_MAX_RETRIES) {
        await sleep(150 * (attempt + 1));
        continue;
      }

      return null;
    } catch {
      if (attempt < SX_MAX_RETRIES) {
        await sleep(150 * (attempt + 1));
        continue;
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

// ── Concurrent API batch check with retry for failures ──
async function checkScreenShareXBatch(
  members: { discordId: string; index: number }[],
  apiKey: string,
): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  
  // Process in concurrent chunks with small delay between chunks to avoid rate limiting
  for (let i = 0; i < members.length; i += CONCURRENCY) {
    const chunk = members.slice(i, i + CONCURRENCY);
    const promises = chunk.map(async ({ discordId }) => {
      const data = await checkScreenShareX(discordId, apiKey);
      return { discordId, data };
    });
    const chunkResults = await Promise.all(promises);
    for (const { discordId, data } of chunkResults) {
      results.set(discordId, data);
    }
    // Small delay between chunks to reduce API pressure
    if (i + CONCURRENCY < members.length) await sleep(25);
  }
  
  return results;
}

function buildCheaterSummary(sxData: any): string[] {
  const summary = sxData.summary || {};
  const parts: string[] = [];
  if (summary.is_flagged) parts.push("Flagged");
  if (summary.total_tickets > 0) parts.push(`${summary.total_tickets} ticket(s)`);
  if (summary.total_tickets_v2 > 0) parts.push(`${summary.total_tickets_v2} SS ticket(s)`);
  if (summary.total_guild_records > 0) parts.push(`${summary.total_guild_records} guild record(s)`);
  if (sxData.bans?.length > 0) parts.push(`${sxData.bans.length} ban(s)`);
  return parts;
}

function hasScreenShareXMatch(sxData: any): boolean {
  if (!sxData || typeof sxData !== "object") return false;

  const summary = sxData.summary || {};
  const tickets = Array.isArray(sxData.tickets) ? sxData.tickets.length : 0;
  const ticketsV2 = Array.isArray(sxData.tickets_v2) ? sxData.tickets_v2.length : 0;
  const guildJoinLeave = Array.isArray(sxData.guild_join_leave) ? sxData.guild_join_leave.length : 0;
  const confirmedUser = Array.isArray(sxData.confirmed_user) ? sxData.confirmed_user.length : 0;
  const bans = Array.isArray(sxData.bans) ? sxData.bans.length : 0;

  return sxData.found === true ||
    sxData.flagged === true ||
    summary.is_flagged === true ||
    tickets > 0 ||
    ticketsV2 > 0 ||
    guildJoinLeave > 0 ||
    confirmedUser > 0 ||
    bans > 0 ||
    Number(summary.total_tickets || 0) > 0 ||
    Number(summary.total_tickets_v2 || 0) > 0 ||
    Number(summary.total_guild_records || 0) > 0;
}

async function saveDetectedCheater(sb: any, sxData: any, member: DiscordMember, server: any) {
  const parts = buildCheaterSummary(sxData);
  await sb.from("bot_detected_cheaters").upsert(
    {
      discord_user_id: member.user!.id!,
      discord_username: member.user?.global_name || member.user?.username || null,
      discord_avatar: member.user?.avatar || null,
      guild_id: server.guild_id,
      guild_name: server.guild_name || null,
      is_flagged: (sxData.summary || {}).is_flagged === true,
      total_bans: sxData.bans?.length || 0,
      total_tickets: ((sxData.summary || {}).total_tickets || 0) + ((sxData.summary || {}).total_tickets_v2 || 0),
      summary_text: parts.join(" • ") || "Found in database",
      detected_at: new Date().toISOString(),
    },
    { onConflict: "discord_user_id,guild_id", ignoreDuplicates: false },
  );
}

const STOP_SCAN_MARKER = "__manual_scan_stop__";

function buildStopScanMarker(scanKey: string) {
  return `${STOP_SCAN_MARKER}:${scanKey}`;
}

async function hasStopRequest(sb: any, guildId: string, scanKey: string): Promise<boolean> {
  const { data } = await sb
    .from("discord_alerted_members")
    .select("id")
    .eq("guild_id", guildId)
    .eq("discord_user_id", buildStopScanMarker(scanKey))
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function buildStoppedResponse(
  server: any, checked: number, skipped: number, alerts: number, guildTotalMembers: number,
  supabase?: any, scanStartedAt?: string, fullScan?: boolean, bgScanHistoryId?: string | null,
) {
  const webhookUrl = server.manual_webhook_url || server.webhook_url;
  const finishedAt = new Date();
  
  if (supabase && scanStartedAt) {
    const durationSeconds = Math.round((finishedAt.getTime() - new Date(scanStartedAt).getTime()) / 1000);
    if (bgScanHistoryId) {
      // Background scan: update existing record
      await supabase.from("scan_history").update({
        total_checked: checked,
        total_skipped: skipped,
        total_alerts: alerts,
        total_members: guildTotalMembers || (checked + skipped),
        duration_seconds: durationSeconds,
        status: "stopped",
        finished_at: finishedAt.toISOString(),
      }).eq("id", bgScanHistoryId);
    } else {
      // Frontend scan: insert new record
      const { error: shErr } = await supabase.from("scan_history").insert({
        server_id: server.id,
        guild_id: server.guild_id,
        guild_name: server.guild_name || null,
        user_id: server.user_id,
        scan_type: fullScan ? "full" : "auto",
        total_checked: checked,
        total_skipped: skipped,
        total_alerts: alerts,
        total_members: guildTotalMembers || (checked + skipped),
        duration_seconds: durationSeconds,
        status: "stopped",
        started_at: scanStartedAt,
        finished_at: finishedAt.toISOString(),
      });
      if (shErr) console.error("Failed to save scan history (stopped):", shErr);
    }
  }

  if (webhookUrl) {
    await sendWebhookWithRetry(webhookUrl, buildScanStoppedEmbed(server, finishedAt.toISOString()));
  }
  return new Response(
    JSON.stringify({ success: true, stopped: true, checked, skipped, alerts, guildTotalMembers }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function buildScanStoppedEmbed(server: any, stoppedAt: string) {
  return {
    embeds: [{
      title: "🛑 Full Scan Stopped",
      description: `The manual full scan for **${server.guild_name || server.guild_id}** was stopped by the user.`,
      color: 0xf59e0b,
      fields: [
        { name: "Server", value: server.guild_name || server.guild_id, inline: true },
        { name: "Status", value: "Stopped manually", inline: true },
      ],
      footer: { text: "CurlyKidd Panel • Full Scan" },
      timestamp: stoppedAt,
    }],
    username: "CurlyKidd Bot",
  };
}

// ── Batch insert member joins ──
async function batchInsertMemberJoins(sb: any, records: any[]) {
  if (records.length === 0) return;
  // Insert in chunks of 500 for speed
  const promises: Promise<void>[] = [];
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    promises.push(
      sb.from("discord_member_joins").insert(chunk)
        .then(({ error }: any) => { if (error) console.error(`Join insert chunk ${i}:`, error); })
    );
  }
  await Promise.all(promises);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth gate: require admin or owner for user-triggered calls,
    // but allow internal background batch chaining via service role auth ──
    const authHeader = req.headers.get("Authorization");
    const SUPABASE_URL_AUTH = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY_AUTH = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY_AUTH = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isInternalServiceCall = !!authHeader && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY_AUTH}`;

    if (!isInternalServiceCall) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(SUPABASE_URL_AUTH, SUPABASE_ANON_KEY_AUTH, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminCheckClient = createClient(SUPABASE_URL_AUTH, SUPABASE_SERVICE_ROLE_KEY_AUTH, { auth: { persistSession: false } });
      const { data: roleRow } = await adminCheckClient
        .from("user_roles").select("role").eq("user_id", userData.user.id)
        .in("role", ["admin", "owner"]).maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action || null;
    const requestedServerId =
      typeof body?.serverId === "string" && body.serverId.trim().length > 0
        ? body.serverId.trim() : null;
    const fullScan = body?.fullScan === true;
    const afterCursor: string = body?.afterCursor || "0";
    const memberOffset: number = typeof body?.memberOffset === "number" ? body.memberOffset : 0;
    const requestedScanId =
      typeof body?.scanId === "string" && body.scanId.trim().length > 0
        ? body.scanId.trim() : null;
    const cumulativeChecked: number = typeof body?.cumulativeChecked === "number" ? body.cumulativeChecked : 0;
    const cumulativeSkipped: number = typeof body?.cumulativeSkipped === "number" ? body.cumulativeSkipped : 0;
    const cumulativeAlerts: number = typeof body?.cumulativeAlerts === "number" ? body.cumulativeAlerts : 0;
    const cumulativeFailed: number = typeof body?.cumulativeFailed === "number" ? body.cumulativeFailed : 0;
    const bgScanHistoryId: string | null = typeof body?._bgScanHistoryId === "string" ? body._bgScanHistoryId : null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const [{ data: botTokenSetting }, { data: apiKeySetting2 }] = await Promise.all([
      supabase.from("admin_settings").select("value").eq("key", "discord_bot_token").maybeSingle(),
      supabase.from("admin_settings").select("value").eq("key", "screensharex_api_key").maybeSingle(),
    ]);
    const DISCORD_BOT_TOKEN = botTokenSetting?.value || Deno.env.get("DISCORD_BOT_TOKEN");

    // ── list-guilds action ──
    if (action === "list-guilds") {
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN is not configured. Set it in Admin Panel → API Keys." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const allGuilds: any[] = [];
      let after: string | undefined = undefined;
      while (true) {
        const url = after
          ? `${DISCORD_API}/users/@me/guilds?limit=200&after=${after}`
          : `${DISCORD_API}/users/@me/guilds?limit=200`;
        const res = await fetchWithRetry(url, { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
        if (!res.ok) {
          const errText = await res.text();
          return new Response(
            JSON.stringify({ success: false, error: `Discord API error: ${res.status} ${errText}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const guilds = (await res.json()) as any[];
        allGuilds.push(...guilds);
        if (guilds.length < 200) break;
        after = guilds[guilds.length - 1].id;
      }
      const guildList = allGuilds.map((g: any) => ({
        id: g.id, name: g.name, icon: g.icon, member_count: g.approximate_member_count || null,
      }));
      return new Response(
        JSON.stringify({ success: true, guilds: guildList }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── create-webhook action ──
    // Creates 3 channels: auto-scan, full-scan, info + webhooks for the first two
    if (action === "create-webhook") {
      const targetGuildId = body?.guildId;
      if (!targetGuildId) {
        return new Response(
          JSON.stringify({ success: false, error: "guildId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN is not configured." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Fetch existing guild channels
      const channelsRes = await fetchWithRetry(
        `${DISCORD_API}/guilds/${targetGuildId}/channels`,
        { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
      );
      if (!channelsRes.ok) {
        const errText = await channelsRes.text();
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch channels: ${channelsRes.status} ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const existingChannels = (await channelsRes.json()) as any[];

      // Helper: find or create a text channel
      const skippedChannels: string[] = [];
      const createdChannels: string[] = [];

      async function findOrCreateChannel(name: string, topic: string): Promise<{ id: string; name: string; existed: boolean }> {
        const existing = existingChannels.find((c: any) => c.type === 0 && c.name === name);
        if (existing) {
          skippedChannels.push(name);
          return { id: existing.id, name: existing.name, existed: true };
        }

        const createRes = await fetchWithRetry(
          `${DISCORD_API}/guilds/${targetGuildId}/channels`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name, type: 0, topic }),
          },
        );
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Failed to create #${name}: ${createRes.status} ${errText}`);
        }
        const ch = await createRes.json() as any;
        createdChannels.push(name);
        return { id: ch.id, name: ch.name, existed: false };
      }

      // Helper: find existing webhook or create one in a channel
      async function findOrCreateWebhook(channelId: string, webhookName: string): Promise<string> {
        const listRes = await fetchWithRetry(
          `${DISCORD_API}/channels/${channelId}/webhooks`,
          { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
        );
        if (listRes.ok) {
          const webhooks = await listRes.json() as any[];
          const existing = webhooks.find((w: any) => w.name === webhookName && w.token);
          if (existing) {
            return `https://discord.com/api/webhooks/${existing.id}/${existing.token}`;
          }
        }

        const res = await fetchWithRetry(
          `${DISCORD_API}/channels/${channelId}/webhooks`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: webhookName }),
          },
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to create webhook in channel ${channelId}: ${res.status} ${errText}`);
        }
        const wh = await res.json() as any;
        return `https://discord.com/api/webhooks/${wh.id}/${wh.token}`;
      }

      try {
        // 1. Auto-scan channel + webhook
        const autoScanChannel = await findOrCreateChannel("auto-scan-alerts", "Automatic scan alerts from CurlyKidd Bot");
        const autoScanWebhookUrl = await findOrCreateWebhook(autoScanChannel.id, "CurlyKidd Auto-Scan");

        // 2. Full-scan channel + webhook
        const fullScanChannel = await findOrCreateChannel("full-scan-alerts", "Full scan alerts from CurlyKidd Bot");
        const fullScanWebhookUrl = await findOrCreateWebhook(fullScanChannel.id, "CurlyKidd Full-Scan");

        // 3. Info channel (no webhook needed)
        const infoChannel = await findOrCreateChannel("curlykidd-info", "Server info & stats from CurlyKidd Bot");

        const allExisted = skippedChannels.length === 3 && createdChannels.length === 0;

        const BOT_LOGO = "https://ucjpepubcxhtjxumowwj.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png";

        const baseEmbed = {
          color: 0x00D9A3,
          thumbnail: { url: BOT_LOGO },
          timestamp: new Date().toISOString(),
          footer: { text: "CurlyKidd Panel  •  Security & Protection", icon_url: BOT_LOGO },
          author: { name: "CurlyKidd Anti-Cheat", icon_url: BOT_LOGO },
        };

        // Channel IDs encoded in custom_id so the interaction handler knows what to delete
        const channelPayload = [autoScanChannel.id, fullScanChannel.id, infoChannel.id].join(",");

        const actionButtons = [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: "Contact Support",
                emoji: { name: "📩" },
                custom_id: `curlykidd_support_${targetGuildId}`,
              },
              {
                type: 2,
                style: 4,
                label: "Delete All Channels",
                emoji: { name: "🗑️" },
                custom_id: `curlykidd_delete_${channelPayload}`,
              },
            ],
          },
        ];

        // Only post welcome messages if channels were newly created
        if (!allExisted) {
        // ── Auto-Scan channel message ──
        await fetchWithRetry(
          `${DISCORD_API}/channels/${autoScanChannel.id}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                ...baseEmbed,
                title: "Auto-Scan Alerts",
                description: [
                  "This channel has been configured for **real-time automatic scanning**.",
                  "",
                  "Every minute, new members joining your server are automatically checked against the CurlyKidd cheater database. If a flagged account is detected, an alert will appear here immediately.",
                  "",
                  "```",
                  "  ✦  Real-time cheater detection",
                  "  ✦  Automatic member screening",
                  "  ✦  Ban & ticket history reports",
                  "```",
                ].join("\n"),
                fields: [
                  { name: "Scan Frequency", value: "`Every 1 minute`", inline: true },
                  { name: "Alert Type", value: "`Auto-Scan`", inline: true },
                  { name: "Status", value: "🟢 Active", inline: true },
                ],
              }],
              components: actionButtons,
            }),
          },
        );

        // ── Full-Scan channel message ──
        await fetchWithRetry(
          `${DISCORD_API}/channels/${fullScanChannel.id}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                ...baseEmbed,
                title: "Full-Scan Reports",
                description: [
                  "This channel receives **comprehensive server scan reports**.",
                  "",
                  "When a full scan is triggered from the CurlyKidd Panel, every member in your server is checked against the database. The detailed results — including flagged accounts, ban histories, and statistics — are posted here.",
                  "",
                  "```",
                  "  ✦  Complete member analysis",
                  "  ✦  Detailed ban history per user",
                  "  ✦  Summary statistics & flagged accounts",
                  "```",
                ].join("\n"),
                fields: [
                  { name: "Scan Type", value: "`Manual Full-Scan`", inline: true },
                  { name: "Alert Type", value: "`Full-Scan`", inline: true },
                  { name: "Status", value: "🟢 Ready", inline: true },
                ],
              }],
              components: actionButtons,
            }),
          },
        );

        // ── Info channel message ──
        await fetchWithRetry(
          `${DISCORD_API}/channels/${infoChannel.id}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                ...baseEmbed,
                title: "CurlyKidd Bot — Setup Complete",
                description: [
                  "Your server is now fully connected to the **CurlyKidd Anti-Cheat Panel**.",
                  "",
                  "The following channels have been created automatically:",
                  "",
                  "📡  <#" + autoScanChannel.id + ">  —  Real-time auto-scan alerts",
                  "🔍  <#" + fullScanChannel.id + ">  —  Full server scan reports",
                  "📋  <#" + infoChannel.id + ">  —  Info & announcements",
                  "",
                  "Everything is configured and ready. Manage your server from the [CurlyKidd Dashboard](https://curlykiddpanel.lovable.app/bot).",
                ].join("\n"),
                fields: [
                  { name: "Dashboard", value: "[Open Panel](https://curlykiddpanel.lovable.app/bot)", inline: true },
                  { name: "Protection", value: "🟢 Active", inline: true },
                  { name: "Channels", value: "`3 created`", inline: true },
                ],
              }],
              components: actionButtons,
            }),
          },
        );
        } // end if (!allExisted)

        return new Response(
          JSON.stringify({
            success: true,
            all_existed: allExisted,
            skipped_channels: skippedChannels,
            created_channels: createdChannels,
            webhook_url: autoScanWebhookUrl,
            auto_scan_webhook_url: autoScanWebhookUrl,
            full_scan_webhook_url: fullScanWebhookUrl,
            info_channel_id: infoChannel.id,
            channels: {
              auto_scan: autoScanChannel,
              full_scan: fullScanChannel,
              info: infoChannel,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, error: err.message || "Failed to setup channels" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── fetch-roles action ──
    if (action === "fetch-roles") {
      const targetGuildId = body?.guildId;
      if (!targetGuildId || !DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "guildId and bot token required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const rolesRes = await fetchWithRetry(
        `${DISCORD_API}/guilds/${targetGuildId}/roles`,
        { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
      );
      if (!rolesRes.ok) {
        const errText = await rolesRes.text();
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch roles: ${rolesRes.status} ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const roles = await rolesRes.json();
      return new Response(
        JSON.stringify({ success: true, roles }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── fetch-icons action ──
    if (action === "fetch-icons") {
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN is not configured." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: servers } = await supabase
        .from("discord_bot_servers").select("id, guild_id, guild_icon, member_count");
      if (!servers || servers.length === 0) {
        return new Response(JSON.stringify({ success: true, updated: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let updated = 0;
      for (const srv of servers) {
        const info = await fetchGuildInfo(srv.guild_id, DISCORD_BOT_TOKEN);
        const updateData: any = {};
        if (info.icon) updateData.guild_icon = info.icon;
        if (info.memberCount > 0) updateData.member_count = info.memberCount;
        if (Object.keys(updateData).length > 0) {
          await supabase.from("discord_bot_servers").update(updateData).eq("id", srv.id);
          updated++;
        }
      }
      return new Response(JSON.stringify({ success: true, updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── guild-info action (fast pre-scan metadata) ──
    if (action === "guild-info") {
      if (!requestedServerId) {
        return new Response(
          JSON.stringify({ success: false, error: "serverId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: srv } = await supabase
        .from("discord_bot_servers").select("guild_id, guild_name, member_count").eq("id", requestedServerId).maybeSingle();
      if (!srv) {
        return new Response(
          JSON.stringify({ success: false, error: "Server not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const info = await fetchGuildInfo(srv.guild_id, DISCORD_BOT_TOKEN);
      // Update member count in DB (fire-and-forget)
      if (info.memberCount > 0) {
        supabase.from("discord_bot_servers").update({ member_count: info.memberCount }).eq("id", requestedServerId);
      }
      return new Response(
        JSON.stringify({
          success: true,
          guildId: srv.guild_id,
          guildName: srv.guild_name,
          memberCount: info.memberCount || srv.member_count || 0,
          icon: info.icon,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── background-scan action (persistent server-side scan) ──
    if (action === "background-scan") {
      if (!requestedServerId) {
        return new Response(
          JSON.stringify({ success: false, error: "serverId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const screensharexApiKey = apiKeySetting2?.value;
      if (!screensharexApiKey) {
        return new Response(
          JSON.stringify({ success: false, error: "CurlyKidd API key not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: server } = await supabase
        .from("discord_bot_servers").select("*").eq("id", requestedServerId).eq("is_active", true).maybeSingle();
      if (!server) {
        return new Response(
          JSON.stringify({ success: false, error: "Server not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const scanStartedAt = new Date().toISOString();
      const scanId = requestedScanId || crypto.randomUUID();

      // Fetch guild info for accurate member count
      const guildInfo = await fetchGuildInfo(server.guild_id, DISCORD_BOT_TOKEN);
      const memberCount = guildInfo.memberCount || server.member_count || 0;

      // Update guild icon/member count in DB
      if (guildInfo.icon || memberCount > 0) {
        const upd: any = {};
        if (guildInfo.icon) upd.guild_icon = guildInfo.icon;
        if (memberCount > 0) upd.member_count = memberCount;
        supabase.from("discord_bot_servers").update(upd).eq("id", server.id);
      }

      // Create scan_history record with status='running'
      const { data: scanRecord, error: insertErr } = await supabase.from("scan_history").insert({
        server_id: server.id,
        guild_id: server.guild_id,
        guild_name: server.guild_name || null,
        user_id: server.user_id,
        scan_type: "full",
        status: "running",
        total_members: memberCount,
        total_checked: 0,
        total_skipped: 0,
        total_alerts: 0,
        total_failed: 0,
        duration_seconds: 0,
        started_at: scanStartedAt,
        finished_at: scanStartedAt,
      }).select("id").single();

      if (insertErr || !scanRecord) {
        console.error("Failed to create scan record:", insertErr);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create scan record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const functionUrl = `${SUPABASE_URL}/functions/v1/discord-member-check`;
      const initialScanPayload = {
        _bgScanHistoryId: scanRecord.id,
        serverId: server.id,
        fullScan: true,
        afterCursor: "0",
        memberOffset: 0,
        scanStartedAt,
        scanId,
        guildTotalMembers: memberCount,
        cumulativeChecked: 0,
        cumulativeSkipped: 0,
        cumulativeAlerts: 0,
        cumulativeFailed: 0,
      };

      EdgeRuntime.waitUntil((async () => {
        try {
          if (!SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in edge runtime");
          }
          const initialBatchResponse = await fetch(functionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "apikey": SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify(initialScanPayload),
          });

          const initialBatchText = await initialBatchResponse.text();
          let initialBatchData: any = {};
          try {
            initialBatchData = initialBatchText ? JSON.parse(initialBatchText) : {};
          } catch {
            initialBatchData = {};
          }

          if (!initialBatchResponse.ok || initialBatchData?.success === false) {
            throw new Error(initialBatchData?.error || `Initial scan batch failed (${initialBatchResponse.status}): ${initialBatchText.slice(0, 200)}`);
          }
        } catch (error) {
          console.error("Initial background scan batch failed:", error);
          await supabase.from("scan_history").update({
            status: "failed",
            finished_at: new Date().toISOString(),
          }).eq("id", scanRecord.id);
        }
      })());

      return new Response(
        JSON.stringify({
          success: true,
          scanHistoryId: scanRecord.id,
          scanId,
          memberCount,
          scanStartedAt,
          guildId: server.guild_id,
          initialChecked: 0,
          initialSkipped: 0,
          initialAlerts: 0,
          initialFailed: 0,
          initialBatchJoins: [],
          status: "running",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── verify-ownership action ──
    // Check if a Discord user has MANAGE_GUILD or ADMINISTRATOR permission in a guild
    if (action === "verify-ownership") {
      const discordUserId = typeof body?.discordUserId === "string" ? body.discordUserId.trim() : null;
      const targetGuildId = typeof body?.guildId === "string" ? body.guildId.trim() : null;
      if (!discordUserId || !targetGuildId) {
        return new Response(
          JSON.stringify({ success: false, error: "discordUserId and guildId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN is not configured." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        const memberRes = await fetchWithRetry(
          `${DISCORD_API}/guilds/${targetGuildId}/members/${discordUserId}`,
          { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" } },
        );
        if (!memberRes.ok) {
          const errText = await memberRes.text();
          return new Response(
            JSON.stringify({ success: false, verified: false, error: `User not found in server (${memberRes.status})` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const memberData = await memberRes.json();
        // Fetch guild roles to check permissions
        const rolesRes = await fetchWithRetry(
          `${DISCORD_API}/guilds/${targetGuildId}/roles`,
          { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" } },
        );
        let hasAdmin = false;
        if (rolesRes.ok) {
          const roles = await rolesRes.json();
          const memberRoleIds = new Set(memberData.roles || []);
          // Check guild owner
          const guildRes = await fetchWithRetry(
            `${DISCORD_API}/guilds/${targetGuildId}`,
            { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" } },
          );
          if (guildRes.ok) {
            const guildData = await guildRes.json();
            if (guildData.owner_id === discordUserId) {
              hasAdmin = true;
            }
          }
          if (!hasAdmin) {
            // ADMINISTRATOR = 0x8, MANAGE_GUILD = 0x20
            for (const role of roles) {
              if (memberRoleIds.has(role.id)) {
                const perms = BigInt(role.permissions);
                if ((perms & BigInt(0x8)) !== BigInt(0) || (perms & BigInt(0x20)) !== BigInt(0)) {
                  hasAdmin = true;
                  break;
                }
              }
            }
          }
        }
        const username = memberData.user?.global_name || memberData.user?.username || null;
        const avatar = memberData.user?.avatar || null;
        return new Response(
          JSON.stringify({ success: true, verified: hasAdmin, username, avatar, discordUserId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Verification failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (action === "stop-scan") {
      if (!requestedServerId) {
        return new Response(
          JSON.stringify({ success: false, error: "serverId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const scanStartedAt = typeof body?.scanStartedAt === "string" && body.scanStartedAt
        ? body.scanStartedAt : new Date().toISOString();
      const stopScanKey = requestedScanId || scanStartedAt;
      const { data: server } = await supabase
        .from("discord_bot_servers")
        .select("id, guild_id, guild_name, webhook_url, manual_webhook_url")
        .eq("id", requestedServerId).maybeSingle();
      if (!server) {
        return new Response(
          JSON.stringify({ success: false, error: "Server not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await supabase.from("discord_alerted_members").insert({
        guild_id: server.guild_id,
        discord_user_id: buildStopScanMarker(stopScanKey),
        joined_at: scanStartedAt,
        alerted_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── verify-alerts action ──
    // After a scan, verify all flagged members were delivered to the webhook channel
    if (action === "verify-alerts") {
      if (!requestedServerId) {
        return new Response(
          JSON.stringify({ success: false, error: "serverId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!DISCORD_BOT_TOKEN) {
        return new Response(
          JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: server } = await supabase
        .from("discord_bot_servers")
        .select("*")
        .eq("id", requestedServerId)
        .maybeSingle();
      if (!server) {
        return new Response(
          JSON.stringify({ success: false, error: "Server not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const webhookUrl = server.manual_webhook_url || server.webhook_url;
      if (!webhookUrl) {
        return new Response(
          JSON.stringify({ success: true, verified: 0, missing: 0, resent: 0, message: "No webhook configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Get all detected cheaters for this guild from the scan
      const scanStartedAt = body?.scanStartedAt || null;
      let cheaterQuery = supabase
        .from("bot_detected_cheaters")
        .select("discord_user_id, discord_username, discord_avatar, summary_text, is_flagged, total_bans, total_tickets")
        .eq("guild_id", server.guild_id);
      if (scanStartedAt) {
        cheaterQuery = cheaterQuery.gte("detected_at", scanStartedAt);
      }
      const { data: detectedCheaters } = await cheaterQuery;

      if (!detectedCheaters || detectedCheaters.length === 0) {
        return new Response(
          JSON.stringify({ success: true, verified: 0, missing: 0, resent: 0, message: "No flagged members to verify" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Check which flagged members were already alerted (recorded in discord_alerted_members table)
      const cheaterIds = detectedCheaters.map((c) => c.discord_user_id);
      const { data: alertedMembers } = await supabase
        .from("discord_alerted_members")
        .select("discord_user_id")
        .eq("guild_id", server.guild_id)
        .in("discord_user_id", cheaterIds);

      const alertedSet = new Set((alertedMembers || []).map((a: any) => a.discord_user_id));

      // Find missing cheaters (not in alerted_members table)
      const missingCheaters = detectedCheaters.filter(
        (c) => !alertedSet.has(c.discord_user_id),
      );

      let resent = 0;

      // Build verification summary embed
      const summaryEmbed = {
        title: "🔄 Webhook Verification Complete",
        description: `Verified all flagged members are in the channel for **${server.guild_name || server.guild_id}**`,
        color: missingCheaters.length > 0 ? 0xf59e0b : 0x00d4aa,
        fields: [
          { name: "✅ Already alerted", value: `${detectedCheaters.length - missingCheaters.length}`, inline: true },
          { name: "❌ Missing", value: `${missingCheaters.length}`, inline: true },
          { name: "📤 Resent", value: `${missingCheaters.length}`, inline: true },
        ],
        footer: { text: "CurlyKidd Panel • Post-Scan Verification" },
        timestamp: new Date().toISOString(),
      };

      if (missingCheaters.length > 0) {
        // Re-send missing alerts via webhook, append summary to last batch
        const batches: typeof missingCheaters[] = [];
        for (let i = 0; i < missingCheaters.length; i += 9) {
          batches.push(missingCheaters.slice(i, i + 9));
        }

        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b];
          const embeds = batch.map((c) => {
            const isFlagged = c.is_flagged === true;
            const hasBans = (c.total_bans || 0) > 0;
            const alertColor = isFlagged || hasBans ? 0xff4444 : 0xffaa00;
            const alertTitle = isFlagged || hasBans ? "🔴 Cheater Detected (Resent)" : "🟡 Player Found in Database (Resent)";
            const avatarUrl = c.discord_avatar
              ? `https://cdn.discordapp.com/avatars/${c.discord_user_id}/${c.discord_avatar}.${c.discord_avatar.startsWith("a_") ? "gif" : "png"}?size=128`
              : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(c.discord_user_id) % BigInt(5))}.png`;
            return {
              title: alertTitle,
              description: `A flagged player is in **${server.guild_name || "your server"}**`,
              color: alertColor,
              thumbnail: { url: avatarUrl },
              fields: [
                { name: "👤 Player", value: `<@${c.discord_user_id}>`, inline: true },
                { name: "💬 Discord ID", value: `\`${c.discord_user_id}\``, inline: true },
                { name: "📝 Summary", value: c.summary_text || "Found in database", inline: false },
              ],
              author: { name: c.discord_username || "Unknown", icon_url: avatarUrl },
              footer: { text: "CurlyKidd Panel • Verification Resend" },
              timestamp: new Date().toISOString(),
            };
          });

          // Append summary to the last batch
          const isLastBatch = b === batches.length - 1;
          if (isLastBatch) {
            summaryEmbed.fields[2].value = `${resent + batch.length}`;
            embeds.push(summaryEmbed as any);
          }

          const sent = await sendWebhookWithRetry(webhookUrl, { embeds, username: "CurlyKidd Bot" });
          if (sent) resent += batch.length;
        }
      } else {
        // No missing — just send the summary
        await sendWebhookWithRetry(webhookUrl, {
          embeds: [summaryEmbed],
          username: "CurlyKidd Bot",
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: detectedCheaters.length,
          inChannel: detectedCheaters.length - missingCheaters.length,
          missing: missingCheaters.length,
          resent,
          missingUsers: missingCheaters.map((c) => ({ id: c.discord_user_id, name: c.discord_username })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!DISCORD_BOT_TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: "DISCORD_BOT_TOKEN is not configured. Set it in Admin Panel → API Keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const screensharexApiKey = apiKeySetting2?.value;
    if (!screensharexApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "CurlyKidd API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Auto-scan (no serverId) ──
    if (!requestedServerId) {
      const { data: servers } = await supabase
        .from("discord_bot_servers").select("*").eq("is_active", true);
      if (!servers || servers.length === 0) {
        return new Response(
          JSON.stringify({ success: true, checked: 0, skipped: 0, alerts: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let totalAlerts = 0, totalChecked = 0, totalSkipped = 0;

      for (const server of servers) {
        try {
          const members = await fetchAllMembers(server.guild_id, DISCORD_BOT_TOKEN);
          const lastChecked = new Date(server.last_checked_at || "2000-01-01T00:00:00.000Z");
          const newMembers = members.filter((m) => new Date(m.joined_at) > lastChecked);

          await supabase.from("discord_bot_servers")
            .update({ last_checked_at: new Date().toISOString() }).eq("id", server.id);

          if (newMembers.length === 0) {
            totalSkipped += members.length;
            continue;
          }

          const { data: alertedMembers } = await supabase
            .from("discord_alerted_members")
            .select("discord_user_id, joined_at").eq("guild_id", server.guild_id);
          const alertedSet = new Set<string>(
            (alertedMembers || []).map((row: any) => `${row.discord_user_id}:${row.joined_at}`),
          );

          // Filter to only members that need checking
          const toCheck: { member: DiscordMember; discordId: string }[] = [];
          for (const member of newMembers) {
            const discordId = member.user?.id;
            if (!discordId || member.user?.bot) { totalSkipped++; continue; }
            const joinKey = `${discordId}:${member.joined_at}`;
            if (alertedSet.has(joinKey)) { totalSkipped++; continue; }
            toCheck.push({ member, discordId });
          }

          // Batch concurrent SX checks
          const sxResults = await checkScreenShareXBatch(
            toCheck.map((m, i) => ({ discordId: m.discordId, index: i })),
            screensharexApiKey,
          );

          const joinRecords: any[] = [];
          for (const { member, discordId } of toCheck) {
            totalChecked++;
            const sxData = sxResults.get(discordId);
            const isCheater = hasScreenShareXMatch(sxData);

            joinRecords.push({
              discord_user_id: discordId,
              discord_username: member.user?.global_name || member.user?.username || null,
              discord_avatar: member.user?.avatar || null,
              guild_id: server.guild_id,
              guild_name: server.guild_name || null,
              is_cheater: isCheater,
            });

            if (isCheater) {
              const embed = buildEmbed(sxData, member, server);
              const sent = await sendWebhookWithRetry(server.webhook_url, embed);
              if (sent) {
                totalAlerts++;
                supabase.from("discord_alerted_members").upsert({
                  guild_id: server.guild_id, discord_user_id: discordId,
                  joined_at: member.joined_at, alerted_at: new Date().toISOString(),
                }, { onConflict: "guild_id,discord_user_id", ignoreDuplicates: false });
                saveDetectedCheater(supabase, sxData, member, server);
              }
            }
          }

          // Batch insert all join records
          await batchInsertMemberJoins(supabase, joinRecords);
        } catch (err) {
          console.error(`Error checking guild ${server.guild_id}:`, err);
        }
      }

      return new Response(
        JSON.stringify({ success: true, checked: totalChecked, skipped: totalSkipped, alerts: totalAlerts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Manual scan (with serverId) ──
    const { data: servers, error: serverErr } = await supabase
      .from("discord_bot_servers").select("*").eq("is_active", true).eq("id", requestedServerId);

    if (serverErr || !servers || servers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, done: true, checked: 0, skipped: 0, alerts: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const server = servers[0];
    const scanStartedAt = body?.scanStartedAt || new Date().toISOString();
    const stopScanKey = requestedScanId || scanStartedAt;

    if (fullScan && (await hasStopRequest(supabase, server.guild_id, stopScanKey))) {
      return await buildStoppedResponse(server, 0, 0, 0, body?.guildTotalMembers || 0, supabase, scanStartedAt, fullScan, bgScanHistoryId);
    }

    let guildTotalMembers = body?.guildTotalMembers || 0;

    // Parallelize: fetch members + guild info (first batch) + stop check + alertedSet simultaneously
    const isFirstBatch = afterCursor === "0" && memberOffset === 0;
    
    const alertedSetPromise = fullScan
      ? supabase
          .from("discord_alerted_members")
          .select("discord_user_id")
          .eq("guild_id", server.guild_id)
          .gte("alerted_at", scanStartedAt)
      : supabase
          .from("discord_alerted_members")
          .select("discord_user_id, joined_at")
          .eq("guild_id", server.guild_id);

    const [members, guildInfoResult, stopResult, alertedResult] = await Promise.all([
      fetchMemberPage(server.guild_id, DISCORD_BOT_TOKEN, afterCursor),
      isFirstBatch ? fetchGuildInfo(server.guild_id, DISCORD_BOT_TOKEN) : Promise.resolve(null),
      fullScan ? hasStopRequest(supabase, server.guild_id, stopScanKey) : Promise.resolve(false),
      alertedSetPromise,
    ]);

    if (stopResult) {
      return await buildStoppedResponse(server, 0, 0, 0, guildTotalMembers, supabase, scanStartedAt, fullScan, bgScanHistoryId);
    }

    if (guildInfoResult) {
      guildTotalMembers = guildInfoResult.memberCount;
      const updateData: any = {};
      if (guildInfoResult.icon) updateData.guild_icon = guildInfoResult.icon;
      if (guildInfoResult.memberCount > 0) updateData.member_count = guildInfoResult.memberCount;
      if (Object.keys(updateData).length > 0) {
        supabase.from("discord_bot_servers").update(updateData).eq("id", server.id); // fire-and-forget
      }
    }

    if (members.length === 0) {
      return new Response(
        JSON.stringify({ success: true, done: true, checked: 0, skipped: 0, alerts: 0, totalMembers: 0, guildTotalMembers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build alerted set from parallel fetch
    let alertedSet: Set<string>;
    const alertedMembers = alertedResult.data || [];
    if (fullScan) {
      alertedSet = new Set<string>(
        alertedMembers
          .filter((row: any) => !row.discord_user_id.startsWith(STOP_SCAN_MARKER))
          .map((row: any) => row.discord_user_id),
      );
    } else {
      alertedSet = new Set<string>(
        alertedMembers.map((row: any) => `${row.discord_user_id}:${row.joined_at}`),
      );
    }

    let totalChecked = 0, totalSkipped = 0, totalAlerts = 0, totalFailed = 0, processed = 0;

    const shouldStopFullScan = fullScan
      ? () => hasStopRequest(supabase, server.guild_id, stopScanKey)
      : null;

    // Use smaller batch for first call to get results back faster
    const isFirstBatchCall = afterCursor === "0" && memberOffset === 0;
    const currentBatchLimit = isFirstBatchCall ? FIRST_BATCH_SIZE : BATCH_SIZE;
    const currentConcurrency = isFirstBatchCall ? FIRST_BATCH_CONCURRENCY : CONCURRENCY;

    // Pre-filter members to check in this batch
    const membersToProcess: { member: DiscordMember; discordId: string; originalIndex: number }[] = [];
    for (let i = memberOffset; i < members.length && membersToProcess.length < currentBatchLimit; i++) {
      const member = members[i];
      const discordId = member.user?.id;
      if (!discordId || member.user?.bot) {
        totalSkipped++;
        processed++;
        continue;
      }
      if (fullScan) {
        if (alertedSet.has(discordId)) { totalSkipped++; processed++; continue; }
      } else {
        const joinKey = `${discordId}:${member.joined_at}`;
        if (alertedSet.has(joinKey)) { totalSkipped++; processed++; continue; }
      }
      membersToProcess.push({ member, discordId, originalIndex: i });
      processed++;
    }

    const lastProcessedIndex = membersToProcess.length > 0
      ? membersToProcess[membersToProcess.length - 1].originalIndex
      : memberOffset + processed - 1;

    // Stop check removed here — already checked at top + inside loop

    const batchLoggedAt = new Date().toISOString();
    const joinRecords: any[] = [];
    const cheaters: { member: DiscordMember; sxData: any }[] = [];

    let lastProgressUpdate = Date.now();
    const PROGRESS_UPDATE_INTERVAL_MS = 1500; // Update DB every 1.5s for responsive UI

    for (let chunkStart = 0; chunkStart < membersToProcess.length; chunkStart += currentConcurrency) {
      // Check for stop request every chunk for near-instant response
      if (shouldStopFullScan && chunkStart > 0) {
        if (await shouldStopFullScan()) {
          await batchInsertMemberJoins(supabase, joinRecords);
          return await buildStoppedResponse(server, totalChecked, totalSkipped, totalAlerts, guildTotalMembers, supabase, scanStartedAt, fullScan, bgScanHistoryId);
        }
      }

      const chunk = membersToProcess.slice(chunkStart, chunkStart + currentConcurrency);
      const promises = chunk.map(async ({ discordId }) => {
        const data = await checkScreenShareX(discordId, screensharexApiKey);
        return { discordId, data };
      });
      const results = await Promise.all(promises);
      // Small delay between chunks to reduce API pressure
      if (chunkStart + currentConcurrency < membersToProcess.length) await sleep(25);

      for (let j = 0; j < chunk.length; j++) {
        const { member, discordId } = chunk[j];
        const sxData = results[j].data;
        const sxFailed = sxData === null;
        if (sxFailed) totalFailed++;
        totalChecked++;

        const isCheater = hasScreenShareXMatch(sxData);

        joinRecords.push({
          discord_user_id: discordId,
          discord_username: member.user?.global_name || member.user?.username || null,
          discord_avatar: member.user?.avatar || null,
          guild_id: server.guild_id,
          guild_name: server.guild_name || null,
          is_cheater: isCheater,
          logged_at: batchLoggedAt,
        });

        if (isCheater) {
          cheaters.push({ member, sxData });
        }
      }

      // Mid-batch progress update for background scans — keeps UI responsive
      if (bgScanHistoryId && Date.now() - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
        const grandCheckedNow = cumulativeChecked + totalChecked;
        const grandSkippedNow = cumulativeSkipped + totalSkipped;
        const grandAlertsNow = cumulativeAlerts + totalAlerts;
        const grandFailedNow = cumulativeFailed + totalFailed;
        const durationNow = Math.round((Date.now() - new Date(scanStartedAt).getTime()) / 1000);
        supabase.from("scan_history").update({
          total_checked: grandCheckedNow,
          total_skipped: grandSkippedNow,
          total_alerts: grandAlertsNow,
          total_failed: grandFailedNow,
          total_members: guildTotalMembers || (grandCheckedNow + grandSkippedNow),
          duration_seconds: durationNow,
        }).eq("id", bgScanHistoryId).then(() => {}); // fire-and-forget
        lastProgressUpdate = Date.now();
      }
    }

    // Fire-and-forget: don't block on DB insert
    batchInsertMemberJoins(supabase, joinRecords).catch((e) => console.error("Join insert error:", e));

    const manualWebhook = server.manual_webhook_url || server.webhook_url;
    if (cheaters.length > 0) {
      if (shouldStopFullScan && (await shouldStopFullScan())) {
        return await buildStoppedResponse(server, totalChecked, totalSkipped, totalAlerts, guildTotalMembers, supabase, scanStartedAt, fullScan, bgScanHistoryId);
      }

      const alertInserts = cheaters.map(({ member }) => {
        const discordId = member.user!.id!;
        alertedSet.add(fullScan ? discordId : `${discordId}:${member.joined_at}`);
        return {
          guild_id: server.guild_id,
          discord_user_id: discordId,
          joined_at: member.joined_at,
          alerted_at: batchLoggedAt,
        };
      });

      totalAlerts += cheaters.length;

      // Fire-and-forget: alert records + cheater saves
      if (alertInserts.length > 0) {
        supabase.from("discord_alerted_members").upsert(alertInserts, { onConflict: "guild_id,discord_user_id", ignoreDuplicates: false })
          .then(({ error }) => { if (error) console.error("Failed to insert alerted members:", error); });
      }
      Promise.allSettled(
        cheaters.map(({ member, sxData }) => saveDetectedCheater(supabase, sxData, member, server)),
      ).catch(() => {});
    }

    if (bgScanHistoryId) {
      const grandCheckedNow = cumulativeChecked + totalChecked;
      const grandSkippedNow = cumulativeSkipped + totalSkipped;
      const grandAlertsNow = cumulativeAlerts + totalAlerts;
      const grandFailedNow = cumulativeFailed + totalFailed;
      const durationNow = Math.round((Date.now() - new Date(scanStartedAt).getTime()) / 1000);

      await supabase.from("scan_history").update({
        total_checked: grandCheckedNow,
        total_skipped: grandSkippedNow,
        total_alerts: grandAlertsNow,
        total_failed: grandFailedNow,
        total_members: guildTotalMembers || (grandCheckedNow + grandSkippedNow),
        duration_seconds: durationNow,
      }).eq("id", bgScanHistoryId);
    }

    if (cheaters.length > 0 && manualWebhook) {
      for (let i = 0; i < cheaters.length; i += 10) {
        if (shouldStopFullScan && i > 0 && (await shouldStopFullScan())) break;
        const batch = cheaters.slice(i, i + 10);
        const embeds = batch.map(({ member, sxData }) => {
          const embed = buildEmbed(sxData, member, server);
          return embed.embeds[0];
        });
        await sendWebhookWithRetry(manualWebhook, {
          embeds,
          username: "CurlyKidd Bot",
        }, 3, shouldStopFullScan);
      }
    }

    const batchJoins = joinRecords;

    // Determine if there's more to process
    const nextOffset = lastProcessedIndex + 1;
    const hasMoreInPage = nextOffset < members.length;
    const hasMorePages = members.length === 1000;
    const hasMore = hasMoreInPage || hasMorePages;
    const nextAfterCursor = hasMoreInPage ? afterCursor : (hasMorePages ? members[members.length - 1]?.user?.id || "0" : "0");
    const nextMemberOffset = hasMoreInPage ? nextOffset : 0;

    // ── Background scan: update scan_history and self-chain ──
    if (bgScanHistoryId) {
      const grandChecked = cumulativeChecked + totalChecked;
      const grandSkipped = cumulativeSkipped + totalSkipped;
      const grandAlerts = cumulativeAlerts + totalAlerts;
      const grandFailed = cumulativeFailed + totalFailed;
      const durationSeconds = Math.round((Date.now() - new Date(scanStartedAt).getTime()) / 1000);

      if (hasMore) {
        // Update progress in scan_history
        await supabase.from("scan_history").update({
          total_checked: grandChecked,
          total_skipped: grandSkipped,
          total_alerts: grandAlerts,
          total_failed: grandFailed,
          total_members: guildTotalMembers || (grandChecked + grandSkipped),
          duration_seconds: durationSeconds,
        }).eq("id", bgScanHistoryId);

        // Self-chain: fire next batch
        const functionUrl = `${SUPABASE_URL}/functions/v1/discord-member-check`;
        EdgeRuntime.waitUntil(
          fetch(functionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              "apikey": SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              _bgScanHistoryId: bgScanHistoryId,
              serverId: server.id,
              fullScan: true,
              afterCursor: nextAfterCursor,
              memberOffset: nextMemberOffset,
              scanStartedAt,
              scanId: requestedScanId,
              guildTotalMembers,
              cumulativeChecked: grandChecked,
              cumulativeSkipped: grandSkipped,
              cumulativeAlerts: grandAlerts,
              cumulativeFailed: grandFailed,
            }),
          }).then(r => r.text()).catch(e => console.error("Background scan chain error:", e))
        );

        return new Response(
          JSON.stringify({ success: true, background: true, done: false, checked: grandChecked, skipped: grandSkipped, alerts: grandAlerts, failed: grandFailed, guildTotalMembers }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ── Background scan DONE ──
      await supabase.from("discord_bot_servers")
        .update({ last_checked_at: new Date().toISOString() }).eq("id", server.id);

      const allLookupsFailed = grandChecked > 0 && grandFailed >= grandChecked;
      const scanStatus = allLookupsFailed ? "failed" : "completed";
      const finishedAt = new Date();
      const finalDuration = Math.round((finishedAt.getTime() - new Date(scanStartedAt).getTime()) / 1000);

      await supabase.from("scan_history").update({
        total_checked: grandChecked,
        total_skipped: grandSkipped,
        total_alerts: grandAlerts,
        total_failed: grandFailed,
        total_members: guildTotalMembers || (grandChecked + grandSkipped),
        duration_seconds: finalDuration,
        status: scanStatus,
        finished_at: finishedAt.toISOString(),
      }).eq("id", bgScanHistoryId);

      // Send summary webhook
      const summaryWebhook = server.manual_webhook_url || server.webhook_url;
      if (summaryWebhook) {
        const mins = Math.floor(finalDuration / 60);
        const secs = finalDuration % 60;
        const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const summaryTitle = allLookupsFailed
          ? "⚠️ Full Scan Complete — Lookup Failures"
          : grandAlerts > 0 ? "🔍 Full Scan Complete — Alerts Found" : "✅ Full Scan Complete — All Clear";
        const summaryColor = allLookupsFailed ? 0xf59e0b : grandAlerts > 0 ? 0xff4444 : 0x00d4aa;
        await sendWebhookWithRetry(summaryWebhook, {
          embeds: [{
            title: summaryTitle,
            description: `Scan finished for **${server.guild_name || server.guild_id}**`,
            color: summaryColor,
            fields: [
              { name: "👥 Members", value: `${guildTotalMembers || (grandChecked + grandSkipped)}`, inline: true },
              { name: "🔎 Checked", value: `${grandChecked}`, inline: true },
              { name: "⏭️ Skipped", value: `${grandSkipped}`, inline: true },
              { name: "🚨 Alerts", value: `${grandAlerts}`, inline: true },
              { name: "❌ Failed", value: `${grandFailed}`, inline: true },
              { name: "⏱️ Duration", value: durationStr, inline: true },
            ],
            footer: { text: "CurlyKidd Panel • Full Scan Summary" },
            timestamp: finishedAt.toISOString(),
          }],
          username: "CurlyKidd Bot",
        });
      }

      // Post-scan verification for background scans
      if (grandAlerts > 0) {
        try {
          const functionUrl = `${SUPABASE_URL}/functions/v1/discord-member-check`;
          EdgeRuntime.waitUntil(
            fetch(functionUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
              },
              body: JSON.stringify({
                action: "verify-alerts",
                serverId: server.id,
                scanStartedAt,
              }),
            }).then(r => r.text()).catch(() => {})
          );
        } catch {}
      }

      return new Response(
        JSON.stringify({ success: true, background: true, done: true, status: scanStatus, checked: grandChecked, skipped: grandSkipped, alerts: grandAlerts, failed: grandFailed, guildTotalMembers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Frontend-driven scan: return batch results to caller ──
    if (hasMoreInPage) {
      return new Response(
        JSON.stringify({
          success: true, done: false,
          checked: totalChecked, skipped: totalSkipped, alerts: totalAlerts, failed: totalFailed,
          nextAfterCursor: afterCursor, nextMemberOffset: nextOffset,
          scanStartedAt, totalMembers: members.length, guildTotalMembers, batchJoins,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (hasMorePages) {
      const lastUserId = members[members.length - 1]?.user?.id;
      return new Response(
        JSON.stringify({
          success: true, done: false,
          checked: totalChecked, skipped: totalSkipped, alerts: totalAlerts, failed: totalFailed,
          nextAfterCursor: lastUserId, nextMemberOffset: 0,
          scanStartedAt, totalMembers: members.length, guildTotalMembers, batchJoins,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("discord_bot_servers")
      .update({ last_checked_at: new Date().toISOString() }).eq("id", server.id);

    const finishedAt = new Date();
    const durationSeconds = Math.round((finishedAt.getTime() - new Date(scanStartedAt).getTime()) / 1000);

    const grandChecked = cumulativeChecked + totalChecked;
    const grandSkipped = cumulativeSkipped + totalSkipped;
    const grandAlerts = cumulativeAlerts + totalAlerts;
    const grandFailed = cumulativeFailed + totalFailed;
    const allLookupsFailed = grandChecked > 0 && grandFailed >= grandChecked;
    const scanStatus = allLookupsFailed ? "failed" : "completed";

    const { error: shErr } = await supabase.from("scan_history").insert({
      server_id: server.id,
      guild_id: server.guild_id,
      guild_name: server.guild_name || null,
      user_id: server.user_id,
      scan_type: fullScan ? "full" : "auto",
      total_checked: grandChecked,
      total_skipped: grandSkipped,
      total_alerts: grandAlerts,
      total_failed: grandFailed,
      total_members: guildTotalMembers || (grandChecked + grandSkipped),
      duration_seconds: durationSeconds,
      status: scanStatus,
      started_at: scanStartedAt,
      finished_at: finishedAt.toISOString(),
    });
    if (shErr) console.error("Failed to save scan history:", shErr);

    const summaryWebhook = server.manual_webhook_url || server.webhook_url;
    if (summaryWebhook) {
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const summaryTitle = allLookupsFailed
        ? "⚠️ Full Scan Complete — Lookup Failures"
        : grandAlerts > 0
          ? "🔍 Full Scan Complete — Alerts Found"
          : "✅ Full Scan Complete — All Clear";
      const summaryColor = allLookupsFailed ? 0xf59e0b : grandAlerts > 0 ? 0xff4444 : 0x00d4aa;
      const summaryDescription = allLookupsFailed
        ? `Scan finished for **${server.guild_name || server.guild_id}**, but the external lookups failed for all checked members.`
        : `Scan finished for **${server.guild_name || server.guild_id}**`;
      const summaryEmbed = {
        embeds: [{
          title: summaryTitle,
          description: summaryDescription,
          color: summaryColor,
          fields: [
            { name: "👥 Members", value: `${guildTotalMembers || (grandChecked + grandSkipped)}`, inline: true },
            { name: "🔎 Checked", value: `${grandChecked}`, inline: true },
            { name: "⏭️ Skipped", value: `${grandSkipped}`, inline: true },
            { name: "🚨 Alerts", value: `${grandAlerts}`, inline: true },
            { name: "❌ Failed", value: `${grandFailed}`, inline: true },
            { name: "⏱️ Duration", value: durationStr, inline: true },
            { name: "📊 Rate", value: `${grandChecked > 0 ? Math.round(grandChecked / (durationSeconds / 60)) : 0}/min`, inline: true },
          ],
          footer: { text: "CurlyKidd Panel • Full Scan Summary" },
          timestamp: finishedAt.toISOString(),
        }],
        username: "CurlyKidd Bot",
      };
      sendWebhookWithRetry(summaryWebhook, summaryEmbed);
    }

    return new Response(
      JSON.stringify({ success: true, done: true, checked: totalChecked, skipped: totalSkipped, alerts: totalAlerts, failed: totalFailed, guildTotalMembers, batchJoins, status: scanStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("discord-member-check error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function buildEmbed(sxData: any, member: DiscordMember, server: any) {
  const discordId = member.user!.id!;
  const username = member.user?.global_name || member.user?.username || "Unknown";
  const avatarHash = member.user?.avatar;

  const summary = sxData.summary || {};
  const parts: string[] = [];
  if (summary.is_flagged) parts.push("🔴 Flagged");
  if (summary.total_tickets > 0) parts.push(`${summary.total_tickets} ticket(s)`);
  if (summary.total_tickets_v2 > 0) parts.push(`${summary.total_tickets_v2} SS ticket(s)`);
  if (summary.total_guild_records > 0) parts.push(`${summary.total_guild_records} guild record(s)`);
  if (sxData.bans && sxData.bans.length > 0) parts.push(`${sxData.bans.length} ban(s)`);
  const flagReason = parts.length > 0 ? parts.join(" • ") : "Found in database";

  const avatarUrl = avatarHash
    ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "png"}?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordId) % BigInt(5))}.png`;

  const isFlagged = summary.is_flagged === true;
  const hasBans = sxData.bans && sxData.bans.length > 0;
  const alertColor = isFlagged || hasBans ? 0xff4444 : 0xffaa00;
  const alertTitle = isFlagged || hasBans ? "🔴 Cheater Detected" : "🟡 Player Found in Database";

  const discordProfileUrl = `https://discord.com/users/${discordId}`;

  const fields: any[] = [
    { name: "👤 Player", value: `<@${discordId}>`, inline: true },
    { name: "💬 Discord ID", value: `\`${discordId}\``, inline: true },
    { name: "📝 Summary", value: flagReason, inline: false },
  ];

  if (sxData.tickets_v2 && sxData.tickets_v2.length > 0) {
    const recentTickets = sxData.tickets_v2.slice(0, 3);
    const ticketInfo = recentTickets
      .map((t: any) => `• **${t.guildname}** — ${t.channelname} (${new Date(t.time).toLocaleDateString()})`)
      .join("\n");
    fields.push({ name: "🎫 Recent Tickets", value: ticketInfo, inline: false });
  }

  if (hasBans) {
    fields.push({ name: "🚫 Bans", value: `${sxData.bans.length} ban(s) found`, inline: true });
  }

  return {
    embeds: [{
      title: alertTitle,
      description: `A flagged player is in **${server.guild_name || "your server"}**`,
      color: alertColor,
      thumbnail: { url: avatarUrl },
      fields,
      author: { name: username, url: discordProfileUrl, icon_url: avatarUrl },
      footer: { text: "CurlyKidd Panel • Cheater Detection" },
      timestamp: new Date().toISOString(),
    }],
    username: "CurlyKidd Bot",
  };
}

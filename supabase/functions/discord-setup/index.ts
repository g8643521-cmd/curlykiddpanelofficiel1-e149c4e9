import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";

async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  }
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["admin", "owner"])
    .maybeSingle();
  if (!roleRow) {
    return { ok: false, response: json({ success: false, error: "Forbidden" }, 403) };
  }
  return { ok: true, userId: userData.user.id };
}

const BOT_LOGO =
  "https://ucjpepubcxhtjxumowwj.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png";

// ── Structure Definition ──
const ROLES = [
  { name: "Owner", color: 0xe74c3c, hoist: true, permissions: "8" },
  { name: "Admin", color: 0xe67e22, hoist: true, permissions: "8" },
  { name: "Moderator", color: 0x2ecc71, hoist: true, permissions: "1099511627775" },
  { name: "Support", color: 0x3498db, hoist: true, permissions: "1099511627775" },
  { name: "Member", color: 0x9b59b6, hoist: false, permissions: "1024" },
];

const CATEGORIES = [
  {
    name: "📢 INFORMATION",
    channels: [
      { name: "announcements", type: 0, topic: "Server announcements and updates" },
      { name: "rules", type: 0, topic: "Server rules and guidelines" },
      { name: "faq", type: 0, topic: "Frequently asked questions" },
    ],
  },
  {
    name: "💬 GENERAL",
    channels: [
      { name: "general", type: 0, topic: "General chat" },
      { name: "off-topic", type: 0, topic: "Off-topic discussions" },
      { name: "media", type: 0, topic: "Share images, videos, and memes" },
    ],
  },
  {
    name: "🎮 GAMING",
    channels: [
      { name: "fivem-chat", type: 0, topic: "FiveM discussions" },
      { name: "server-status", type: 0, topic: "Server status and updates" },
      { name: "bug-reports", type: 0, topic: "Report bugs here" },
      { name: "suggestions", type: 0, topic: "Suggest new features" },
    ],
  },
  {
    name: "🎧 VOICE",
    channels: [
      { name: "General Voice", type: 2, topic: "" },
      { name: "Gaming", type: 2, topic: "" },
      { name: "AFK", type: 2, topic: "" },
    ],
  },
  {
    name: "🛡️ STAFF AREA",
    staffOnly: true,
    channels: [
      { name: "staff-chat", type: 0, topic: "Staff discussions" },
      { name: "mod-logs", type: 0, topic: "Moderation logs" },
      { name: "admin-commands", type: 0, topic: "Admin commands" },
    ],
  },
  {
    name: "🤖 BOT",
    channels: [
      { name: "bot-commands", type: 0, topic: "Bot commands" },
      { name: "bot-logs", type: 0, topic: "Bot activity logs" },
      { name: "alerts", type: 0, topic: "Anti-cheat alerts" },
    ],
  },
];

function getToken(): string {
  const t = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!t) throw new Error("DISCORD_BOT_TOKEN not configured");
  return t;
}

function headers(token: string) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };
}

// ── Helpers ──

async function fetchGuildChannels(token: string, guildId: string) {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch channels: ${res.status}`);
  return (await res.json()) as Array<{ id: string; name: string; type: number; parent_id: string | null }>;
}

async function fetchGuildRoles(token: string, guildId: string) {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch roles: ${res.status}`);
  return (await res.json()) as Array<{
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
    permissions: string;
  }>;
}

// VIEW_CHANNEL = 1024
const VIEW_CHANNEL = "1024";

// ── Actions ──

async function getBotInfo(token: string) {
  const botRes = await fetch(`${DISCORD_API}/users/@me`, { headers: headers(token) });
  if (!botRes.ok) throw new Error(`Failed to fetch bot info: ${botRes.status}`);
  const bot = (await botRes.json()) as any;

  const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: headers(token) });
  if (!guildsRes.ok) throw new Error(`Failed to fetch guilds: ${guildsRes.status}`);
  const guilds = await guildsRes.json();

  return { bot, guilds };
}

async function getInviteUrl(token: string) {
  const botRes = await fetch(`${DISCORD_API}/users/@me`, { headers: headers(token) });
  if (!botRes.ok) throw new Error("Failed to fetch bot info");
  const bot = (await botRes.json()) as any;
  const invite_url = `https://discord.com/api/oauth2/authorize?client_id=${bot.id}&permissions=8&scope=bot%20applications.commands`;
  return { invite_url };
}

async function getStructurePreview() {
  return {
    roles: ROLES.map(({ name, color, hoist }) => ({ name, color, hoist })),
    categories: CATEGORIES.map((c) => ({
      name: c.name,
      staffOnly: !!(c as any).staffOnly,
      channels: c.channels,
    })),
  };
}

async function setupServer(token: string, guildId: string) {
  const logs: string[] = [];

  // ── 1. Check existing roles ──
  const existingRoles = await fetchGuildRoles(token, guildId);
  const existingRoleNames = new Set(existingRoles.map((r) => r.name.toLowerCase()));

  logs.push("🔍 Checking existing roles...");
  const createdRoleIds: Record<string, string> = {};

  for (const role of ROLES) {
    if (existingRoleNames.has(role.name.toLowerCase())) {
      const existing = existingRoles.find((r) => r.name.toLowerCase() === role.name.toLowerCase());
      if (existing) createdRoleIds[role.name] = existing.id;
      logs.push(`⏭️ Role "${role.name}" already exists — skipping`);
      continue;
    }

    try {
      const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          permissions: role.permissions,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as any;
        createdRoleIds[role.name] = created.id;
        logs.push(`✅ Created role: ${role.name}`);
      } else {
        logs.push(`❌ Failed to create role: ${role.name} (${res.status})`);
      }
    } catch (e) {
      logs.push(`❌ Error creating role ${role.name}: ${(e as Error).message}`);
    }
  }

  // ── 2. Check existing channels & categories ──
  const existingChannels = await fetchGuildChannels(token, guildId);
  const existingCategoryNames = new Set(
    existingChannels.filter((c) => c.type === 4).map((c) => c.name.toLowerCase())
  );
  const existingChannelsByParent = new Map<string | null, Set<string>>();
  for (const ch of existingChannels) {
    if (!existingChannelsByParent.has(ch.parent_id)) {
      existingChannelsByParent.set(ch.parent_id, new Set());
    }
    existingChannelsByParent.get(ch.parent_id)!.add(ch.name.toLowerCase());
  }

  logs.push("🔍 Checking existing channels...");

  // Staff role IDs for permissions
  const staffRoleIds = ["Owner", "Admin", "Moderator", "Support"]
    .map((n) => createdRoleIds[n])
    .filter(Boolean);

  for (const category of CATEGORIES) {
    const catNameLower = category.name.toLowerCase();
    let categoryId: string | null = null;

    if (existingCategoryNames.has(catNameLower)) {
      const existing = existingChannels.find(
        (c) => c.type === 4 && c.name.toLowerCase() === catNameLower
      );
      categoryId = existing?.id ?? null;
      logs.push(`⏭️ Category "${category.name}" already exists — skipping creation`);
    } else {
      // Build permission overwrites for staff-only categories
      const permissionOverwrites: any[] = [];
      if ((category as any).staffOnly) {
        // Deny @everyone
        permissionOverwrites.push({
          id: guildId,
          type: 0,
          deny: "1024",
        });
        for (const roleId of staffRoleIds) {
          permissionOverwrites.push({
            id: roleId,
            type: 0,
            allow: "1024",
          });
        }
      }

      try {
        const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
          method: "POST",
          headers: headers(token),
          body: JSON.stringify({
            name: category.name,
            type: 4,
            permission_overwrites: permissionOverwrites.length > 0 ? permissionOverwrites : undefined,
          }),
        });
        if (res.ok) {
          const created = (await res.json()) as any;
          categoryId = created.id;
          logs.push(`✅ Created category: ${category.name}`);
        } else {
          logs.push(`❌ Failed to create category: ${category.name} (${res.status})`);
          continue;
        }
      } catch (e) {
        logs.push(`❌ Error creating category ${category.name}: ${(e as Error).message}`);
        continue;
      }
    }

    // Now create channels in this category
    const existingInCategory = existingChannelsByParent.get(categoryId) ?? new Set();

    for (const channel of category.channels) {
      const chNameLower = channel.name.toLowerCase();
      if (existingInCategory.has(chNameLower)) {
        logs.push(`⏭️ Channel "#${channel.name}" already exists in "${category.name}" — skipping`);
        continue;
      }

      try {
        const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
          method: "POST",
          headers: headers(token),
          body: JSON.stringify({
            name: channel.name,
            type: channel.type,
            topic: channel.topic || undefined,
            parent_id: categoryId,
          }),
        });
        if (res.ok) {
          logs.push(`✅ Created channel: #${channel.name}`);
        } else {
          logs.push(`❌ Failed to create channel: #${channel.name} (${res.status})`);
        }
      } catch (e) {
        logs.push(`❌ Error creating channel #${channel.name}: ${(e as Error).message}`);
      }
    }
  }

  logs.push("📊 Server setup complete!");
  return { logs };
}

async function postAllMessages(token: string, guildId: string) {
  const logs: string[] = [];
  const channels = await fetchGuildChannels(token, guildId);
  let posted = 0;

  // Find specific channels to post welcome messages
  const messageMap: Record<string, { title: string; description: string; color: number }> = {
    announcements: {
      title: "📢 Welcome to the Server!",
      description: "Stay tuned for the latest announcements and updates.",
      color: 0x5865f2,
    },
    rules: {
      title: "📜 Server Rules",
      description:
        "1. Be respectful\n2. No spam\n3. No cheating\n4. Follow Discord ToS\n5. Listen to staff\n\nBreaking rules may result in warnings, mutes, or bans.",
      color: 0xe74c3c,
    },
    faq: {
      title: "❓ FAQ",
      description:
        "**Q: How do I get started?**\nA: Check #announcements and #rules first!\n\n**Q: How do I report a cheater?**\nA: Use the bot commands in #bot-commands.",
      color: 0x2ecc71,
    },
    alerts: {
      title: "🛡️ Anti-Cheat Alerts",
      description: "This channel will receive automatic alerts when suspicious players are detected.",
      color: 0xe74c3c,
    },
  };

  for (const [channelName, embed] of Object.entries(messageMap)) {
    const ch = channels.find((c) => c.name === channelName && c.type === 0);
    if (!ch) {
      logs.push(`⏭️ Channel #${channelName} not found — skipping`);
      continue;
    }

    try {
      const res = await fetch(`${DISCORD_API}/channels/${ch.id}/messages`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          embeds: [
            {
              ...embed,
              thumbnail: { url: BOT_LOGO },
              timestamp: new Date().toISOString(),
              footer: { text: "CurlyKidd Anti-Cheat", icon_url: BOT_LOGO },
            },
          ],
        }),
      });
      if (res.ok) {
        posted++;
        logs.push(`✅ Posted message in #${channelName}`);
      } else {
        logs.push(`❌ Failed to post in #${channelName} (${res.status})`);
      }
    } catch (e) {
      logs.push(`❌ Error posting in #${channelName}: ${(e as Error).message}`);
    }
  }

  return { posted, logs };
}

async function deleteBotMessages(
  token: string,
  guildId: string,
  mode: "welcome" | "7days" | "all"
) {
  const logs: string[] = [];
  const channels = await fetchGuildChannels(token, guildId);
  const botRes = await fetch(`${DISCORD_API}/users/@me`, { headers: headers(token) });
  const bot = (await botRes.json()) as any;
  const botId = bot.id;
  let deleted = 0;
  let partial = false;

  const textChannels = channels.filter((c) => c.type === 0);
  const targetChannels =
    mode === "welcome"
      ? textChannels.filter((c) => ["announcements", "rules", "faq", "alerts"].includes(c.name))
      : textChannels;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const ch of targetChannels) {
    try {
      const res = await fetch(`${DISCORD_API}/channels/${ch.id}/messages?limit=100`, {
        headers: headers(token),
      });
      if (!res.ok) continue;
      const messages = (await res.json()) as any[];

      for (const msg of messages) {
        if (msg.author?.id !== botId) continue;
        if (mode === "7days" && new Date(msg.timestamp).getTime() < sevenDaysAgo) continue;

        try {
          const delRes = await fetch(`${DISCORD_API}/channels/${ch.id}/messages/${msg.id}`, {
            method: "DELETE",
            headers: headers(token),
          });
          if (delRes.ok) {
            deleted++;
            logs.push(`🗑️ Deleted message in #${ch.name}`);
          }
          // Rate limiting
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          // ignore individual failures
        }
      }
    } catch (e) {
      logs.push(`⚠️ Could not read #${ch.name}`);
    }
  }

  logs.push(`📊 Deleted ${deleted} message(s)`);
  return { deleted, partial, logs };
}

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { action, guild_id } = await req.json();

    if (action === "get_bot_info") {
      const token = getToken();
      const { bot, guilds } = await getBotInfo(token);
      return json({ success: true, bot, guilds });
    }

    if (action === "get_invite_url") {
      const token = getToken();
      const result = await getInviteUrl(token);
      return json({ success: true, ...result });
    }

    if (action === "get_structure_preview") {
      const structure = await getStructurePreview();
      return json({ success: true, structure });
    }

    if (action === "setup_server") {
      if (!guild_id) return json({ success: false, error: "guild_id required" }, 400);
      const token = getToken();
      const result = await setupServer(token, guild_id);
      return json({ success: true, ...result });
    }

    if (action === "post_all_messages") {
      if (!guild_id) return json({ success: false, error: "guild_id required" }, 400);
      const token = getToken();
      const result = await postAllMessages(token, guild_id);
      return json({ success: true, ...result });
    }

    if (action === "delete_welcome_messages") {
      if (!guild_id) return json({ success: false, error: "guild_id required" }, 400);
      const token = getToken();
      const result = await deleteBotMessages(token, guild_id, "welcome");
      return json({ success: true, ...result });
    }

    if (action === "delete_all_messages_7days") {
      if (!guild_id) return json({ success: false, error: "guild_id required" }, 400);
      const token = getToken();
      const result = await deleteBotMessages(token, guild_id, "7days");
      return json({ success: true, ...result });
    }

    if (action === "delete_all_bot_messages") {
      if (!guild_id) return json({ success: false, error: "guild_id required" }, 400);
      const token = getToken();
      const result = await deleteBotMessages(token, guild_id, "all");
      return json({ success: true, ...result });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err: any) {
    console.error("discord-setup error:", err);
    return json({ success: false, error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

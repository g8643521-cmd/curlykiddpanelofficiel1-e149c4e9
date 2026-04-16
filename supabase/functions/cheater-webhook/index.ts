const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const replaceVars = (text: string, vars: Record<string, string>): string => {
  if (!text) return text
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      search_query,
      results_count = 0,
      searched_by = 'Unknown',
      sx_username,
      sx_tickets = 0,
      sx_guilds = 0,
      sx_guild_names = [],
      sx_avatar_url,
      sx_discord_id,
      db_matches = [],
      sx_guild_activity = [],
      sx_tickets_detail = [],
    } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: settings } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['discord_search_webhook_url', 'discord_webhook_url', 'embed_config_search_lookup'])

    const settingsMap = new Map(settings?.map((s: any) => [s.key, s.value]) || [])
    const webhookUrl = settingsMap.get('discord_search_webhook_url') || settingsMap.get('discord_webhook_url')

    if (!webhookUrl) {
      return new Response(JSON.stringify({ success: false, error: 'No webhook URL configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Parse embed config
    let embedConfig: any = null
    const rawConfig = settingsMap.get('embed_config_search_lookup')
    if (rawConfig) {
      try { embedConfig = JSON.parse(rawConfig) } catch { /* use defaults */ }
    }

    const isFlagged = results_count > 0 || sx_tickets > 0
    const discordId = sx_discord_id || (/^\d{17,19}$/.test(search_query) ? search_query : '')
    const discordProfileUrl = discordId ? `https://discord.com/users/${discordId}` : ''

    const vars: Record<string, string> = {
      search_query,
      searched_by,
      results_count: String(results_count),
      sx_username: sx_username || 'N/A',
      sx_tickets: String(sx_tickets),
      sx_guilds: String(sx_guilds),
      discord_id: discordId || 'N/A',
      discord_avatar_url: sx_avatar_url || '',
      discord_profile_url: discordProfileUrl,
      timestamp: new Date().toISOString(),
    }

    let embed: any
    let content: string | undefined

    if (embedConfig && (embedConfig.title || embedConfig.description || embedConfig.fields?.length)) {
      // User-configured embed
      const color = parseInt((embedConfig.color || '#2563EB').replace('#', ''), 16)
      embed = {
        title: replaceVars(embedConfig.title, vars) || (isFlagged ? '🚨 Flagged Player Search' : '🔍 Player Search'),
        color: isFlagged ? 15158332 : color,
        timestamp: new Date().toISOString(),
      }
      const desc = replaceVars(embedConfig.description, vars)
      if (desc?.trim()) embed.description = desc
      const footerText = replaceVars(embedConfig.footer || 'CurlyKiddPanel • Cheater Search', vars)
      if (footerText?.trim()) embed.footer = { text: footerText }
      if (embedConfig.author_name) {
        const authorName = replaceVars(embedConfig.author_name, vars)
        if (authorName?.trim()) {
          embed.author = { name: authorName }
          const authorIcon = embedConfig.author_icon_url ? replaceVars(embedConfig.author_icon_url, vars) : null
          if (authorIcon?.trim() && authorIcon.startsWith('http')) embed.author.icon_url = authorIcon
        }
      }
      const thumbUrl = embedConfig.thumbnail_url ? replaceVars(embedConfig.thumbnail_url, vars) : sx_avatar_url
      if (thumbUrl?.trim() && thumbUrl.startsWith('http')) {
        embed.thumbnail = { url: thumbUrl }
      }
      const imgUrl = embedConfig.image_url ? replaceVars(embedConfig.image_url, vars) : null
      if (imgUrl?.trim() && imgUrl.startsWith('http')) embed.image = { url: imgUrl }
      if (embedConfig.fields?.length) {
        embed.fields = embedConfig.fields
          .map((f: any) => ({
            name: replaceVars(f.name, vars),
            value: replaceVars(f.value, vars),
            inline: f.inline ?? false,
          }))
          .filter((f: any) => f.name?.trim() && f.value?.trim())
      } else {
        embed.fields = buildDefaultFields(search_query, searched_by, results_count, sx_username, sx_tickets, sx_guilds, sx_guild_names, db_matches, discordId, discordProfileUrl, sx_guild_activity, sx_tickets_detail)
      }
      if (embedConfig.content) {
        const c = replaceVars(embedConfig.content, vars)
        if (c?.trim()) content = c
      }
    } else {
      // Rich default embed
      const fields = buildDefaultFields(search_query, searched_by, results_count, sx_username, sx_tickets, sx_guilds, sx_guild_names, db_matches, discordId, discordProfileUrl, sx_guild_activity, sx_tickets_detail)

      embed = {
        title: isFlagged ? '🚨 Flagged Player Search' : '🔍 Player Search',
        color: isFlagged ? 15158332 : 3447003,
        fields,
        thumbnail: sx_avatar_url ? { url: sx_avatar_url } : undefined,
        timestamp: new Date().toISOString(),
        footer: { text: 'CurlyKiddPanel • Cheater Search' },
      }

      // Add Discord profile as author with clickable link
      if (sx_username && discordId) {
        embed.author = {
          name: `${sx_username}`,
          url: discordProfileUrl,
          icon_url: sx_avatar_url || undefined,
        }
      }
    }

    // Sanitize embed fields - Discord requires non-empty name and value, max 1024 chars per value, max 25 fields
    if (embed.fields) {
      embed.fields = embed.fields
        .filter((f: any) => f.name && f.value)
        .map((f: any) => ({
          ...f,
          name: String(f.name).slice(0, 256) || 'N/A',
          value: String(f.value).slice(0, 1024) || 'N/A',
        }))
        .slice(0, 25)
    }
    if (embed.description) embed.description = String(embed.description).slice(0, 4096)
    if (embed.title) embed.title = String(embed.title).slice(0, 256)

    const payload: any = {
      username: 'CurlyKiddPanel',
      avatar_url: 'https://svmulnlysrsmxolvgxnw.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png',
      embeds: [embed],
    }
    if (content?.trim()) payload.content = content.trim()

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!discordRes.ok) {
      const errText = await discordRes.text()
      console.error('Discord webhook error:', errText)
      return new Response(JSON.stringify({ success: false, error: errText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    await discordRes.text()
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Cheater webhook error:', err)
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

function buildDefaultFields(
  search_query: string,
  searched_by: string,
  results_count: number,
  sx_username: string | undefined,
  sx_tickets: number,
  sx_guilds: number,
  sx_guild_names: string[],
  db_matches: any[],
  discordId: string,
  discordProfileUrl: string,
  sx_guild_activity: any[] = [],
  sx_tickets_detail: any[] = [],
) {
  const fields: any[] = [
    { name: '🔍 Search Query', value: `\`${search_query}\``, inline: true },
    { name: '👤 Searched By', value: searched_by, inline: true },
    { name: '📊 DB Matches', value: `${results_count}`, inline: true },
  ]

  if (discordId) {
    fields.push({ name: '🆔 Discord ID', value: `\`${discordId}\``, inline: true })
  }
  if (sx_username) {
    const nameDisplay = discordId
      ? `<@${discordId}>`
      : sx_username
    fields.push({ name: '🎮 Discord User', value: nameDisplay, inline: true })
  }
  if (sx_tickets > 0) {
    fields.push({ name: '🎫 SX Tickets', value: `${sx_tickets}`, inline: true })
  }
  if (sx_guilds > 0) {
    fields.push({ name: '🏰 SX Guilds', value: `${sx_guilds}`, inline: true })
  }
  if (sx_guild_names.length > 0) {
    fields.push({ name: '📋 Guild Names', value: sx_guild_names.slice(0, 5).join(', '), inline: false })
  }
  // Ticket details
  if (sx_tickets_detail.length > 0) {
    const ticketLines = sx_tickets_detail.slice(0, 5).map((t: any) => {
      const time = t.time ? `<t:${Math.floor(new Date(t.time).getTime() / 1000)}:R>` : ''
      const games = t.games?.length ? ` [${t.games.join(', ')}]` : ''
      return `• **${t.guild || 'Unknown'}** — ${t.action || 'Ticket'}${games} ${time}`
    })
    fields.push({ name: '🎫 Ticket History', value: ticketLines.join('\n'), inline: false })
  }
  // Guild activity (join/leave)
  if (sx_guild_activity.length > 0) {
    const activityLines = sx_guild_activity.slice(0, 6).map((g: any) => {
      const joined = g.joined ? `<t:${Math.floor(new Date(g.joined).getTime() / 1000)}:d>` : '?'
      const left = g.left ? `<t:${Math.floor(new Date(g.left).getTime() / 1000)}:d>` : '✅ Active'
      return `• **${g.guild}** — Joined: ${joined} | Left: ${left}`
    })
    fields.push({ name: '🏰 Guild Activity', value: activityLines.join('\n'), inline: false })
  }
  // Cheater records
  if (db_matches.length > 0) {
    db_matches.slice(0, 5).forEach((m: any, i: number) => {
      const header = db_matches.length > 1 ? `⚠️ Cheater #${i + 1}: ${m.name}` : `⚠️ Cheater: ${m.name}`
      const lines: string[] = []
      lines.push(`**Status:** ${m.status}`)
      if (m.reason) lines.push(`**Reason:** ${m.reason.slice(0, 200)}`)
      if (m.server_name) lines.push(`**Server:** ${m.server_name}${m.server_code ? ` (\`${m.server_code}\`)` : ''}`)
      if (m.evidence_url) lines.push(`**Evidence:** [Link](${m.evidence_url})`)
      if (m.created_at) {
        const date = new Date(m.created_at)
        lines.push(`**Reported:** <t:${Math.floor(date.getTime() / 1000)}:R>`)
      }
      if (m.player_identifiers && typeof m.player_identifiers === 'object') {
        const ids = Object.entries(m.player_identifiers)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}: \`${v}\``)
          .slice(0, 5)
        if (ids.length > 0) lines.push(`**Identifiers:** ${ids.join(', ')}`)
      }
      fields.push({ name: header, value: lines.join('\n'), inline: false })
    })
  }
  if (discordProfileUrl) {
    fields.push({ name: '🔗 Discord Profile', value: `[Åbn profil](${discordProfileUrl})`, inline: false })
  }
  return fields
}

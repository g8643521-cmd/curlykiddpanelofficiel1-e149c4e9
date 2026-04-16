import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEO_TIMEOUT_MS = 1500
const DISCORD_TIMEOUT_MS = 5000

const replaceVars = (text: string, vars: Record<string, string>): string => {
  if (!text) return text
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  const work = processSignupWebhook(req, body)
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(work)
  } else {
    void work
  }

  return new Response(JSON.stringify({ accepted: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 202,
  })
})

async function processSignupWebhook(req: Request, body: any) {
  const {
    user_email = 'Unknown',
    display_name = 'Unknown',
    auth_provider = 'email',
    avatar_url,
    user_id,
    user_agent = 'Unknown',
    language = 'Unknown',
    platform = 'Unknown',
    screen_resolution = 'Unknown',
    timezone = 'Unknown',
    referrer = 'Direct',
    created_at,
    last_sign_in,
    email_confirmed = 'Unknown',
    phone,
  } = body

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'Unknown'

  const browserInfo = parseUserAgent(user_agent)
  const geoInfo = await lookupGeoInfo(clientIp)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: settings, error: settingsError } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['discord_signup_webhook_url', 'embed_config_signup'])

  if (settingsError) {
    console.error('Signup webhook settings error:', settingsError)
    return
  }

  const settingsMap = new Map(settings?.map((s: any) => [s.key, s.value]) || [])
  const webhookUrl = settingsMap.get('discord_signup_webhook_url')

  if (!webhookUrl) {
    console.error('Signup webhook missing discord_signup_webhook_url')
    return
  }

  let embedConfig: any = null
  const rawConfig = settingsMap.get('embed_config_signup')
  if (rawConfig) {
    try {
      embedConfig = JSON.parse(rawConfig)
    } catch (error) {
      console.error('Signup webhook embed parse error:', error)
    }
  }

  const providerEmoji: Record<string, string> = {
    google: '🔵 Google',
    email: '📧 Email',
    apple: '🍎 Apple',
    phone: '📱 Phone',
  }

  const locationParts = [geoInfo.city, geoInfo.region, geoInfo.country].filter(
    (part) => part && part !== 'Unknown'
  )

  const vars: Record<string, string> = {
    user_email,
    display_name,
    auth_provider: providerEmoji[auth_provider] || auth_provider,
    user_id: user_id || 'N/A',
    ip: clientIp,
    country: geoInfo.country,
    region: geoInfo.region,
    city: geoInfo.city,
    isp: geoInfo.isp,
    location: locationParts.length ? locationParts.join(', ') : 'Unknown',
    browser: browserInfo.browser,
    os: browserInfo.os,
    device: browserInfo.device,
    language,
    platform,
    screen_resolution,
    timezone,
    referrer,
    created_at: created_at || 'N/A',
    last_sign_in: last_sign_in || 'N/A',
    email_confirmed,
    phone: phone || 'N/A',
    timestamp: new Date().toISOString(),
  }

  console.log('Signup webhook dispatching', JSON.stringify({
    user_id: vars.user_id,
    provider: vars.auth_provider,
    ip: vars.ip,
  }))

  let embed: any
  let content: string | undefined

  if (embedConfig && (embedConfig.title || embedConfig.description || embedConfig.fields?.length)) {
    const color = parseInt((embedConfig.color || '#9333EA').replace('#', ''), 16)
    embed = {
      title: replaceVars(embedConfig.title, vars) || '👋 New Account',
      color,
      timestamp: new Date().toISOString(),
    }

    if (embedConfig.description) embed.description = replaceVars(embedConfig.description, vars)
    embed.footer = { text: replaceVars(embedConfig.footer || 'CurlyKiddPanel • Signups', vars) }

    if (embedConfig.author_name) {
      embed.author = { name: replaceVars(embedConfig.author_name, vars) }
      if (embedConfig.author_icon_url) embed.author.icon_url = replaceVars(embedConfig.author_icon_url, vars)
    }

    if (embedConfig.thumbnail_url) {
      embed.thumbnail = { url: replaceVars(embedConfig.thumbnail_url, vars) }
    } else if (avatar_url) {
      embed.thumbnail = { url: avatar_url }
    }

    if (embedConfig.image_url) embed.image = { url: replaceVars(embedConfig.image_url, vars) }

    if (embedConfig.fields?.length) {
      embed.fields = embedConfig.fields.map((field: any) => ({
        name: replaceVars(field.name, vars),
        value: replaceVars(field.value, vars),
        inline: field.inline ?? false,
      }))
    } else {
      embed.fields = buildDefaultFields(vars)
    }

    if (embedConfig.content) content = replaceVars(embedConfig.content, vars)
  } else {
    embed = {
      title: '👋 New Account',
      description: 'En ny bruger har oprettet en konto.',
      color: 0x9333EA,
      fields: buildDefaultFields(vars),
      thumbnail: avatar_url ? { url: avatar_url } : undefined,
      timestamp: new Date().toISOString(),
      footer: { text: 'CurlyKiddPanel • Signups' },
    }
  }

  const payload: any = {
    username: 'CurlyKiddPanel',
    avatar_url: 'https://svmulnlysrsmxolvgxnw.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png',
    embeds: [embed],
  }
  if (content?.trim()) payload.content = content.trim()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS)

  try {
    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!discordRes.ok) {
      const errText = await discordRes.text()
      console.error('Signup webhook Discord error:', discordRes.status, errText)
      return
    }

    await discordRes.text()
    console.log('Signup webhook delivered', JSON.stringify({ user_id: vars.user_id }))
  } catch (error) {
    console.error('Signup webhook request error:', error)
  } finally {
    clearTimeout(timeout)
  }
}

async function lookupGeoInfo(ip: string) {
  const fallback = { country: 'Unknown', region: 'Unknown', city: 'Unknown', isp: 'Unknown' }
  if (!ip || ip === 'Unknown') return fallback

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS)

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CurlyKiddPanel/1.0' },
    })

    if (!response.ok) return fallback

    const geo = await response.json()
    if (geo?.success === false) return fallback

    return {
      country: geo.country || 'Unknown',
      region: geo.region || 'Unknown',
      city: geo.city || 'Unknown',
      isp: geo.connection?.isp || geo.connection?.org || 'Unknown',
    }
  } catch {
    return fallback
  } finally {
    clearTimeout(timeout)
  }
}

function buildDefaultFields(vars: Record<string, string>) {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: '📧 Email', value: `\`${vars.user_email}\``, inline: true },
    { name: '👤 Display Name', value: vars.display_name, inline: true },
    { name: '🔐 Auth Method', value: vars.auth_provider, inline: true },
    { name: '🌐 IP Address', value: `\`${vars.ip}\``, inline: true },
    { name: '📍 Location', value: vars.location, inline: true },
    { name: '🏢 ISP', value: vars.isp, inline: true },
    { name: '🖥️ Browser', value: vars.browser, inline: true },
    { name: '💻 OS', value: vars.os, inline: true },
    { name: '📱 Device', value: vars.device, inline: true },
    { name: '🌍 Language', value: vars.language, inline: true },
    { name: '🕐 Timezone', value: vars.timezone, inline: true },
    { name: '📐 Screen', value: vars.screen_resolution, inline: true },
    { name: '🔗 Referrer', value: vars.referrer, inline: true },
    { name: '✅ Email Confirmed', value: vars.email_confirmed, inline: true },
  ]

  if (vars.phone && vars.phone !== 'N/A') {
    fields.push({ name: '📱 Phone', value: `\`${vars.phone}\``, inline: true })
  }

  fields.push({ name: '🆔 User ID', value: `\`${vars.user_id}\``, inline: false })
  fields.push({ name: '📅 Created', value: vars.created_at, inline: true })
  fields.push({ name: '🕑 Last Sign In', value: vars.last_sign_in, inline: true })
  fields.push({ name: '⏰ Timestamp', value: vars.timestamp, inline: true })

  return fields
}

function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  let browser = 'Unknown'
  let os = 'Unknown'
  let device = 'Desktop'

  if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('MSIE') || ua.includes('Trident/')) browser = 'IE'

  if (ua.includes('Windows NT 10')) os = 'Windows 10/11'
  else if (ua.includes('Windows NT')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('CrOS')) os = 'ChromeOS'

  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) device = 'Mobile'
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet'

  return { browser, os, device }
}

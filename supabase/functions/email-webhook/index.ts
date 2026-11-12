import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    if (!response.ok) {
      console.error('Resend registration email failed:', response.status, await response.text())
      return false
    }
    return true
  } catch (error: unknown) {
    console.error('Resend registration email failed:', error)
    return false
  }
}

async function matchesSecret(received: string, expected: string) {
  const encoder = new TextEncoder()
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let matches = a.length === b.length
  for (let index = 0; index < a.length; index += 1) {
    matches = (a[index] === b[index]) && matches
  }
  return matches
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const expectedSecret = Deno.env.get('DATABASE_WEBHOOK_SECRET')
  if (!expectedSecret) return json({ error: 'Webhook secret is not configured' }, 503)
  const secret = request.headers.get('x-webhook-secret') ?? ''
  if (!await matchesSecret(secret, expectedSecret)) return json({ error: 'Unauthorized webhook' }, 401)

  let event: {
    type?: string
    table?: string
    schema?: string
    record?: { full_name?: string; email?: string }
  }
  try {
    event = await request.json()
  } catch {
    return json({ error: 'Invalid webhook payload' }, 400)
  }
  if (event.type !== 'INSERT' || event.table !== 'profiles' || event.schema !== 'public' || !event.record?.email) {
    return json({ error: 'Unsupported database event' }, 400)
  }

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: settings, error: settingsError } = await client
    .from('admin_settings')
    .select('admin_email, brand_name')
    .eq('singleton', true)
    .single()
  if (settingsError) {
    console.error('Could not load registration notification settings:', settingsError.message)
    return json({ error: 'Could not load email settings' }, 500)
  }
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey || !from) {
    return json({ success: true, emailConfigured: false, emailSent: false, adminNotificationSent: false })
  }

  const brand = escapeHtml(settings.brand_name || 'NON MTG QUEEN')
  const name = escapeHtml(event.record.full_name || 'New member')
  const email = escapeHtml(event.record.email)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [event.record.email],
      subject: `Welcome to ${settings.brand_name || 'NON MTG QUEEN'}`,
      html: `<div style="background:#071013;color:#e5e7eb;padding:32px;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;border:1px solid #1f3b33;border-radius:20px;padding:28px;background:#0b1518"><p style="color:#6ee7b7;letter-spacing:3px">${brand}</p><h1 style="color:#fff">Welcome to the community</h1><p>Hello ${name},</p><p>Your account has been created. Please use the separate verification email from our sign-in provider to confirm your email address before logging in.</p><p style="color:#9ca3af">Never share your broker password or one-time codes.</p></div></div>`,
    }),
  }).catch((error: unknown) => {
    console.error('Resend registration email failed:', error)
    return null
  })
  if (!response) return json({ error: 'Registration notification email could not be sent' }, 502)
  if (!response.ok) {
    console.error('Resend registration email failed:', response.status, await response.text())
    return json({ error: 'Registration notification email could not be sent' }, 502)
  }
  if (settings.admin_email) {
    const adminHtml = `<div style="background:#071013;color:#e5e7eb;padding:32px;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;border:1px solid #1f3b33;border-radius:20px;padding:28px;background:#0b1518"><p style="color:#6ee7b7;letter-spacing:3px">${brand}</p><h1 style="color:#fff">New member registration</h1><p>${name} (${email}) has registered and needs email verification.</p></div></div>`
    const adminSent = await sendEmail(
      apiKey,
      from,
      settings.admin_email,
      `${settings.brand_name || 'NON MTG QUEEN'}: new member registration`,
      adminHtml,
    )
    if (!adminSent) return json({ error: 'Member welcome email was sent, but the admin notification could not be sent' }, 502)
  }
  return json({ success: true, emailConfigured: true, emailSent: true, adminNotificationSent: Boolean(settings.admin_email) })
})

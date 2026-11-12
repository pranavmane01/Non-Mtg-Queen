import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const allowedOrigins = new Set([
  'https://non-mtg-queen.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])
const ADMIN_EMAILS = new Set(['pranavmane205@gmail.com', 'queotexsupport@gmail.com'])
const SUPPORT_EMAIL = 'nonmtgqueen.support@gmail.com'
const isAuthorizedAdminEmail = (email: string | undefined) =>
  Boolean(email && ADMIN_EMAILS.has(email.trim().toLowerCase()))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private' },
  })

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!apiKey || !from) return { configured: false, sent: false }

  const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    }).catch((error: unknown) => {
      console.error('Resend request failed:', error)
      return null
    })
  if (!response) return { configured: true, sent: false }
  if (!response.ok) {
    const message = await response.text()
    console.error('Resend request failed:', response.status, message)
    return { configured: true, sent: false }
  }
  return { configured: true, sent: true }
}

async function sendReviewEmails(
  action: string,
  memberEmail: string,
  memberName: string,
  remarks: string | null,
  adminEmail: string | null,
) {
  const safeName = escapeHtml(memberName)
  const safeRemarks = escapeHtml(remarks ?? '')
  const brand = 'NON MTG QUEEN'
  const copy = action === 'APPROVE'
    ? {
        subject: 'Your VIP membership is approved',
        message: 'Congratulations! Your Free VIP Access Has Been Approved.',
      }
    : action === 'REJECT'
      ? {
          subject: 'An update to your VIP application',
          message: `Your application was not approved. Reason: ${safeRemarks}`,
        }
      : action === 'REVOKE_VIP'
        ? {
            subject: 'Your VIP access has changed',
            message: `Your VIP access was revoked by an administrator. Reason: ${safeRemarks}`,
          }
        : {
          subject: 'Please resubmit your Trader ID',
          message: 'An administrator has requested a corrected Trader ID submission.',
        }
  const html = `<div style="background:#071013;color:#e5e7eb;padding:32px;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;border:1px solid #1f3b33;border-radius:20px;padding:28px;background:#0b1518"><p style="color:#6ee7b7;letter-spacing:3px">${brand}</p><h1 style="color:#fff">${copy.subject}</h1><p>Hello ${safeName},</p><p>${copy.message}</p><p style="color:#9ca3af">Trading involves financial risk. Membership does not guarantee trading success.</p><p style="color:#9ca3af">Questions? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#6ee7b7">${SUPPORT_EMAIL}</a>.</p></div></div>`
  const memberResult = await sendEmail(memberEmail, copy.subject, html)
  const adminResult = adminEmail
    ? await sendEmail(adminEmail, `${brand}: ${copy.subject}`, html)
    : { configured: Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM')), sent: false }
  return { configured: memberResult.configured, sent: memberResult.sent && (!adminEmail || adminResult.sent) }
}

const handleRequest = async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  const token = authorization.slice('Bearer '.length)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userResult, error: authError } = await callerClient.auth.getUser(token)
  if (authError || !userResult.user) return json({ error: 'Invalid authentication token' }, 401)
  const caller = userResult.user
  if (!caller.email_confirmed_at) return json({ error: 'Verify your email address before using this service' }, 403)

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400)
  }

  const action = input.action
  const { data: callerProfile, error: profileError } = await service
    .from('profiles')
    .select('id, role, full_name, email, vip_status')
    .eq('id', caller.id)
    .maybeSingle()
  if (profileError || !callerProfile) return json({ error: 'Member profile was not found' }, 403)

  if (action === 'bootstrap_admin') {
    if (!isAuthorizedAdminEmail(caller.email)) return json({ error: 'This account is not eligible for administrator setup' }, 403)
    const setupSecret = Deno.env.get('ADMIN_SETUP_SECRET')
    if (!setupSecret) return json({ error: 'First-admin setup is not configured on the server' }, 503)
    const suppliedSecret = typeof input.setupSecret === 'string' ? input.setupSecret : ''
    if (callerProfile.role === 'admin') return json({ error: 'This account is already an administrator' }, 409)
    if (suppliedSecret.length > 256) return json({ error: 'Provide the one-time setup code' }, 403)
    const encoder = new TextEncoder()
    const [expected, supplied] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(setupSecret)),
      crypto.subtle.digest('SHA-256', encoder.encode(suppliedSecret)),
    ])
    const expectedBytes = new Uint8Array(expected)
    const suppliedBytes = new Uint8Array(supplied)
    let matches = expectedBytes.length === suppliedBytes.length
    for (let index = 0; index < expectedBytes.length; index += 1) {
      matches = (expectedBytes[index] === suppliedBytes[index]) && matches
    }
    if (!matches) return json({ error: 'Invalid first-admin setup code' }, 403)
    const { error: promoteError } = await service.rpc('bootstrap_first_admin', {
      p_user_id: caller.id,
    })
    if (promoteError) return json({ error: promoteError.message }, /already configured|maximum number/i.test(promoteError.message) ? 409 : 500)
    return json({ success: true })
  }

  if (action === 'get_vip_invite') {
    const { data: membership, error: membershipError } = await service
      .from('vip_memberships')
      .select('status')
      .eq('user_id', caller.id)
      .maybeSingle()
    if (membershipError || membership?.status !== 'APPROVED') return json({ error: 'Approved VIP membership is required' }, 403)
    const { data: settings, error } = await service
      .from('admin_settings')
      .select('private_vip_telegram_url')
      .eq('singleton', true)
      .single()
    if (error) return json({ error: 'Could not load VIP access settings' }, 500)
    if (!settings.private_vip_telegram_url) return json({ error: 'The private VIP invitation has not been configured' }, 404)
    return json({ inviteUrl: settings.private_vip_telegram_url })
  }

  if (action === 'notify_submission') {
    if (typeof input.submissionId !== 'string') return json({ error: 'Submission ID is required' }, 400)
    const { data: submission, error: submissionError } = await service
      .from('trader_submissions')
      .select('id, user_id, broker_name, broker_email, trader_id, submitted_at')
      .eq('id', input.submissionId)
      .maybeSingle()
    if (submissionError || !submission || submission.user_id !== caller.id) {
      return json({ error: 'Submission not found or not owned by this member' }, 404)
    }
    const { data: settings, error: settingsError } = await service
      .from('admin_settings')
      .select('admin_email')
      .eq('singleton', true)
      .single()
    if (settingsError) return json({ error: 'Could not load notification settings' }, 500)

    const adminEmail = settings.admin_email
    const safeName = escapeHtml(callerProfile.full_name)
    const safeId = escapeHtml(submission.trader_id)
    const html = `<div style="background:#071013;color:#e5e7eb;padding:32px;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;border:1px solid #1f3b33;border-radius:20px;padding:28px;background:#0b1518"><p style="color:#6ee7b7;letter-spacing:3px">NON MTG QUEEN</p><h1 style="color:#fff">Trader ID submitted</h1><p>Hello ${safeName}, your submission is now pending admin verification.</p><p>Reference: ${escapeHtml(submission.id)}</p><p style="color:#9ca3af">Never share your broker password or one-time codes.</p><p style="color:#9ca3af">Questions? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#6ee7b7">${SUPPORT_EMAIL}</a>.</p></div></div>`
    const memberResult = await sendEmail(caller.email ?? callerProfile.email, 'Trader ID received for verification', html)
    const adminResult = adminEmail
      ? await sendEmail(
          adminEmail,
          'New Trader ID verification submission',
          `<div style="font-family:Arial,sans-serif"><h2>New member submission</h2><p>${safeName} submitted Trader ID ${safeId} for manual review.</p><p>Broker: ${escapeHtml(submission.broker_name)}</p><p>Registered broker email: ${escapeHtml(submission.broker_email ?? 'Not provided')}</p></div>`,
        )
      : { configured: Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM')), sent: false }
    return json({
      success: true,
      emailConfigured: memberResult.configured && Boolean(adminEmail),
      emailSent: memberResult.sent && Boolean(adminEmail) && adminResult.sent,
    })
  }

  if (action === 'get_signed_screenshot') {
    if (callerProfile.role !== 'admin' || !isAuthorizedAdminEmail(caller.email)) return json({ error: 'Administrator access required' }, 403)
    if (typeof input.submissionId !== 'string') return json({ error: 'Submission ID is required' }, 400)
    const { data: submission, error } = await service
      .from('trader_submissions')
      .select('screenshot_path')
      .eq('id', input.submissionId)
      .maybeSingle()
    if (error || !submission?.screenshot_path) return json({ error: 'Screenshot not found' }, 404)
    const { data: signed, error: signedError } = await service.storage
      .from('trader-verification')
      .createSignedUrl(submission.screenshot_path, 60)
    if (signedError || !signed) return json({ error: 'Could not create secure screenshot link' }, 500)
    return json({ signedUrl: signed.signedUrl })
  }

  if (callerProfile.role !== 'admin' || !isAuthorizedAdminEmail(caller.email)) return json({ error: 'Administrator access required' }, 403)

  if (action === 'get_settings') {
    const { data, error } = await service
      .from('admin_settings')
      .select('admin_email, brand_name, public_telegram_url, broker_referral_url, private_vip_telegram_url')
      .eq('singleton', true)
      .single()
    if (error) return json({ error: 'Could not load settings' }, 500)
    return json({ settings: data })
  }

  if (action === 'update_settings') {
    const values = input.settings
    if (!values || typeof values !== 'object') return json({ error: 'Settings are required' }, 400)
    const settings = values as Record<string, unknown>
    const urlFields = ['public_telegram_url', 'broker_referral_url', 'private_vip_telegram_url'] as const
    for (const key of urlFields) {
      const value = settings[key]
      if (value === null || value === '') continue
      if (typeof value !== 'string') return json({ error: `Invalid ${key}` }, 400)
      try {
        if (new URL(value).protocol !== 'https:') return json({ error: `${key} must use HTTPS` }, 400)
      } catch {
        return json({ error: `Invalid ${key}` }, 400)
      }
    }
    for (const key of ['admin_email'] as const) {
      const value = settings[key]
      if (value !== null && value !== '' && (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
        return json({ error: `Invalid ${key}` }, 400)
      }
    }
    const updates = {
      admin_email: typeof settings.admin_email === 'string' ? settings.admin_email.trim() || null : null,
      brand_name: typeof settings.brand_name === 'string' ? settings.brand_name.trim().slice(0, 100) : 'NON MTG QUEEN',
      public_telegram_url: settings.public_telegram_url,
      broker_referral_url: settings.broker_referral_url,
      private_vip_telegram_url: settings.private_vip_telegram_url || null,
      support_email: SUPPORT_EMAIL,
      updated_at: new Date().toISOString(),
    }
    if (typeof updates.public_telegram_url !== 'string' || typeof updates.broker_referral_url !== 'string') {
      return json({ error: 'Public Telegram and broker referral URLs are required' }, 400)
    }
    const { error } = await service.from('admin_settings').upsert({ singleton: true, ...updates })
    if (error) return json({ error: 'Could not save settings' }, 500)
    return json({ success: true })
  }

  const isVipRevocation = action === 'revoke_vip'
  if (action === 'review_submission' || isVipRevocation) {
    const submissionId = input.submissionId
    const reviewAction = input.reviewAction
    const remarks = typeof input.remarks === 'string' ? input.remarks.trim() : null
    if (
      typeof submissionId !== 'string'
      || (isVipRevocation
        ? !remarks
        : !['APPROVE', 'REJECT', 'REQUEST_RESUBMISSION'].includes(String(reviewAction)))
    ) {
      return json({ error: 'Invalid review request' }, 400)
    }
    const { error: reviewError } = isVipRevocation
      ? await service.rpc('revoke_vip_membership', {
          p_submission_id: submissionId,
          p_admin_id: caller.id,
          p_remarks: remarks,
        })
      : await service.rpc('review_trader_submission', {
          p_submission_id: submissionId,
          p_admin_id: caller.id,
          p_action: reviewAction,
          p_remarks: remarks,
        })
    if (reviewError) return json({ error: reviewError.message }, 400)

    const { data: reviewedSubmission, error: reviewedSubmissionError } = await service
      .from('trader_submissions')
      .select('user_id')
      .eq('id', submissionId)
      .single()
    if (reviewedSubmissionError) return json({ error: 'Review was saved, but its member details could not be loaded' }, 500)
    const { data: member, error: memberError } = await service
      .from('profiles')
      .select('full_name, email')
      .eq('id', reviewedSubmission.user_id)
      .single()
    if (memberError) return json({ error: 'Review was saved, but member notification details could not be loaded' }, 500)
    const { data: settings } = await service
      .from('admin_settings')
      .select('admin_email')
      .eq('singleton', true)
      .single()
    const email = await sendReviewEmails(
      isVipRevocation ? 'REVOKE_VIP' : String(reviewAction),
      member.email,
      member.full_name,
      remarks,
      settings?.admin_email ?? null,
    )
    return json({ success: true, emailConfigured: email.configured, emailSent: email.sent })
  }

  return json({ error: 'Unknown action' }, 400)
}

Deno.serve(async (request) => {
  const response = await handleRequest(request)
  const headers = new Headers(response.headers)
  headers.delete('Access-Control-Allow-Origin')
  const origin = request.headers.get('origin')
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})

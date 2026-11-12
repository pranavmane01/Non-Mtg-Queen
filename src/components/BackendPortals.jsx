import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  LockKeyhole,
  LogOut,
  Mail,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { invokeAdmin, supabase } from '../lib/supabase'

const cardClass = 'rounded-[28px] border border-white/10 bg-[#0b1217] p-6'
const fieldClass = 'w-full rounded-2xl border border-white/10 bg-[#0b1014] px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'

function Field({ label, type = 'text', value, onChange, disabled = false, required = false, accept }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={type === 'file' ? undefined : value}
        onChange={(event) => onChange(type === 'file' ? event.target.files?.[0] ?? null : event.target.value)}
        disabled={disabled}
        required={required}
        accept={accept}
        className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-70`}
      />
    </label>
  )
}

function InlineMessage({ error, success }) {
  if (error) return <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
  if (success) return <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{success}</div>
  return null
}

export function MemberDashboard({ currentUser, setCurrentUser, settings }) {
  const navigate = useNavigate()
  const [submissions, setSubmissions] = useState([])
  const [membershipStatus, setMembershipStatus] = useState(currentUser.vipStatus)
  const [notifications, setNotifications] = useState([])
  const [brokerName, setBrokerName] = useState('')
  const [brokerEmail, setBrokerEmail] = useState('')
  const [traderId, setTraderId] = useState('')
  const [screenshot, setScreenshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    setError('')
    const [submissionResult, membershipResult, notificationResult] = await Promise.all([
      supabase.from('trader_submissions').select('id, broker_name, broker_email, trader_id, screenshot_path, status, rejection_reason, resubmission_requested, submitted_at').eq('user_id', currentUser.id).order('submitted_at', { ascending: false }),
      supabase.from('vip_memberships').select('status').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('notifications').select('id, title, message, is_read, created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(30),
    ])
    const queryError = submissionResult.error || membershipResult.error || notificationResult.error
    if (queryError) {
      setError(queryError.message)
      setLoading(false)
      return
    }
    const rows = submissionResult.data ?? []
    const nextMembershipStatus = membershipResult.data?.status ?? rows[0]?.status ?? 'NOT_SUBMITTED'
    setSubmissions(rows)
    setMembershipStatus(nextMembershipStatus)
    setCurrentUser((user) => user?.id === currentUser.id ? { ...user, vipStatus: nextMembershipStatus } : user)
    setNotifications(notificationResult.data ?? [])
    setLoading(false)
  }, [currentUser.id, setCurrentUser])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const latestSubmission = submissions[0]
  const resubmissionAllowed = Boolean(latestSubmission?.resubmission_requested)
  const canSubmit = !latestSubmission || (latestSubmission.status === 'REJECTED' && resubmissionAllowed)
  const status = membershipStatus || 'NOT_SUBMITTED'
  const statusMessage = {
    NOT_SUBMITTED: 'Your Trader ID has not been submitted yet.',
    PENDING: 'Your Trader ID is currently under verification. Please wait for admin approval.',
    APPROVED: 'Congratulations! Your Free VIP Access Has Been Approved.',
    REJECTED: latestSubmission?.rejection_reason
      ? `Your application was rejected: ${latestSubmission.rejection_reason}`
      : resubmissionAllowed
        ? 'An administrator requested a resubmission. You may update your Trader ID below.'
        : 'Your application was rejected. Contact support if you believe this is incorrect.',
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }
    if (!canSubmit) {
      setError('A submission is already pending or approved. Wait for admin review before submitting again.')
      return
    }
    if (!brokerName.trim() || !brokerEmail.trim() || !traderId.trim()) {
      setError('Enter your broker name, registered broker email and Trader ID.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brokerEmail.trim())) {
      setError('Enter a valid registered broker email address.')
      return
    }
    if (screenshot && (!['image/jpeg', 'image/png', 'image/webp'].includes(screenshot.type) || screenshot.size > 5 * 1024 * 1024)) {
      setError('Screenshot must be a JPG, PNG or WebP image no larger than 5 MB.')
      return
    }

    setSubmitting(true)
    let uploadedPath = null
    try {
      if (screenshot) {
        const extension = screenshot.type === 'image/jpeg' ? 'jpg' : screenshot.type.split('/')[1]
        uploadedPath = `${currentUser.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('trader-verification')
          .upload(uploadedPath, screenshot, { contentType: screenshot.type, upsert: false })
        if (uploadError) throw uploadError
      }

      const { data: submission, error: submissionError } = await supabase
        .from('trader_submissions')
        .insert({
          user_id: currentUser.id,
          broker_name: brokerName.trim(),
          broker_email: brokerEmail.trim().toLowerCase(),
          trader_id: traderId.trim(),
          screenshot_path: uploadedPath,
        })
        .select('id')
        .single()
      if (submissionError) throw submissionError

      setSuccess('Your Trader ID was submitted for verification.')
      setBrokerName('')
      setBrokerEmail('')
      setTraderId('')
      setScreenshot(null)
      await refresh()
      try {
        const mailResult = await invokeAdmin('notify_submission', { submissionId: submission.id })
        if (!mailResult.emailConfigured) setSuccess('Submission saved. Email notifications are not configured yet.')
        else if (!mailResult.emailSent) setSuccess('Submission saved, but an email notification could not be sent. Please contact support.')
      } catch (mailError) {
        console.error('Submission email notification failed:', mailError)
        setSuccess('Submission saved. Email notification failed; the admin can still review it in the dashboard.')
      }
    } catch (submitError) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('trader-verification').remove([uploadedPath])
        if (cleanupError) console.error('Could not remove unreferenced screenshot:', cleanupError.message)
      }
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    const { error: logoutError } = await supabase.auth.signOut()
    if (logoutError) {
      setError(logoutError.message)
      return
    }
    setCurrentUser(null)
    navigate('/login')
  }

  const markRead = async (notification) => {
    if (notification.is_read) return
    const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
  }

  return (
    <div className="min-h-screen bg-[#05080B] text-slate-100">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-white/10 bg-[#0b1217] p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-lg font-black text-emerald-300">N</div>
            <div><div className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Member portal</div><div className="text-lg font-semibold">{settings.brandName}</div></div>
          </div>
          <nav className="space-y-2 text-sm text-slate-300">
            {[['Overview', '#overview'], ['My Profile', '#profile'], ['Telegram Community', '#telegram'], ['Create Broker Account', '#broker'], ['Submit Trader ID', '#submission'], ['VIP Membership', '#vip'], ['Notifications', '#notifications']].map(([label, href]) => (
              <a key={label} href={href} className="block rounded-2xl border border-transparent px-3 py-2.5 hover:border-emerald-400/20 hover:bg-white/5 hover:text-white">{label}</a>
            ))}
            <button type="button" onClick={handleLogout} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-slate-200">Logout <LogOut size={16} /></button>
          </nav>
        </aside>

        <main className="flex-1 space-y-6">
          <div id="overview" className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-xs uppercase tracking-[0.24em] text-emerald-300/75">Welcome back</div><h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">{currentUser.fullName}</h1></div>
              <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">Logout <LogOut size={16} /></button>
            </div>
          </div>
          <InlineMessage error={error} success={success} />

          <div id="profile" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Member ID', value: currentUser.memberId, icon: Shield },
              { label: 'Email', value: currentUser.email, icon: Mail },
              { label: 'Verification status', value: loading ? 'Loading…' : status, icon: ShieldCheck },
              { label: 'Registration date', value: new Date(currentUser.createdAt).toLocaleDateString(), icon: CalendarDays },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-[24px] border border-white/10 bg-[#0b1217] p-5">
                <div className="mb-3 inline-flex rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><Icon size={18} /></div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
                <div className="mt-3 break-words text-lg font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <section id="vip" className={cardClass}>
                <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold text-white">VIP Membership</h2><span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-200">{status}</span></div>
                <p className="text-base leading-7 text-slate-200">{statusMessage[status] || statusMessage.NOT_SUBMITTED}</p>
                {status === 'APPROVED' && <Link to="/vip" className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Open VIP Dashboard <ArrowRight size={16} /></Link>}
              </section>

              <section id="submission" className={cardClass}>
                <h2 className="text-xl font-bold text-white">Submit Trader ID</h2>
                <p className="mt-2 text-sm text-slate-300">After opening a broker account, submit your Trader ID for manual verification. We never request broker passwords or one-time codes.</p>
                <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Member Name" value={currentUser.fullName} onChange={() => {}} disabled />
                    <Field label="Member Email" type="email" value={currentUser.email} onChange={() => {}} disabled />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Broker Name" value={brokerName} onChange={setBrokerName} required disabled={!canSubmit || submitting} />
                    <Field label="Trader ID" value={traderId} onChange={setTraderId} required disabled={!canSubmit || submitting} />
                  </div>
                  <Field label="Registered Broker Email" type="email" value={brokerEmail} onChange={setBrokerEmail} required disabled={!canSubmit || submitting} />
                  <Field label="Optional screenshot (JPG, PNG or WebP, max 5 MB)" type="file" accept="image/jpeg,image/png,image/webp" onChange={setScreenshot} disabled={!canSubmit || submitting} />
                  {screenshot && <p className="text-xs text-slate-400">Selected file: {screenshot.name} ({Math.ceil(screenshot.size / 1024)} KB)</p>}
                  <button type="submit" disabled={!canSubmit || submitting || loading} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting ? 'SUBMITTING…' : 'SUBMIT FOR VERIFICATION'} <Send size={16} />
                  </button>
                  {!canSubmit && <p className="text-sm text-slate-400">Your current application cannot be resubmitted unless an administrator requests it.</p>}
                </form>
              </section>

              <section className={cardClass}>
                <h2 className="text-xl font-bold text-white">Your submissions</h2>
                {submissions.length ? (
                  <div className="mt-4 space-y-3">
                    {submissions.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.broker_name} · {item.trader_id}</strong><span className="text-xs text-emerald-200">{item.status}</span></div>
                        {item.broker_email && <p className="mt-2 text-xs text-slate-400">Registered broker email: {item.broker_email}</p>}
                        <p className="mt-2 text-xs text-slate-400">Submitted {new Date(item.submitted_at).toLocaleString()}</p>
                        {item.rejection_reason && <p className="mt-2 text-sm text-amber-100">Admin note: {item.rejection_reason}</p>}
                        {item.screenshot_path && <p className="mt-2 text-xs text-slate-400">Verification screenshot uploaded securely.</p>}
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-slate-400">No Trader ID submissions yet.</p>}
              </section>
            </div>

            <div className="space-y-6">
              <section id="telegram" className={cardClass}>
                <h2 className="text-xl font-bold text-white">Join Our Telegram Community</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">Connect with our trading community, receive updates and learn together.</p>
                <a href={settings.publicTelegramUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-200">JOIN TELEGRAM <ArrowRight size={16} /></a>
              </section>

              <section id="broker" className={cardClass}>
                <h2 className="text-xl font-bold text-white">Create Your Broker Account</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">Use the referral link to create your broker account, then find your Trader ID in your broker’s account details. Do not share broker passwords or OTPs.</p>
                <a href={settings.brokerReferralUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950">CREATE ACCOUNT <ArrowRight size={16} /></a>
              </section>

              <section id="notifications" className={cardClass}>
                <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-white">Notifications</h2><Bell size={17} className="text-emerald-300" /></div>
                <div className="mt-5 space-y-3">
                  {notifications.length ? notifications.map((item) => (
                    <button key={item.id} type="button" onClick={() => markRead(item)} className={`w-full rounded-2xl border p-3 text-left ${item.is_read ? 'border-white/10 bg-white/5' : 'border-emerald-400/20 bg-emerald-500/5'}`}>
                      <div className="text-sm font-semibold text-white">{item.title}</div><p className="mt-2 text-xs leading-6 text-slate-300">{item.message}</p><p className="mt-2 text-[10px] text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
                    </button>
                  )) : <p className="text-sm text-slate-400">No notifications yet.</p>}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export function VipDashboard({ currentUser }) {
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    invokeAdmin('get_vip_invite')
      .then((result) => { if (active) setInviteUrl(result.inviteUrl) })
      .catch((inviteError) => { if (active) setError(inviteError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[30px] border border-emerald-400/20 bg-[#0c1418] p-8 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em] ${inviteUrl ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}><ShieldCheck size={14} /> {loading ? 'Checking access' : inviteUrl ? 'VIP approved' : 'Access restricted'}</div>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.06em] text-white">{inviteUrl ? 'Welcome to VIP Community' : 'VIP access'}</h1>
          <p className="mt-3 max-w-2xl text-slate-300">{inviteUrl ? 'Your membership access is checked by the server before the private invite is returned.' : 'The private VIP invitation is available only while your membership is approved.'}</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ['Membership', inviteUrl ? 'ACTIVE' : loading ? 'CHECKING' : 'INACTIVE'],
              ['Status', inviteUrl ? 'APPROVED' : loading ? 'CHECKING' : 'NOT APPROVED'],
              ['Member ID', currentUser.memberId],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div><div className="mt-3 text-xl font-bold text-white">{value}</div></div>)}
          </div>
          <InlineMessage error={error} />
          {loading ? <div className="mt-8 animate-pulse text-emerald-200">Verifying VIP access…</div> : inviteUrl && <a href={inviteUrl} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">JOIN PRIVATE VIP TELEGRAM <ArrowRight size={18} /></a>}
          <Link to="/dashboard" className="mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white">Return to dashboard</Link>
        </div>
        <div className={`mt-8 ${cardClass}`}>
          <h2 className="text-2xl font-bold text-white">VIP announcements</h2>
          <p className="mt-4 text-slate-300">Check your private Telegram community for member announcements and updates.</p>
        </div>
      </div>
    </div>
  )
}

export function AdminPanel({ currentUser, setCurrentUser, updatePublicSettings }) {
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [notifications, setNotifications] = useState([])
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const [profilesResult, submissionsResult, notificationsResult, historyResult] = await Promise.all([
        supabase.from('profiles').select('id, member_id, full_name, email, mobile, role, vip_status, created_at').neq('role', 'admin').order('created_at', { ascending: false }),
        supabase.from('trader_submissions').select('id, user_id, broker_name, broker_email, trader_id, screenshot_path, status, rejection_reason, resubmission_requested, submitted_at, reviewed_at, reviewed_by').order('submitted_at', { ascending: false }),
        supabase.from('notifications').select('id, user_id, title, message, is_read, created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('verification_history').select('id, submission_id, admin_id, action, remarks, created_at').order('created_at', { ascending: false }).limit(200),
      ])
      const queryError = profilesResult.error || submissionsResult.error || notificationsResult.error || historyResult.error
      if (queryError) {
        setError(queryError.message)
        return
      }
      setMembers(profilesResult.data ?? [])
      setSubmissions(submissionsResult.data ?? [])
      setNotifications(notificationsResult.data ?? [])
      setHistory(historyResult.data ?? [])
      const result = await invokeAdmin('get_settings')
      setSettings(result.settings)
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Could not load administrator data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const submissionsByUser = useMemo(() => {
    const lookup = new Map()
    submissions.forEach((submission) => {
      if (!lookup.has(submission.user_id)) lookup.set(submission.user_id, submission)
    })
    return lookup
  }, [submissions])

  const memberRows = useMemo(() => members.map((member) => ({
    ...member,
    submission: submissionsByUser.get(member.id),
    status: submissionsByUser.get(member.id)?.status || member.vip_status || 'NOT_SUBMITTED',
  })), [members, submissionsByUser])

  const filtered = memberRows.filter((member) => {
    const needle = `${member.full_name} ${member.email} ${member.member_id} ${member.submission?.trader_id ?? ''} ${member.submission?.broker_email ?? ''}`.toLowerCase()
    return needle.includes(search.toLowerCase()) && (statusFilter === 'ALL' || member.status === statusFilter)
  })
  const selectedHistory = selected
    ? history.filter((item) => submissions.some((submission) => submission.id === item.submission_id && submission.user_id === selected.id))
    : []

  const stats = {
    members: members.length,
    pending: submissions.filter((submission) => submission.status === 'PENDING').length,
    approved: submissions.filter((submission) => submission.status === 'APPROVED').length,
    rejected: submissions.filter((submission) => submission.status === 'REJECTED').length,
    newMembers: members.filter((member) => Date.now() - new Date(member.created_at).getTime() < 7 * 86400000).length,
  }

  const handleReview = async (submission, action) => {
    if (!submission || !window.confirm(`Confirm ${action.replaceAll('_', ' ').toLowerCase()} for this Trader ID submission?`)) return
    let remarks = null
    if (action === 'REJECT' || action === 'REVOKE_VIP') {
      remarks = window.prompt(action === 'REVOKE_VIP' ? 'Enter the reason for revoking VIP access:' : 'Enter the rejection reason for the member:')?.trim()
      if (!remarks) {
        setError(action === 'REVOKE_VIP' ? 'A revocation reason is required.' : 'A rejection reason is required.')
        return
      }
      if (remarks.length > 2000) {
        setError('Remarks must be 2000 characters or fewer.')
        return
      }
    }
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const result = action === 'REVOKE_VIP'
        ? await invokeAdmin('revoke_vip', { submissionId: submission.id, remarks })
        : await invokeAdmin('review_submission', {
            submissionId: submission.id,
            reviewAction: action,
            remarks,
          })
      setSuccess(result.emailConfigured
        ? result.emailSent ? 'Review saved; notifications sent.' : 'Review saved, but email delivery failed.'
        : 'Review saved. Email notifications are not configured.')
      await refresh()
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setSaving(false)
    }
  }

  const viewScreenshot = async (submissionId) => {
    setError('')
    try {
      const result = await invokeAdmin('get_signed_screenshot', { submissionId })
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (screenshotError) {
      setError(screenshotError.message)
    }
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await invokeAdmin('update_settings', { settings })
      updatePublicSettings(settings)
      setSuccess('Website settings saved.')
    } catch (settingsError) {
      setError(settingsError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      const { error: logoutError } = await supabase.auth.signOut()
      if (logoutError) {
        setError(logoutError.message)
        return
      }
      setCurrentUser(null)
      navigate('/login')
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Could not sign out. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl lg:flex lg:items-start lg:gap-6">
        <aside className="mb-6 rounded-[28px] border border-white/10 bg-[#0b1217] p-4 lg:sticky lg:top-6 lg:mb-0 lg:w-60 lg:shrink-0">
          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-emerald-300/70">Owner panel</div>
          <nav className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-1">
            <a href="#admin-overview" className="rounded-xl px-3 py-2 hover:bg-white/5">Overview</a>
            <a href="#admin-members" onClick={() => setStatusFilter('ALL')} className="rounded-xl px-3 py-2 hover:bg-white/5">Members</a>
            <button type="button" onClick={() => { setStatusFilter('PENDING'); document.getElementById('admin-members')?.scrollIntoView() }} className="rounded-xl px-3 py-2 text-left hover:bg-white/5">Trader ID Verification</button>
            <button type="button" onClick={() => { setStatusFilter('APPROVED'); document.getElementById('admin-members')?.scrollIntoView() }} className="rounded-xl px-3 py-2 text-left hover:bg-white/5">Approved VIP</button>
            <button type="button" onClick={() => { setStatusFilter('REJECTED'); document.getElementById('admin-members')?.scrollIntoView() }} className="rounded-xl px-3 py-2 text-left hover:bg-white/5">Rejected Members</button>
            <a href="#admin-notifications" className="rounded-xl px-3 py-2 hover:bg-white/5">Notifications</a>
            <a href="#admin-settings" className="rounded-xl px-3 py-2 hover:bg-white/5">Website Settings</a>
            <button type="button" onClick={handleLogout} className="rounded-xl px-3 py-2 text-left text-slate-300 hover:bg-white/5">Logout</button>
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
        <header className={`${cardClass} mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}>
          <div><div className="text-xs uppercase tracking-[0.25em] text-emerald-300/70">Owner panel</div><h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">Admin dashboard</h1><p className="mt-1 text-sm text-slate-400">Signed in as {currentUser.email}</p></div>
          <div className="flex gap-3"><button type="button" onClick={() => refresh()} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm">Refresh</button><button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm">Logout <LogOut size={16} /></button></div>
        </header>
        <InlineMessage error={error} success={success} />
        {loading && <div className="my-4 animate-pulse text-emerald-200">Loading administrator data…</div>}

        <div id="admin-overview" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total members', stats.members, Users],
            ['Pending applications', stats.pending, CircleAlert],
            ['Approved VIP', stats.approved, ShieldCheck],
            ['Rejected applications', stats.rejected, LockKeyhole],
            ['New registrations (7d)', stats.newMembers, FileCheck2],
          ].map(([label, value, Icon]) => <div key={label} className="rounded-[24px] border border-white/10 bg-[#0b1217] p-5"><div className="mb-3 inline-flex rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><Icon size={18} /></div><div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div><div className="mt-3 text-3xl font-black text-white">{value}</div></div>)}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section id="admin-members" className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-white">Member management & verification</h2>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or Trader ID" className="w-44 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" /></div>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-full border border-white/10 bg-[#0f171b] px-3 py-2 text-sm text-slate-200"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="NOT_SUBMITTED">Not submitted</option></select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead><tr className="border-b border-white/10 text-xs uppercase tracking-[0.15em] text-slate-400"><th className="px-3 py-3">Member</th><th className="px-3 py-3">Email / ID</th><th className="px-3 py-3">Broker / Trader ID</th><th className="px-3 py-3">Submitted</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead>
                <tbody>
                  {filtered.map((member) => (
                    <tr key={member.id} className="border-b border-white/10 align-top">
                      <td className="px-3 py-4"><button type="button" onClick={() => setSelected(member)} className="font-semibold text-white hover:text-emerald-200">{member.full_name}</button><div className="mt-1 text-xs text-slate-500">{member.mobile || 'No mobile provided'}</div></td>
                      <td className="px-3 py-4"><div>{member.email}</div><div className="mt-1 text-xs text-slate-500">{member.member_id}</div></td>
                      <td className="px-3 py-4"><div>{member.submission?.broker_name || '—'}</div><div className="mt-1 text-xs text-slate-400">{member.submission?.trader_id || 'No submission'}</div>{member.submission?.broker_email && <div className="mt-1 text-xs text-slate-500">{member.submission.broker_email}</div>}</td>
                      <td className="px-3 py-4 text-xs">{member.submission ? new Date(member.submission.submitted_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-4"><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em]">{member.status}</span></td>
                      <td className="px-3 py-4"><div className="flex min-w-44 flex-wrap gap-2">
                        <button type="button" onClick={() => setSelected(member)} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">View</button>
                        {member.submission?.status === 'PENDING' && <>
                          <button type="button" disabled={saving} onClick={() => handleReview(member.submission, 'APPROVE')} className="rounded-full bg-emerald-500 px-2 py-1 text-xs font-semibold text-slate-950 disabled:opacity-50">Approve</button>
                          <button type="button" disabled={saving} onClick={() => handleReview(member.submission, 'REJECT')} className="rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Reject</button>
                          <button type="button" disabled={saving} onClick={() => handleReview(member.submission, 'REQUEST_RESUBMISSION')} className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 disabled:opacity-50">Request resubmission</button>
                        </>}
                        {member.submission?.status === 'APPROVED' && <button type="button" disabled={saving} onClick={() => handleReview(member.submission, 'REVOKE_VIP')} className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-1 text-xs text-red-100 disabled:opacity-50">Revoke VIP</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && !loading && <p className="py-6 text-center text-sm text-slate-400">No members match this filter.</p>}
            </div>
          </section>

          <section id="admin-settings" className={cardClass}>
            <h2 className="text-xl font-bold text-white">Website settings</h2>
            {settings ? <form onSubmit={saveSettings} className="mt-5 space-y-4">
              {[
                ['Admin notification email', 'admin_email'],
                ['Brand name', 'brand_name'],
                ['Public Telegram URL', 'public_telegram_url'],
                ['Broker referral URL', 'broker_referral_url'],
                ['Private VIP Telegram URL', 'private_vip_telegram_url'],
                ['Support email', 'support_email'],
              ].map(([label, key]) => <Field key={key} label={label} value={settings[key] || ''} onChange={(value) => setSettings((prev) => ({ ...prev, [key]: value }))} />)}
              <p className="text-xs leading-5 text-amber-100/80">The private invitation is only returned by an authenticated server function to members whose VIP status is approved.</p>
              <p className="text-xs leading-5 text-slate-400">Email delivery status is shown after submissions and reviews. Configure Resend credentials and a verified sender as server-side Supabase Function secrets to enable email notifications.</p>
              <button type="submit" disabled={saving} className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{saving ? 'SAVING…' : 'SAVE SETTINGS'}</button>
            </form> : <p className="mt-4 text-sm text-slate-400">Settings unavailable until the Edge Function is deployed.</p>}
          </section>
        </div>

        <section id="admin-notifications" className={`mt-8 ${cardClass}`}>
          <h2 className="text-xl font-bold text-white">Admin notifications</h2>
          <div className="mt-4 space-y-3">
            {notifications.slice(0, 12).map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Bell size={14} />{item.title}</div><p className="mt-1 text-xs text-slate-300">{item.message}</p><p className="mt-1 text-[10px] text-slate-500">{new Date(item.created_at).toLocaleString()}</p></div>)}
            {!notifications.length && <p className="text-sm text-slate-400">No notifications yet.</p>}
          </div>
        </section>

        {selected && <div className={`mt-8 ${cardClass}`}><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-white">Member profile & submission</h2><button type="button" onClick={() => setSelected(null)} className="text-sm text-slate-300">Close</button></div><div className="mt-5 grid gap-6 md:grid-cols-2"><div className="space-y-3 text-sm text-slate-200"><div>Full name: {selected.full_name}</div><div>Member ID: {selected.member_id}</div><div>Email: {selected.email}</div><div>Mobile: {selected.mobile || 'Not provided'}</div><div>Registered: {new Date(selected.created_at).toLocaleString()}</div><div>Broker: {selected.submission?.broker_name || 'No submission'}</div><div>Registered broker email: {selected.submission?.broker_email || 'Not provided'}</div><div>Trader ID: {selected.submission?.trader_id || 'No submission'}</div><div>Submission date: {selected.submission ? new Date(selected.submission.submitted_at).toLocaleString() : '—'}</div><div>Verification status: {selected.status}</div><div>Admin remarks: {selected.submission?.rejection_reason || '—'}</div></div><div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-white">Verification screenshot</h3>{selected.submission?.screenshot_path ? <button type="button" onClick={() => viewScreenshot(selected.submission.id)} className="mt-4 rounded-full border border-emerald-400/30 px-4 py-2 text-sm text-emerald-200">Create secure 60-second view link</button> : <p className="mt-4 text-sm text-slate-400">No screenshot uploaded.</p>}</div></div><div className="mt-6"><h3 className="font-semibold text-white">Verification history</h3><div className="mt-3 space-y-2">{selectedHistory.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"><div>{item.action} · {new Date(item.created_at).toLocaleString()}</div>{item.remarks && <div className="mt-1 text-slate-400">{item.remarks}</div>}</div>)}{!selectedHistory.length && <p className="text-sm text-slate-400">No review history recorded.</p>}</div></div></div>}
        </div>
      </div>
    </div>
  )
}

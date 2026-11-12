import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { invokeAdmin, isSupabaseConfigured, supabase, supabaseConfigError } from './lib/supabase'
import {
  AdminPanel,
  MemberDashboard as SecureMemberDashboard,
  VipDashboard as SecureVipDashboard,
} from './components/BackendPortals'
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Coins,
  FileCheck2,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Phone,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCircle2,
  UserRoundCheck,
  Users,
  WalletCards,
} from 'lucide-react'

const TELEGRAM_URL = 'https://t.me/+Gfmw8VN2tJhjZTM1'
const BROKER_URL = 'https://broker-qx.pro/sign-up/?lid=2383209'

const DEFAULT_SETTINGS = {
  brandName: 'NON MTG QUEEN',
  publicTelegramUrl: TELEGRAM_URL,
  brokerReferralUrl: BROKER_URL,
  supportEmail: '',
}

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [backendReady, setBackendReady] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [serviceMessage, setServiceMessage] = useState(
    isSupabaseConfigured
      ? 'Checking Supabase database and public settings…'
      : supabaseConfigError,
  )

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const loadProfile = async (authUser) => {
      if (!authUser) {
        if (active) setCurrentUser(null)
        return
      }
      let data
      let error
      try {
        ({ data, error } = await supabase
          .from('profiles')
          .select('id, member_id, full_name, email, mobile, role, vip_status, created_at')
          .eq('id', authUser.id)
          .maybeSingle())
      } catch (profileError) {
        if (!active) return
        setCurrentUser(null)
        setServiceMessage(profileError instanceof Error ? profileError.message : 'Your member profile could not be loaded.')
        return
      }
      if (!active) return
      if (error || !data) {
        setCurrentUser(null)
        setServiceMessage(error?.message || 'Your member profile is not available. Apply the Supabase migration and try signing in again.')
        return
      }
      setCurrentUser({
        id: data.id,
        memberId: data.member_id,
        fullName: data.full_name,
        email: data.email,
        mobile: data.mobile,
        role: data.role,
        vipStatus: data.vip_status,
        createdAt: data.created_at,
      })
    }

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          setServiceMessage(error.message)
          return
        }
        return loadProfile(data.session?.user ?? null)
      })
      .catch((sessionError) => {
        if (active) {
          setCurrentUser(null)
          setServiceMessage(sessionError instanceof Error ? sessionError.message : 'Could not restore your sign-in session.')
        }
      })
      .finally(() => {
        if (active) setAuthReady(true)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        loadProfile(session?.user ?? null).finally(() => {
          if (active) setAuthReady(true)
        })
      }, 0)
    })

    supabase.functions.invoke('public-settings').then(({ data, error }) => {
      if (error) {
        console.error('Public settings unavailable:', error.message)
        if (active) {
          setBackendReady(false)
          setServiceMessage('Supabase is reachable, but the backend schema or public-settings function is not ready. Apply the migration and deploy the functions before registering.')
        }
        return
      }
      if (!data?.settings) {
        if (active) {
          setBackendReady(false)
          setServiceMessage('Supabase responded, but public database settings are unavailable. Apply the database migration and deploy the public-settings function.')
        }
        return
      }
      if (!active) return
      setBackendReady(true)
      setServiceMessage('Supabase database connected; public settings loaded successfully.')
      setSettings({
        brandName: data.settings.brand_name || DEFAULT_SETTINGS.brandName,
        publicTelegramUrl: data.settings.public_telegram_url || TELEGRAM_URL,
        brokerReferralUrl: data.settings.broker_referral_url || BROKER_URL,
        supportEmail: data.settings.support_email || DEFAULT_SETTINGS.supportEmail,
      })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const adminPanel = (
    <AdminRoute user={currentUser} authReady={authReady}>
      <AdminPanel
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        updatePublicSettings={(saved) => setSettings({
          brandName: saved.brand_name || DEFAULT_SETTINGS.brandName,
          publicTelegramUrl: saved.public_telegram_url || TELEGRAM_URL,
          brokerReferralUrl: saved.broker_referral_url || BROKER_URL,
          supportEmail: saved.support_email || DEFAULT_SETTINGS.supportEmail,
        })}
      />
    </AdminRoute>
  )

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#05080B] text-white antialiased">
        <div className="border-b border-white/10 bg-[#0b1116]/90" role="status">
          <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-emerald-200/90 sm:px-6 lg:px-8">
            {serviceMessage}
          </div>
        </div>

        <Routes>
          <Route path="/" element={<HomePage settings={settings} />} />
          <Route path="/login" element={<LoginPage setCurrentUser={setCurrentUser} />} />
          <Route path="/admin/login" element={currentUser?.role === 'admin' ? <Navigate to="/admin" replace /> : <LoginPage setCurrentUser={setCurrentUser} adminOnly />} />
          <Route path="/register" element={<RegisterPage backendReady={backendReady} />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/admin/setup" element={<ProtectedRoute user={currentUser} authReady={authReady}><AdminSetupPage /></ProtectedRoute>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute user={currentUser} authReady={authReady}>
                <SecureMemberDashboard
                  currentUser={currentUser}
                  setCurrentUser={setCurrentUser}
                  settings={settings}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vip"
            element={
              <ProtectedRoute user={currentUser} authReady={authReady}>
                <SecureVipDashboard currentUser={currentUser} />
              </ProtectedRoute>
            }
          />
          <Route path="/admin" element={adminPanel} />
          <Route path="/admin/:section" element={adminPanel} />
          <Route path="/privacy-policy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />
          <Route path="/risk-disclaimer" element={<LegalPage type="risk" />} />
          <Route path="/vip-membership" element={<VipMembershipPage brokerReferralUrl={settings.brokerReferralUrl} />} />
          <Route path="/contact" element={<ContactPage supportEmail={settings.supportEmail} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

function ProtectedRoute({ user, authReady, children }) {
  if (!authReady) return <LoadingPage />
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

function AdminRoute({ user, authReady, children }) {
  if (!authReady) return <LoadingPage />
  if (!user || user.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }
  return children
}

function LoadingPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-[#05080B] text-emerald-200">
      <div className="animate-pulse rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 py-3">Loading secure session…</div>
    </div>
  )
}
function HomePage({ settings }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navItems = [
    ['Home', '#home'],
    ['About', '#about'],
    ['Our Services', '#services'],
    ['How It Works', '#how-it-works'],
    ['Community', '#community'],
    ['VIP Membership', '#vip-membership'],
    ['FAQ', '#faq'],
    ['Contact', '#contact'],
  ]

  const featureCards = [
    {
      title: 'Premium market insights',
      text: 'Learn trading frameworks with a focused, disciplined community built around education and risk management.',
      icon: TrendingUp,
    },
    {
      title: 'Member-first access',
      text: 'From onboarding to VIP approval, each member path is designed to be transparent and structured.',
      icon: Users,
    },
    {
      title: 'Secure verification',
      text: 'Broker signup and Trader ID review protect the VIP process while keeping the community compliant.',
      icon: ShieldCheck,
    },
  ]

  const steps = [
    'Create your account and activate your secure profile.',
    'Submit your Trader ID through the dashboard after opening a broker account.',
    'Complete verification and unlock the VIP community once approved.',
  ]

  const faqs = [
    {
      q: 'Do I need to deposit money to join?',
      a: 'No. Membership is free, and earnings potential is never guaranteed. This is an educational trading community.',
    },
    {
      q: 'How does VIP access work?',
      a: 'Members complete the broker account flow and Trader ID submission for manual review. VIP access is unlocked only after approval.',
    },
    {
      q: 'Is this a guaranteed profit service?',
      a: 'No. Educational content and community support do not guarantee investment returns or profits.',
    },
  ]

  return (
    <div className="bg-[#05080B] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070b0d]/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-lg font-black text-emerald-300">
              N
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Trading community</div>
              <div className="text-lg font-semibold text-white">{settings.brandName}</div>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm text-slate-300 lg:flex">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} className="transition hover:text-emerald-300">
                {label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <Link to="/login" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-400/50 hover:text-white">
              Login
            </Link>
            <Link to="/register" className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-2 text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(52,211,153,0.35)] transition hover:brightness-110">
              Register
            </Link>
          </div>

          <button type="button" aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 lg:hidden">
            <Menu size={18} />
          </button>
        </nav>
        {mobileMenuOpen && <div className="space-y-1 border-t border-white/10 px-4 py-3 lg:hidden">
          {navItems.map(([label, href]) => <a key={label} href={href} onClick={() => setMobileMenuOpen(false)} className="block rounded-xl px-3 py-2 text-sm text-slate-200 hover:bg-white/5">{label}</a>)}
          <div className="flex gap-3 pt-2">
            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="flex-1 rounded-full border border-white/15 px-4 py-2 text-center text-sm">Login</Link>
            <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="flex-1 rounded-full bg-emerald-400 px-4 py-2 text-center text-sm font-bold text-slate-950">Register</Link>
          </div>
        </div>}
      </header>

      <main>
        <section id="home" className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),transparent_38%),radial-gradient(circle_at_right,_rgba(251,191,36,0.1),transparent_32%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-12 pt-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-20 lg:pt-20">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-emerald-200">
                <Sparkles size={14} />
                Premium trading community
              </div>
              <h1 className="max-w-xl text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl lg:text-6xl">
                TRADE SMARTER. LEARN TOGETHER. GROW TOGETHER.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Join {settings.brandName}, a trading community where members connect, learn trading concepts and access our exclusive VIP community after verification.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a href={settings.publicTelegramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20">
                  JOIN TELEGRAM COMMUNITY <ArrowRight size={18} />
                </a>
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-6 py-3 font-bold text-slate-950 shadow-[0_0_26px_rgba(52,211,153,0.3)] transition hover:brightness-110">
                  GET FREE VIP ACCESS
                </Link>
                <a href={settings.brokerReferralUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 font-semibold text-slate-200 transition hover:border-emerald-400/40">
                  CREATE BROKER ACCOUNT
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Free community access</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">VIP verification process</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Member dashboard</span>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="relative">
              <div className="relative rounded-[30px] border border-white/10 bg-white/5 p-5 shadow-[0_0_60px_rgba(16,185,129,0.12)] backdrop-blur-xl">
                <div className="absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.2),transparent_35%)]" />
                <div className="relative space-y-4">
                  <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/15 to-black/20 p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.25em] text-emerald-200/80">Community approach</div>
                      <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200">EDUCATION</div>
                    </div>
                    <div className="mt-6 flex items-end gap-3">
                      <div className="text-3xl font-black text-white">Process over promises</div>
                    </div>
                    <div className="mt-5 flex h-24 items-center rounded-xl bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(255,255,255,0.04))] p-4">
                      <div className="flex h-full items-end gap-2">
                        <p className="text-sm leading-6 text-emerald-50">Learn responsibly. Verify securely. Build a consistent routine.</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-[#0d1418] p-4">
                      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Learning</div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><Users size={20} /></div>
                        <div className="text-base font-semibold text-white">Community-led</div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#0d1418] p-4">
                      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">VIP access</div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="rounded-xl bg-amber-500/10 p-2 text-amber-300"><ShieldCheck size={20} /></div>
                        <div className="text-base font-semibold text-white">Manually reviewed</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="About" heading="A disciplined community built for serious traders" description="NON MTG QUEEN combines education, accountability and verification to help members stay grounded while they sharpen their trading knowledge." />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {featureCards.map(({ title, text, icon: Icon }) => (
              <motion.div key={title} whileHover={{ y: -4 }} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_40px_rgba(15,23,42,0.4)]">
                <div className="mb-4 inline-flex rounded-2xl bg-emerald-500/10 p-3 text-emerald-300"><Icon size={22} /></div>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="services" className="border-y border-white/10 bg-[#0a1015]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Our Services" heading="Everything you need to build a sane trading routine" description="Every layer of the platform is designed to help members learn responsibly, stay connected and move through verification in a secure structure." />

            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {[
                { icon: MessageSquare, label: 'Community chat', text: 'Stay connected with real traders and market discussions.' },
                { icon: WalletCards, label: 'Broker sign-up', text: 'Open a referral-linked account to unlock the verification path.' },
                { icon: FileCheck2, label: 'Trader ID review', text: 'Submit your identity and application details for admin checks.' },
                { icon: ShieldCheck, label: 'VIP access', text: 'Gain secure access after manual approval and verification.' },
              ].map(({ icon: Icon, label, text }) => (
                <div key={label} className="rounded-3xl border border-white/10 bg-[#0c1518] p-6">
                  <div className="mb-5 inline-flex rounded-2xl bg-emerald-500/10 p-3 text-emerald-300"><Icon size={22} /></div>
                  <div className="text-lg font-semibold text-white">{label}</div>
                  <p className="mt-3 text-sm text-slate-300">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="How it works" heading="Simple steps from registration to VIP access" description="This path keeps everything transparent: join, verify, submit, then unlock the private trading community once approved." />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-200">0{index + 1}</div>
                <p className="text-base leading-7 text-slate-200">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="community" className="border-y border-white/10 bg-[#081116]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-3xl border border-emerald-400/20 bg-[#0b1217] p-8">
                <div className="mb-4 inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-200">Community</div>
                <h3 className="text-3xl font-bold text-white">Learn with a peer group that respects process.</h3>
                <p className="mt-4 text-slate-300">
                  Connect with members who focus on strategy, discipline and education rather than hype-driven shortcuts.
                </p>
                <a href={settings.publicTelegramUrl} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">
                  JOIN TELEGRAM <ArrowRight size={18} />
                </a>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {[
                  'Market education and structured learning',
                  'Broker account guidance and verification steps',
                  'Private VIP coordination after approval',
                  'Responsible risk management and community support',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-200">
                    <div className="mb-3 inline-flex rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><CheckCircle2 size={18} /></div>
                    <p className="text-base leading-7">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="vip-membership" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="VIP Membership" heading="Access follows verification and admin approval" description="Create an account, submit your broker details from the member dashboard, and wait for a manual review. The private invitation is only returned to approved members." />
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link to="/vip-membership" className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200">Learn about membership <ArrowRight size={16} /></Link>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-6 py-3 font-bold text-slate-950">Create a member account</Link>
          </div>
        </section>

        <section id="contact" className="border-y border-white/10 bg-[#0a1015]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Contact" heading="Get in touch with the community team" description={settings.supportEmail ? `Email our support team at ${settings.supportEmail}.` : 'Support contact details will appear here when configured by an administrator.'} />
            {settings.supportEmail && <a href={`mailto:${settings.supportEmail}`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 font-bold text-slate-950"><Mail size={16} /> Contact support</a>}
            <Link to="/contact" className="mt-6 ml-0 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold text-slate-100 sm:ml-3">Contact details <ArrowRight size={16} /></Link>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="FAQ" heading="Frequently asked questions" description="The platform is built around secure onboarding and transparent community access, without fake promises or guaranteed results." />
          <div className="mt-10 space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-lg font-semibold text-white">{faq.q}</div>
                <p className="mt-2 text-sm leading-7 text-slate-300">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-[28px] border border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-emerald-500/10 p-8">
            <div className="mb-3 flex items-center gap-2 text-amber-200"><CircleAlert size={18} /> Risk Disclaimer</div>
            <p className="text-slate-200">
              Trading involves financial risk. Market prices can change rapidly and losses are possible. Educational content and community discussions do not guarantee profits. Members should conduct independent research and make informed decisions. VIP membership does not guarantee trading success.
            </p>
          </div>
        </section>

        <footer className="border-t border-white/10 bg-[#05080B]">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-slate-300 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr] lg:px-8">
            <div>
              <div className="text-lg font-semibold text-white">{settings.brandName}</div>
              <p className="mt-3 max-w-md text-slate-400">A professional trading community for responsible learning, verification and VIP access.</p>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Company</div>
              <ul className="space-y-2">
                <li><Link to="/privacy-policy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms & Conditions</Link></li>
                <li><Link to="/risk-disclaimer">Risk Disclaimer</Link></li>
                <li><Link to="/vip-membership">VIP Membership</Link></li>
                <li><Link to="/contact">Contact</Link></li>
              </ul>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Access</div>
              <ul className="space-y-2">
                <li><Link to="/login">Login</Link></li>
                <li><Link to="/register">Register</Link></li>
                <li><Link to="/dashboard">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Contact</div>
              <ul className="space-y-2">
                <li className="flex items-center gap-2"><Mail size={15} /> {settings.supportEmail || 'Support email to be configured'}</li>
              </ul>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

function SectionHeader({ eyebrow, heading, description }) {
  return (
    <div className="max-w-3xl">
      <div className="text-xs uppercase tracking-[0.28em] text-emerald-300/80">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">{heading}</h2>
      <p className="mt-4 text-base leading-7 text-slate-300">{description}</p>
    </div>
  )
}

function LoginPage({ setCurrentUser, adminOnly = false }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!supabase) {
      setError('Supabase is not configured. Add the project URL and publishable key before signing in.')
      return
    }

    setLoading(true)
    try {
      if (resetMode) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (resetError) setError(resetError.message)
        else setNotice('If that email is registered, a password reset link has been sent.')
        return
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      if (loginError || !data.user) {
        setError(loginError?.message || 'Sign in failed. Please try again.')
        return
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, member_id, full_name, email, mobile, role, vip_status, created_at')
        .eq('id', data.user.id)
        .single()
      if (profileError) {
        setError(profileError.message)
        return
      }
      const account = {
        id: profile.id,
        memberId: profile.member_id,
        fullName: profile.full_name,
        email: profile.email,
        mobile: profile.mobile,
        role: profile.role,
        vipStatus: profile.vip_status,
        createdAt: profile.created_at,
      }
      if (adminOnly && account.role !== 'admin') {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) throw signOutError
        setCurrentUser(null)
        setError('This account does not have administrator access.')
        return
      }
      setCurrentUser(account)
      navigate(account.role === 'admin' ? '/admin' : '/dashboard')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title={resetMode ? 'Reset your password' : adminOnly ? 'Administrator login' : 'Welcome back'} subtitle={resetMode ? 'Request a secure password reset link' : adminOnly ? 'Secure sign-in for authorized administrators' : 'Secure member login'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Email Address" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
        {!resetMode && <Field label="Password" type="password" value={form.password} onChange={(value) => setForm((prev) => ({ ...prev, password: value }))} />}

        {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{notice}</div> : null}

        <button type="submit" disabled={loading} className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950 shadow-[0_0_25px_rgba(52,211,153,0.28)] disabled:cursor-wait disabled:opacity-60">
          {loading ? 'PLEASE WAIT…' : resetMode ? 'SEND RESET LINK' : 'LOGIN'}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm text-slate-300">
        {adminOnly ? <Link to="/login" className="text-emerald-300 hover:text-emerald-200">Member login</Link> : <Link to="/register" className="text-emerald-300 hover:text-emerald-200">Create account</Link>}
        <button type="button" onClick={() => { setResetMode((active) => !active); setError(''); setNotice('') }} className="text-slate-300 hover:text-white">
          {resetMode ? 'Back to login' : 'Forgot password?'}
        </button>
      </div>
    </AuthShell>
  )
}

function RegisterPage({ backendReady }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!form.fullName || !form.email || !form.mobile || !form.password || !form.confirmPassword) {
      setError('Please complete every field before registering.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('The password and confirm password must match.')
      return
    }

    if (form.password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    if (!supabase || !backendReady) {
      setError('Registration is unavailable until the Supabase database migration and public-settings function are deployed.')
      return
    }

    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.fullName, mobile: form.mobile },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      setNotice('Registration received. Check your email and verify your address before signing in. Your Member ID is created securely when your profile is provisioned.')
    } catch (signUpError) {
      setError(signUpError instanceof Error ? signUpError.message : 'Registration could not be completed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Join the NON MTG QUEEN community">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Full Name" value={form.fullName} onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))} />
        <Field label="Email Address" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />
        <Field label="Mobile Number" value={form.mobile} onChange={(value) => setForm((prev) => ({ ...prev, mobile: value }))} />
        <Field label="Password" type="password" value={form.password} onChange={(value) => setForm((prev) => ({ ...prev, password: value }))} />
        <Field label="Confirm Password" type="password" value={form.confirmPassword} onChange={(value) => setForm((prev) => ({ ...prev, confirmPassword: value }))} />

        {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{notice}</div> : null}

        <button type="submit" disabled={loading || !backendReady} className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950 shadow-[0_0_25px_rgba(52,211,153,0.28)] disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'CREATING ACCOUNT…' : backendReady ? 'REGISTER NOW' : 'BACKEND SETUP REQUIRED'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-300">
        Already have an account? <Link to="/login" className="text-emerald-300 hover:text-emerald-200">Login here</Link>
      </div>
    </AuthShell>
  )
}

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (password.length < 8 || password !== confirmation) {
      setError(password !== confirmation ? 'Passwords do not match.' : 'Password must contain at least 8 characters.')
      return
    }
    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setMessage('Password updated. You can now sign in with your new password.')
      window.setTimeout(() => navigate('/login'), 1500)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Password update failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Set a new password for your account">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="New Password" type="password" value={password} onChange={setPassword} />
        <Field label="Confirm New Password" type="password" value={confirmation} onChange={setConfirmation} />
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</div>}
        <button type="submit" disabled={loading} className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-60">
          {loading ? 'UPDATING…' : 'UPDATE PASSWORD'}
        </button>
      </form>
    </AuthShell>
  )
}

function AdminSetupPage() {
  const [setupSecret, setSetupSecret] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      await invokeAdmin('bootstrap_admin', { setupSecret })
      setNotice('Your account is now the first administrator. Sign out and sign in again to refresh your role.')
    } catch (setupError) {
      setError(setupError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="First administrator setup" subtitle="One-time server-authorized setup for an existing verified account">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-slate-300">Sign in to the member account you want to make the initial admin, then enter the one-time setup secret configured in Supabase Edge Function secrets.</p>
        <Field label="One-time setup secret" type="password" value={setupSecret} onChange={setSetupSecret} />
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{notice}</div>}
        <button type="submit" disabled={loading} className="w-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-60">
          {loading ? 'VERIFYING…' : 'CONFIGURE FIRST ADMIN'}
        </button>
      </form>
    </AuthShell>
  )
}

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05080B] px-4 py-12">
      <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#0d1519]/90 p-8 shadow-[0_0_40px_rgba(16,185,129,0.12)] backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-xl font-black text-emerald-300">N</div>
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-black tracking-[-0.06em] text-white">{title}</h1>
          <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#0b1014] px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      />
    </label>
  )
}

function MemberDashboard({ currentUser, setCurrentUser, settings, submissions, setSubmissions, notifications, setNotifications }) {
  const navigate = useNavigate()
  const memberSubmissions = useMemo(
    () => submissions.filter((item) => item.memberId === currentUser.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [currentUser.id, submissions],
  )

  const activeStatus = memberSubmissions[0]?.status || currentUser.vipStatus || 'NOT_SUBMITTED'
  const portalMessage = {
    NOT_SUBMITTED: 'Your Trader ID is currently not submitted yet.',
    PENDING: 'Your Trader ID is currently under verification. Please wait for admin approval.',
    APPROVED: 'Congratulations! Your Free VIP Access Has Been Approved.',
    REJECTED: 'Your application was rejected. Review the admin feedback and submit again if enabled.',
  }

  const [submissionState, setSubmissionState] = useState({
    brokerName: '',
    traderId: '',
    screenshot: '',
  })

  const handleSubmitTraderId = (event) => {
    event.preventDefault()

    const duplicate = memberSubmissions.some(
      (item) => item.status === 'PENDING' || item.status === 'APPROVED',
    )

    if (duplicate) {
      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}`,
          title: 'Pending submission already exists',
          detail: 'Your Trader ID is already under review or approved. Duplicate submission is blocked.',
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
      return
    }

    const submission = {
      id: `sub-${Date.now()}`,
      memberId: currentUser.id,
      memberName: currentUser.fullName,
      memberEmail: currentUser.email,
      brokerName: submissionState.brokerName,
      traderId: submissionState.traderId,
      screenshot: submissionState.screenshot,
      status: 'PENDING',
      submissionDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      referenceId: `REF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    }

    setSubmissions((prev) => [submission, ...prev])
    setCurrentUser((prev) => ({ ...prev, vipStatus: 'PENDING' }))
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Trader ID submitted',
        detail: `Reference ${submission.referenceId} has been submitted and is pending review.`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])
    setSubmissionState({ brokerName: '', traderId: '', screenshot: '' })
  }

  const handleLogout = () => {
    setCurrentUser(null)
    navigate('/login')
  }

  const summaryCards = [
    { label: 'Member ID', value: currentUser.memberId, icon: UserRoundCheck },
    { label: 'Email', value: currentUser.email, icon: Mail },
    { label: 'Status', value: activeStatus, icon: Shield },
    { label: 'Registration date', value: new Date(currentUser.createdAt).toLocaleDateString(), icon: CalendarDays },
  ]

  return (
    <div className="min-h-screen bg-[#05080B] text-slate-100">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-white/10 bg-[#0b1217] p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-lg font-black text-emerald-300">N</div>
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Member portal</div>
              <div className="text-lg font-semibold">{settings.brandName}</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm text-slate-300">
            {['Overview', 'My Profile', 'Telegram Community', 'Create Broker Account', 'Submit Trader ID', 'VIP Membership', 'Notifications'].map((label) => (
              <div key={label} className="rounded-2xl border border-transparent px-3 py-2.5 hover:border-emerald-400/20 hover:bg-white/5 hover:text-white">
                {label}
              </div>
            ))}
            <button type="button" onClick={handleLogout} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-slate-200">
              Logout
              <LogOut size={16} />
            </button>
          </nav>
        </aside>

        <main className="flex-1 space-y-6">
          <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-emerald-300/75">Welcome back</div>
                <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">{currentUser.fullName}</h1>
              </div>
              <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 lg:hidden">
                Logout <LogOut size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-[24px] border border-white/10 bg-[#0b1217] p-5">
                <div className="mb-3 inline-flex rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><Icon size={18} /></div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
                <div className="mt-3 text-lg font-semibold text-white break-words">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">VIP Membership</h2>
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-200">{activeStatus}</div>
                </div>
                <p className="text-base leading-7 text-slate-200">{portalMessage[activeStatus] || portalMessage.NOT_SUBMITTED}</p>
                {activeStatus === 'APPROVED' ? (
                  <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-emerald-100">
                    <div className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> VIP Approved</div>
                    <p className="text-sm text-emerald-100/90">Access to the private VIP dashboard is enabled. Please continue to the VIP section for exclusive updates.</p>
                    <Link to="/vip" className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Open VIP Dashboard <ArrowRight size={16} /></Link>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
                <h2 className="text-xl font-bold text-white">Submit Trader ID</h2>
                <p className="mt-2 text-sm text-slate-300">To request free VIP membership, create your broker account using the referral link. After registration, submit your Trader ID for manual verification.</p>
                <form onSubmit={handleSubmitTraderId} className="mt-6 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Member Name" value={currentUser.fullName} onChange={() => {}} />
                    <Field label="Member Email" type="email" value={currentUser.email} onChange={() => {}} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Broker Name" value={submissionState.brokerName} onChange={(value) => setSubmissionState((prev) => ({ ...prev, brokerName: value }))} />
                    <Field label="Trader ID" value={submissionState.traderId} onChange={(value) => setSubmissionState((prev) => ({ ...prev, traderId: value }))} />
                  </div>
                  <Field label="Optional Screenshot URL" value={submissionState.screenshot} onChange={(value) => setSubmissionState((prev) => ({ ...prev, screenshot: value }))} />
                  <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950">
                    SUBMIT FOR VERIFICATION <Send size={16} />
                  </button>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
                <h2 className="text-xl font-bold text-white">Join Our Telegram Community</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">Connect with our trading community, receive updates and learn together.</p>
                <a href={settings.publicTelegramUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-200">
                  JOIN TELEGRAM
                </a>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
                <h2 className="text-xl font-bold text-white">Create Your Broker Account</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">To request free VIP membership, create your broker account using our referral link. After registration, submit your Trader ID for manual verification.</p>
                <a href={settings.brokerReferralUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-4 py-3 font-bold text-slate-950">
                  CREATE ACCOUNT
                </a>
                <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <div className="mb-2 flex items-center gap-2 font-semibold"><CircleAlert size={16} /> Trader ID guidance</div>
                  <p>Look for your Trader ID or client ID inside your broker dashboard, typically under account details, profile or trading terminal settings. Never share broker passwords or OTP codes.</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
                <h2 className="text-xl font-bold text-white">Notifications</h2>
                <div className="mt-5 space-y-3">
                  {notifications.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><Bell size={14} /> {item.title}</div>
                      <p className="mt-2 text-xs leading-6 text-slate-300">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function VipDashboard({ currentUser, settings }) {
  const isApproved = currentUser.vipStatus === 'APPROVED'

  if (!isApproved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05080B] px-4">
        <div className="w-full max-w-lg rounded-[30px] border border-white/10 bg-[#0b1217] p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-200"><LockKeyhole size={28} /></div>
          <h1 className="text-3xl font-black text-white">VIP access locked</h1>
          <p className="mt-4 text-slate-300">Only manually approved members can access the VIP area. Please complete the verification process and wait for admin approval.</p>
          <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">Return to dashboard <ArrowRight size={16} /></Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[30px] border border-emerald-400/20 bg-[#0c1418] p-8 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-200">
            <ShieldCheck size={14} /> VIP approved
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.06em] text-white">Welcome to VIP Community</h1>
          <p className="mt-3 max-w-2xl text-slate-300">Your membership has been approved. Access the private Telegram community, notices and premium updates from the trusted team.</p>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <StatusCard title="Membership" value="ACTIVE" accent="emerald" />
            <StatusCard title="Status" value="APPROVED" accent="amber" />
            <StatusCard title="Member ID" value={currentUser.memberId} accent="cyan" />
          </div>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            {settings.privateVipTelegramUrl ? (
              <a href={settings.privateVipTelegramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">
                JOIN PRIVATE VIP TELEGRAM <ArrowRight size={18} />
              </a>
            ) : (
              <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-5 py-3 text-sm font-medium text-amber-100">Private Telegram invite is configured by the admin in the secure settings panel.</div>
            )}
            <Link to="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white">Return to dashboard</Link>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
          <h2 className="text-2xl font-bold text-white">VIP announcements</h2>
          <div className="mt-5 space-y-4">
            {[
              'New educational market breakdowns are added every week.',
              'VIP members receive priority access to community announcements and curated discussions.',
              'Approval remains valid while your community status is active and verified.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-200">
                <div className="mt-1 rounded-full bg-emerald-500/10 p-1 text-emerald-300"><CheckCircle2 size={15} /></div>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusCard({ title, value, accent }) {
  const palettes = {
    emerald: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-400/30',
    cyan: 'bg-cyan-500/10 text-cyan-200 border-cyan-400/30',
  }

  return (
    <div className={`rounded-2xl border p-4 ${palettes[accent]}`}>
      <div className="text-xs uppercase tracking-[0.2em] text-slate-300">{title}</div>
      <div className="mt-3 text-xl font-bold text-white">{value}</div>
    </div>
  )
}

function AdminDashboard({ currentUser, users, setUsers, submissions, setSubmissions, settings, setSettings, notifications, setNotifications, setCurrentUser }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedMember, setSelectedMember] = useState(null)

  const members = useMemo(
    () => users.filter((user) => user.role !== 'admin'),
    [users],
  )

  const counts = useMemo(() => {
    const total = members.length
    const totalSubmitted = submissions.length
    const pending = submissions.filter((item) => item.status === 'PENDING').length
    const approved = submissions.filter((item) => item.status === 'APPROVED').length
    const rejected = submissions.filter((item) => item.status === 'REJECTED').length
    return { total, totalSubmitted, pending, approved, rejected }
  }, [members.length, submissions])

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const targetStatus = submissions.find((submission) => submission.memberId === member.id)?.status || member.vipStatus || 'NOT_SUBMITTED'
      const searchValue = `${member.fullName} ${member.email} ${member.memberId} ${submissions.find((submission) => submission.memberId === member.id)?.traderId || ''}`.toLowerCase()
      const matchesSearch = searchValue.includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || targetStatus === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [members, search, statusFilter, submissions])

  const handleApproval = (member) => {
    const targetSubmission = submissions.find((item) => item.memberId === member.id)
    if (!targetSubmission) {
      setUsers((prev) => prev.map((user) => (user.id === member.id ? { ...user, vipStatus: 'APPROVED' } : user)))
      return
    }

    setSubmissions((prev) =>
      prev.map((item) =>
        item.memberId === member.id ? { ...item, status: 'APPROVED', reviewedBy: currentUser.id, reviewedAt: new Date().toISOString() } : item,
      ),
    )
    setUsers((prev) => prev.map((user) => (user.id === member.id ? { ...user, vipStatus: 'APPROVED' } : user)))
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'VIP approval granted',
        detail: `${member.fullName} has been approved for VIP access.`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  const handleRejection = (member) => {
    const reason = window.prompt('Enter rejection reason for this application:')
    const targetSubmission = submissions.find((item) => item.memberId === member.id)

    if (targetSubmission) {
      setSubmissions((prev) =>
        prev.map((item) =>
          item.memberId === member.id ? { ...item, status: 'REJECTED', rejectionReason: reason || 'No reason provided', reviewedBy: currentUser.id, reviewedAt: new Date().toISOString() } : item,
        ),
      )
    }

    setUsers((prev) => prev.map((user) => (user.id === member.id ? { ...user, vipStatus: 'REJECTED' } : user)))
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'VIP rejection recorded',
        detail: `${member.fullName} was rejected with a reason: ${reason || 'No reason provided'}.`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  const handleResubmission = (member) => {
    const targetSubmission = submissions.find((item) => item.memberId === member.id)
    setSubmissions((prev) =>
      prev.map((item) =>
        item.memberId === member.id ? { ...item, status: 'PENDING', requestedResubmission: true, reviewedBy: currentUser.id, reviewedAt: new Date().toISOString() } : item,
      ),
    )
    setUsers((prev) => prev.map((user) => (user.id === member.id ? { ...user, vipStatus: 'PENDING' } : user)))
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: 'Resubmission requested',
        detail: `${member.fullName} has been asked to update their Trader ID details.`,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ])
  }

  const handleLogout = () => {
    setCurrentUser(null)
    navigate('/login')
  }

  const selectedProfile = selectedMember
    ? {
        ...selectedMember,
        submission: submissions.find((item) => item.memberId === selectedMember.id),
      }
    : null

  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-[#0b1217] p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-emerald-300/70">Owner panel</div>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">Admin dashboard</h1>
          </div>
          <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
            Logout <LogOut size={16} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Total members', value: counts.total, icon: Users },
            { label: 'Submitted', value: counts.totalSubmitted, icon: FileCheck2 },
            { label: 'Pending', value: counts.pending, icon: CircleAlert },
            { label: 'Approved', value: counts.approved, icon: ShieldCheck },
            { label: 'Rejected', value: counts.rejected, icon: LockKeyhole },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-[#0b1217] p-5">
              <div className="mb-3 inline-flex rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><Icon size={18} /></div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</div>
              <div className="mt-3 text-3xl font-black text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-white">Member management</h2>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                  <Search size={15} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="w-36 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
                </div>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-full border border-white/10 bg-[#0f171b] px-3 py-2 text-sm text-slate-200 focus:outline-none">
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <th className="px-3 py-3">Member ID</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Trader ID</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => {
                    const latestSubmission = submissions.find((item) => item.memberId === member.id)
                    const memberStatus = latestSubmission?.status || member.vipStatus || 'NOT_SUBMITTED'
                    return (
                      <tr key={member.id} className="border-b border-white/10 align-top">
                        <td className="px-3 py-4 font-medium text-white">{member.memberId}</td>
                        <td className="px-3 py-4">{member.fullName}</td>
                        <td className="px-3 py-4">{member.email}</td>
                        <td className="px-3 py-4">{latestSubmission?.traderId || 'Not submitted'}</td>
                        <td className="px-3 py-4">
                          <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${memberStatus === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-200' : memberStatus === 'REJECTED' ? 'bg-red-500/10 text-red-200' : 'bg-amber-500/10 text-amber-200'}`}>
                            {memberStatus}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setSelectedMember(member)} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">View</button>
                            <button type="button" onClick={() => handleApproval(member)} className="rounded-full bg-emerald-500 px-2 py-1 text-xs font-semibold text-slate-950">Approve</button>
                            <button type="button" onClick={() => handleRejection(member)} className="rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">Reject</button>
                            <button type="button" onClick={() => handleResubmission(member)} className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">Resubmit</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
            <h2 className="text-xl font-bold text-white">Admin settings</h2>
            <div className="mt-5 space-y-4">
              <Field label="Admin Notification Email" value={settings.adminEmail} onChange={(value) => setSettings((prev) => ({ ...prev, adminEmail: value }))} />
              <Field label="Private VIP Telegram URL" value={settings.privateVipTelegramUrl} onChange={(value) => setSettings((prev) => ({ ...prev, privateVipTelegramUrl: value }))} />
              <Field label="Public Telegram URL" value={settings.publicTelegramUrl} onChange={(value) => setSettings((prev) => ({ ...prev, publicTelegramUrl: value }))} />
              <Field label="Broker Referral URL" value={settings.brokerReferralUrl} onChange={(value) => setSettings((prev) => ({ ...prev, brokerReferralUrl: value }))} />
              <Field label="Brand Name" value={settings.brandName} onChange={(value) => setSettings((prev) => ({ ...prev, brandName: value }))} />
              <Field label="Support Contact Email" value={settings.supportEmail} onChange={(value) => setSettings((prev) => ({ ...prev, supportEmail: value }))} />
            </div>
          </div>
        </div>

        {selectedProfile ? (
          <div className="mt-8 rounded-[28px] border border-white/10 bg-[#0b1217] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Member profile</h2>
              <button type="button" onClick={() => setSelectedMember(null)} className="text-sm text-slate-300">Close</button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3 text-sm text-slate-200">
                <div><span className="text-slate-400">Full Name:</span> {selectedProfile.fullName}</div>
                <div><span className="text-slate-400">Member ID:</span> {selectedProfile.memberId}</div>
                <div><span className="text-slate-400">Email:</span> {selectedProfile.email}</div>
                <div><span className="text-slate-400">Mobile Number:</span> {selectedProfile.mobile}</div>
                <div><span className="text-slate-400">Broker Name:</span> {selectedProfile.submission?.brokerName || 'Not submitted'}</div>
                <div><span className="text-slate-400">Trader ID:</span> {selectedProfile.submission?.traderId || 'Not submitted'}</div>
                <div><span className="text-slate-400">Current Status:</span> {selectedProfile.submission?.status || selectedProfile.vipStatus || 'NOT_SUBMITTED'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 text-sm font-semibold text-white">Screenshot</div>
                {selectedProfile.submission?.screenshot ? (
                  <img src={selectedProfile.submission.screenshot} alt="Submission screenshot" className="h-56 w-full rounded-xl object-cover" />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-400">No screenshot uploaded</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function VipMembershipPage({ brokerReferralUrl }) {
  const steps = [
    'Create and verify your member account.',
    'Open a broker account using the published referral link.',
    'Submit your Trader ID and registered broker email from your member dashboard.',
    'Wait for an administrator to review your submission. Only an approved membership can retrieve the private invitation.',
  ]

  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-emerald-400/20 bg-[#0b1217] p-8 shadow-[0_0_40px_rgba(16,185,129,0.12)]">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-200">
          <ShieldCheck size={14} /> Membership
        </div>
        <h1 className="text-4xl font-black tracking-[-0.06em] text-white">VIP Membership</h1>
        <p className="mt-4 leading-7 text-slate-300">VIP access is subject to manual verification and administrator approval. Registration does not guarantee approval, trading results, or profits.</p>
        <ol className="mt-8 space-y-4">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-200">{index + 1}</span>
              <span className="leading-6 text-slate-200">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">Create an account <ArrowRight size={16} /></Link>
          <a href={brokerReferralUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold text-slate-100">Broker registration <ArrowRight size={16} /></a>
          <Link to="/" className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 font-semibold text-slate-100">Back to home</Link>
        </div>
      </div>
    </div>
  )
}

function ContactPage({ supportEmail }) {
  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-[32px] border border-white/10 bg-[#0b1217] p-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-200">
          <Mail size={14} /> Contact
        </div>
        <h1 className="text-4xl font-black tracking-[-0.06em] text-white">Contact NON MTG QUEEN</h1>
        {supportEmail ? (
          <p className="mt-4 leading-7 text-slate-300">For account or verification support, email <a className="text-emerald-200 underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
        ) : (
          <p className="mt-4 leading-7 text-slate-300">A support email address has not been configured yet. Please check back later or use the public community link on the home page.</p>
        )}
        <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">Back to home <ArrowRight size={16} /></Link>
      </div>
    </div>
  )
}

function LegalPage({ type }) {
  const pages = {
    privacy: {
      title: 'Privacy Policy',
      body: [
        'We collect only the information necessary to provide secure access, manage your member account and handle VIP verification.',
        'Profile details, trader submission data and communication preferences may be kept in secure systems to support account management and approval workflows.',
        'We do not sell personal data. Access is restricted to authorized members and administrators under role-based access controls.',
      ],
    },
    terms: {
      title: 'Terms and Conditions',
      body: [
        'Members are expected to use the platform responsibly and in compliance with relevant laws and trading regulations.',
        'Educational content is informational only and does not guarantee financial outcomes or profits.',
        'We reserve the right to remove or restrict access to accounts that violate the community guidelines or platform terms.',
      ],
    },
    risk: {
      title: 'Risk Disclaimer',
      body: [
        'Trading involves financial risk. Market prices can change rapidly and losses are possible.',
        'Educational content and community discussions do not guarantee profits. Members should conduct independent research and make informed decisions.',
        'VIP membership does not guarantee trading success.',
      ],
    },
  }

  const page = pages[type]

  return (
    <div className="min-h-screen bg-[#05080B] px-4 py-16 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-white/10 bg-[#0b1217] p-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-emerald-200">
          <Shield size={14} /> Legal
        </div>
        <h1 className="text-4xl font-black tracking-[-0.06em] text-white">{page.title}</h1>
        <div className="mt-6 space-y-4 text-base leading-7 text-slate-300">
          {page.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-3 font-bold text-slate-950">Back to home <ArrowRight size={16} /></Link>
      </div>
    </div>
  )
}

export default App

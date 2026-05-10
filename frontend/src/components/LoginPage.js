import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { AlertCircle, Eye, EyeOff, MessagesSquare, Play, Sparkles, Search, Download } from 'lucide-react';

function formatError(detail) {
  if (detail == null) return 'System Error.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(' ');
  if (detail?.msg) return detail.msg;
  return String(detail);
}

const spotlightCards = [
  {
    title: 'Have fun with your people',
    body: 'DMs, streaks, stories aur spotlight ek dark shell me.',
    tone: 'from-[#0f172a] via-[#172554] to-[#1d4ed8]',
    cta: 'Find your crew',
  },
  {
    title: 'Express with live lenses',
    body: 'Story orbit, creator drops, aur camera-style energy ko fast access.',
    tone: 'from-[#3b0764] via-[#701a75] to-[#db2777]',
    cta: 'Try lenses',
  },
];

export default function LoginPage() {
  const { login, demoLogin, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setDemoLoading(true);
    try {
      await demoLogin();
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div data-testid="login-page" className="min-h-screen bg-[#05070c] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,229,106,0.12),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(56,189,248,0.14),transparent_28%),linear-gradient(180deg,#05070c,#0a1020_45%,#05070c)]" />

      <div className="relative z-10 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-[30px] border border-white/10 bg-black/20 backdrop-blur-xl shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden">
          <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[20px] bg-[#ffe56a] text-[#05070c] flex items-center justify-center shadow-[0_12px_30px_rgba(255,229,106,0.28)]">
                <span className="text-2xl font-black">Q</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">Dark social web</p>
                <h1 className="font-heading text-xl sm:text-2xl truncate">QuantChat</h1>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <div data-testid="login-header-search-chip" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/68">
                <Search size={15} />
                Search friends
              </div>
              <button data-testid="login-header-download-button" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#05070c]">Download</button>
              <button data-testid="login-header-login-button" className="rounded-full bg-[#ffe600] px-5 py-2.5 text-sm font-semibold text-[#05070c]">Log In</button>
            </div>
          </header>

          <div className="grid lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
            <section className="border-b lg:border-b-0 lg:border-r border-white/10 px-5 py-6 sm:px-8 sm:py-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#ffe56a]/20 bg-[#ffe56a]/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-[#ffe56a]">
                <Sparkles size={13} />
                Snapchat-style dark lane
              </div>

              <h2 className="mt-5 text-[clamp(2.7rem,9vw,4.7rem)] font-bold leading-[0.96] text-white max-w-[12ch]">
                Jump into chats, stories, spotlight and your AI copilot.
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-white/64">
                Premium dark shell, faster mobile spacing, demo access, and a cleaner auth flow built for direct testing.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {['Mobile-first shell', 'Instant demo login', 'AI workflows'].map((item) => (
                  <div key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/56">
                    {item}
                  </div>
                ))}
              </div>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div data-testid="login-error" className="rounded-[22px] border border-red-500/30 bg-red-500/12 p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-red-300 flex-shrink-0" />
                      <p className="text-sm text-red-100">{error}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white/80">Username or email address</label>
                  <input
                    data-testid="login-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 block w-full rounded-[22px] border border-white/10 bg-white/6 px-4 py-3.5 text-sm text-white placeholder:text-white/28 focus:border-[#ffe56a]/55 focus:outline-none focus:ring-2 focus:ring-[#ffe56a]/18"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-white/80">Password</label>
                    <span className="text-xs text-white/45">Dark mode only</span>
                  </div>
                  <div className="mt-2 relative">
                    <input
                      data-testid="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-[22px] border border-white/10 bg-white/6 px-4 py-3.5 pr-12 text-sm text-white placeholder:text-white/28 focus:border-[#ffe56a]/55 focus:outline-none focus:ring-2 focus:ring-[#ffe56a]/18"
                    />
                    <button
                      data-testid="login-password-visibility-toggle"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/55 hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  data-testid="login-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#1d9bf0] px-5 py-3.5 text-base font-semibold text-white shadow-[0_18px_38px_rgba(29,155,240,0.28)] transition hover:bg-[#38a9f4] disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Log In'}
                </button>

                <button
                  type="button"
                  data-testid="login-demo-btn"
                  onClick={handleDemoLogin}
                  disabled={demoLoading}
                  className="w-full rounded-full border border-white/10 bg-white text-[#05070c] px-5 py-3.5 text-base font-semibold transition hover:bg-white/90 disabled:opacity-50"
                >
                  {demoLoading ? 'Opening demo...' : 'Login as Demo User'}
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                <Link data-testid="login-register-link" to="/register" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/82 hover:bg-white/9">
                  Create account
                </Link>
                <button className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-white/52 cursor-default">
                  Use phone number instead
                </button>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-[#ffe56a] text-sm font-medium">
                  <MessagesSquare size={16} />
                  Demo quick access
                </div>
                <p data-testid="demo-credentials-card" className="mt-2 text-sm text-white/68">arjun@quantchat.com / Demo@1234</p>
              </div>
            </section>

            <section className="px-5 py-6 sm:px-8 sm:py-8">
              <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
                <div className="rounded-[30px] overflow-hidden border border-white/10 bg-[linear-gradient(140deg,#141c2f,#1e293b_55%,#0f172a)] min-h-[280px] p-6 flex flex-col justify-between">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/70">
                    <Play size={13} />
                    Stories + Spotlight
                  </div>
                  <div>
                    <h3 className="max-w-md text-3xl font-bold leading-tight sm:text-4xl">Move between media, messages and smart help without friction.</h3>
                    <p className="mt-3 max-w-md text-white/68">Watch story drops, open spotlight, ask Copilot for a reply draft, and jump back into DMs from the same shell.</p>
                  </div>
                  <button data-testid="login-find-friends-button" className="w-fit rounded-full bg-white/16 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm">
                    Find Your Friends
                  </button>
                </div>

                <div className="grid gap-4">
                  {spotlightCards.map((card) => (
                    <article key={card.title} className={`rounded-[30px] border border-white/10 bg-gradient-to-br ${card.tone} p-6 min-h-[190px] flex flex-col justify-between shadow-[0_20px_60px_rgba(0,0,0,0.25)]`}>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/70">
                        <Sparkles size={13} />
                        Curated
                      </div>
                      <div>
                        <h3 className="text-3xl font-bold leading-tight">{card.title}</h3>
                        <p className="mt-3 max-w-sm text-white/72">{card.body}</p>
                      </div>
                      <button data-testid={`spotlight-card-${card.title.toLowerCase().replace(/\s+/g, '-')}`} className="w-fit rounded-full bg-black/30 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm">
                        {card.cta}
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {[
                  ['Stories', 'Story orbit and private replies now feel more like a living media deck.'],
                  ['Spotlight', 'Media-first reels with comments, up next, share and creator detail tabs.'],
                  ['APK Ready', 'Android debug build ko latest web shell ke saath sync rakh raha hoon.'],
                ].map(([title, copy]) => (
                  <div key={title} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/70">{copy}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3 text-white/56 text-sm">
                <Download size={16} />
                Keep testing on web and APK while the Snapchat-style dark rebuild keeps getting deeper.
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

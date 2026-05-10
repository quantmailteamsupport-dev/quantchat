import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { AlertCircle, Eye, EyeOff, Sparkles, UserPlus, Radio, Clapperboard } from 'lucide-react';

function formatError(detail) {
  if (detail == null) return 'System Error.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(' ');
  if (detail?.msg) return detail.msg;
  return String(detail);
}

const onboardingNotes = [
  {
    icon: Radio,
    title: 'Story orbit',
    body: 'Quick text stories, color backdrops, private replies aur auto-advance deck.',
  },
  {
    icon: Clapperboard,
    title: 'Spotlight drops',
    body: 'Media-first reels, share actions, comments, up-next and creator detail tabs.',
  },
  {
    icon: Sparkles,
    title: 'Dark social shell',
    body: 'Mobile-friendly, Chrome-safe, APK-synced and focused on premium dark UI.',
  },
];

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="register-page" className="min-h-screen bg-[#05070c] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,229,106,0.08),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(147,51,234,0.16),transparent_25%),linear-gradient(180deg,#05070c,#091224_48%,#05070c)]" />

      <div className="relative z-10 px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-[30px] border border-white/10 bg-black/20 backdrop-blur-xl shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden">
          <div className="grid xl:grid-cols-[1fr_minmax(0,470px)]">
            <section className="px-5 py-6 sm:px-8 sm:py-8 border-b xl:border-b-0 xl:border-r border-white/10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-[#ffe56a]">
                <Sparkles size={13} />
                Build your dark profile
              </div>

              <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-[3rem]">
                Create your QuantChat account and start the Snapchat-style dark lane.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/66">
                Signup surface ko bhi ab split, rich aur media-first feel diya hai. Register karo aur seedha chat, stories, groups aur spotlight testing me jump karo.
              </p>

              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {onboardingNotes.map(({ icon: Icon, title, body }) => (
                  <article key={title} className="rounded-[26px] border border-white/10 bg-white/5 p-5">
                    <div className="w-11 h-11 rounded-2xl bg-white/8 flex items-center justify-center text-[#ffe56a]">
                      <Icon size={18} />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/62">{body}</p>
                  </article>
                ))}
              </div>

              <div className="mt-6 rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,24,39,0.95),rgba(10,16,32,0.95))] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/42">Why this shell</p>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
                  User ne Snapchat references diye the, isliye main flat messenger se nikal kar app ko media-heavy dark social product feel me push kar raha hoon.
                </p>
              </div>
            </section>

            <section className="px-5 py-6 sm:px-8 sm:py-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-[20px] bg-[#ffe56a] text-[#05070c] flex items-center justify-center shadow-[0_12px_30px_rgba(255,229,106,0.28)]">
                  <span className="text-2xl font-black">Q</span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/42">Create profile</p>
                  <h2 className="font-heading text-2xl">Join QuantChat</h2>
                </div>
              </div>

              <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div data-testid="register-error" className="rounded-[22px] border border-red-500/30 bg-red-500/12 p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-red-300 flex-shrink-0" />
                      <p className="text-sm text-red-100">{error}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white/80">Display name</label>
                  <input
                    data-testid="register-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2 block w-full rounded-[22px] border border-white/10 bg-white/6 px-4 py-3.5 text-sm text-white placeholder:text-white/28 focus:border-[#ffe56a]/55 focus:outline-none focus:ring-2 focus:ring-[#ffe56a]/18"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80">Email address</label>
                  <input
                    data-testid="register-email-input"
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
                    <span className="text-xs text-white/45">Minimum 6 chars</span>
                  </div>
                  <div className="mt-2 relative">
                    <input
                      data-testid="register-password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-[22px] border border-white/10 bg-white/6 px-4 py-3.5 pr-12 text-sm text-white placeholder:text-white/28 focus:border-[#ffe56a]/55 focus:outline-none focus:ring-2 focus:ring-[#ffe56a]/18"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/55 hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  data-testid="register-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#ffe600] px-5 py-3.5 text-base font-semibold text-[#05070c] shadow-[0_18px_38px_rgba(255,230,0,0.22)] transition hover:bg-[#ffef5a] disabled:opacity-50"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link data-testid="register-login-link" to="/login" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/82 hover:bg-white/9">
                  Already have an account?
                </Link>
                <div className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-white/52">
                  Dark theme stays on
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-[#ffe56a] text-sm font-medium">
                  <UserPlus size={16} />
                  Fresh account perks
                </div>
                <ul className="mt-3 space-y-2 text-sm text-white/66">
                  <li>Private DMs and group lanes</li>
                  <li>Story posting and replies</li>
                  <li>Spotlight posting and comments</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

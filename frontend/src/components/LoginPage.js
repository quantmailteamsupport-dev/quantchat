import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Lock, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

function formatError(detail) {
  if (detail == null) return 'System Error.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(' ');
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
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
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="login-page" className="h-screen bg-qc-bg flex overflow-hidden">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-qc-accent-primary border-r-2 border-qc-border items-center justify-center overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(20,minmax(0,1fr))] opacity-10 pointer-events-none">
          {Array.from({length: 400}).map((_, i) => (
             <div key={i} className="border-r border-b border-black"></div>
          ))}
        </div>
        <div className="relative z-10 px-16">
          <div className="flex items-center gap-3 mb-8 border-2 border-qc-border bg-qc-surface p-2 w-max shadow-brutal">
            <div className="w-10 h-10 bg-qc-accent-tertiary border-2 border-qc-border flex items-center justify-center">
              <span className="font-heading font-black text-qc-text-primary text-xl">Q</span>
            </div>
            <span className="font-heading font-black text-3xl text-qc-text-primary tracking-tighter uppercase mr-2">QuantChat</span>
          </div>
          <h1 className="font-heading font-black text-6xl text-qc-text-primary leading-[1.1] mb-6">
            RAW. UNFILTERED.<br />MESSAGING.
          </h1>
          <p className="text-qc-text-primary bg-qc-surface border-2 border-qc-border shadow-brutal p-4 font-mono font-medium max-w-md">
            ENTER THE GRID. SYNC WITH YOUR TEAM.
          </p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-qc-bg">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-12 border-2 border-qc-border bg-qc-surface p-2 w-max shadow-brutal">
            <div className="w-8 h-8 bg-qc-accent-tertiary border-2 border-qc-border flex items-center justify-center">
              <span className="font-heading font-black text-qc-text-primary">Q</span>
            </div>
            <span className="font-heading font-black text-2xl text-qc-text-primary tracking-tighter uppercase mr-2">QuantChat</span>
          </div>

          <div className="bg-qc-surface border-2 border-qc-border shadow-brutal p-8">
            <h2 data-testid="login-heading" className="font-heading font-black text-4xl text-qc-text-primary mb-2 uppercase">Authenticate</h2>
            <p className="text-qc-text-secondary font-mono text-sm mb-8 uppercase tracking-widest">Input Credentials</p>

            {error && (
              <div data-testid="login-error" className="flex items-center gap-2 bg-[#FF3333] border-2 border-qc-border text-white text-sm font-mono p-3 mb-6 shadow-[2px_2px_0px_#0A0A0A]">
                <AlertCircle size={16} />
                <span className="uppercase font-bold">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-sm font-bold text-qc-text-primary font-mono tracking-wider uppercase block mb-2">Email_Address</label>
                <input
                  data-testid="login-email-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-qc-bg border-2 border-qc-border text-qc-text-primary px-4 py-3 font-mono focus:bg-qc-surface focus:ring-2 focus:ring-qc-accent-primary transition-all"
                  placeholder="USER@DOMAIN.COM"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-bold text-qc-text-primary font-mono tracking-wider uppercase block mb-2">Pass_Key</label>
                <div className="relative">
                  <input
                    data-testid="login-password-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-qc-bg border-2 border-qc-border text-qc-text-primary px-4 py-3 font-mono focus:bg-qc-surface focus:ring-2 focus:ring-qc-accent-primary transition-all pr-12"
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-qc-text-secondary hover:text-qc-text-primary">
                    {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                  </button>
                </div>
              </div>
              <button
                data-testid="login-submit-button"
                type="submit"
                disabled={loading}
                className="w-full bg-qc-accent-secondary text-qc-text-primary font-bold font-mono tracking-widest uppercase py-4 flex items-center justify-center gap-3 btn-brutal disabled:opacity-50"
              >
                {loading ? (
                  <span>AUTHENTICATING...</span>
                ) : (
                  <>
                    <Lock size={18} />
                    <span>Login</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t-2 border-qc-border text-center">
              <p className="text-qc-text-secondary font-mono text-sm uppercase">
                No Access?{' '}
                <Link data-testid="login-register-link" to="/register" className="text-qc-text-primary font-bold underline hover:bg-qc-accent-primary transition-colors px-1">
                  Request_Access
                </Link>
              </p>
              <p className="mt-4 text-qc-text-secondary text-xs font-mono bg-qc-bg border-2 border-qc-border p-2 inline-block">DEMO: arjun@quantchat.com / Demo@1234</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

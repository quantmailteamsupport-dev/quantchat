import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Lock, ArrowRight, AlertCircle } from 'lucide-react';

function formatError(detail) {
  if (detail == null) return 'Something went wrong.';
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
    <div data-testid="login-page" className="h-screen bg-qc-bg flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center"
        style={{
          backgroundImage: 'url(https://static.prod-images.emergentagent.com/jobs/c89ece03-01c5-4a75-b33a-08299e675ee7/images/a62178a5ab19bff6e21b2bde8467d10900640014d49f7a1e3478ec88b7535716.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative z-10 px-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-qc-accent flex items-center justify-center">
              <span className="font-heading font-black text-white text-xl">Q</span>
            </div>
            <span className="font-heading font-black text-3xl text-white tracking-tighter">QuantChat</span>
          </div>
          <p className="font-mono text-xs text-qc-accent tracking-widest uppercase mb-4">Secure Communications</p>
          <h1 className="font-heading font-black text-5xl text-white leading-tight mb-6">
            Private chat with<br />operational certainty.
          </h1>
          <p className="text-qc-text-secondary text-lg leading-relaxed max-w-md">
            Realtime messaging, trusted-device identity, and production-grade telemetry.
          </p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-qc-accent flex items-center justify-center">
              <span className="font-heading font-black text-white">Q</span>
            </div>
            <span className="font-heading font-black text-2xl text-white tracking-tighter">QuantChat</span>
          </div>

          <h2 data-testid="login-heading" className="font-heading font-bold text-2xl text-white mb-1">Sign in</h2>
          <p className="text-qc-text-secondary text-sm mb-8">Enter your credentials to continue</p>

          {error && (
            <div data-testid="login-error" className="flex items-center gap-2 bg-qc-error/10 border border-qc-error/20 text-qc-error text-sm px-3 py-2 mb-4">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-qc-text-secondary font-mono tracking-wider uppercase block mb-1.5">Email</label>
              <input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-qc-surface border border-qc-border text-white px-3 py-2.5 text-sm focus:border-qc-accent transition-colors duration-150"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="text-xs text-qc-text-secondary font-mono tracking-wider uppercase block mb-1.5">Password</label>
              <input
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-qc-surface border border-qc-border text-white px-3 py-2.5 text-sm focus:border-qc-accent transition-colors duration-150"
                placeholder="Enter password"
                required
              />
            </div>
            <button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-qc-accent hover:bg-qc-accent-hover text-white font-medium py-2.5 text-sm flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50"
            >
              {loading ? (
                <span className="font-mono text-xs">AUTHENTICATING...</span>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Sign In</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <p className="text-qc-text-secondary text-sm mt-6 text-center">
            No account?{' '}
            <Link data-testid="login-register-link" to="/register" className="text-qc-accent hover:text-qc-accent-hover transition-colors duration-150">
              Create one
            </Link>
          </p>

          <div className="mt-8 border-t border-qc-border pt-4">
            <p className="text-qc-text-tertiary text-xs font-mono text-center">DEMO: arjun@quantchat.com / Demo@1234</p>
          </div>
        </div>
      </div>
    </div>
  );
}

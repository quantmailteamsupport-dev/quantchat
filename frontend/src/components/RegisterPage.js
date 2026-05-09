import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { UserPlus, ArrowRight, AlertCircle } from 'lucide-react';

function formatError(detail) {
  if (detail == null) return 'Something went wrong.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(' ');
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
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
      await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="register-page" className="h-screen bg-qc-bg flex">
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
          <h1 className="font-heading font-black text-5xl text-white leading-tight mb-6">
            Join the secure<br />communications grid.
          </h1>
          <p className="text-qc-text-secondary text-lg leading-relaxed max-w-md">
            Create your account and start messaging with end-to-end security.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-qc-accent flex items-center justify-center">
              <span className="font-heading font-black text-white">Q</span>
            </div>
            <span className="font-heading font-black text-2xl text-white tracking-tighter">QuantChat</span>
          </div>

          <h2 data-testid="register-heading" className="font-heading font-bold text-2xl text-white mb-1">Create account</h2>
          <p className="text-qc-text-secondary text-sm mb-8">Set up your QuantChat identity</p>

          {error && (
            <div data-testid="register-error" className="flex items-center gap-2 bg-qc-error/10 border border-qc-error/20 text-qc-error text-sm px-3 py-2 mb-4">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-qc-text-secondary font-mono tracking-wider uppercase block mb-1.5">Name</label>
              <input
                data-testid="register-name-input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-qc-surface border border-qc-border text-white px-3 py-2.5 text-sm focus:border-qc-accent transition-colors duration-150"
                placeholder="Your display name"
                required
              />
            </div>
            <div>
              <label className="text-xs text-qc-text-secondary font-mono tracking-wider uppercase block mb-1.5">Email</label>
              <input
                data-testid="register-email-input"
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
                data-testid="register-password-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-qc-surface border border-qc-border text-white px-3 py-2.5 text-sm focus:border-qc-accent transition-colors duration-150"
                placeholder="Min 6 characters"
                required
                minLength={6}
              />
            </div>
            <button
              data-testid="register-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-qc-accent hover:bg-qc-accent-hover text-white font-medium py-2.5 text-sm flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50"
            >
              {loading ? (
                <span className="font-mono text-xs">CREATING ACCOUNT...</span>
              ) : (
                <>
                  <UserPlus size={14} />
                  <span>Create Account</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <p className="text-qc-text-secondary text-sm mt-6 text-center">
            Already have an account?{' '}
            <Link data-testid="register-login-link" to="/login" className="text-qc-accent hover:text-qc-accent-hover transition-colors duration-150">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

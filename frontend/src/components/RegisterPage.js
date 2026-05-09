import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

function formatError(detail) {
  if (detail == null) return 'System Error.';
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
    <div data-testid="register-page" className="min-h-screen bg-qc-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <div className="mx-auto w-16 h-16 bg-qc-accent-primary rounded-full flex items-center justify-center mb-4">
          <span className="text-white text-3xl font-bold">Q</span>
        </div>
        <h2 className="text-3xl font-bold text-qc-text-primary">QuantChat</h2>
        <p className="mt-2 text-qc-text-secondary">Create a new account</p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-qc-surface py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-qc-border">
          {error && (
            <div data-testid="register-error" className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-qc-text-primary">Display Name</label>
              <div className="mt-1">
                <input
                  data-testid="register-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-qc-border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-qc-accent-primary focus:border-qc-accent-primary sm:text-sm bg-qc-bg text-qc-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-qc-text-primary">Email address</label>
              <div className="mt-1">
                <input
                  data-testid="register-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-qc-border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-qc-accent-primary focus:border-qc-accent-primary sm:text-sm bg-qc-bg text-qc-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-qc-text-primary">Password</label>
              <div className="mt-1 relative">
                <input
                  data-testid="register-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-qc-border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-qc-accent-primary focus:border-qc-accent-primary sm:text-sm bg-qc-bg text-qc-text-primary pr-10"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-qc-text-secondary">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <button
                data-testid="register-submit-button"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-qc-accent-primary hover:bg-qc-accent-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-qc-accent-primary disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-qc-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-qc-surface text-qc-text-secondary">Already have an account?</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link data-testid="register-login-link" to="/login" className="font-medium text-qc-accent-primary hover:text-qc-accent-secondary">
                Sign in here
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

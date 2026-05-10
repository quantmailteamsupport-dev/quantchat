import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ChatApp from './components/ChatApp';
import { API } from './lib/api';

axios.defaults.withCredentials = true;

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('qc_token') || null);

  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('qc_theme', 'dark');
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(true);

  const checkAuth = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/auth/me`, { headers });
      setUser(data.user);
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem('qc_token');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/api/auth/login`, { email, password });
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('qc_token', data.token);
    return data.user;
  };

  const demoLogin = async () => login('arjun@quantchat.com', 'Demo@1234');

  const loginWithFirebase = async (payload) => {
    const { data } = await axios.post(`${API}/api/auth/firebase/exchange`, payload);
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('qc_token', data.token);
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await axios.post(`${API}/api/auth/register`, { name, email, password });
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('qc_token', data.token);
    return data.user;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/api/auth/logout`);
    } catch {}
    setUser(null);
    setToken(null);
    localStorage.removeItem('qc_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithFirebase, demoLogin, register, logout, setUser, darkMode, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen bg-[#020409] flex items-center justify-center px-6">
        <div className="rounded-[28px] border border-white/10 bg-[rgba(11,13,20,0.88)] px-6 py-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="mx-auto h-12 w-12 rounded-full border border-white/12 bg-white/5 flex items-center justify-center assistant-orb">
            <span className="text-lg font-semibold text-white">Q</span>
          </div>
          <div className="mt-4 text-sm font-medium text-white/88">Connecting QuantChat</div>
          <div className="mt-1 text-xs text-white/45">Loading your secure social shell...</div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/*" element={<ProtectedRoute><ChatApp /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

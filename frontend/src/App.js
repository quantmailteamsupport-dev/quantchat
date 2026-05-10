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
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, setUser, darkMode, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen bg-qc-bg flex items-center justify-center">
        <div className="text-qc-accent-primary font-medium">Connecting...</div>
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

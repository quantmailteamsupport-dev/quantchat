import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, User, MessageCircle, Loader } from 'lucide-react';
import { API } from '../lib/api';

export default function UserSearch({ onStartChat }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('qc_token');

  useEffect(() => {
    const search = async () => {
      setLoading(true);
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const { data } = await axios.get(`${API}/api/users/search?q=${encodeURIComponent(query)}`, { headers });
        setUsers(data.users);
      } catch {}
      setLoading(false);
    };
    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query, token]);

  return (
    <div data-testid="user-search" className="flex flex-col h-full overflow-y-auto" style={{ background: '#05060b' }}>
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
        <p className="text-[10px] uppercase tracking-[0.26em] text-white/36">Discover</p>
        <h2 data-testid="search-title" className="font-bold text-2xl text-white mt-1 mb-4">Find people</h2>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
          <Search size={16} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
          <input
            data-testid="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/28 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size={22} className="animate-spin text-white/40" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-[28px] p-8 text-center mt-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <User size={30} className="mx-auto mb-3 text-white/30" />
            <p className="text-white/60 font-medium">{query ? 'No matches found' : 'Start typing to search'}</p>
            <p className="text-white/30 text-sm mt-1">{query ? 'Try a different name or email.' : 'Find and message anyone on QuantChat.'}</p>
          </div>
        ) : users.map((u) => (
          <div
            key={u.id}
            data-testid={`search-result-${u.id}`}
            className="flex items-center gap-3 p-3.5 rounded-[20px] transition-all"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="w-11 h-11 rounded-[14px] overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,rgba(79,140,255,0.18),rgba(162,89,255,0.10))', border: '1.5px solid rgba(255,255,255,0.10)' }}>
              {u.avatar
                ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                : <User size={18} style={{ color: 'rgba(79,140,255,0.7)' }} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/90 truncate">{u.name}</p>
              <p className="text-xs text-white/40 truncate mt-0.5">{u.bio || u.email}</p>
            </div>
            <button
              data-testid={`start-chat-${u.id}`}
              onClick={() => onStartChat(u.id)}
              className="w-9 h-9 rounded-[12px] flex items-center justify-center transition-all hover:bg-[#4f8cff]/20"
              style={{ color: '#4f8cff', border: '1.5px solid rgba(79,140,255,0.25)' }}
            >
              <MessageCircle size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

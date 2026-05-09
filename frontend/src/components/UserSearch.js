import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, User, MessageCircle, Loader } from 'lucide-react';
import { API } from '../lib/api';

export default function UserSearch({ onStartChat, currentUserId }) {
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
    <div data-testid="user-search" className="flex flex-col h-full bg-qc-surface">
      <div className="p-5 border-b-2 border-qc-border bg-[#FFB6C1]">
        <h2 data-testid="search-title" className="font-heading font-black text-2xl text-qc-text-primary uppercase tracking-tighter mb-4">FIND_AGENTS</h2>
        <div className="relative shadow-[2px_2px_0px_#0A0A0A]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-qc-text-primary" />
          <input
            data-testid="search-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ENTER QUERY..."
            className="w-full bg-qc-bg border-2 border-qc-border text-qc-text-primary font-mono font-bold text-sm pl-10 pr-4 py-3 focus:bg-qc-surface transition-all placeholder:text-qc-text-secondary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={24} className="text-qc-text-primary animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="border-4 border-qc-border bg-qc-bg p-6 shadow-brutal text-center">
            <User size={32} className="mx-auto mb-2" />
            <p className="font-heading font-black text-xl uppercase mb-1">
              {query ? 'NO_MATCHES' : 'AWAITING_QUERY'}
            </p>
          </div>
        ) : (
          users.map(u => (
            <div
              key={u.id}
              data-testid={`search-result-${u.id}`}
              className="flex items-center gap-3 p-3 border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-primary hover:shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 transition-all"
            >
              <div className="w-12 h-12 border-2 border-qc-border bg-qc-surface flex items-center justify-center flex-shrink-0 overflow-hidden">
                {u.avatar ? (
                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover grayscale contrast-125" />
                ) : (
                  <User size={24} className="text-qc-text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold font-mono uppercase text-qc-text-primary truncate">{u.name}</p>
                <p className="text-[10px] font-mono uppercase text-qc-text-secondary truncate">{u.bio || u.email}</p>
              </div>
              <button
                data-testid={`start-chat-${u.id}`}
                onClick={() => onStartChat(u.id)}
                className="w-10 h-10 flex items-center justify-center border-2 border-qc-border bg-qc-surface hover:bg-[#00FF66] shadow-[2px_2px_0px_#0A0A0A] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              >
                <MessageCircle size={18} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

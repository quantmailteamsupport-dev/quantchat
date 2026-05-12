import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, User, MessageCircle, Loader } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

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
    <div data-testid="user-search" className="flex flex-col h-full">
      <div className="p-4 border-b border-qc-border">
        <h2 data-testid="search-title" className="font-heading font-bold text-lg text-white mb-3">Find People</h2>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-qc-text-tertiary" />
          <input
            data-testid="search-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full bg-qc-elevated border border-qc-border text-white text-sm pl-9 pr-3 py-2 placeholder:text-qc-text-tertiary focus:border-qc-accent transition-colors duration-150"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={18} className="text-qc-accent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <User size={28} className="text-qc-text-tertiary mb-3" />
            <p className="text-qc-text-secondary text-sm">
              {query ? 'No users found' : 'Search for users to chat with'}
            </p>
          </div>
        ) : (
          users.map(u => (
            <div
              key={u.id}
              data-testid={`search-result-${u.id}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-qc-border hover:bg-qc-elevated transition-colors duration-150"
            >
              <div className="w-10 h-10 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center flex-shrink-0">
                {u.avatar ? (
                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={18} className="text-qc-text-secondary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.name}</p>
                <p className="text-xs text-qc-text-secondary truncate">{u.bio || u.email}</p>
              </div>
              <button
                data-testid={`start-chat-${u.id}`}
                onClick={() => onStartChat(u.id)}
                className="w-8 h-8 flex items-center justify-center bg-qc-accent hover:bg-qc-accent-hover text-white transition-colors duration-150"
              >
                <MessageCircle size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

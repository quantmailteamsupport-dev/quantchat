import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { User, MessageCircle, Loader } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Contacts({ onStartChat }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('qc_token');

  useEffect(() => {
    (async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const { data } = await axios.get(`${API}/api/contacts`, { headers });
        setContacts(data.contacts || []);
      } catch {}
      setLoading(false);
    })();
  }, [token]);

  return (
    <div data-testid="contacts-panel" className="flex flex-col h-full">
      <div className="p-4 border-b border-qc-border flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-white">Contacts</h2>
        <span className="font-mono text-[10px] text-qc-text-tertiary tracking-widest uppercase">{contacts.length} people</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={18} className="text-qc-accent animate-spin"/></div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <User size={28} className="text-qc-text-tertiary mb-3"/>
            <p className="text-qc-text-secondary text-sm">No contacts yet</p>
            <p className="text-qc-text-tertiary text-xs mt-1">Start conversations to build your contacts</p>
          </div>
        ) : contacts.map(u => (
          <div key={u.id} data-testid={`contact-${u.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-qc-border hover:bg-qc-elevated transition-colors duration-150">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center flex-shrink-0">
              {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover"/> : <User size={18} className="text-qc-text-secondary"/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{u.name}</p>
              <p className="text-xs text-qc-text-secondary truncate">{u.bio || u.email}</p>
            </div>
            <button data-testid={`contact-chat-${u.id}`} onClick={() => onStartChat(u.id)}
              className="w-8 h-8 flex items-center justify-center bg-qc-accent hover:bg-qc-accent-hover text-white transition-colors duration-150">
              <MessageCircle size={14}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

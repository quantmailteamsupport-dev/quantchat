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
    <div data-testid="contacts-panel" className="flex flex-col h-full bg-qc-surface">
      <div className="p-5 border-b-2 border-qc-border flex items-center justify-between bg-qc-accent-tertiary">
        <h2 className="font-heading font-black text-2xl text-qc-text-primary uppercase tracking-tighter">DIRECTORY</h2>
        <span className="font-mono text-xs font-bold border-2 border-qc-border bg-qc-surface px-2 py-1 shadow-[2px_2px_0px_#0A0A0A]">{contacts.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={24} className="text-qc-text-primary animate-spin"/></div>
        ) : contacts.length === 0 ? (
          <div className="border-4 border-qc-border bg-qc-bg p-6 shadow-brutal text-center">
            <User size={32} className="mx-auto mb-2"/>
            <p className="font-heading font-black text-xl uppercase mb-1">NO_AGENTS_FOUND</p>
            <p className="font-mono text-xs font-bold uppercase text-qc-text-secondary">Initate search to populate directory.</p>
          </div>
        ) : contacts.map(u => (
          <div key={u.id} data-testid={`contact-${u.id}`} className="flex items-center gap-3 p-3 border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-secondary hover:shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 transition-all">
            <div className="w-12 h-12 border-2 border-qc-border bg-qc-surface flex items-center justify-center flex-shrink-0 overflow-hidden">
              {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover grayscale contrast-125"/> : <User size={24}/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold font-mono uppercase truncate">{u.name}</p>
              <p className="text-[10px] font-mono uppercase text-qc-text-secondary truncate">{u.bio || u.email}</p>
            </div>
            <button data-testid={`contact-chat-${u.id}`} onClick={() => onStartChat(u.id)}
              className="w-10 h-10 flex items-center justify-center border-2 border-qc-border bg-qc-surface hover:bg-[#00FF66] shadow-[2px_2px_0px_#0A0A0A] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all">
              <MessageCircle size={18}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

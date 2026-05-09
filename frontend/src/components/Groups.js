import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Plus, User, Loader, X, Check } from 'lucide-react';
import { API } from '../lib/api';

export default function Groups({ onSelectConv, userId }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const token = localStorage.getItem('qc_token');

  useEffect(() => { loadGroups(); }, []);

  const loadGroups = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations`, { headers });
      setGroups((data.conversations || []).filter(c => c.type === 'group'));
    } catch {}
    setLoading(false);
  };

  const loadUsers = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/users/search?q=`, { headers });
      setAllUsers(data.users || []);
    } catch {}
  };

  const openCreate = () => { setShowCreate(true); loadUsers(); };

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setCreating(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/conversations/group`, { name: groupName, participant_ids: selectedUsers }, { headers });
      setShowCreate(false);
      setGroupName('');
      setSelectedUsers([]);
      loadGroups();
      if (data.conversation) onSelectConv(data.conversation);
    } catch {}
    setCreating(false);
  };

  const toggleUser = (id) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
  };

  return (
    <div data-testid="groups-panel" className="flex flex-col h-full bg-qc-surface relative">
      <div className="p-5 border-b-2 border-qc-border flex items-center justify-between bg-[#00FF66]">
        <h2 className="font-heading font-black text-2xl text-qc-text-primary uppercase tracking-tighter">SQUADS</h2>
        <button data-testid="create-group-btn" onClick={openCreate} className="w-8 h-8 flex items-center justify-center border-2 border-qc-border bg-qc-surface shadow-[2px_2px_0px_#0A0A0A] hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all">
          <Plus size={18}/>
        </button>
      </div>

      {showCreate && (
        <div className="absolute inset-0 z-30 bg-qc-surface flex flex-col">
          <div className="p-4 border-b-2 border-qc-border flex items-center justify-between bg-qc-bg">
            <span className="font-heading font-black text-xl uppercase">FORM_SQUAD</span>
            <button onClick={() => setShowCreate(false)} className="border-2 border-qc-border p-1 bg-qc-surface hover:bg-[#FF3333] hover:text-white shadow-[2px_2px_0px_#0A0A0A]"><X size={18}/></button>
          </div>
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <input data-testid="group-name-input" type="text" value={groupName} onChange={e => setGroupName(e.target.value)}
              placeholder="SQUAD_DESIGNATION..." className="w-full bg-qc-bg border-2 border-qc-border p-3 font-mono font-bold focus:bg-qc-surface focus:ring-2 focus:ring-qc-accent-primary"/>
            <div className="space-y-2">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-qc-text-secondary border-b-2 border-qc-border pb-1">SELECT_OPERATIVES</p>
              {allUsers.map(u => (
                <button key={u.id} data-testid={`group-select-${u.id}`} onClick={() => toggleUser(u.id)}
                  className={`w-full flex items-center gap-3 p-2 border-2 border-qc-border text-left ${selectedUsers.includes(u.id) ? 'bg-[#00FF66] shadow-[2px_2px_0px_#0A0A0A] -translate-y-0.5' : 'bg-qc-bg hover:bg-qc-surface'}`}>
                  <div className="w-8 h-8 border-2 border-qc-border bg-qc-surface flex items-center justify-center overflow-hidden">
                    {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover grayscale"/> : <User size={16}/>}
                  </div>
                  <span className="flex-1 font-mono text-sm font-bold uppercase truncate">{u.name}</span>
                  {selectedUsers.includes(u.id) && <Check size={18} className="text-black"/>}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 border-t-2 border-qc-border bg-qc-bg">
            <button data-testid="create-group-submit" onClick={createGroup} disabled={creating || !groupName.trim() || selectedUsers.length === 0}
              className="w-full border-2 border-qc-border bg-qc-accent-primary font-mono font-bold uppercase py-3 shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#0A0A0A] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none">
              {creating ? 'PROCESSING...' : `DEPLOY_SQUAD (${selectedUsers.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={24} className="text-qc-text-primary animate-spin"/></div>
        ) : groups.length === 0 ? (
          <div className="border-4 border-qc-border bg-qc-bg p-6 shadow-brutal text-center">
            <Users size={32} className="mx-auto mb-2"/>
            <p className="font-heading font-black text-xl uppercase mb-1">NO_SQUADS_ACTIVE</p>
            <p className="font-mono text-xs font-bold uppercase text-qc-text-secondary">Deploy a squad to initiate group comms.</p>
          </div>
        ) : groups.map(g => (
          <button key={g.id} data-testid={`group-item-${g.id}`} onClick={() => onSelectConv(g)}
            className="w-full flex items-center gap-3 p-3 border-2 border-qc-border bg-qc-bg hover:bg-[#00FF66] hover:shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 transition-all text-left">
            <div className="w-12 h-12 border-2 border-qc-border bg-qc-surface flex items-center justify-center flex-shrink-0">
              <Users size={24}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold font-mono uppercase truncate">{g.name}</p>
              <p className="text-[10px] font-mono font-bold uppercase text-qc-text-secondary mt-1 border-2 border-qc-border px-1 w-max bg-qc-surface">{g.participants?.length || 0}_UNITS</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

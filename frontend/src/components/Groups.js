import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Plus, User, Loader, X, Check } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Groups({ onSelectConv, userId }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const token = localStorage.getItem('qc_token');

  useEffect(() => {
    loadGroups();
  }, []);

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
    <div data-testid="groups-panel" className="flex flex-col h-full">
      <div className="p-4 border-b border-qc-border flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-white">Groups</h2>
        <button data-testid="create-group-btn" onClick={openCreate} className="w-8 h-8 flex items-center justify-center bg-qc-accent hover:bg-qc-accent-hover text-white transition-colors duration-150">
          <Plus size={16}/>
        </button>
      </div>

      {showCreate && (
        <div className="p-4 border-b border-qc-border bg-qc-elevated space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-qc-accent tracking-widest uppercase">New Group</span>
            <button onClick={() => setShowCreate(false)} className="text-qc-text-secondary hover:text-white"><X size={14}/></button>
          </div>
          <input data-testid="group-name-input" type="text" value={groupName} onChange={e => setGroupName(e.target.value)}
            placeholder="Group name..." className="w-full bg-qc-surface border border-qc-border text-white text-sm px-3 py-2 focus:border-qc-accent transition-colors duration-150"/>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {allUsers.map(u => (
              <button key={u.id} data-testid={`group-select-${u.id}`} onClick={() => toggleUser(u.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm ${selectedUsers.includes(u.id) ? 'bg-qc-accent/20 text-qc-accent' : 'text-white hover:bg-qc-highlight'}`}>
                <div className="w-6 h-6 rounded bg-qc-highlight flex items-center justify-center overflow-hidden">
                  {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover"/> : <User size={12} className="text-qc-text-secondary"/>}
                </div>
                <span className="flex-1 truncate">{u.name}</span>
                {selectedUsers.includes(u.id) && <Check size={14} className="text-qc-accent"/>}
              </button>
            ))}
          </div>
          <button data-testid="create-group-submit" onClick={createGroup} disabled={creating || !groupName.trim() || selectedUsers.length === 0}
            className="w-full bg-qc-accent hover:bg-qc-accent-hover text-white text-sm py-2 disabled:opacity-40 transition-colors duration-150">
            {creating ? 'Creating...' : `Create Group (${selectedUsers.length} members)`}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={18} className="text-qc-accent animate-spin"/></div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Users size={28} className="text-qc-text-tertiary mb-3"/>
            <p className="text-qc-text-secondary text-sm">No groups yet</p>
            <p className="text-qc-text-tertiary text-xs mt-1">Create a group to chat with multiple people</p>
          </div>
        ) : groups.map(g => (
          <button key={g.id} data-testid={`group-item-${g.id}`} onClick={() => onSelectConv(g)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-qc-border hover:bg-qc-elevated transition-colors duration-150 text-left">
            <div className="w-10 h-10 rounded-md bg-qc-accent/20 flex items-center justify-center flex-shrink-0">
              <Users size={18} className="text-qc-accent"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{g.name}</p>
              <p className="text-xs text-qc-text-secondary">{g.participants?.length || 0} members</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

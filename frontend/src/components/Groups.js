import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Users, Plus, User, Loader, X, Check, Search, Sparkles } from 'lucide-react';
import { API } from '../lib/api';

export default function Groups({ onSelectConv }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const token = localStorage.getItem('qc_token');

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations`, { headers });
      setGroups((data.conversations || []).filter((conversation) => conversation.type === 'group'));
    } catch {
      setGroups([]);
    }
    setLoading(false);
  };

  const loadUsers = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/users/search?q=`, { headers });
      setAllUsers(data.users || []);
    } catch {
      setAllUsers([]);
    }
  };

  const openCreate = () => {
    setShowCreate(true);
    loadUsers();
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    setCreating(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(
        `${API}/api/conversations/group`,
        { name: groupName, participant_ids: selectedUsers },
        { headers }
      );
      setShowCreate(false);
      setGroupName('');
      setSelectedUsers([]);
      setMemberSearch('');
      loadGroups();
      if (data.conversation) onSelectConv(data.conversation);
    } catch {}
    setCreating(false);
  };

  const toggleUser = (id) => {
    setSelectedUsers((previous) => (
      previous.includes(id) ? previous.filter((userId) => userId !== id) : [...previous, id]
    ));
  };

  const filteredGroups = useMemo(() => (
    groups.filter((group) => group.name?.toLowerCase().includes(search.toLowerCase()))
  ), [groups, search]);

  const filteredUsers = useMemo(() => (
    allUsers.filter((user) => (
      user.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      user.email?.toLowerCase().includes(memberSearch.toLowerCase())
    ))
  ), [allUsers, memberSearch]);

  return (
    <div data-testid="groups-panel" className="flex flex-col h-full bg-[#05060b] relative overflow-y-auto">
      <div className="px-4 py-4 sm:px-5 border-b border-white/8 bg-[rgba(255,255,255,0.03)]">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/36">Squad control</p>
            <div className="flex items-center gap-2 mt-1">
              <Users size={18} className="text-[#4f8cff]" />
              <h2 className="font-heading text-2xl text-white/88">Groups</h2>
            </div>
          </div>

          <button
            data-testid="create-group-btn"
            onClick={openCreate}
            className="h-11 px-3 sm:px-4 rounded-2xl bg-[#4f8cff] text-white hover:bg-[#3a7aee] transition-colors flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(79,140,255,0.15)] whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="text-sm font-medium">New group</span>
          </button>
        </div>

        <div className="mt-4 flex gap-3 overflow-x-auto hide-scrollbar sm:grid sm:grid-cols-3">
          <div className="shrink-0 min-w-[160px] rounded-2xl border border-white/8 bg-white/5 px-4 py-3 sm:min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Active groups</p>
            <p className="text-xl font-semibold text-white/88 mt-1">{groups.length}</p>
          </div>
          <div className="shrink-0 min-w-[160px] rounded-2xl border border-white/8 bg-white/5 px-4 py-3 sm:min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Selected members</p>
            <p className="text-xl font-semibold text-white/88 mt-1">{selectedUsers.length}</p>
          </div>
          <div className="shrink-0 min-w-[160px] rounded-2xl border border-white/8 bg-white/5 px-4 py-3 sm:min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Mode</p>
            <p className="text-sm font-semibold text-white/88 mt-2">Fast squad setup</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/8 bg-white/5 px-3 py-2 flex items-center gap-2">
          <Search size={16} className="text-white/48" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search existing groups"
            className="w-full bg-transparent text-sm text-white/88"
          />
        </div>
      </div>

      {showCreate && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-[580px] max-h-[85vh] bg-[rgba(255,255,255,0.03)] border border-white/8 rounded-[32px] overflow-hidden shadow-[0_24px_70px_rgba(19,31,51,0.24)] flex flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="p-5 border-b border-white/8 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Create squad</p>
                <h3 className="font-heading text-xl text-white/88 mt-1">Build a focused group</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-white/48 hover:text-white/88">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <input
                data-testid="group-name-input"
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Squad name"
                className="w-full bg-white/5 border border-white/8 rounded-2xl p-4 text-sm text-white/88"
              />

              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-2 flex items-center gap-2">
                <Search size={16} className="text-white/48" />
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Search people by name or email"
                  className="w-full bg-transparent text-sm text-white/88"
                />
              </div>

              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {filteredUsers
                    .filter((user) => selectedUsers.includes(user.id))
                    .map((user) => (
                      <div key={user.id} className="rounded-full border border-white/8 bg-[rgba(79,140,255,0.12)] px-3 py-1 text-xs text-white/88">
                        {user.name}
                      </div>
                    ))}
                </div>
              )}

              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    data-testid={`group-select-${user.id}`}
                    onClick={() => toggleUser(user.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                      selectedUsers.includes(user.id)
                        ? 'border-qc-accent-primary bg-[rgba(79,140,255,0.12)]'
                        : 'border-white/8 bg-[rgba(255,255,255,0.03)] hover:bg-white/5'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center overflow-hidden">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={16} className="text-white/48" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white/88 truncate">{user.name}</p>
                      <p className="text-xs text-white/48 truncate">{user.email}</p>
                    </div>
                    {selectedUsers.includes(user.id) && (
                      <div className="w-7 h-7 rounded-full bg-[#4f8cff] text-white flex items-center justify-center">
                        <Check size={14} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 border-t border-white/8 bg-white/5">
              <button
                data-testid="create-group-submit"
                onClick={createGroup}
                disabled={creating || !groupName.trim() || selectedUsers.length === 0}
                className="w-full rounded-2xl bg-[#4f8cff] hover:bg-[#3a7aee] text-white text-sm font-medium py-3 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_rgba(79,140,255,0.15)]"
              >
                {creating ? 'Creating squad...' : `Create group (${selectedUsers.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-5 sm:px-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="text-white/88 animate-spin" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-[30px] border border-dashed border-white/8 bg-[rgba(255,255,255,0.03)] p-8 text-center shadow-sm">
            <Sparkles size={34} className="mx-auto mb-4 text-[#4f8cff]" />
            <p className="text-white/88 text-lg font-medium">No groups in this view</p>
            <p className="text-white/48 text-sm mt-2">
              Create a focused squad for launches, support, or campaign work.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredGroups.map((group) => (
              <button
                key={group.id}
                data-testid={`group-item-${group.id}`}
                onClick={() => onSelectConv(group)}
                className="w-full rounded-[28px] border border-white/8 bg-[rgba(255,255,255,0.03)] text-left p-5 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(79,140,255,0.15)] transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-[rgba(79,140,255,0.12)] text-[#4f8cff] flex items-center justify-center flex-shrink-0">
                      <Users size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-white/88 truncate">{group.name}</p>
                      <p className="text-xs text-white/48 mt-1">
                        {(group.participants?.length || 0)} members
                      </p>
                    </div>
                  </div>

                  <div className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] text-white/48">
                    Open
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(group.participants || []).slice(0, 4).map((participant) => (
                    <div key={participant.user_id} className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-xs text-white/88">
                      {participant.name}
                    </div>
                  ))}
                  {(group.participants?.length || 0) > 4 && (
                    <div className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-xs text-white/48">
                      +{group.participants.length - 4} more
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

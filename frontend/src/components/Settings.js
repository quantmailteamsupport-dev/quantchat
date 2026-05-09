import React, { useState } from 'react';
import axios from 'axios';
import { User, Mail, Edit3, Save, Shield } from 'lucide-react';
import { API } from '../lib/api';

export default function Settings({ user }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const token = localStorage.getItem('qc_token');

  const handleSave = async () => {
    setSaving(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.patch(`${API}/api/users/profile`, { name, bio }, { headers });
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  return (
    <div data-testid="settings-panel" className="flex flex-col h-full">
      <div className="p-4 border-b border-qc-border">
        <h2 data-testid="settings-title" className="font-heading font-bold text-lg text-white">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Profile section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-qc-accent tracking-widest uppercase">Profile</span>
            <button
              data-testid="edit-profile-btn"
              onClick={() => editing ? handleSave() : setEditing(true)}
              className="text-qc-text-secondary hover:text-qc-accent transition-colors duration-150"
            >
              {editing ? <Save size={16} /> : <Edit3 size={16} />}
            </button>
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User size={28} className="text-qc-text-secondary" />
              )}
            </div>
            <div>
              <p className="text-white font-medium">{user?.name}</p>
              <p className="text-qc-text-secondary text-xs flex items-center gap-1">
                <Mail size={10} /> {user?.email}
              </p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-qc-text-tertiary font-mono tracking-wider uppercase block mb-1">Name</label>
                <input
                  data-testid="settings-name-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-qc-elevated border border-qc-border text-white text-sm px-3 py-2 focus:border-qc-accent transition-colors duration-150"
                />
              </div>
              <div>
                <label className="text-[10px] text-qc-text-tertiary font-mono tracking-wider uppercase block mb-1">Bio</label>
                <textarea
                  data-testid="settings-bio-input"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={3}
                  className="w-full bg-qc-elevated border border-qc-border text-white text-sm px-3 py-2 resize-none focus:border-qc-accent transition-colors duration-150"
                />
              </div>
              <button
                data-testid="save-profile-btn"
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-qc-accent hover:bg-qc-accent-hover text-white text-sm py-2 flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50"
              >
                {saving ? <span className="font-mono text-xs">SAVING...</span> : <><Save size={14} /> Save Changes</>}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-qc-elevated border border-qc-border p-3">
                <span className="text-[10px] text-qc-text-tertiary font-mono tracking-wider uppercase block mb-1">Bio</span>
                <p className="text-sm text-qc-text-secondary">{user?.bio || 'No bio set'}</p>
              </div>
              <div className="bg-qc-elevated border border-qc-border p-3">
                <span className="text-[10px] text-qc-text-tertiary font-mono tracking-wider uppercase block mb-1">Role</span>
                <p className="text-sm text-qc-text-secondary capitalize">{user?.role || 'user'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Security section */}
        <div>
          <span className="font-mono text-[10px] text-qc-accent tracking-widest uppercase block mb-3">Security</span>
          <div className="bg-qc-elevated border border-qc-border p-3 flex items-center gap-3">
            <Shield size={18} className="text-qc-success flex-shrink-0" />
            <div>
              <p className="text-sm text-white font-medium">End-to-End Encryption</p>
              <p className="text-xs text-qc-text-secondary">Your messages are protected</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

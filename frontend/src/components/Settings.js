import React, { useState } from 'react';
import axios from 'axios';
import { User, Mail, Edit3, Save, Shield } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

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
    <div data-testid="settings-panel" className="flex flex-col h-full bg-qc-surface">
      <div className="p-5 border-b-2 border-qc-border bg-[#D8B2D8]">
        <h2 data-testid="settings-title" className="font-heading font-black text-2xl text-qc-text-primary uppercase tracking-tighter">CONFIG</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Profile section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4 border-b-2 border-qc-border pb-2">
            <span className="font-mono text-sm font-bold tracking-widest uppercase">IDENTITY</span>
            <button
              data-testid="edit-profile-btn"
              onClick={() => editing ? handleSave() : setEditing(true)}
              className="text-qc-text-primary border-2 border-transparent hover:border-qc-border p-1"
            >
              {editing ? <Save size={18} /> : <Edit3 size={18} />}
            </button>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 border-2 border-qc-border bg-qc-accent-tertiary flex items-center justify-center overflow-hidden shadow-[2px_2px_0px_#0A0A0A]">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover grayscale contrast-125" />
              ) : (
                <User size={32} className="text-qc-text-primary" />
              )}
            </div>
            <div>
              <p className="text-qc-text-primary font-bold font-mono uppercase text-lg">{user?.name}</p>
              <p className="text-qc-text-secondary font-mono text-xs flex items-center gap-1 uppercase bg-qc-bg border-2 border-qc-border px-1 w-max">
                <Mail size={12} /> {user?.email}
              </p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold font-mono tracking-wider uppercase block mb-1">DESIGNATION</label>
                <input
                  data-testid="settings-name-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-qc-bg border-2 border-qc-border text-qc-text-primary font-bold font-mono text-sm px-3 py-3 focus:bg-qc-surface focus:ring-2 focus:ring-qc-accent-primary"
                />
              </div>
              <div>
                <label className="text-xs font-bold font-mono tracking-wider uppercase block mb-1">STATUS</label>
                <textarea
                  data-testid="settings-bio-input"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  rows={3}
                  className="w-full bg-qc-bg border-2 border-qc-border text-qc-text-primary font-bold font-mono text-sm px-3 py-3 resize-none focus:bg-qc-surface focus:ring-2 focus:ring-qc-accent-primary"
                />
              </div>
              <button
                data-testid="save-profile-btn"
                onClick={handleSave}
                disabled={saving}
                className="w-full border-2 border-qc-border bg-[#00FF66] hover:bg-[#00CC55] text-qc-text-primary font-mono font-bold text-sm py-3 shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#0A0A0A] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50 flex justify-center"
              >
                {saving ? 'UPDATING...' : 'COMMIT_CHANGES'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-qc-bg border-2 border-qc-border p-4 shadow-[2px_2px_0px_#0A0A0A]">
                <span className="text-[10px] font-bold text-qc-text-secondary font-mono tracking-wider uppercase block mb-1">STATUS</span>
                <p className="text-sm font-mono uppercase text-qc-text-primary font-bold">{user?.bio || 'NO_STATUS_SET'}</p>
              </div>
              <div className="bg-qc-bg border-2 border-qc-border p-4 shadow-[2px_2px_0px_#0A0A0A]">
                <span className="text-[10px] font-bold text-qc-text-secondary font-mono tracking-wider uppercase block mb-1">ACCESS_LEVEL</span>
                <p className="text-sm font-mono uppercase text-qc-text-primary font-bold">{user?.role || 'OPERATIVE'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Security section */}
        <div className="mt-8">
          <span className="font-mono text-sm font-bold tracking-widest uppercase border-b-2 border-qc-border pb-2 block mb-4">SECURITY</span>
          <div className="bg-qc-bg border-2 border-qc-border p-4 flex items-center gap-4 shadow-[2px_2px_0px_#0A0A0A]">
            <Shield size={24} className="text-[#00FF66] flex-shrink-0" />
            <div>
              <p className="text-sm text-qc-text-primary font-mono font-bold uppercase">END-TO-END ENCRYPTION</p>
              <p className="text-xs text-qc-text-secondary font-mono uppercase">TRANSMISSIONS SECURED</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

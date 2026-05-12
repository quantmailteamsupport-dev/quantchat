import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { User, Mail, Edit3, Save, Shield, Moon, BellRing, PlayCircle, Radio } from 'lucide-react';
import { API } from '../lib/api';
import { useAuth } from '../App';

const PREF_EVENT = 'qc-preferences-changed';

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 48, height: 28, borderRadius: 14,
        background: enabled ? 'linear-gradient(135deg,#4f8cff,#6a7aff)' : 'rgba(255,255,255,0.08)',
        border: enabled ? 'none' : '1.5px solid rgba(255,255,255,0.12)',
        position: 'relative', transition: 'all 0.2s',
        boxShadow: enabled ? '0 0 14px rgba(79,140,255,0.30)' : 'none',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 4, left: enabled ? 24 : 4,
        width: 20, height: 20, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function PreferenceRow({ icon: Icon, title, description, enabled, onToggle }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-4 rounded-[22px]"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(79,140,255,0.12)', color: '#4f8cff' }}
        >
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/88">{title}</p>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
      </div>
      <Toggle enabled={enabled} onToggle={onToggle} />
    </div>
  );
}

export default function Settings() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState(() => ({
    autoplayReels: localStorage.getItem('qc_pref_autoplay_reels') !== 'false',
    storyAutoadvance: localStorage.getItem('qc_pref_story_autoadvance') !== 'false',
    showPreviewHints: localStorage.getItem('qc_pref_preview_hints') !== 'false',
  }));
  const token = localStorage.getItem('qc_token');

  const stats = useMemo(() => ([
    { label: 'Theme', value: 'Dark' },
    { label: 'Profile mode', value: editing ? 'Editing' : 'Viewing' },
    { label: 'Story flow', value: preferences.storyAutoadvance ? 'Auto' : 'Manual' },
  ]), [editing, preferences.storyAutoadvance]);

  const broadcastPreferences = (nextPreferences) => {
    localStorage.setItem('qc_pref_autoplay_reels', String(nextPreferences.autoplayReels));
    localStorage.setItem('qc_pref_story_autoadvance', String(nextPreferences.storyAutoadvance));
    localStorage.setItem('qc_pref_preview_hints', String(nextPreferences.showPreviewHints));
    window.dispatchEvent(new Event(PREF_EVENT));
  };

  const togglePreference = (key) => {
    setPreferences((current) => {
      const next = { ...current, [key]: !current[key] };
      broadcastPreferences(next);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.patch(`${API}/api/users/profile`, { name, bio }, { headers });
      setUser((current) => current ? { ...current, name, bio } : current);
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  const inputClass = "w-full px-4 py-3 rounded-[16px] text-sm text-white placeholder:text-white/28 focus:outline-none focus:ring-1 focus:ring-[#4f8cff]/40";
  const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' };

  return (
    <div data-testid="settings-panel" className="flex flex-col h-full overflow-y-auto" style={{ background: '#05060b' }}>
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <p className="text-[10px] uppercase tracking-[0.26em] text-white/36">Profile cockpit</p>
        <h2 data-testid="settings-title" className="font-bold text-2xl text-white mt-1.5">You</h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[18px] px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/36">{stat.label}</p>
              <p className="text-sm font-semibold text-white mt-1.5">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 space-y-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-8">
        <section className="rounded-[28px] p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Identity</p>
              <h3 className="text-base font-semibold text-white mt-1">Profile &amp; bio</h3>
            </div>
            <button
              data-testid="edit-profile-btn"
              onClick={() => (editing ? handleSave() : setEditing(true))}
              className="h-9 px-4 rounded-full text-sm font-medium inline-flex items-center gap-2 transition-all"
              style={{ background: editing ? 'linear-gradient(135deg,#4f8cff,#6a7aff)' : 'rgba(255,255,255,0.06)', color: editing ? 'white' : 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {editing ? <Save size={14} /> : <Edit3 size={14} />}
              {editing ? 'Save' : 'Edit'}
            </button>
          </div>

          <div className="flex items-center gap-4 mb-5">
            <div
              className="w-16 h-16 rounded-[20px] overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,rgba(79,140,255,0.20),rgba(162,89,255,0.12))', border: '1.5px solid rgba(255,255,255,0.10)' }}
            >
              {user?.avatar
                ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                : <User size={28} style={{ color: '#4f8cff' }} />
              }
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-lg truncate">{user?.name}</p>
              <p className="text-white/48 text-sm flex items-center gap-1.5 mt-0.5 truncate"><Mail size={13} />{user?.email}</p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/36 block mb-1.5">Display name</label>
                <input data-testid="settings-name-input" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/36 block mb-1.5">Bio</label>
                <textarea data-testid="settings-bio-input" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={`${inputClass} resize-none`} style={inputStyle} />
              </div>
              <button
                data-testid="save-profile-btn"
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-[16px] py-3 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#4f8cff,#6a7aff)', boxShadow: '0 4px 20px rgba(79,140,255,0.28)' }}
              >
                {saving ? 'Updating profile...' : 'Save profile'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/36 block mb-1.5">Status</span>
                <p className="text-sm text-white/72">{user?.bio || 'No status set yet.'}</p>
              </div>
              <div className="rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/36 block mb-1.5">Access level</span>
                <p className="text-sm text-white/72 capitalize">{user?.role || 'user'}</p>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="px-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/36">Preferences</p>
            <h3 className="text-base font-semibold text-white mt-1">Experience toggles</h3>
          </div>
          <PreferenceRow icon={Moon} title="Dark shell locked" description="App stays in dark mode on all platforms." enabled onToggle={() => {}} />
          <PreferenceRow icon={PlayCircle} title="Autoplay reels" description="Spotlight videos start automatically on the active frame." enabled={preferences.autoplayReels} onToggle={() => togglePreference('autoplayReels')} />
          <PreferenceRow icon={Radio} title="Story auto-advance" description="Move through the story viewer automatically." enabled={preferences.storyAutoadvance} onToggle={() => togglePreference('storyAutoadvance')} />
          <PreferenceRow icon={BellRing} title="Preview hints" description="Show helper hints inside social panels." enabled={preferences.showPreviewHints} onToggle={() => togglePreference('showPreviewHints')} />
        </section>

        <section className="rounded-[24px] p-5 flex items-start gap-4" style={{ background: 'rgba(79,140,255,0.06)', border: '1px solid rgba(79,140,255,0.18)' }}>
          <div className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(79,140,255,0.18)', color: '#4f8cff' }}>
            <Shield size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/90">End-to-end encryption</p>
            <p className="text-sm text-white/48 mt-1.5">Messages stay encrypted in transit. Profile edits and UI preferences are saved instantly.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

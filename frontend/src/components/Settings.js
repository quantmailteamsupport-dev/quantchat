import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { User, Mail, Edit3, Save, Shield, Moon, BellRing, PlayCircle, Radio } from 'lucide-react';
import { API } from '../lib/api';
import { useAuth } from '../App';

const PREF_EVENT = 'qc-preferences-changed';

function PreferenceRow({ icon: Icon, title, description, enabled, onToggle }) {
  return (
    <div className="rounded-[24px] border border-qc-border bg-qc-surface p-4 flex items-center justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-11 h-11 rounded-2xl bg-qc-accent-tertiary text-qc-accent-primary flex items-center justify-center flex-shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-qc-text-primary">{title}</p>
          <p className="text-xs text-qc-text-secondary mt-1">{description}</p>
        </div>
      </div>

      <button
        onClick={onToggle}
        className={`w-14 h-8 rounded-full transition-colors relative ${enabled ? 'bg-qc-accent-primary' : 'bg-qc-surface-hover border border-qc-border'}`}
      >
        <span
          className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-7 left-0' : 'translate-x-1 left-0'}`}
        />
      </button>
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

  return (
    <div data-testid="settings-panel" className="flex flex-col h-full bg-qc-bg">
      <div className="px-4 py-4 sm:px-5 border-b border-qc-border bg-qc-surface">
        <p className="text-[10px] uppercase tracking-[0.24em] text-qc-text-tertiary">Profile cockpit</p>
        <h2 data-testid="settings-title" className="font-heading text-2xl text-qc-text-primary mt-1">You</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-qc-border bg-qc-surface-hover px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">{stat.label}</p>
              <p className="text-sm font-semibold text-qc-text-primary mt-2">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 space-y-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-6">
        <section className="rounded-[30px] border border-qc-border bg-qc-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Identity</p>
              <h3 className="text-lg font-semibold text-qc-text-primary mt-1">Profile and bio</h3>
            </div>
            <button
              data-testid="edit-profile-btn"
              onClick={() => (editing ? handleSave() : setEditing(true))}
              className="h-11 px-4 rounded-2xl border border-qc-border bg-qc-surface-hover text-qc-text-primary hover:bg-qc-accent-tertiary transition-colors flex items-center gap-2"
            >
              {editing ? <Save size={16} /> : <Edit3 size={16} />}
              <span className="text-sm font-medium">{editing ? 'Save' : 'Edit'}</span>
            </button>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-[28px] bg-qc-accent-tertiary flex items-center justify-center overflow-hidden shadow-glow">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User size={34} className="text-qc-accent-primary" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-qc-text-primary font-semibold text-xl truncate">{user?.name}</p>
              <p className="text-qc-text-secondary text-sm flex items-center gap-2 mt-1 truncate">
                <Mail size={14} /> {user?.email}
              </p>
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium tracking-wide uppercase text-qc-text-tertiary block mb-2">Display name</label>
                <input
                  data-testid="settings-name-input"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full bg-qc-surface-hover border border-qc-border text-qc-text-primary text-sm px-4 py-3 rounded-2xl"
                />
              </div>
              <div>
                <label className="text-xs font-medium tracking-wide uppercase text-qc-text-tertiary block mb-2">Bio</label>
                <textarea
                  data-testid="settings-bio-input"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={4}
                  className="w-full bg-qc-surface-hover border border-qc-border text-qc-text-primary text-sm px-4 py-3 rounded-2xl resize-none"
                />
              </div>
              <button
                data-testid="save-profile-btn"
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-2xl bg-qc-accent-primary hover:bg-qc-accent-secondary text-white text-sm font-medium py-3 disabled:opacity-50 shadow-glow"
              >
                {saving ? 'Updating profile...' : 'Save profile'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4">
                <span className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary block mb-2">Status</span>
                <p className="text-sm text-qc-text-primary">{user?.bio || 'No status set yet.'}</p>
              </div>
              <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4">
                <span className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary block mb-2">Access level</span>
                <p className="text-sm text-qc-text-primary capitalize">{user?.role || 'user'}</p>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Preferences</p>
            <h3 className="text-lg font-semibold text-qc-text-primary mt-1">Experience toggles</h3>
          </div>

          <PreferenceRow
            icon={Moon}
            title="Dark shell locked"
            description="Mobile aur web dono par ab app dark mode me hi rahega."
            enabled
            onToggle={() => {}}
          />
          <PreferenceRow
            icon={PlayCircle}
            title="Autoplay reels"
            description="Let Spotlight videos start automatically when they hit the active frame."
            enabled={preferences.autoplayReels}
            onToggle={() => togglePreference('autoplayReels')}
          />
          <PreferenceRow
            icon={Radio}
            title="Story auto-advance"
            description="Move through the story viewer automatically every few seconds."
            enabled={preferences.storyAutoadvance}
            onToggle={() => togglePreference('storyAutoadvance')}
          />
          <PreferenceRow
            icon={BellRing}
            title="Preview hints"
            description="Show helper hints and navigation cues inside the social panels."
            enabled={preferences.showPreviewHints}
            onToggle={() => togglePreference('showPreviewHints')}
          />
        </section>

        <section className="rounded-[28px] border border-qc-border bg-qc-surface p-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-qc-accent-tertiary text-qc-accent-primary flex items-center justify-center flex-shrink-0">
              <Shield size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-qc-text-primary">End-to-end encryption</p>
              <p className="text-sm text-qc-text-secondary mt-2">
                Messages stay encrypted in transit. This panel now also saves your profile edits and live UI preferences instantly.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

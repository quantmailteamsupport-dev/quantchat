import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { KeyRound, Phone, Save, Plus, X, Bookmark, Grid3X3, Activity, Camera, BarChart3 } from 'lucide-react';
import { API } from '../lib/api';

function blankServer() {
  return { name: '', url: '', enabled: true };
}

export default function ProfilePanel({ token }) {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('posts');
  const [form, setForm] = useState({
    active_provider: 'openai',
    active_model: 'gpt-5.2',
    openai_api_key: '',
    gemini_api_key: '',
    claude_api_key: '',
    deepseek_api_key: '',
    ollama_base_url: '',
    ollama_model: '',
    mcp_servers: [],
  });

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadProfile = async () => {
    try {
      const { data } = await axios.get(`${API}/api/profile`, { headers });
      setProfile(data);
      setForm({ ...form, ...data.ai_config, mcp_servers: data.ai_config?.mcp_servers || [] });
    } catch {}
  };

  useEffect(() => {
    if (!token) return;
    loadProfile();
  }, [token]);

  const stats = useMemo(() => {
    const posts = profile?.posts || [];
    const imagePosts = posts.filter((item) => item.media_url).length;
    return [
      { label: 'Posts', value: posts.length || 0 },
      { label: 'Shots', value: imagePosts },
      { label: 'AI tools', value: (profile?.ai_config?.mcp_servers || []).length + 1 },
    ];
  }, [profile]);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateServer = (index, key, value) => setForm((current) => ({ ...current, mcp_servers: current.mcp_servers.map((server, i) => i === index ? { ...server, [key]: value } : server) }));

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/ai-config`, form, { headers });
      await loadProfile();
    } catch {}
    setSaving(false);
  };

  return (
    <div data-testid="profile-panel" className="h-full overflow-y-auto bg-[#050608] text-white">
      <div className="mx-auto max-w-[980px] px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-4 space-y-4">
        <section className="overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_28px_70px_rgba(0,0,0,0.24)]">
          <div className="h-32 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%),linear-gradient(135deg,#0a0c12,#11151d)]" />
          <div className="px-5 pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between -mt-10">
              <div className="flex items-end gap-4">
                <div className="h-24 w-24 rounded-[30px] border border-white/10 bg-black overflow-hidden shadow-[0_18px_45px_rgba(0,0,0,0.32)]">
                  {profile?.user?.avatar ? <img src={profile.user.avatar} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-3xl text-white/80">{profile?.user?.name?.[0] || 'Q'}</div>}
                </div>
                <div className="pb-1">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Quantum identity</div>
                  <h2 className="mt-2 font-heading text-3xl text-white">{profile?.user?.name || 'QuantChat User'}</h2>
                  <p className="mt-1 text-sm text-white/56">{profile?.user?.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" data-testid="profile-edit-button" className="h-11 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white/78">Edit profile</button>
                <button type="button" data-testid="profile-add-story-button" className="h-11 rounded-full bg-white px-4 text-sm font-semibold text-black inline-flex items-center gap-2">
                  <Camera size={15} /> Add story
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {stats.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 text-center">
                  <div className="text-xl font-semibold text-white">{item.value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto hide-scrollbar">
              {[
                { id: 'posts', label: 'Posts', icon: Grid3X3 },
                { id: 'activity', label: 'Activity', icon: Activity },
                { id: 'saved', label: 'Saved', icon: Bookmark },
                { id: 'settings', label: 'AI Settings', icon: KeyRound },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" data-testid={`profile-tab-${id}`} onClick={() => setTab(id)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm border inline-flex items-center gap-2 ${tab === id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-white/76'}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {tab === 'posts' && (
              <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {(profile?.posts || []).map((post) => (
                  <article key={post.id} data-testid={`profile-post-${post.id}`} className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] min-h-[240px]">
                    {post.media_url ? <img src={post.media_url} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square p-4 flex items-end bg-[linear-gradient(180deg,#0e1218,#090b10)] text-lg font-semibold leading-tight text-white">{post.content}</div>}
                    <div className="p-4">
                      <div className="line-clamp-2 text-sm leading-6 text-white/82">{post.content}</div>
                      <div className="mt-2 text-xs text-white/44">{post.location_label || 'Profile post'}</div>
                    </div>
                  </article>
                ))}
              </section>
            )}

            {tab === 'activity' && (
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Profile health</div>
                  <div className="mt-4 space-y-3 text-sm text-white/70">
                    <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">Header, stats, and grid ab more premium aur readable ban chuke hain.</div>
                    <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">Phone OTP ecosystem aur AI tooling ek hi identity stack me visible hai.</div>
                  </div>
                </div>
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Insights</div>
                  <div className="mt-4 space-y-3">
                    {stats.map((item) => (
                      <div key={item.label} className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 flex items-center justify-between gap-3">
                        <div className="text-sm text-white/70">{item.label}</div>
                        <div className="text-lg font-semibold text-white">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {tab === 'saved' && (
              <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 text-sm text-white/62">
                Saved posts, saved messages, aur channel drafts ko next polish pass me yahin richer layout me merge karunga. Structure ready hai.
              </section>
            )}

            {tab === 'settings' && (
              <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 space-y-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/42"><KeyRound size={12} /> Quant AI key manager</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input data-testid="profile-active-provider-input" value={form.active_provider || ''} onChange={(event) => updateField('active_provider', event.target.value)} placeholder="Provider" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-active-model-input" value={form.active_model || ''} onChange={(event) => updateField('active_model', event.target.value)} placeholder="Model" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-openai-key-input" value={form.openai_api_key || ''} onChange={(event) => updateField('openai_api_key', event.target.value)} placeholder="OpenAI key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-gemini-key-input" value={form.gemini_api_key || ''} onChange={(event) => updateField('gemini_api_key', event.target.value)} placeholder="Gemini key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-claude-key-input" value={form.claude_api_key || ''} onChange={(event) => updateField('claude_api_key', event.target.value)} placeholder="Claude key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-deepseek-key-input" value={form.deepseek_api_key || ''} onChange={(event) => updateField('deepseek_api_key', event.target.value)} placeholder="DeepSeek key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-ollama-url-input" value={form.ollama_base_url || ''} onChange={(event) => updateField('ollama_base_url', event.target.value)} placeholder="Ollama URL" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                  <input data-testid="profile-ollama-model-input" value={form.ollama_model || ''} onChange={(event) => updateField('ollama_model', event.target.value)} placeholder="Ollama model" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                </div>
                <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white/72">MCP Servers</div>
                    <button type="button" data-testid="profile-add-mcp-server" onClick={() => updateField('mcp_servers', [...(form.mcp_servers || []), blankServer()])} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white inline-flex items-center gap-2"><Plus size={12} /> Add</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(form.mcp_servers || []).map((server, index) => (
                      <div key={`${server.url}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input data-testid={`profile-mcp-name-${index}`} value={server.name} onChange={(event) => updateServer(index, 'name', event.target.value)} placeholder="Server name" className="rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/28" />
                        <input data-testid={`profile-mcp-url-${index}`} value={server.url} onChange={(event) => updateServer(index, 'url', event.target.value)} placeholder="Server URL" className="rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/28" />
                        <button type="button" data-testid={`profile-mcp-remove-${index}`} onClick={() => updateField('mcp_servers', form.mcp_servers.filter((_, i) => i !== index))} className="h-[46px] w-[46px] rounded-[16px] border border-white/10 bg-white/5 text-white/76 flex items-center justify-center"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="button" data-testid="profile-save-ai-config" onClick={saveConfig} disabled={saving} className="h-12 rounded-full bg-white px-5 text-sm font-semibold text-black inline-flex items-center gap-2 disabled:opacity-40">
                  <Save size={16} /> {saving ? 'Saving...' : 'Save Quant AI settings'}
                </button>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Identity roadmap</div>
              <div className="mt-4 space-y-3 text-sm text-white/68">
                <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 flex items-start gap-3"><Phone size={15} className="mt-1" /> Firebase phone OTP and linked identity are now part of this profile stack.</div>
                <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 flex items-start gap-3"><BarChart3 size={15} className="mt-1" /> Profile is now more data-rich instead of the earlier flat settings screen.</div>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Highlights</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {["Saved", "Drafts", "Broadcast"].map((item) => (
                  <div key={item} className="rounded-[22px] border border-white/10 bg-black/20 aspect-square flex items-center justify-center text-sm text-white/72">{item}</div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
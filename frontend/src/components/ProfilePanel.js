import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { KeyRound, Phone, Save, Plus, X } from 'lucide-react';
import { API } from '../lib/api';

function blankServer() {
  return { name: '', url: '', enabled: true };
}

export default function ProfilePanel({ token }) {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
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
    <div data-testid="profile-panel" className="flex flex-col h-full overflow-y-auto bg-[linear-gradient(180deg,#04070d,#090d17)]">
      <div className="px-4 py-5 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-[22px] overflow-hidden bg-white/6">
            {profile?.user?.avatar ? <img src={profile.user.avatar} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-white text-xl">{profile?.user?.name?.[0] || 'Q'}</div>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">Profile</p>
            <h2 className="text-2xl font-semibold text-white mt-1">{profile?.user?.name || 'QuantChat User'}</h2>
            <p className="text-sm text-white/56 mt-1">{profile?.user?.email}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/46"><Phone size={12} /> Auth roadmap</div>
          <p className="mt-3 text-sm text-white/74">Email/password live hai. Firebase phone OTP next phase ke liye planned hai, taaki number-based onboarding smooth ho.</p>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,18,29,0.98),rgba(18,25,41,0.96))] p-4 space-y-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/46"><KeyRound size={12} /> AI key manager</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input data-testid="profile-active-provider-input" value={form.active_provider || ''} onChange={(event) => updateField('active_provider', event.target.value)} placeholder="active provider: openai / gemini / claude" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-active-model-input" value={form.active_model || ''} onChange={(event) => updateField('active_model', event.target.value)} placeholder="active model" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-openai-key-input" value={form.openai_api_key || ''} onChange={(event) => updateField('openai_api_key', event.target.value)} placeholder="OpenAI key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-gemini-key-input" value={form.gemini_api_key || ''} onChange={(event) => updateField('gemini_api_key', event.target.value)} placeholder="Gemini key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-claude-key-input" value={form.claude_api_key || ''} onChange={(event) => updateField('claude_api_key', event.target.value)} placeholder="Claude key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-deepseek-key-input" value={form.deepseek_api_key || ''} onChange={(event) => updateField('deepseek_api_key', event.target.value)} placeholder="DeepSeek key" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-ollama-url-input" value={form.ollama_base_url || ''} onChange={(event) => updateField('ollama_base_url', event.target.value)} placeholder="Ollama base URL" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
            <input data-testid="profile-ollama-model-input" value={form.ollama_model || ''} onChange={(event) => updateField('ollama_model', event.target.value)} placeholder="Ollama model" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/72">MCP servers</div>
              <button type="button" data-testid="profile-add-mcp-server" onClick={() => updateField('mcp_servers', [...(form.mcp_servers || []), blankServer()])} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white inline-flex items-center gap-2"><Plus size={12} /> Add</button>
            </div>
            {(form.mcp_servers || []).map((server, index) => (
              <div key={`${server.url}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input data-testid={`profile-mcp-name-${index}`} value={server.name} onChange={(event) => updateServer(index, 'name', event.target.value)} placeholder="Server name" className="rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/28" />
                <input data-testid={`profile-mcp-url-${index}`} value={server.url} onChange={(event) => updateServer(index, 'url', event.target.value)} placeholder="Server URL" className="rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-white/28" />
                <button type="button" data-testid={`profile-mcp-remove-${index}`} onClick={() => updateField('mcp_servers', form.mcp_servers.filter((_, i) => i !== index))} className="h-[46px] w-[46px] rounded-[16px] border border-white/10 bg-white/5 text-white/76 flex items-center justify-center"><X size={16} /></button>
              </div>
            ))}
          </div>

          <button type="button" data-testid="profile-save-ai-config" onClick={saveConfig} disabled={saving} className="h-11 px-4 rounded-full bg-white text-black font-medium inline-flex items-center gap-2 disabled:opacity-40">
            <Save size={16} /> {saving ? 'Saving...' : 'Save AI settings'}
          </button>
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/46">Your public posts</p>
            <h3 className="text-lg font-semibold text-white mt-1">Profile feed</h3>
          </div>
          {(profile?.posts || []).map((post) => (
            <article key={post.id} data-testid={`profile-post-${post.id}`} className="rounded-[28px] border border-white/10 bg-white/[0.04] overflow-hidden">
              {post.media_url && <img src={post.media_url} alt="" className="w-full aspect-[4/3] object-cover" />}
              <div className="p-4">
                <div className="text-sm leading-6 text-white/82">{post.content}</div>
                <div className="mt-2 text-xs text-white/46">{post.location_label || 'Profile post'}</div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
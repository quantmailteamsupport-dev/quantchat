import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bot, BrainCircuit, MessageSquare, Send, Settings2, Sparkles } from 'lucide-react';
import { API } from '../lib/api';

const BOT_MODES = [
  { id: 'general', label: 'Copilot', icon: Bot },
  { id: 'reply_draft', label: 'Reply Bot', icon: MessageSquare },
  { id: 'story_lab', label: 'Story Bot', icon: Sparkles },
  { id: 'unread_digest', label: 'Digest', icon: BrainCircuit },
];

export default function AIHub({ token }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('general');
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadConfig = async () => {
    try {
      const { data } = await axios.get(`${API}/api/ai-config`, { headers });
      setConfig(data.config);
    } catch {
      setConfig(null);
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await axios.get(`${API}/api/assistant/history`, { headers });
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadConfig();
    loadHistory();
  }, [token]);

  const submitPrompt = async (promptText = input) => {
    if (!promptText.trim()) return;
    setSending(true);
    try {
      const { data } = await axios.post(`${API}/api/assistant/respond`, { prompt: promptText.trim(), mode }, { headers });
      setMessages(data.messages || []);
      setInput('');
    } catch {}
    setSending(false);
  };

  return (
    <div data-testid="ai-hub-panel" className="flex flex-col h-full overflow-y-auto bg-[linear-gradient(180deg,#04070d,#090d17)]">
      <div className="px-4 py-4 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">AI workspace</p>
            <h2 className="text-2xl font-semibold text-white mt-1">Bots & tools</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/62 inline-flex items-center gap-2">
            <Settings2 size={12} /> {config?.active_provider || 'openai'} / {config?.active_model || 'gpt-5.2'}
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
          {BOT_MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" data-testid={`ai-hub-mode-${id}`} onClick={() => setMode(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm border inline-flex items-center gap-2 ${mode === id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/76'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] space-y-4">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/46">Active provider</p>
            <p className="mt-2 text-lg font-semibold text-white">{config?.active_provider || 'openai'}</p>
            <p className="mt-2 text-sm text-white/58">Universal key live, custom keys manageable from Profile.</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/46">MCP servers</p>
            <div className="mt-2 text-sm text-white/74 space-y-1">
              {(config?.mcp_servers || []).length === 0 ? <div>No custom MCP servers added yet.</div> : config.mcp_servers.map((server) => <div key={server.url}>{server.name} • {server.enabled ? 'Live' : 'Off'}</div>)}
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,18,29,0.98),rgba(18,25,41,0.96))] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8 text-sm text-white/58">Run multi-bot style prompts from one workspace.</div>
          <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-white/58">Ask for reply drafts, inbox digests, story ideas, or group messaging strategy.</div>
            ) : messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[88%] rounded-[24px] px-4 py-3 ${message.role === 'assistant' ? 'border border-white/10 bg-white/[0.05] text-white' : 'bg-white text-black'}`}>
                  <div className="text-[11px] uppercase tracking-[0.18em] opacity-55">{message.role}</div>
                  <div data-testid={`ai-hub-message-${message.id}`} className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-white/8 bg-black/22">
            <div className="rounded-[28px] border border-white/10 bg-black/22 px-3 py-2 flex items-end gap-2">
              <textarea data-testid="ai-hub-input" value={input} onChange={(event) => setInput(event.target.value)} rows={1} placeholder="Ask Copilot, Reply Bot, Story Bot or Digest Bot" className="flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder:text-white/28 resize-none" />
              <button type="button" data-testid="ai-hub-send-button" onClick={() => submitPrompt()} disabled={!input.trim() || sending} className="h-11 w-11 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40">
                <Send size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
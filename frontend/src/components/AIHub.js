import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { API } from '../lib/api';
import { Bot, BrainCircuit, MessageSquare, Send, Sparkles, Minimize2, Maximize2, GripHorizontal, PanelRight, Wand2, ArrowRight, Workflow, ShieldCheck } from 'lucide-react';

const QUANT_AI_MODES = [
  { id: 'general', label: 'Core', icon: Bot },
  { id: 'reply_draft', label: 'Reply', icon: MessageSquare },
  { id: 'story_lab', label: 'Creative', icon: Wand2 },
  { id: 'unread_digest', label: 'Digest', icon: BrainCircuit },
];

export default function AIHub({ token }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('general');
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState(null);
  const [widgetPos, setWidgetPos] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const widgetRef = useRef(null);

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

  useEffect(() => {
    const move = (event) => {
      if (!dragging || minimized) return;
      setWidgetPos({ x: Math.max(8, event.clientX - dragOffsetRef.current.x), y: Math.max(8, event.clientY - dragOffsetRef.current.y) });
    };
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, minimized]);

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

  const quantStats = useMemo(() => [
    { label: 'Provider', value: config?.active_provider || 'openai' },
    { label: 'Model', value: config?.active_model || 'gpt-5.2' },
    { label: 'MCP', value: `${(config?.mcp_servers || []).length} live` },
  ], [config]);

  const suggestions = [
    'Draft a crisp product update for my team.',
    'Summarize my unread chats in priority order.',
    'Give me 3 captions for a futuristic feed post.',
    'Plan channel broadcast for tonight launch.',
  ];

  const startDrag = (event) => {
    if (!widgetRef.current || minimized) return;
    const rect = widgetRef.current.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDragging(true);
  };

  return (
    <div data-testid="ai-hub-panel" className="relative h-full overflow-hidden bg-[linear-gradient(180deg,#050608,#090b10)] text-white">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,transparent,rgba(0,0,0,0.35))]" />
      <div className="relative h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-4">
        <div className="mx-auto max-w-[980px] space-y-4">
          <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.24)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.26em] text-white/38">Quantum ecosystem</div>
                <h2 className="mt-2 font-heading text-3xl text-white">Quant AI</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">Movable, chat-aware, and cleaner. Ye ab ek scattered panel nahi, balki full Quant ecosystem workspace hai.</p>
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                {QUANT_AI_MODES.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" data-testid={`ai-hub-mode-${id}`} onClick={() => setMode(id)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm border inline-flex items-center gap-2 ${mode === id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-white/76'}`}>
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              {quantStats.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-white/10 bg-black/25 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/38">{item.label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4">
            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Live workspace</div>
                  <div className="mt-1 text-lg font-semibold text-white">Quant AI terminal</div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/58 inline-flex items-center gap-2">
                  <PanelRight size={12} /> draggable dock enabled
                </div>
              </div>

              <div className="p-5 space-y-4 max-h-[62vh] overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="rounded-[26px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/58">Ask Quant AI for reply drafts, story concepts, launch assistance, channel plans, or inbox digests.</div>
                ) : messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[90%] rounded-[26px] px-4 py-3 ${message.role === 'assistant' ? 'border border-white/10 bg-white/[0.05] text-white' : 'bg-white text-black'}`}>
                      <div className="text-[11px] uppercase tracking-[0.18em] opacity-50">{message.role === 'assistant' ? 'Quant AI' : 'You'}</div>
                      <div data-testid={`ai-hub-message-${message.id}`} className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/8 p-4 bg-black/18">
                <div className="rounded-[28px] border border-white/10 bg-black/30 px-3 py-2 flex items-end gap-2">
                  <textarea data-testid="ai-hub-input" value={input} onChange={(event) => setInput(event.target.value)} rows={1} placeholder="Ask Quant AI anything about chats, content, channels, or your ecosystem..." className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/28" />
                  <button type="button" data-testid="ai-hub-send-button" onClick={() => submitPrompt()} disabled={!input.trim() || sending} className="h-12 w-12 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Suggested prompts</div>
                <div className="mt-4 space-y-3">
                  {suggestions.map((item, index) => (
                    <button key={item} type="button" data-testid={`ai-hub-suggestion-${index}`} onClick={() => submitPrompt(item)} className="w-full rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 text-left text-sm leading-6 text-white/78 hover:bg-white/[0.06]">
                      {item}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Quant AI systems</div>
                <div className="mt-4 space-y-3 text-sm text-white/72">
                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 flex items-start gap-3"><Workflow size={16} className="mt-1" /> Channel broadcasts, reply generation, and story ideas now flow from one workspace.</div>
                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 flex items-start gap-3"><ShieldCheck size={16} className="mt-1" /> Custom keys and MCP servers remain connected from your profile settings.</div>
                  <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 flex items-start gap-3"><ArrowRight size={16} className="mt-1" /> Next pass me proactive Quant AI cards aur smart action chips aur deepen kiye ja sakte hain.</div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>

      <div
        ref={widgetRef}
        data-testid="quant-ai-draggable-widget"
        className={`absolute z-30 border border-white/10 bg-[rgba(7,8,12,0.92)] backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.38)] ${minimized ? 'rounded-full px-4 py-3' : 'w-[280px] rounded-[28px] p-4'}`}
        style={{ right: 16 + widgetPos.x, bottom: 20 + widgetPos.y }}
      >
        <div className="flex items-center justify-between gap-3">
          <button type="button" data-testid="quant-ai-widget-drag-handle" onPointerDown={startDrag} className="inline-flex items-center gap-2 text-sm text-white/74">
            <GripHorizontal size={14} /> Quant AI dock
          </button>
          <button type="button" data-testid="quant-ai-widget-toggle" onClick={() => setMinimized((value) => !value)} className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white flex items-center justify-center">
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
        </div>
        {!minimized && (
          <div className="mt-4 space-y-3">
            <div className="rounded-[22px] border border-white/10 bg-black/24 px-4 py-4 text-sm text-white/72">Move this dock anywhere. Quant AI now feels like an actual ecosystem tool, not a broken floating sheet.</div>
            <button type="button" data-testid="quant-ai-widget-action" onClick={() => submitPrompt('Give me a quick Quant AI digest for my social workspace')} className="w-full rounded-full bg-white text-black h-11 font-semibold inline-flex items-center justify-center gap-2">
              <Sparkles size={14} /> Run quick digest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
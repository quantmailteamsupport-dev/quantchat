import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Bot, Sparkles, X, Send, Loader2, Wand2, MessageSquare, BrainCircuit, Lightbulb } from 'lucide-react';
import { API } from '../lib/api';

const MODE_OPTIONS = [
  { id: 'general', label: 'Copilot', icon: Bot },
  { id: 'unread_digest', label: 'Digest', icon: BrainCircuit },
  { id: 'reply_draft', label: 'Reply', icon: MessageSquare },
  { id: 'story_lab', label: 'Story', icon: Wand2 },
];

function buildActionPrompts({ activeConversation, unreadCount }) {
  if (activeConversation) {
    return [
      'Summarize this chat in 3 bullets.',
      'Draft a confident but warm reply for this conversation.',
      'What should I say next to keep this chat moving?',
    ];
  }

  return [
    unreadCount > 0 ? `Give me a priority digest for my ${unreadCount} unread messages.` : 'Summarize my inbox status.',
    'Suggest a strong story update I can post today.',
    'What micro-improvements would make this app feel faster to use?',
  ];
}

export default function AIAssistant({ token, activeConversation, activeSection, conversations }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('general');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);

  const unreadCount = useMemo(
    () => conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
    [conversations]
  );

  const actionPrompts = useMemo(
    () => buildActionPrompts({ activeConversation, unreadCount }),
    [activeConversation, unreadCount]
  );

  const conversationId = activeConversation?.id || null;

  const loadHistory = async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const query = conversationId ? `?conversation_id=${conversationId}` : '';
      const { data } = await axios.get(`${API}/api/assistant/history${query}`, { headers });
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, conversationId]);

  const submitPrompt = async (promptText = input, nextMode = mode) => {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt || !token) return;
    setSending(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const { data } = await axios.post(
        `${API}/api/assistant/respond`,
        { prompt: cleanPrompt, mode: nextMode, conversation_id: conversationId },
        { headers }
      );
      setMessages(data.messages || []);
      setInput('');
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: 'Assistant abhi response nahi de paaya. Thodi der me dobara try karo.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="ai-fab-btn"
        onClick={() => setOpen(true)}
        className="absolute right-4 bottom-[calc(var(--mobile-nav-height)+1.15rem)] md:bottom-5 z-40 h-14 w-14 rounded-full border border-white/12 bg-[radial-gradient(circle_at_30%_30%,rgba(157,76,221,0.4),rgba(0,229,255,0.18)_45%,rgba(10,10,16,0.92)_70%)] shadow-[0_16px_45px_rgba(0,0,0,0.45)] backdrop-blur-2xl flex items-center justify-center text-white assistant-orb"
      >
        <Bot size={22} strokeWidth={1.6} />
        {unreadCount > 0 && (
          <span data-testid="ai-fab-unread-count" className="absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center px-1.5">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end justify-center" onClick={() => setOpen(false)}>
          <div
            data-testid="ai-assistant-panel"
            className="w-full md:max-w-[440px] max-h-[92dvh] rounded-t-[34px] md:rounded-[34px] border border-white/10 bg-[rgba(10,10,15,0.94)] shadow-[0_-12px_42px_rgba(157,76,221,0.15)] flex flex-col overflow-hidden animate-sheetRise"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/55">
                    <Sparkles size={12} />
                    AI assistant
                  </div>
                  <h3 data-testid="ai-assistant-title" className="mt-3 text-2xl font-semibold text-white">QuantChat Copilot</h3>
                  <p data-testid="ai-assistant-context" className="mt-2 text-sm leading-6 text-white/62">
                    {activeConversation
                      ? `Active in ${activeConversation.name || activeConversation.other_user?.name || 'this chat'}`
                      : `Helping with your ${activeSection} lane and inbox flow.`}
                  </p>
                </div>
                <button type="button" data-testid="ai-assistant-close" onClick={() => setOpen(false)} className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-white/75 hover:bg-white/10 flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
                {MODE_OPTIONS.map(({ id, label, icon: Icon }) => {
                  const isActive = mode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`ai-mode-${id}`}
                      onClick={() => setMode(id)}
                      className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors ${
                        isActive ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/78 hover:bg-white/10'
                      }`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-[26px] border border-white/8 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/42">
                  <Lightbulb size={12} />
                  Quick actions
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
                  {actionPrompts.map((prompt, index) => (
                    <button
                      key={`${prompt}-${index}`}
                      type="button"
                      data-testid={`ai-quick-action-${index}`}
                      onClick={() => submitPrompt(prompt, mode)}
                      className="shrink-0 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/82 hover:bg-white/10"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8 text-white/55">
                  <Loader2 className="animate-spin" size={18} />
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/58">
                  Ask for an unread digest, draft a reply, or get story ideas. Copilot will keep suggestions concise and never auto-send anything.
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[88%] rounded-[24px] px-4 py-3 ${message.role === 'assistant' ? 'border border-white/10 bg-white/[0.05] text-white' : 'bg-white text-black'}`}>
                      <div className="text-[11px] uppercase tracking-[0.2em] opacity-50">{message.role}</div>
                      <div data-testid={`ai-message-${message.id}`} className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-white/8 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[rgba(7,7,12,0.92)]">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-2 flex items-end gap-2">
                <textarea
                  data-testid="ai-assistant-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={1}
                  placeholder={activeConversation ? 'Ask for a reply draft or summary' : 'Ask for inbox digest or story ideas'}
                  className="min-h-[48px] max-h-[120px] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/28"
                />
                <button
                  type="button"
                  data-testid="ai-assistant-send"
                  onClick={() => submitPrompt()}
                  disabled={!input.trim() || sending}
                  className="h-11 w-11 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40"
                >
                  {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
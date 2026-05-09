import React, { useState, useRef, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Send, ArrowLeft, User, Check, CheckCheck, MoreVertical, Smile, Trash2, Forward, CornerUpRight, X } from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

function formatMsgTime(time) {
  try {
    const d = new Date(time);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday ' + format(d, 'HH:mm');
    return format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

function MessageBubble({ msg, isMine, userId, onReact, onDelete, onForward, onReply, onPin, participants }) {
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const reactions = msg.reactions || {};
  const reactionList = Object.entries(reactions);
  const senderName = !isMine ? (participants?.find(p => p.user_id === msg.sender_id)?.name || '') : '';

  return (
    <div data-testid={`message-${msg.id}`}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fadeIn group relative`}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => { setShowActions(false); setShowEmoji(false); }}
      onTouchStart={() => setShowActions(true)}>

      {showActions && (
        <div className={`absolute -top-7 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1 z-10 bg-qc-elevated border border-qc-border p-1 rounded-md shadow-lg`}>
          <button onClick={() => setShowEmoji(!showEmoji)} className="w-6 h-6 flex items-center justify-center text-qc-text-secondary hover:text-white"><Smile size={13}/></button>
          <button onClick={() => onReply(msg)} className="w-6 h-6 flex items-center justify-center text-qc-text-secondary hover:text-white" title="Reply"><CornerUpRight size={13}/></button>
          <button onClick={() => onPin(msg.id)} className="w-6 h-6 flex items-center justify-center text-qc-text-secondary hover:text-white" title="Pin"><Check size={13}/></button>
          {isMine && <button onClick={() => onDelete(msg.id)} className="w-6 h-6 flex items-center justify-center text-qc-text-secondary hover:text-qc-error"><Trash2 size={13}/></button>}
          <button onClick={() => onForward(msg.id)} className="w-6 h-6 flex items-center justify-center text-qc-text-secondary hover:text-white"><Forward size={13}/></button>
        </div>
      )}
      
      {showEmoji && (
        <div className={`absolute -top-14 ${isMine ? 'right-0' : 'left-0'} bg-qc-elevated border border-qc-border p-1 flex gap-1 z-20 rounded-sm`}>
          {EMOJIS.map(e => <button key={e} onClick={() => { onReact(msg.id, e); setShowEmoji(false); setShowActions(false); }} className="w-8 h-8 flex items-center justify-center hover:bg-qc-highlight text-base">{e}</button>)}
        </div>
      )}}

      <div className={`max-w-[80%] sm:max-w-[70%] px-3 py-2 ${isMine ? 'bg-qc-accent text-white rounded-md rounded-br-none' : 'bg-qc-elevated text-white border border-qc-border rounded-md rounded-bl-none'}`}>
        {msg.reply_to_content && (
          <div className="mb-2 p-2 bg-black/20 border-l-2 border-white/50 rounded-sm text-xs opacity-80 line-clamp-2">
            {msg.reply_to_content}
          </div>
        )}
        {senderName && <p className="text-[10px] font-mono text-qc-accent mb-0.5">{senderName}</p>}
        {msg.forwarded && <p className="text-[10px] italic text-white/50 mb-0.5 flex items-center gap-1"><CornerUpRight size={9}/>Forwarded</p>}
        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
        {reactionList.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {reactionList.map(([uid, emoji]) => <span key={uid} className="text-xs bg-black/20 px-1 rounded">{emoji}</span>)}
          </div>
        )}
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className="font-mono text-[9px] opacity-60">{formatMsgTime(msg.created_at)}</span>
          {isMine && (msg.status === 'read' ? <CheckCheck size={12} className="text-white opacity-80"/> : <Check size={12} className="opacity-50"/>)}
        </div>
      </div>
    </div>
  );
}

function getConvInfo(conv, userId) {
  if (conv.type === 'group') return { name: conv.name, avatar: conv.avatar, isGroup: true };
  const other = conv.other_user || conv.participants?.find(p => p.user_id !== userId);
  return { name: other?.name || 'Unknown', avatar: other?.avatar || '', user_id: other?.user_id, isGroup: false };
}

export default function ChatView({ conversation, messages, onSend, userId, onlineUsers, typingUsers, emitTyping, onBack, conversations, token, onReloadMessages, isMobile, onPinMessage, onUnpinMessage }) {
  const [input, setInput] = useState('');
  const [forwardMsgId, setForwardMsgId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const info = getConvInfo(conversation, userId);
  const isOnline = info.user_id ? onlineUsers.has(info.user_id) : false;
  const isTyping = typingUsers[conversation.id] && typingUsers[conversation.id] !== userId;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim(), 'text', replyingTo?.id);
    setReplyingTo(null);
    setInput('');
    emitTyping(conversation.id, false);
  };
  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping(conversation.id, true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emitTyping(conversation.id, false), 2000);
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } };

  const handleReact = async (msgId, emoji) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/messages/${msgId}/react`, { emoji }, { headers });
      if (onReloadMessages) onReloadMessages(conversation.id);
    } catch {}
  };
  const handleDelete = async (msgId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${API}/api/messages/${msgId}`, { headers });
      if (onReloadMessages) onReloadMessages(conversation.id);
    } catch {}
  };
  const handleForward = async (targetConvId) => {
    if (!forwardMsgId) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/messages/${forwardMsgId}/forward`, { conversation_id: targetConvId }, { headers });
      setForwardMsgId(null);
    } catch {}
  };

  const memberCount = conversation.participants?.length || 0;
  const onlineCount = conversation.participants?.filter(p => onlineUsers.has(p.user_id)).length || 0;

  return (
    <div data-testid="chat-view" className="flex flex-col h-full w-full">
      {/* Forward Modal */}
      {forwardMsgId && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center" onClick={() => setForwardMsgId(null)}>
          <div className="bg-qc-surface border border-qc-border w-full sm:w-80 max-h-[70vh] flex flex-col rounded-t-lg sm:rounded-lg" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-qc-border flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-medium text-white">Forward to...</span>
              <button onClick={() => setForwardMsgId(null)} className="text-qc-text-secondary hover:text-white"><X size={16}/></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(conversations || []).filter(c => c.id !== conversation.id).map(c => {
                const ci = getConvInfo(c, userId);
                return (
                  <button key={c.id} data-testid={`forward-to-${c.id}`} onClick={() => handleForward(c.id)}
                    className="w-full flex items-center gap-2 px-3 py-3 hover:bg-qc-elevated border-b border-qc-border text-left">
                    <div className="w-9 h-9 rounded-md bg-qc-highlight flex items-center justify-center overflow-hidden flex-shrink-0">
                      {ci.avatar ? <img src={ci.avatar} alt="" className="w-full h-full object-cover"/> : <User size={14} className="text-qc-text-secondary"/>}
                    </div>
                    <span className="text-sm text-white truncate">{ci.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div data-testid="chat-header" className="h-14 px-3 border-b border-qc-border flex items-center gap-2.5 bg-qc-surface flex-shrink-0">
        <button data-testid="chat-back-btn" onClick={onBack}
          className="w-9 h-9 flex items-center justify-center text-qc-text-secondary hover:text-white hover:bg-qc-elevated rounded-sm flex-shrink-0">
          <ArrowLeft size={20}/>
        </button>
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center">
            {info.avatar ? <img src={info.avatar} alt={info.name} className="w-full h-full object-cover"/> : <User size={16} className="text-qc-text-secondary"/>}
          </div>
      {conversation.pinned_message && (
        <div className="bg-qc-elevated border-b border-qc-border px-3 py-2 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Check size={16} className="text-qc-accent flex-shrink-0"/>
            <div className="min-w-0">
              <p className="text-[10px] text-qc-accent font-mono uppercase tracking-wider">Pinned Message</p>
              <p className="text-xs text-white truncate max-w-sm">{conversation.pinned_message.content}</p>
            </div>
          </div>
          <button onClick={() => onUnpinMessage(conversation.id)} className="text-qc-text-secondary hover:text-white ml-2 flex-shrink-0"><X size={14}/></button>
        </div>
      )}
          {isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-qc-success border-2 border-qc-surface rounded-full"/>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 data-testid="chat-recipient-name" className="text-sm font-medium text-white truncate">{info.name}</h3>
          {isTyping ? <p className="text-[11px] text-qc-accent font-mono animate-pulse-dot">typing...</p>
            : info.isGroup ? <p className="text-[11px] text-qc-text-tertiary font-mono">{memberCount} members, {onlineCount} online</p>
            : <p className="text-[11px] text-qc-text-tertiary font-mono">{isOnline ? 'online' : 'offline'}</p>}
        </div>
        <button data-testid="chat-more-btn" className="w-9 h-9 flex items-center justify-center text-qc-text-secondary hover:text-white hover:bg-qc-elevated rounded-sm flex-shrink-0">
          <MoreVertical size={18}/>
        </button>
      </div>

      {/* Messages */}
      <div data-testid="messages-container" className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-qc-text-tertiary text-sm">No messages yet</p>
            <p className="text-qc-text-tertiary text-xs mt-1 font-mono">Send the first message</p>
          </div>
        ) : messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isMine={msg.sender_id === userId} userId={userId}
            onReact={handleReact} onDelete={handleDelete} onForward={setForwardMsgId} onReply={setReplyingTo} onPin={(msgId) => onPinMessage(conversation.id, msgId)}
            participants={conversation.participants} />
        ))}
        <div ref={messagesEndRef}/>
      </div>

      {/* Input */}
      {replyingTo && (
        <div className="px-3 py-2 bg-qc-elevated border-t border-qc-border flex items-center justify-between flex-shrink-0">
          <div className="border-l-2 border-qc-accent pl-2 min-w-0">
            <p className="text-[10px] text-qc-accent font-mono">Replying to message</p>
            <p className="text-xs text-white truncate max-w-sm opacity-80">{replyingTo.content}</p>
          </div>
          <button onClick={() => setReplyingTo(null)} className="text-qc-text-secondary hover:text-white"><X size={16}/></button>
        </div>
      )}
      {conversation.is_channel && (!conversation.admins || !conversation.admins.includes(userId)) ? (
        <div className="p-3 text-center bg-qc-surface border-t border-qc-border text-qc-text-secondary text-sm font-mono flex-shrink-0 safe-bottom">
          Only admins can send messages
        </div>
      ) : (
        <form data-testid="message-form" onSubmit={handleSend}
        className="border-t border-qc-border bg-qc-surface px-3 py-2.5 flex items-center gap-2 flex-shrink-0 safe-bottom">
        <input data-testid="message-input" type="text" value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
          placeholder="Type a message..." className="flex-1 bg-qc-elevated border border-qc-border text-white text-sm px-3 py-2.5 rounded-sm placeholder:text-qc-text-tertiary outline-none focus:border-qc-accent transition-colors"/>
        <button data-testid="send-message-btn" type="submit" disabled={!input.trim()}
          className="w-10 h-10 flex items-center justify-center bg-qc-accent hover:bg-qc-accent-hover text-white rounded-sm transition-colors duration-150 disabled:opacity-30 flex-shrink-0">
          <Send size={16}/>
        </button>
      </form>
      )}
    </div>
  );
}

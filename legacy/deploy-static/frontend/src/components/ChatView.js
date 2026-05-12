import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { Send, ArrowLeft, User, Check, CheckCheck, MoreVertical } from 'lucide-react';

function formatMsgTime(time) {
  try {
    const d = new Date(time);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday ' + format(d, 'HH:mm');
    return format(d, 'dd/MM HH:mm');
  } catch {
    return '';
  }
}

function MessageBubble({ msg, isMine }) {
  return (
    <div
      data-testid={`message-${msg.id}`}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fadeIn`}
    >
      <div className={`max-w-[70%] px-3 py-2 ${
        isMine
          ? 'bg-qc-accent text-white rounded-md rounded-br-none'
          : 'bg-qc-elevated text-white border border-qc-border rounded-md rounded-bl-none'
      }`}>
        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
          <span className="font-mono text-[9px] opacity-60">{formatMsgTime(msg.created_at)}</span>
          {isMine && (
            msg.status === 'read'
              ? <CheckCheck size={12} className="text-white opacity-80" />
              : <Check size={12} className="opacity-50" />
          )}
        </div>
      </div>
    </div>
  );
}

function getConvInfo(conv, userId) {
  if (conv.type === 'group') {
    return { name: conv.name, avatar: conv.avatar };
  }
  const other = conv.other_user || conv.participants?.find(p => p.user_id !== userId);
  return { name: other?.name || 'Unknown', avatar: other?.avatar || '', user_id: other?.user_id };
}

export default function ChatView({ conversation, messages, onSend, userId, onlineUsers, typingUsers, emitTyping, onBack }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const info = getConvInfo(conversation, userId);
  const isOnline = info.user_id ? onlineUsers.has(info.user_id) : false;
  const isTyping = typingUsers[conversation.id] && typingUsers[conversation.id] !== userId;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
    emitTyping(conversation.id, false);
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping(conversation.id, true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      emitTyping(conversation.id, false);
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  return (
    <div data-testid="chat-view" className="flex flex-col h-full">
      {/* Header */}
      <div data-testid="chat-header" className="h-14 px-4 border-b border-qc-border flex items-center gap-3 bg-qc-surface flex-shrink-0">
        <button
          data-testid="chat-back-btn"
          onClick={onBack}
          className="sm:hidden text-qc-text-secondary hover:text-white mr-1"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="relative">
          <div className="w-9 h-9 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center">
            {info.avatar ? (
              <img src={info.avatar} alt={info.name} className="w-full h-full object-cover" />
            ) : (
              <User size={16} className="text-qc-text-secondary" />
            )}
          </div>
          {isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-qc-success border-2 border-qc-surface rounded-full" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 data-testid="chat-recipient-name" className="text-sm font-medium text-white truncate">{info.name}</h3>
          {isTyping ? (
            <p className="text-[11px] text-qc-accent font-mono animate-pulse-dot">typing...</p>
          ) : (
            <p className="text-[11px] text-qc-text-tertiary font-mono">
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </p>
          )}
        </div>

        <button data-testid="chat-more-btn" className="text-qc-text-secondary hover:text-white transition-colors duration-150">
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Messages */}
      <div data-testid="messages-container" className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-qc-text-tertiary text-sm">No messages yet</p>
            <p className="text-qc-text-tertiary text-xs mt-1 font-mono">Send the first message</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} isMine={msg.sender_id === userId} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        data-testid="message-form"
        onSubmit={handleSend}
        className="border-t border-qc-border bg-qc-surface px-4 py-3 flex items-center gap-3"
      >
        <input
          data-testid="message-input"
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-transparent text-white text-sm placeholder:text-qc-text-tertiary outline-none"
        />
        <button
          data-testid="send-message-btn"
          type="submit"
          disabled={!input.trim()}
          className="w-8 h-8 flex items-center justify-center bg-qc-accent hover:bg-qc-accent-hover text-white transition-colors duration-150 disabled:opacity-30 disabled:hover:bg-qc-accent"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

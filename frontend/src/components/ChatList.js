import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { User, MessageSquare } from 'lucide-react';

function getDisplayInfo(conv, userId) {
  if (conv.type === 'group') {
    return { name: conv.name || 'Group', avatar: conv.avatar };
  }
  const other = conv.other_user || conv.participants?.find(p => p.user_id !== userId);
  return {
    name: other?.name || 'Unknown',
    avatar: other?.avatar || '',
    user_id: other?.user_id,
  };
}

function TimeStamp({ time }) {
  if (!time || time === 'None' || time === '') return null;
  try {
    return (
      <span className="font-mono text-xs text-qc-text-secondary font-bold uppercase tracking-wider">
        {formatDistanceToNow(new Date(time), { addSuffix: false })}
      </span>
    );
  } catch {
    return null;
  }
}

export default function ChatList({ conversations, activeConv, onSelect, onlineUsers, typingUsers, userId }) {
  return (
    <div data-testid="chat-list" className="flex flex-col h-full bg-qc-surface">
      <div className="p-5 border-b-2 border-qc-border flex items-center justify-between bg-qc-accent-primary">
        <h2 data-testid="chat-list-title" className="font-heading font-black text-2xl text-qc-text-primary uppercase tracking-tighter">Messages</h2>
        <span className="font-mono text-xs text-qc-text-primary font-bold border-2 border-qc-border bg-qc-surface px-2 py-1 shadow-[2px_2px_0px_#0A0A0A]">
          {conversations.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 border-2 border-qc-border flex items-center justify-center bg-qc-accent-secondary mb-4 shadow-brutal">
              <MessageSquare size={32} className="text-qc-text-primary" />
            </div>
            <p className="text-qc-text-primary font-bold uppercase tracking-widest text-sm mb-2">No Comm Links</p>
            <p className="text-qc-text-secondary font-mono text-xs uppercase">Search directory to establish connection</p>
          </div>
        ) : (
          conversations.map(conv => {
            const info = getDisplayInfo(conv, userId);
            const isActive = activeConv?.id === conv.id;
            const isOnline = info.user_id ? onlineUsers.has(info.user_id) : false;
            const isTyping = typingUsers[conv.id] && typingUsers[conv.id] !== userId;

            return (
              <button
                key={conv.id}
                data-testid={`chat-list-item-${conv.id}`}
                onClick={() => onSelect(conv)}
                className={`w-full flex items-center gap-4 p-4 border-b-2 border-qc-border transition-all text-left ${
                  isActive ? 'bg-qc-accent-secondary shadow-[inset_4px_0px_0px_#0A0A0A]' : 'hover:bg-qc-bg'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className={`w-12 h-12 border-2 border-qc-border bg-qc-accent-tertiary flex items-center justify-center overflow-hidden ${
                    conv.unread_count > 0 ? 'shadow-[2px_2px_0px_#0A0A0A]' : ''
                  }`}>
                    {info.avatar ? (
                      <img src={info.avatar} alt={info.name} className="w-full h-full object-cover grayscale contrast-125" />
                    ) : (
                      <User size={24} className="text-qc-text-primary" />
                    )}
                  </div>
                  {isOnline && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#00FF66] border-2 border-qc-border shadow-[1px_1px_0px_#0A0A0A]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-qc-text-primary uppercase tracking-wider truncate pr-2">{info.name}</span>
                    <TimeStamp time={conv.last_message_time} />
                  </div>
                  <div className="flex items-center justify-between">
                    {isTyping ? (
                      <span className="text-xs text-qc-text-primary bg-qc-accent-primary border-2 border-qc-border px-1 font-mono font-bold animate-pulse">TYPING...</span>
                    ) : (
                      <span className={`text-xs font-mono truncate max-w-[160px] ${conv.unread_count > 0 ? 'text-qc-text-primary font-bold' : 'text-qc-text-secondary'}`}>
                        {conv.last_message || 'NO DATA'}
                      </span>
                    )}
                    {conv.unread_count > 0 && (
                      <span data-testid={`unread-badge-${conv.id}`} className="bg-[#FF3333] border-2 border-qc-border text-white text-xs font-mono font-black w-6 h-6 flex items-center justify-center shadow-[1px_1px_0px_#0A0A0A]">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

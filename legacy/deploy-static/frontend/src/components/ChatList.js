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
      <span className="font-mono text-[10px] text-qc-text-tertiary tracking-wider">
        {formatDistanceToNow(new Date(time), { addSuffix: false })}
      </span>
    );
  } catch {
    return null;
  }
}

export default function ChatList({ conversations, activeConv, onSelect, onlineUsers, typingUsers, userId }) {
  return (
    <div data-testid="chat-list" className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-qc-border flex items-center justify-between">
        <h2 data-testid="chat-list-title" className="font-heading font-bold text-lg text-white">Messages</h2>
        <span className="font-mono text-[10px] text-qc-text-tertiary tracking-widest uppercase">
          {conversations.length} active
        </span>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare size={32} className="text-qc-text-tertiary mb-3" />
            <p className="text-qc-text-secondary text-sm">No conversations yet</p>
            <p className="text-qc-text-tertiary text-xs mt-1">Search for users to start chatting</p>
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
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-qc-border transition-colors duration-150 text-left ${
                  isActive ? 'bg-qc-elevated' : 'hover:bg-qc-elevated/50'
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center ${
                    conv.unread_count > 0 ? 'ring-2 ring-qc-accent ring-offset-2 ring-offset-qc-surface' : ''
                  }`}>
                    {info.avatar ? (
                      <img src={info.avatar} alt={info.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={18} className="text-qc-text-secondary" />
                    )}
                  </div>
                  {isOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-qc-success border-2 border-qc-surface rounded-full" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white truncate">{info.name}</span>
                    <TimeStamp time={conv.last_message_time} />
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    {isTyping ? (
                      <span className="text-xs text-qc-accent font-mono animate-pulse-dot">typing...</span>
                    ) : (
                      <span className="text-xs text-qc-text-secondary truncate max-w-[160px]">
                        {conv.last_message || 'No messages yet'}
                      </span>
                    )}
                    {conv.unread_count > 0 && (
                      <span data-testid={`unread-badge-${conv.id}`} className="bg-qc-accent text-white text-[10px] font-mono font-bold min-w-[18px] h-[18px] flex items-center justify-center px-1">
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

      {/* Mobile nav */}
      <div className="sm:hidden flex border-t border-qc-border">
        <button className="flex-1 py-3 flex items-center justify-center text-qc-accent">
          <MessageSquare size={20} />
        </button>
      </div>
    </div>
  );
}

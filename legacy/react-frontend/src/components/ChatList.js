import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Users, Pin, Flame } from 'lucide-react';

const AVATAR_GRADIENTS = [
  'from-[#4f8cff] to-[#7c3aed]',
  'from-[#ff6fb5] to-[#9d4cdd]',
  'from-[#00e5ff] to-[#4f8cff]',
  'from-[#ffe56a] to-[#ff9d4f]',
  'from-[#4ade80] to-[#06b6d4]',
  'from-[#f472b6] to-[#fb923c]',
];

function getAvatarGradient(name) {
  const idx = (name || '').charCodeAt(0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx] || AVATAR_GRADIENTS[0];
}

function getInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function getDisplayInfo(conv, userId) {
  if (conv.type === 'group') {
    return { name: conv.name || 'Group', avatar: conv.avatar, isGroup: true };
  }
  const other = conv.other_user || conv.participants?.find(p => p.user_id !== userId);
  return { name: other?.name || 'Unknown', avatar: other?.avatar || '', user_id: other?.user_id, isGroup: false };
}

function formatSnippet(lastMessage) {
  if (!lastMessage) return '';
  if (typeof lastMessage === 'string' && lastMessage.startsWith('data:image')) return 'Photo';
  if (typeof lastMessage === 'string' && lastMessage.startsWith('data:audio')) return 'Voice note';
  try {
    const p = JSON.parse(lastMessage);
    if (p && p.name) return 'File: ' + p.name;
  } catch {}
  return lastMessage;
}

function formatTime(time) {
  if (!time || time === 'None') return '';
  try {
    const d = new Date(time);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yday';
    return format(d, 'dd/MM');
  } catch { return ''; }
}

function AvatarBubble({ info, size }) {
  const s = size || 46;
  const grad = getAvatarGradient(info.name);
  if (info.avatar) {
    return (
      <img
        src={info.avatar}
        alt={info.name}
        style={{ width: s, height: s }}
        className="rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: s, height: s }}
      className={'rounded-full bg-gradient-to-br ' + grad + ' flex items-center justify-center flex-shrink-0'}
    >
      {info.isGroup
        ? <Users size={Math.round(s * 0.42)} className="text-white" />
        : <span className="text-white font-bold" style={{ fontSize: Math.round(s * 0.36) }}>{getInitials(info.name)}</span>
      }
    </div>
  );
}

export default function ChatList({ conversations, activeConv, onSelect, onlineUsers, typingUsers, userId }) {
  return (
    <div data-testid="chat-list" className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#4f8cff]/20 to-[#9d4cdd]/20 border border-white/8 flex items-center justify-center mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm font-semibold text-white/60 mb-1">No conversations yet</p>
            <p className="text-xs text-white/32">Start a new chat to connect</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const info = getDisplayInfo(conv, userId);
            const isActive = activeConv && activeConv.id === conv.id;
            const isOnline = info.user_id ? (onlineUsers && onlineUsers.has(info.user_id)) : false;
            const isTyping = typingUsers && typingUsers[conv.id] && typingUsers[conv.id] !== userId;
            const unread = conv.unread_count || 0;
            const snippet = formatSnippet(conv.last_message);
            const timeStr = formatTime(conv.last_message_time);
            const isPinned = conv.is_starred;
            const hasStreak = conv.streak_count > 0;

            return (
              <button
                key={conv.id}
                data-testid={'chat-list-item-' + conv.id}
                onClick={() => onSelect(conv)}
                className={'w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 text-left relative mx-1 rounded-2xl mb-0.5 ' + (isActive ? 'bg-white/8' : 'hover:bg-white/5')}
              >
                <div className="relative flex-shrink-0">
                  <div className={isActive ? 'rounded-full ring-2 ring-[#4f8cff]/60' : 'rounded-full'}>
                    <AvatarBubble info={info} size={46} />
                  </div>
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22c55e] border-2 border-[#0a0c14] shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isPinned && <Pin size={11} className="text-[#ffe56a] flex-shrink-0" />}
                      {hasStreak && <Flame size={11} className="text-orange-400 flex-shrink-0" />}
                      <span className={(unread > 0 ? 'font-semibold text-white' : 'font-medium text-white/88') + ' text-sm truncate'}>
                        {info.name}
                      </span>
                    </div>
                    <span className={'text-[11px] flex-shrink-0 ' + (unread > 0 ? 'text-[#4f8cff]' : 'text-white/38')}>
                      {timeStr}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      {isTyping ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[#4f8cff]">typing</span>
                          <span className="flex gap-0.5">
                            {[0,1,2].map(i => (
                              <span key={i} className="w-1 h-1 rounded-full bg-[#4f8cff] animate-bounce" style={{ animationDelay: (i * 0.15) + 's' }} />
                            ))}
                          </span>
                        </div>
                      ) : (
                        <span className={'text-xs truncate ' + (unread > 0 ? 'text-white/70' : 'text-white/40')}>
                          {snippet || 'Tap to open chat'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {hasStreak && (
                        <span className="text-[10px] text-orange-400 font-semibold">{conv.streak_count}🔥</span>
                      )}
                      {unread > 0 && (
                        <span
                          data-testid={'unread-badge-' + conv.id}
                          className="min-w-[18px] h-[18px] rounded-full bg-[#4f8cff] text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-[0_2px_8px_rgba(79,140,255,0.45)]"
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
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

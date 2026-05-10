import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../App';
import axios from 'axios';
import { io } from 'socket.io-client';
import LeftPanel from './LeftPanel';
import ChatArea from './ChatView';
import StoriesPanel from './Stories';
import ReelsPanel from './Reels';
import GroupsPanel from './Groups';
import SettingsPanel from './Settings';
import { MessageSquare, CircleDashed, Clapperboard, Users, Settings as SettingsIcon } from 'lucide-react';
import { API } from '../lib/api';

const MOBILE_NAV_ITEMS = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'stories', label: 'Stories', icon: CircleDashed },
  { id: 'reels', label: 'Spotlight', icon: Clapperboard },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'settings', label: 'You', icon: SettingsIcon },
];

export default function ChatApp() {
  const { user, token, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [activeSection, setActiveSection] = useState('chats');
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const [isMobileView, setIsMobileView] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [appHeight, setAppHeight] = useState('100dvh');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const socketRef = useRef(null);
  const baseViewportHeightRef = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations`, { headers });
      setConversations(data.conversations);
      setActiveConv(currentActive => {
        if (!currentActive) return currentActive;
        return data.conversations.find(conv => conv.id === currentActive.id) || currentActive;
      });
    } catch {}
  }, [token]);

  const loadMessages = useCallback(async (convId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations/${convId}/messages`, { headers });
      setMessages(data.messages);
      if (socketRef.current) socketRef.current.emit('mark_read', { conversation_id: convId });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    } catch {}
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const isEditableTarget = () => {
      const active = document.activeElement;
      if (!active) return false;
      return (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.getAttribute('contenteditable') === 'true'
      );
    };

    const updateViewport = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height || window.innerHeight;
      const viewportOffsetTop = viewport?.offsetTop || 0;
      const nextIsMobile = window.innerWidth < 768;
      const effectiveHeight = Math.max(viewportHeight + viewportOffsetTop, viewportHeight);

      if (!baseViewportHeightRef.current || (!isEditableTarget() && effectiveHeight > baseViewportHeightRef.current - 40)) {
        baseViewportHeightRef.current = effectiveHeight;
      }

      const keyboardDelta = baseViewportHeightRef.current - effectiveHeight;
      const keyboardLikelyOpen = nextIsMobile && isEditableTarget() && keyboardDelta > 160;

      setAppHeight(`${effectiveHeight}px`);
      setIsMobileView(nextIsMobile);
      setIsKeyboardOpen(keyboardLikelyOpen);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('focusin', updateViewport);
    window.addEventListener('focusout', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('focusin', updateViewport);
      window.removeEventListener('focusout', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(API, {
      path: '/api/ws/socket.io/',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socketRef.current = socket;
    socket.on('connect', () => socket.emit('authenticate', { token }));
    socket.on('authenticated', (data) => {
      if (Array.isArray(data?.online_users)) {
        setOnlineUsers(new Set(data.online_users));
      }
    });
    socket.on('new_message', (data) => {
      const msg = data.message;
      const convId = data.conversation_id;

      setMessages(prev => {
        if (prev.length > 0 && prev[0]?.conversation_id === convId) {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        }
        return prev;
      });

      setConversations(prev => prev.map(c => {
        if (c.id === convId) {
          return {
            ...c,
            last_message: msg.content,
            last_message_time: msg.created_at,
            unread_count: c.id === activeConv?.id ? 0 : (c.unread_count || 0) + (msg.sender_id !== user?.id ? 1 : 0),
          };
        }
        return c;
      }).sort((a, b) => new Date(b.last_message_time) - new Date(a.last_message_time)));
    });
    socket.on('message_edited', (data) => {
      setMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, content: data.content, is_edited: true } : m));
      loadConversations();
    });
    socket.on('message_deleted', (data) => {
      setMessages(prev => prev.filter(m => m.id !== data.message_id));
      loadConversations();
      if (activeConv?.id === data.conversation_id) {
        loadMessages(data.conversation_id);
      }
    });
    socket.on('message_reaction', (data) => {
      setMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, reactions: data.reactions } : m));
    });
    socket.on('message_pinned', () => {
      loadConversations();
    });
    socket.on('message_unpinned', () => {
      loadConversations();
    });
    socket.on('conversation_settings_updated', (data) => {
      setConversations(prev => prev.map(conv => conv.id === data.conversation_id ? { ...conv, disappearing_minutes: data.disappearing_minutes } : conv));
      if (activeConv?.id === data.conversation_id) {
        setActiveConv(current => current ? { ...current, disappearing_minutes: data.disappearing_minutes } : current);
      }
    });
    socket.on('user_online', (data) => setOnlineUsers(prev => new Set([...prev, data.user_id])));
    socket.on('user_offline', (data) => setOnlineUsers(prev => {
      const next = new Set(prev);
      next.delete(data.user_id);
      return next;
    }));
    socket.on('user_typing', (data) => {
      setTypingUsers(prev => ({ ...prev, [data.conversation_id]: data.is_typing ? data.user_id : null }));
      if (data.is_typing) {
        setTimeout(() => {
          setTypingUsers(prev => prev[data.conversation_id] === data.user_id ? { ...prev, [data.conversation_id]: null } : prev);
        }, 3000);
      }
    });
    socket.on('messages_read', (data) => {
      setMessages(prev => prev.map(m => m.conversation_id === data.conversation_id && m.sender_id === user?.id ? { ...m, status: 'read' } : m));
    });

    return () => socket.disconnect();
  }, [token, user?.id, activeConv?.id, loadConversations, loadMessages]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
    }
  }, [activeConv, loadMessages]);

  const sendMessage = async (content, type = 'text', replyTo = null) => {
    if (!activeConv || (!content.trim() && type === 'text')) return;

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/conversations/${activeConv.id}/messages`, {
        content,
        type,
        reply_to: replyTo,
      }, { headers });
    } catch {}
  };

  const editMessage = async (msgId, content) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.patch(`${API}/api/messages/${msgId}`, { content }, { headers });
    } catch {}
  };

  const startConversation = async (otherUserId, draftText = '') => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/conversations`, { participant_id: otherUserId }, { headers });
      if (draftText?.trim()) {
        localStorage.setItem(`qc_draft_${data.conversation.id}`, draftText.trim());
      }
      await loadConversations();
      setActiveConv(data.conversation);
      setActiveSection('chats');
      setShowChat(true);
    } catch {}
  };

  const emitTyping = (convId, isTyping) => {
    if (socketRef.current) {
      socketRef.current.emit('typing', { conversation_id: convId, is_typing: isTyping });
    }
  };

  const selectConversation = (conv) => {
    setActiveConv(conv);
    setActiveSection('chats');
    setShowChat(true);
  };

  const selectSection = (section) => {
    setActiveSection(section);
    if (isMobileView) {
      setShowChat(section !== 'chats');
    }
  };

  const handleMobileBack = () => {
    if (activeSection !== 'chats') {
      setActiveSection('chats');
    }
    setShowChat(false);
  };

  const renderMainContent = () => {
    if (activeSection === 'stories') {
      return <StoriesPanel userId={user?.id} onStartConversation={startConversation} />;
    }

    if (activeSection === 'reels') {
      return <ReelsPanel userId={user?.id} onStartConversation={startConversation} />;
    }

    if (activeSection === 'groups') {
      return (
        <GroupsPanel
          userId={user?.id}
          onSelectConv={(conv) => {
            setActiveConv(conv);
            setActiveSection('chats');
            setShowChat(true);
            loadConversations();
          }}
        />
      );
    }

    if (activeSection === 'settings') {
      return <SettingsPanel user={user} />;
    }

    if (activeConv) {
      return (
        <ChatArea
          conversation={activeConv}
          messages={messages}
          onSend={sendMessage}
          onEdit={editMessage}
          userId={user?.id}
          onlineUsers={onlineUsers}
          typingUsers={typingUsers}
          emitTyping={emitTyping}
          onBack={handleMobileBack}
          conversations={conversations}
          token={token}
          onReloadMessages={loadMessages}
          onReloadConversations={loadConversations}
          isMobile={isMobileView}
          keyboardOpen={isKeyboardOpen}
          onConversationUpdate={setActiveConv}
        />
      );
    }

    return (
      <div className="hidden md:flex flex-col items-center justify-center h-full text-center bg-qc-bg chat-bg-pattern border-l border-qc-border">
        <div className="bg-qc-surface rounded-full p-6 shadow-sm mb-6">
          <span className="text-4xl text-qc-accent-primary font-bold">Q</span>
        </div>
        <h2 className="text-3xl font-light text-qc-text-primary mb-4">QuantChat for Web</h2>
        <p className="text-qc-text-secondary text-sm max-w-md">
          Open a conversation, jump into Stories, or browse Spotlight without losing your place.
          <br />
          Your chats stay ready while the social feed now owns the main stage.
        </p>
        <div className="mt-10 flex items-center justify-center gap-2 text-qc-text-secondary text-xs">
          <span>End-to-end encrypted</span>
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="chat-app"
      className="w-screen bg-[#0A1014] flex items-center justify-center overflow-hidden xl:py-4 xl:px-4"
      style={{
        height: appHeight,
        minHeight: '100svh',
        '--mobile-nav-height': isKeyboardOpen ? '0px' : '74px',
      }}
    >
      <div className="flex h-full w-full xl:max-w-[1600px] xl:h-[95vh] bg-qc-surface xl:shadow-lg xl:rounded-xl overflow-hidden relative">
        <div className={`w-full md:w-[400px] flex-shrink-0 border-r border-qc-border bg-qc-surface flex flex-col ${isMobileView && showChat ? 'hidden' : 'flex'}`}>
          <LeftPanel
            user={user}
            logout={logout}
            darkMode={darkMode}
            toggleTheme={toggleTheme}
            conversations={conversations}
            activeConv={activeConv}
            onSelectConv={selectConversation}
            onStartChat={startConversation}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
            onReloadConversations={loadConversations}
            token={token}
            view={activeSection}
            onViewChange={selectSection}
            isMobile={isMobileView}
            hideFooterNav={isMobileView}
          />
        </div>

        <div className={`flex-1 flex flex-col bg-qc-bg ${isMobileView && !showChat ? 'hidden' : 'flex'} ${isMobileView && !isKeyboardOpen ? 'pb-[var(--mobile-nav-height)]' : ''}`}>
          {renderMainContent()}
        </div>

        {isMobileView && !isKeyboardOpen && (
          <div className="absolute inset-x-0 bottom-0 z-40 border-t border-qc-border bg-[rgba(9,17,31,0.94)] backdrop-blur-xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-5 gap-1">
              {MOBILE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => selectSection(item.id)}
                    className={`rounded-2xl px-2 py-2 flex flex-col items-center justify-center gap-1 transition-all ${
                      isActive
                        ? 'bg-qc-accent-tertiary text-qc-accent-primary'
                        : 'text-qc-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-[10px] leading-none">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

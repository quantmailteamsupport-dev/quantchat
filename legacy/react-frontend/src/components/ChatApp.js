import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../App';
import axios from 'axios';
import { io } from 'socket.io-client';
import LeftPanel from './LeftPanel';
import ChatArea from './ChatView';
import ReelsPanel from './Reels';
import FeedPanel from './FeedPanel';
import AIHub from './AIHub';
import ProfilePanel from './ProfilePanel';
import AIAssistant from './AIAssistant';
import CameraLensSheet from './CameraLensSheet';
import { MessageSquare, Compass, Clapperboard, Bot, UserRound } from 'lucide-react';
import { API } from '../lib/api';

const MOBILE_NAV_ITEMS = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'feed', label: 'Feed', icon: Compass },
  { id: 'reels', label: 'Spotlight', icon: Clapperboard },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'profile', label: 'Profile', icon: UserRound },
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
  const [showCamera, setShowCamera] = useState(false);
  const socketRef = useRef(null);
  const baseViewportHeightRef = useRef(0);
  const totalUnread = conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

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
      const nextViewport = nextIsMobile ? (window.innerWidth < 520 ? 'phone' : 'tablet') : 'desktop';
      const userAgent = window.navigator.userAgent || '';
      const platform = /iPhone|iPad|iPod/i.test(userAgent)
        ? 'ios'
        : /Android/i.test(userAgent)
          ? 'android'
          : /Windows/i.test(userAgent)
            ? 'windows'
            : 'desktop';
      const effectiveHeight = Math.max(viewportHeight + viewportOffsetTop, viewportHeight);

      if (!baseViewportHeightRef.current || (!isEditableTarget() && effectiveHeight > baseViewportHeightRef.current - 40)) {
        baseViewportHeightRef.current = effectiveHeight;
      }

      const keyboardDelta = baseViewportHeightRef.current - effectiveHeight;
      const keyboardLikelyOpen = nextIsMobile && isEditableTarget() && keyboardDelta > 160;

      setAppHeight(`${effectiveHeight}px`);
      setIsMobileView(nextIsMobile);
      setIsKeyboardOpen(keyboardLikelyOpen);
      document.documentElement.dataset.platform = platform;
      document.documentElement.dataset.viewport = nextViewport;
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

  useEffect(() => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };
    const warmFeed = async (endpoint, key) => {
      try {
        const { data } = await axios.get(`${API}${endpoint}`, { headers });
        sessionStorage.setItem(key, JSON.stringify(data));
      } catch {}
    };

    warmFeed('/api/stories', 'qc_cache_stories');
    warmFeed('/api/reels', 'qc_cache_reels');
  }, [token]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const shouldLockShell = !isMobileView || showCamera;

    document.body.style.overflow = shouldLockShell ? 'hidden' : previousBodyOverflow;
    document.documentElement.style.overflow = shouldLockShell ? 'hidden' : previousHtmlOverflow;
    document.body.style.overscrollBehavior = shouldLockShell ? 'none' : previousBodyOverscroll;
    document.documentElement.style.overscrollBehavior = shouldLockShell ? 'none' : previousHtmlOverscroll;

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [isMobileView, showCamera]);

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
      setShowChat(!['chats', 'newChat', 'saved'].includes(section));
    }
  };

  const handleMobileBack = () => {
    if (activeSection !== 'chats') {
      setActiveSection('chats');
    }
    setShowChat(false);
  };

  const renderMainContent = () => {
    if (activeSection === 'feed') {
      return <FeedPanel token={token} onOpenCamera={() => setShowCamera(true)} />;
    }

    if (activeSection === 'reels') {
      return <ReelsPanel userId={user?.id} onStartConversation={startConversation} />;
    }

    if (activeSection === 'ai') {
      return <AIHub token={token} />;
    }

    if (activeSection === 'profile') {
      return <ProfilePanel token={token} />;
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
      <div className="hidden md:flex flex-col items-center justify-center h-full text-center bg-[#050608] chat-bg-pattern border-l border-white/8">
        <div className="bg-[rgba(255,255,255,0.03)] rounded-full p-6 shadow-sm mb-6">
          <span className="text-4xl text-[#4f8cff] font-bold">Q</span>
        </div>
        <h2 className="text-3xl font-light text-white/88 mb-4">QuantChat for Web</h2>
        <p className="text-white/50 text-sm max-w-md">
          Open a conversation, jump into Stories, or browse Spotlight without losing your place.
          <br />
          Your chats stay ready while the social feed now owns the main stage.
        </p>
        <div className="mt-10 flex items-center justify-center gap-2 text-white/50 text-xs">
          <span>End-to-end encrypted</span>
        </div>
      </div>
    );
  };

  const handleCameraPublish = async ({ mode, imageData, caption, audience, locationLabel, tags, scheduleMinutes }) => {
    if (!token || !imageData) return;
    if (mode === 'snap' && activeConv?.id) {
      const snapContent = [caption, imageData].filter(Boolean).join('\n');
      await axios.post(`${API}/api/conversations/${activeConv.id}/messages`, { content: snapContent, type: 'image' }, { headers });
      await loadMessages(activeConv.id);
      await loadConversations();
      return;
    }
    if (mode === 'story') {
      await axios.post(`${API}/api/stories`, { content: imageData, type: 'image', caption, audience: (audience || 'Friends').toLowerCase(), location_label: locationLabel, tags }, { headers });
      return;
    }
    if (mode === 'reel') {
      await axios.post(`${API}/api/reels`, { media_url: imageData, caption: caption || 'Captured with QuantChat Camera', audience: (audience || 'Public').toLowerCase(), location_label: locationLabel, tags }, { headers });
      return;
    }
    await axios.post(`${API}/api/posts`, { content: caption || (mode === 'snap' ? 'Quick snap drop from QuantChat Camera' : 'Captured with QuantChat Camera'), media_url: imageData, visibility: 'public', audience: (audience || 'Public').toLowerCase(), tags, location_label: locationLabel || 'Live camera drop', schedule_minutes: scheduleMinutes || 0 }, { headers });
  };

  return (
    <div
      data-testid="chat-app"
      className="w-screen bg-[radial-gradient(circle_at_top_left,rgba(79,140,255,0.14),transparent_24%),radial-gradient(circle_at_78%_10%,rgba(255,229,106,0.13),transparent_16%),radial-gradient(circle_at_50%_100%,rgba(255,111,181,0.08),transparent_18%),radial-gradient(circle_at_bottom,rgba(157,76,221,0.1),transparent_20%),linear-gradient(180deg,#020409,#05070c_55%,#020409)] flex items-stretch md:items-center justify-center overflow-y-auto md:overflow-hidden px-0 md:px-5 md:py-5"
      style={{
        height: appHeight,
        minHeight: '100svh',
        '--mobile-nav-height': isKeyboardOpen ? '0px' : '74px',
      }}
    >
      <div className="flex h-full min-h-[100svh] w-full md:max-w-[1460px] md:min-h-0 md:h-[94vh] bg-[linear-gradient(180deg,rgba(8,10,15,0.95),rgba(10,13,19,0.92))] md:border md:border-white/10 md:rounded-[34px] overflow-hidden relative shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl animate-surfaceGlow">
        <div className={`w-full md:w-[400px] min-h-0 flex-shrink-0 border-r border-white/8 bg-[rgba(255,255,255,0.03)] flex flex-col ${isMobileView && showChat ? 'hidden' : 'flex'}`}>
          <LeftPanel
            user={user}
            logout={logout}
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
            onOpenCamera={() => setShowCamera(true)}
            isMobile={isMobileView}
            hideFooterNav={isMobileView}
          />
        </div>

        <div className={`flex-1 min-h-0 flex flex-col bg-[#050608] ${isMobileView && !showChat ? 'hidden' : 'flex'} ${isMobileView && !isKeyboardOpen ? 'pb-[var(--mobile-nav-height)]' : ''}`}>
          {renderMainContent()}
        </div>

        <AIAssistant
          token={token}
          activeConversation={activeConv}
          activeSection={activeSection}
          conversations={conversations}
        />

        {isMobileView && !isKeyboardOpen && (
          <div className="absolute inset-x-0 bottom-0 z-40 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
            <div className="floating-nav-shell mx-auto max-w-[430px] rounded-[30px] border border-white/10 backdrop-blur-2xl px-2 py-2">
            <div className="grid grid-cols-5 gap-1">
              {MOBILE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    data-testid={`mobile-nav-${item.id}`}
                    onClick={() => selectSection(item.id)}
                    className={`rounded-2xl px-2 py-2 flex flex-col items-center justify-center gap-1 transition-all ${
                      isActive
                        ? 'bg-white text-black shadow-[0_12px_26px_rgba(255,255,255,0.14)]'
                        : 'text-white/50 hover:bg-white/5'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-[10px] leading-none">{item.label}</span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        )}

        {!isMobileView && totalUnread > 0 && (
          <div data-testid="desktop-unread-pill" className="absolute top-4 right-4 z-30 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-xs uppercase tracking-[0.24em] text-white/68 backdrop-blur-xl">
            {totalUnread} unread
          </div>
        )}

        <CameraLensSheet open={showCamera} onClose={() => setShowCamera(false)} onPublish={handleCameraPublish} />
      </div>
    </div>
  );
}

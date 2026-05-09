import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../App';
import axios from 'axios';
import { io } from 'socket.io-client';
import Sidebar from './Sidebar';
import ChatList from './ChatList';
import ChatView from './ChatView';
import UserSearch from './UserSearch';
import Settings from './Settings';
import EmptyState from './EmptyState';
import Contacts from './Contacts';
import Groups from './Groups';
import Stories from './Stories';
import { API } from '../lib/api';

export default function ChatApp() {
  const { user, token, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState('chats');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const socketRef = useRef(null);
  // Mobile: 'list' = show left panel, 'chat' = show chat panel
  const [mobileScreen, setMobileScreen] = useState('list');

  useEffect(() => {
    if (!token) return;
    const socket = io(API, {
      path: '/api/ws/socket.io/',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('authenticate', { token }));
    socket.on('authenticated', () => {});
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
          return { ...c, last_message: msg.content, last_message_time: msg.created_at,
            unread_count: c.id === activeConv?.id ? 0 : (c.unread_count || 0) + (msg.sender_id !== user?.id ? 1 : 0) };
        }
        return c;
      }).sort((a, b) => new Date(b.last_message_time) - new Date(a.last_message_time)));
    });
    socket.on('user_online', (data) => setOnlineUsers(prev => new Set([...prev, data.user_id])));
    socket.on('user_offline', (data) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(data.user_id); return n; }));
    socket.on('user_typing', (data) => {
      setTypingUsers(prev => ({ ...prev, [data.conversation_id]: data.is_typing ? data.user_id : null }));
      if (data.is_typing) setTimeout(() => setTypingUsers(prev => prev[data.conversation_id] === data.user_id ? { ...prev, [data.conversation_id]: null } : prev), 3000);
    });
    socket.on('messages_read', (data) => setMessages(prev => prev.map(m => m.conversation_id === data.conversation_id && m.sender_id === user?.id ? { ...m, status: 'read' } : m)));
    return () => socket.disconnect();
  }, [token, user?.id]);

  const loadConversations = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations`, { headers });
      setConversations(data.conversations);
    } catch {}
  }, [token]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (convId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations/${convId}/messages`, { headers });
      setMessages(data.messages);
      if (socketRef.current) socketRef.current.emit('mark_read', { conversation_id: convId });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    } catch {}
  }, [token]);

  useEffect(() => { if (activeConv) loadMessages(activeConv.id); }, [activeConv, loadMessages]);

  const sendMessage = async (content, type = 'text') => {
    if (!activeConv || !content.trim()) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/conversations/${activeConv.id}/messages`, { content, type }, { headers });
    } catch {}
  };

  const startConversation = async (otherUserId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/conversations`, { participant_id: otherUserId }, { headers });
      await loadConversations();
      setActiveConv(data.conversation);
      setView('chats');
      setMobileScreen('chat');
    } catch {}
  };

  const emitTyping = (convId, isTyping) => {
    if (socketRef.current) socketRef.current.emit('typing', { conversation_id: convId, is_typing: isTyping });
  };

  const selectConversation = (conv) => {
    setActiveConv(conv);
    setMobileScreen('chat');
  };

  const handleMobileBack = () => {
    setMobileScreen('list');
    setActiveConv(null);
  };

  const handleViewChange = (v) => {
    setView(v);
    setMobileScreen('list');
    setActiveConv(null);
  };

  // Render the left panel content based on current view
  const renderLeftContent = () => {
    switch (view) {
      case 'chats': return <ChatList conversations={conversations} activeConv={activeConv} onSelect={selectConversation} onlineUsers={onlineUsers} typingUsers={typingUsers} userId={user?.id} />;
      case 'search': return <UserSearch onStartChat={startConversation} currentUserId={user?.id} />;
      case 'contacts': return <Contacts onStartChat={startConversation} />;
      case 'groups': return <Groups onSelectConv={(conv) => { setActiveConv(conv); setView('chats'); setMobileScreen('chat'); }} userId={user?.id} />;
      case 'stories': return <Stories userId={user?.id} />;
      case 'settings': return <Settings user={user} />;
      default: return <ChatList conversations={conversations} activeConv={activeConv} onSelect={selectConversation} onlineUsers={onlineUsers} typingUsers={typingUsers} userId={user?.id} />;
    }
  };

  return (
    <div data-testid="chat-app" className="h-screen bg-qc-bg flex flex-col md:flex-row overflow-hidden">

      {/* ===== MOBILE LAYOUT (< md) ===== */}
      <div className="flex flex-col h-full w-full md:hidden">
        {mobileScreen === 'list' ? (
          <>
            {/* Left content full screen */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {renderLeftContent()}
            </div>
            {/* Bottom nav bar */}
            <BottomNav view={view} setView={handleViewChange} user={user} logout={logout} />
          </>
        ) : (
          /* Chat view full screen */
          activeConv ? (
            <ChatView
              conversation={activeConv} messages={messages} onSend={sendMessage} userId={user?.id}
              onlineUsers={onlineUsers} typingUsers={typingUsers} emitTyping={emitTyping}
              onBack={handleMobileBack} conversations={conversations} token={token} onReloadMessages={loadMessages}
              isMobile={true}
            />
          ) : (
            <>
              <div className="flex-1 flex flex-col overflow-hidden">{renderLeftContent()}</div>
              <BottomNav view={view} setView={handleViewChange} user={user} logout={logout} />
            </>
          )
        )}
      </div>

      {/* ===== DESKTOP LAYOUT (>= md) ===== */}
      <div className="hidden md:flex md:flex-row h-full w-full">
        {/* Desktop sidebar */}
        <Sidebar view={view} setView={handleViewChange} user={user} logout={logout} />
        {/* Middle panel */}
        <div className="w-80 border-r border-qc-border flex-shrink-0 flex flex-col bg-qc-surface">
          {renderLeftContent()}
        </div>
        {/* Right panel */}
        <div className="flex-1 flex flex-col bg-qc-bg">
          {activeConv ? (
            <ChatView
              conversation={activeConv} messages={messages} onSend={sendMessage} userId={user?.id}
              onlineUsers={onlineUsers} typingUsers={typingUsers} emitTyping={emitTyping}
              onBack={() => setActiveConv(null)} conversations={conversations} token={token} onReloadMessages={loadMessages}
              isMobile={false}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Mobile Bottom Navigation ===== */
import { MessageSquare, Search, Settings as SettingsIcon, Users, Radio, Contact, LogOut, User } from 'lucide-react';

function BottomNav({ view, setView, user, logout }) {
  const tabs = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'contacts', icon: Contact, label: 'Contacts' },
    { id: 'groups', icon: Users, label: 'Groups' },
    { id: 'stories', icon: Radio, label: 'Stories' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <div data-testid="bottom-nav" className="flex items-center justify-around bg-qc-surface border-t border-qc-border px-1 py-1 flex-shrink-0 safe-bottom">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button key={id} data-testid={`bnav-${id}`} onClick={() => setView(id)}
          className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-0 ${view === id ? 'text-qc-accent' : 'text-qc-text-tertiary'}`}>
          <Icon size={18} />
          <span className="text-[9px] mt-0.5 font-mono tracking-wider truncate">{label}</span>
        </button>
      ))}
      <button data-testid="bnav-logout" onClick={logout} className="flex flex-col items-center justify-center py-1.5 px-2 text-qc-text-tertiary">
        <LogOut size={18} />
        <span className="text-[9px] mt-0.5 font-mono tracking-wider">Exit</span>
      </button>
    </div>
  );
}

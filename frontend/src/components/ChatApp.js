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
import { MessageSquare, Search, Settings as SettingsIcon, Users, Radio, Contact, LogOut, Moon, Sun } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

function BottomNav({ view, setView, user, logout, darkMode, toggleTheme }) {
  const tabs = [
    { id: 'chats', icon: MessageSquare, label: 'CHATS' },
    { id: 'contacts', icon: Contact, label: 'CONTACTS' },
    { id: 'groups', icon: Users, label: 'GROUPS' },
    { id: 'stories', icon: Radio, label: 'STORIES' },
    { id: 'search', icon: Search, label: 'SEARCH' },
  ];

  return (
    <div data-testid="bottom-nav" className="flex items-center justify-around bg-qc-surface border-t-2 border-qc-border px-1 py-2 flex-shrink-0 relative z-20">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button key={id} data-testid={`bnav-${id}`} onClick={() => setView(id)}
          className={`flex flex-col items-center justify-center py-2 px-3 border-2 border-qc-border ${view === id ? 'bg-qc-accent-secondary shadow-[2px_2px_0px_#0A0A0A]' : 'bg-qc-bg hover:bg-qc-accent-tertiary'}`}>
          <Icon size={18} className="text-qc-text-primary" />
        </button>
      ))}
      <button onClick={toggleTheme} className="flex flex-col items-center justify-center py-2 px-3 border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-primary">
        {darkMode ? <Sun size={18} className="text-qc-text-primary" /> : <Moon size={18} className="text-qc-text-primary" />}
      </button>
      <button data-testid="bnav-logout" onClick={logout} className="flex flex-col items-center justify-center py-2 px-3 border-2 border-qc-border bg-[#FF3333] hover:shadow-[2px_2px_0px_#0A0A0A]">
        <LogOut size={18} className="text-white" />
      </button>
    </div>
  );
}

export default function ChatApp() {
  const { user, token, logout, darkMode, toggleTheme } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState('chats');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const socketRef = useRef(null);
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
    socket.on('message_edited', (data) => {
      setMessages(prev => prev.map(m => m.id === data.message_id ? { ...m, content: data.content, is_edited: true } : m));
      if (activeConv?.id === data.conversation_id) {
        setConversations(prev => prev.map(c => c.id === data.conversation_id && c.last_message === data.content ? c : c));
      }
    });
    socket.on('user_online', (data) => setOnlineUsers(prev => new Set([...prev, data.user_id])));
    socket.on('user_offline', (data) => setOnlineUsers(prev => { const n = new Set(prev); n.delete(data.user_id); return n; }));
    socket.on('user_typing', (data) => {
      setTypingUsers(prev => ({ ...prev, [data.conversation_id]: data.is_typing ? data.user_id : null }));
      if (data.is_typing) setTimeout(() => setTypingUsers(prev => prev[data.conversation_id] === data.user_id ? { ...prev, [data.conversation_id]: null } : prev), 3000);
    });
    socket.on('messages_read', (data) => setMessages(prev => prev.map(m => m.conversation_id === data.conversation_id && m.sender_id === user?.id ? { ...m, status: 'read' } : m)));
    return () => socket.disconnect();
  }, [token, user?.id, activeConv?.id]);

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
    if (!activeConv || (!content.trim() && type === 'text')) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/conversations/${activeConv.id}/messages`, { content, type }, { headers });
    } catch {}
  };

  const editMessage = async (msgId, content) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.patch(`${API}/api/messages/${msgId}`, { content }, { headers });
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
    <div data-testid="chat-app" className="h-screen bg-qc-bg flex flex-col md:flex-row overflow-hidden font-mono selection:bg-qc-accent-primary selection:text-black">

      {/* MOBILE */}
      <div className="flex flex-col h-full w-full md:hidden">
        {mobileScreen === 'list' ? (
          <>
            <div className="flex-1 flex flex-col overflow-hidden">
              {renderLeftContent()}
            </div>
            <BottomNav view={view} setView={handleViewChange} user={user} logout={logout} darkMode={darkMode} toggleTheme={toggleTheme} />
          </>
        ) : (
          activeConv ? (
            <ChatView
              conversation={activeConv} messages={messages} onSend={sendMessage} onEdit={editMessage} userId={user?.id}
              onlineUsers={onlineUsers} typingUsers={typingUsers} emitTyping={emitTyping}
              onBack={handleMobileBack} conversations={conversations} token={token} onReloadMessages={loadMessages}
              isMobile={true}
            />
          ) : (
            <>
              <div className="flex-1 flex flex-col overflow-hidden">{renderLeftContent()}</div>
              <BottomNav view={view} setView={handleViewChange} user={user} logout={logout} darkMode={darkMode} toggleTheme={toggleTheme} />
            </>
          )
        )}
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex md:flex-row h-full w-full">
        <Sidebar view={view} setView={handleViewChange} user={user} logout={logout} darkMode={darkMode} toggleTheme={toggleTheme} />
        <div className="w-[340px] border-r-2 border-qc-border flex-shrink-0 flex flex-col bg-qc-surface z-10">
          {renderLeftContent()}
        </div>
        <div className="flex-1 flex flex-col bg-qc-bg relative">
          {/* Background grid texture */}
          <div className="absolute inset-0 grid grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(20,minmax(0,1fr))] opacity-[0.03] pointer-events-none z-0">
            {Array.from({length: 400}).map((_, i) => (
              <div key={i} className="border-r border-b border-black"></div>
            ))}
          </div>

          <div className="relative z-10 flex-1 flex flex-col h-full">
            {activeConv ? (
              <ChatView
                conversation={activeConv} messages={messages} onSend={sendMessage} onEdit={editMessage} userId={user?.id}
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
    </div>
  );
}

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

const API = process.env.REACT_APP_BACKEND_URL;

export default function ChatApp() {
  const { user, token, logout } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState('chats');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const socketRef = useRef(null);
  const [mobileView, setMobileView] = useState('list');

  // Socket connection
  useEffect(() => {
    if (!token) return;
    const socket = io(API, {
      path: '/api/ws/socket.io/',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('authenticate', { token });
    });

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

    socket.on('user_online', (data) => {
      setOnlineUsers(prev => new Set([...prev, data.user_id]));
    });

    socket.on('user_offline', (data) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(data.user_id);
        return next;
      });
    });

    socket.on('user_typing', (data) => {
      setTypingUsers(prev => ({ ...prev, [data.conversation_id]: data.is_typing ? data.user_id : null }));
      if (data.is_typing) {
        setTimeout(() => {
          setTypingUsers(prev => {
            if (prev[data.conversation_id] === data.user_id) {
              return { ...prev, [data.conversation_id]: null };
            }
            return prev;
          });
        }, 3000);
      }
    });

    socket.on('messages_read', (data) => {
      setMessages(prev => prev.map(m => {
        if (m.conversation_id === data.conversation_id && m.sender_id === user?.id) {
          return { ...m, status: 'read' };
        }
        return m;
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user?.id]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations`, { headers });
      setConversations(data.conversations);
    } catch {}
  }, [token]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages for active conversation
  const loadMessages = useCallback(async (convId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/conversations/${convId}/messages`, { headers });
      setMessages(data.messages);
      // Mark as read
      if (socketRef.current) {
        socketRef.current.emit('mark_read', { conversation_id: convId });
      }
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    } catch {}
  }, [token]);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
    }
  }, [activeConv, loadMessages]);

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
      setMobileView('chat');
    } catch {}
  };

  const emitTyping = (convId, isTyping) => {
    if (socketRef.current) {
      socketRef.current.emit('typing', { conversation_id: convId, is_typing: isTyping });
    }
  };

  const selectConversation = (conv) => {
    setActiveConv(conv);
    setMobileView('chat');
  };

  return (
    <div data-testid="chat-app" className="h-screen bg-qc-bg flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        view={view}
        setView={setView}
        user={user}
        logout={logout}
      />

      {/* Middle Panel - Chat List / Search / Settings */}
      <div className={`w-full sm:w-80 border-r border-qc-border flex-shrink-0 flex flex-col bg-qc-surface ${mobileView === 'chat' ? 'hidden sm:flex' : 'flex'}`}>
        {view === 'chats' && (
          <ChatList
            conversations={conversations}
            activeConv={activeConv}
            onSelect={selectConversation}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
            userId={user?.id}
          />
        )}
        {view === 'search' && (
          <UserSearch
            onStartChat={startConversation}
            currentUserId={user?.id}
          />
        )}
        {view === 'contacts' && (
          <Contacts onStartChat={startConversation} />
        )}
        {view === 'groups' && (
          <Groups onSelectConv={(conv) => { setActiveConv(conv); setView('chats'); setMobileView('chat'); }} userId={user?.id} />
        )}
        {view === 'stories' && (
          <Stories userId={user?.id} />
        )}
        {view === 'settings' && (
          <Settings user={user} />
        )}
      </div>

      {/* Right Panel - Active Chat */}
      <div className={`flex-1 flex flex-col bg-qc-bg ${mobileView === 'list' ? 'hidden sm:flex' : 'flex'}`}>
        {activeConv ? (
          <ChatView
            conversation={activeConv}
            messages={messages}
            onSend={sendMessage}
            userId={user?.id}
            onlineUsers={onlineUsers}
            typingUsers={typingUsers}
            emitTyping={emitTyping}
            onBack={() => setMobileView('list')}
            conversations={conversations}
            token={token}
            onReloadMessages={loadMessages}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

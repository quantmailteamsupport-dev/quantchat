import React, { useState, useEffect, useRef } from 'react';
import { Search, User, MessageSquare, MoreVertical, Filter, ArrowLeft, Plus, Users, Settings, LogOut, Moon, Sun, CircleDashed } from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import axios from 'axios';
import { API } from '../lib/api';

function formatMsgTimeShort(time) {
  if (!time || time === 'None' || time === '') return '';
  try {
    const d = new Date(time);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yyyy');
  } catch { return ''; }
}

export default function LeftPanel({ user, logout, darkMode, toggleTheme, conversations, activeConv, onSelectConv, onStartChat, onlineUsers, typingUsers, onReloadConversations, token }) {
  const [view, setView] = useState('chats'); // chats, newChat, settings, stories
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // For New Chat view
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchUsers = async (q) => {
    setLoadingUsers(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/users/search?q=${encodeURIComponent(q)}`, { headers });
      setUsers(data.users);
    } catch {}
    setLoadingUsers(false);
  };

  useEffect(() => {
    if (view === 'newChat') {
      const debounce = setTimeout(() => handleSearchUsers(newChatSearch), 300);
      return () => clearTimeout(debounce);
    }
  }, [newChatSearch, view]);

  const filteredConversations = conversations.filter(c => {
    if (!searchQuery) return true;
    const name = c.type === 'group' ? c.name : (c.other_user?.name || c.participants?.find(p => p.user_id !== user?.id)?.name || '');
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const TopHeader = () => (
    <div className="h-16 bg-qc-surface-hover flex items-center justify-between px-4 border-b border-qc-border flex-shrink-0 relative z-10">
      <button onClick={() => setView('settings')} className="w-10 h-10 rounded-full overflow-hidden bg-qc-bg flex items-center justify-center cursor-pointer">
        {user?.avatar ? <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" /> : <User size={20} className="text-qc-text-secondary" />}
      </button>
      <div className="flex items-center gap-2 relative">
        <button onClick={() => setView('stories')} className="w-10 h-10 rounded-full flex items-center justify-center text-qc-text-secondary hover:bg-qc-border transition-colors" title="Status/Stories">
          <CircleDashed size={20} />
        </button>
        <button onClick={() => setView('newChat')} className="w-10 h-10 rounded-full flex items-center justify-center text-qc-text-secondary hover:bg-qc-border transition-colors" title="New Chat">
          <MessageSquare size={20} />
        </button>
        <button onClick={() => setShowMenu(!showMenu)} className="w-10 h-10 rounded-full flex items-center justify-center text-qc-text-secondary hover:bg-qc-border transition-colors" title="Menu">
          <MoreVertical size={20} />
        </button>
        {showMenu && (
          <div ref={menuRef} className="absolute top-12 right-0 w-48 bg-qc-surface border border-qc-border rounded-lg shadow-lg py-2 z-50">
            <button onClick={() => { setView('settings'); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover">Settings</button>
            <button onClick={() => { toggleTheme(); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover flex justify-between items-center">
              Toggle Theme {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button onClick={() => { logout(); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-qc-surface-hover">Log out</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderChats = () => (
    <>
      <TopHeader />
      <div className="p-2 border-b border-qc-border flex-shrink-0">
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-qc-text-secondary" />
          </div>
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-qc-surface-hover text-qc-text-primary text-sm rounded-lg pl-10 pr-4 py-1.5 focus:bg-qc-surface focus:outline-none focus:ring-1 focus:ring-qc-accent-primary transition-all"
          />
          <button className="ml-2 text-qc-text-secondary hover:text-qc-text-primary p-1">
            <Filter size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-qc-surface">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-qc-text-secondary text-sm p-4 text-center">
            {searchQuery ? "No chats found matching your search." : "No conversations yet. Click the message icon to start a new chat."}
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isGroup = conv.type === 'group';
            const name = isGroup ? conv.name : (conv.other_user?.name || conv.participants?.find(p => p.user_id !== user?.id)?.name || 'Unknown');
            const avatar = isGroup ? conv.avatar : (conv.other_user?.avatar || conv.participants?.find(p => p.user_id !== user?.id)?.avatar || '');
            const otherUserId = isGroup ? null : (conv.other_user?.user_id || conv.participants?.find(p => p.user_id !== user?.id)?.user_id);
            const isOnline = otherUserId ? onlineUsers.has(otherUserId) : false;
            const isTyping = typingUsers[conv.id] && typingUsers[conv.id] !== user?.id;

            return (
              <button
                key={conv.id}
                onClick={() => onSelectConv(conv)}
                className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-qc-surface-hover transition-colors text-left ${activeConv?.id === conv.id ? 'bg-qc-surface-hover' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-qc-surface-hover flex items-center justify-center">
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (isGroup ? <Users size={20} className="text-qc-text-secondary" /> : <User size={20} className="text-qc-text-secondary" />)}
                  </div>
                  {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-qc-accent-primary border-2 border-qc-surface rounded-full" />}
                </div>
                <div className="flex-1 min-w-0 border-b border-qc-border pb-3 pt-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-qc-text-primary text-[15px] truncate">{name}</span>
                    <span className={`text-xs ${conv.unread_count > 0 ? 'text-qc-accent-primary font-medium' : 'text-qc-text-secondary'}`}>
                      {formatMsgTimeShort(conv.last_message_time)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-qc-text-secondary truncate pr-2">
                      {isTyping ? <span className="text-qc-accent-primary font-medium italic">typing...</span> : (conv.last_message || 'No messages yet')}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="bg-qc-accent-primary text-white text-[10px] font-bold min-w-[20px] h-[20px] rounded-full flex items-center justify-center px-1">
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
    </>
  );

  const renderNewChat = () => (
    <div className="flex flex-col h-full bg-qc-surface animate-slideIn">
      <div className="h-24 bg-qc-accent-secondary flex items-end px-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-6 text-white w-full">
          <button onClick={() => setView('chats')}><ArrowLeft size={24} /></button>
          <span className="font-medium text-lg">New chat</span>
        </div>
      </div>
      <div className="p-2 border-b border-qc-border flex-shrink-0">
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-qc-text-secondary" />
          </div>
          <input
            type="text"
            placeholder="Search name or number"
            value={newChatSearch}
            onChange={(e) => setNewChatSearch(e.target.value)}
            className="w-full bg-qc-surface-hover text-qc-text-primary text-sm rounded-lg pl-10 pr-4 py-1.5 focus:bg-qc-surface focus:outline-none focus:ring-1 focus:ring-qc-accent-primary transition-all"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button className="w-full flex items-center gap-4 px-4 py-3 hover:bg-qc-surface-hover transition-colors text-left border-b border-qc-border">
          <div className="w-12 h-12 rounded-full bg-qc-accent-primary flex items-center justify-center text-white flex-shrink-0">
            <Users size={20} />
          </div>
          <span className="font-medium text-qc-text-primary text-base">New group</span>
        </button>
        <div className="py-4 px-4 text-qc-text-secondary text-sm font-medium uppercase tracking-wider bg-qc-bg">Contacts on QuantChat</div>
        {loadingUsers ? (
          <div className="p-4 text-center text-qc-text-secondary text-sm">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-4 text-center text-qc-text-secondary text-sm">No contacts found</div>
        ) : (
          users.map(u => (
            <button key={u.id} onClick={() => { onStartChat(u.id); setView('chats'); }} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-qc-surface-hover transition-colors text-left">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-qc-surface-hover flex items-center justify-center flex-shrink-0">
                {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : <User size={20} className="text-qc-text-secondary" />}
              </div>
              <div className="flex-1 min-w-0 border-b border-qc-border pb-3 pt-1">
                <p className="font-medium text-qc-text-primary text-[15px] truncate">{u.name}</p>
                <p className="text-[13px] text-qc-text-secondary truncate">{u.bio || u.email}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-full bg-qc-surface animate-slideIn">
      <div className="h-24 bg-qc-accent-secondary flex items-end px-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-6 text-white w-full">
          <button onClick={() => setView('chats')}><ArrowLeft size={24} /></button>
          <span className="font-medium text-lg">Profile</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-qc-bg">
        <div className="bg-qc-surface py-8 flex justify-center mb-2 shadow-sm">
          <div className="relative">
            <div className="w-48 h-48 rounded-full overflow-hidden bg-qc-surface-hover flex items-center justify-center">
              {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <User size={64} className="text-qc-text-secondary" />}
            </div>
          </div>
        </div>
        <div className="bg-qc-surface px-6 py-4 mb-2 shadow-sm">
          <p className="text-sm text-qc-accent-primary mb-1">Your name</p>
          <div className="flex justify-between items-center">
            <p className="text-qc-text-primary text-[17px]">{user?.name}</p>
          </div>
        </div>
        <div className="bg-qc-surface px-6 py-4 mb-2 shadow-sm">
          <p className="text-sm text-qc-accent-primary mb-1">About</p>
          <p className="text-qc-text-primary text-[15px]">{user?.bio || 'Hey there! I am using QuantChat.'}</p>
        </div>
        <div className="bg-qc-surface px-6 py-4 mb-2 shadow-sm">
          <p className="text-sm text-qc-accent-primary mb-1">Email</p>
          <p className="text-qc-text-primary text-[15px]">{user?.email}</p>
        </div>
      </div>
    </div>
  );

  const renderStories = () => (
    <div className="flex flex-col h-full bg-qc-surface animate-slideIn">
      <div className="h-24 bg-qc-accent-secondary flex items-end px-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-6 text-white w-full">
          <button onClick={() => setView('chats')}><ArrowLeft size={24} /></button>
          <span className="font-medium text-lg">Status</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-qc-bg">
        <button className="w-full flex items-center gap-4 px-4 py-3 bg-qc-surface hover:bg-qc-surface-hover transition-colors text-left mb-2 shadow-sm">
          <div className="relative flex-shrink-0">
             <div className="w-12 h-12 rounded-full overflow-hidden bg-qc-surface-hover flex items-center justify-center">
              {user?.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : <User size={20} className="text-qc-text-secondary" />}
             </div>
             <div className="absolute bottom-0 right-0 w-4 h-4 bg-qc-accent-primary rounded-full flex items-center justify-center border-2 border-qc-surface text-white">
                <Plus size={10} strokeWidth={4} />
             </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-qc-text-primary text-[15px] truncate">My status</p>
            <p className="text-[13px] text-qc-text-secondary truncate">Click to add status update</p>
          </div>
        </button>
        <div className="py-2 px-4 text-qc-text-secondary text-sm font-medium uppercase tracking-wider">Recent updates</div>
        <div className="p-4 text-center text-qc-text-secondary text-sm">No recent updates</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-qc-surface w-full overflow-hidden relative">
      {view === 'chats' && renderChats()}
      {view === 'newChat' && renderNewChat()}
      {view === 'settings' && renderSettings()}
      {view === 'stories' && renderStories()}
    </div>
  );
}

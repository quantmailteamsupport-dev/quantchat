import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  User,
  MessageSquare,
  MoreVertical,
  Filter,
  ArrowLeft,
  Users,
  Settings as SettingsIcon,
  LogOut,
  Moon,
  CircleDashed,
  Clapperboard,
  Sparkles,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import axios from 'axios';
import { API } from '../lib/api';

function formatMsgTimeShort(time) {
  if (!time || time === 'None' || time === '') return '';
  try {
    const d = new Date(time);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '';
  }
}

export default function LeftPanel({
  user,
  logout,
  conversations,
  activeConv,
  onSelectConv,
  onlineUsers,
  typingUsers,
  onReloadConversations,
  token,
  view,
  onViewChange,
  isMobile,
  hideFooterNav,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [chatFilter, setChatFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [showPreviewHints, setShowPreviewHints] = useState(localStorage.getItem('qc_pref_preview_hints') !== 'false');
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const syncPreferences = () => setShowPreviewHints(localStorage.getItem('qc_pref_preview_hints') !== 'false');
    window.addEventListener('qc-preferences-changed', syncPreferences);
    return () => window.removeEventListener('qc-preferences-changed', syncPreferences);
  }, []);

  useEffect(() => {
    if (view !== 'newChat') return undefined;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const { data } = await axios.get(`${API}/api/users/search?q=${encodeURIComponent(newChatSearch)}`, { headers });
        setUsers(data.users || []);
      } catch {
        setUsers([]);
      }
      setLoadingUsers(false);
    };

    const debounce = setTimeout(fetchUsers, 250);
    return () => clearTimeout(debounce);
  }, [newChatSearch, token, view]);

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
  const onlineDirectConversations = conversations.filter(conv => conv.type === 'direct' && onlineUsers.has(conv.other_user?.user_id)).length;
  const groupCount = conversations.filter(conv => conv.type === 'group').length;

  const filteredConversations = conversations.filter(conv => {
    if (chatFilter === 'unread' && !conv.unread_count) return false;
    if (chatFilter === 'groups' && conv.type !== 'group') return false;
    if (chatFilter === 'direct' && conv.type !== 'direct') return false;

    if (!searchQuery) return true;

    const name = conv.type === 'group'
      ? conv.name
      : (conv.other_user?.name || conv.participants?.find(p => p.user_id !== user?.id)?.name || '');

    return name.toLowerCase().includes(searchQuery.toLowerCase()) || (conv.last_message || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const navItems = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'stories', label: 'Stories', icon: CircleDashed },
    { id: 'reels', label: 'Spotlight', icon: Clapperboard },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'settings', label: 'You', icon: SettingsIcon },
  ];

  const renderTopShell = () => (
    <>
      <div className={`px-4 border-b border-qc-border bg-qc-surface backdrop-blur-xl relative ${isMobile ? 'pt-3 pb-2' : 'pt-4 pb-3'}`}>
        <div className="flex items-start justify-between gap-3">
          <button onClick={() => onViewChange('settings')} className="flex items-center gap-3 text-left">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-qc-accent-tertiary flex items-center justify-center shadow-glow">
              {user?.avatar ? <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" /> : <User size={20} className="text-qc-text-secondary" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-qc-text-tertiary">QuantChat Hub</p>
              <h2 className="font-heading text-xl text-qc-text-primary truncate">{user?.name || 'Operator'}</h2>
            </div>
          </button>

          <div className="flex items-center gap-2 relative" ref={menuRef}>
            <button onClick={() => onViewChange('stories')} className="w-10 h-10 rounded-2xl flex items-center justify-center text-qc-text-secondary hover:bg-qc-accent-tertiary transition-colors" title="Open stories">
              <CircleDashed size={18} />
            </button>
            <button onClick={() => onViewChange('newChat')} className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-qc-accent-primary hover:bg-qc-accent-secondary transition-colors shadow-glow" title="Start a chat">
              <MessageSquare size={18} />
            </button>
            <button onClick={() => setShowMenu(value => !value)} className="w-10 h-10 rounded-2xl flex items-center justify-center text-qc-text-secondary hover:bg-qc-accent-tertiary transition-colors" title="Open menu">
              <MoreVertical size={18} />
            </button>

            {showMenu && (
              <div className="absolute top-12 right-0 w-56 bg-qc-surface border border-qc-border rounded-2xl shadow-xl py-2 z-50 animate-fadeIn">
                <button onClick={() => { onViewChange('groups'); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover flex items-center gap-2">
                  <Users size={15} /> Manage groups
                </button>
                <button onClick={() => { onReloadConversations?.(); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover flex items-center gap-2">
                  <Sparkles size={15} /> Refresh feed
                </button>
                <button onClick={() => setShowMenu(false)} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover flex items-center justify-between">
                  <span className="flex items-center gap-2"><Moon size={15} /> Dark mode locked</span>
                  <span className="text-qc-text-tertiary text-xs">On</span>
                </button>
                <button onClick={() => { logout(); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-qc-surface-hover flex items-center gap-2">
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={`mt-3 rounded-[24px] border border-qc-border bg-[linear-gradient(135deg,rgba(255,107,61,0.95),rgba(79,124,255,0.92))] text-white shadow-glow ${isMobile ? 'p-3' : 'p-4'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Daily streak</p>
              <h3 className="font-heading text-xl leading-none mt-1">Social cockpit</h3>
              <p className="text-xs text-white/80 mt-2 max-w-[18rem]">{isMobile ? 'Chats, stories aur spotlight ke beech fast switch.' : 'Chats pinned rakho, baaki stories aur spotlight ab main stage par open hote hain.'}</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-3 py-2 text-right min-w-[78px]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Unread</p>
              <p className="text-xl font-semibold">{totalUnread}</p>
            </div>
          </div>

          <div className={`mt-3 grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className="rounded-2xl bg-white/12 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/65">Online</p>
              <p className="text-base font-semibold">{onlineDirectConversations}</p>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/65">Squads</p>
              <p className="text-base font-semibold">{groupCount}</p>
            </div>
            <div className={`rounded-2xl bg-white/12 px-3 py-2 ${isMobile ? 'col-span-2' : ''}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/65">Profile</p>
              <p className="text-base font-semibold truncate">{user?.role || 'user'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-qc-border bg-qc-surface backdrop-blur-md">
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-qc-text-secondary" />
          </div>
          <input
            type="text"
            placeholder="Search chats, names, snippets..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-qc-surface-hover text-qc-text-primary text-sm rounded-2xl pl-10 pr-4 py-2.5 border border-transparent focus:border-qc-border focus:bg-qc-surface focus:outline-none transition-all"
          />
          <button
            onClick={() => setChatFilter(current => current === 'unread' ? 'all' : 'unread')}
            className={`ml-2 p-2 rounded-2xl transition-colors ${chatFilter === 'unread' ? 'bg-qc-accent-tertiary text-qc-accent-primary' : 'text-qc-text-secondary hover:bg-qc-accent-tertiary'}`}
            title="Toggle unread filter"
          >
            <Filter size={18} />
          </button>
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: 'All chats' },
            { id: 'unread', label: 'Unread' },
            { id: 'direct', label: 'Direct' },
            { id: 'groups', label: 'Groups' },
          ].map(filter => (
            <button
              key={filter.id}
              onClick={() => setChatFilter(filter.id)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-all ${
                chatFilter === filter.id
                  ? 'bg-qc-text-primary text-white border-qc-text-primary'
                  : 'bg-qc-surface text-qc-text-secondary border-qc-border hover:bg-qc-surface-hover'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const renderChats = () => (
    <div className="flex flex-col h-full">
      {renderTopShell()}
      {view !== 'chats' && showPreviewHints && (
        <div className="px-4 py-3 border-b border-qc-border bg-qc-accent-tertiary/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-qc-text-tertiary">Active space</p>
              <p className="text-sm font-medium text-qc-text-primary">
                {view === 'stories' && 'Stories are open in the main panel'}
                {view === 'reels' && 'Spotlight is open in the main panel'}
                {view === 'groups' && 'Groups are open in the main panel'}
                {view === 'settings' && 'Profile settings are open in the main panel'}
                {view === 'newChat' && 'Start a chat from the overlay'}
              </p>
            </div>
            {view !== 'newChat' && (
              <button
                onClick={() => onViewChange('chats')}
                className="rounded-full border border-qc-border px-3 py-1.5 text-xs font-medium text-qc-text-primary hover:bg-qc-surface"
              >
                Back to chats
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto bg-qc-surface">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-qc-text-secondary text-sm p-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-qc-accent-tertiary text-qc-accent-primary flex items-center justify-center mb-4">
              <MessageSquare size={28} />
            </div>
            <p className="font-medium text-qc-text-primary mb-1">No chats match this view yet</p>
            <p>{searchQuery ? 'Try another search or switch the filter chips.' : 'Start a fresh conversation or jump into Stories and Spotlight.'}</p>
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
                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-qc-surface-hover transition-colors text-left border-b border-qc-border/80 ${
                  activeConv?.id === conv.id ? 'bg-qc-accent-tertiary' : ''
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-qc-accent-tertiary flex items-center justify-center">
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (isGroup ? <Users size={20} className="text-qc-text-secondary" /> : <User size={20} className="text-qc-text-secondary" />)}
                  </div>
                  {isOnline && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-qc-accent-primary border-2 border-qc-surface rounded-full" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-3 mb-1">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-medium text-qc-text-primary text-[15px] truncate">{name}</span>
                      {conv.streak_count > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-qc-accent-tertiary text-qc-accent-primary font-medium whitespace-nowrap">🔥 {conv.streak_count}</span>}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${conv.unread_count > 0 ? 'text-qc-accent-primary font-medium' : 'text-qc-text-secondary'}`}>
                      {formatMsgTimeShort(conv.last_message_time)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      {isTyping ? (
                        <span className="text-qc-accent-primary font-medium italic text-[13px]">typing...</span>
                      ) : (
                        <div className="min-w-0">
                          <span className="text-[13px] text-qc-text-secondary truncate block">
                            {conv.last_message || (isGroup ? 'Group ready for activity' : 'Say hi to kick things off')}
                          </span>
                          {conv.disappearing_minutes > 0 && (
                            <span className="text-[10px] text-qc-text-tertiary">Vanish mode: {conv.disappearing_minutes < 60 ? `${conv.disappearing_minutes}m` : conv.disappearing_minutes < 1440 ? `${Math.round(conv.disappearing_minutes / 60)}h` : `${Math.round(conv.disappearing_minutes / 1440)}d`}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {conv.unread_count > 0 ? (
                      <span className="bg-qc-accent-primary text-white text-[10px] font-bold min-w-[22px] h-[22px] rounded-full flex items-center justify-center px-1.5">
                        {conv.unread_count}
                      </span>
                    ) : isGroup ? (
                      <span className="text-[10px] uppercase tracking-[0.2em] text-qc-text-tertiary border border-qc-border rounded-full px-2 py-1">
                        Squad
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const renderNewChat = () => (
    <div className="absolute inset-0 z-30 bg-qc-surface flex flex-col animate-slideIn">
      <div className="px-4 py-4 border-b border-qc-border flex items-center gap-3 bg-qc-surface-hover">
        <button onClick={() => onViewChange('chats')} className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-qc-surface">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-qc-text-tertiary">Discover people</p>
          <h3 className="font-heading text-xl text-qc-text-primary">Start something new</h3>
        </div>
      </div>

      <div className="p-4 border-b border-qc-border bg-qc-surface">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-qc-text-secondary" />
          <input
            type="text"
            placeholder="Search by name or email"
            value={newChatSearch}
            onChange={(event) => setNewChatSearch(event.target.value)}
            className="w-full bg-qc-surface-hover rounded-2xl border border-qc-border px-10 py-3 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <button onClick={() => onViewChange('groups')} className="rounded-2xl border border-qc-border bg-qc-surface-hover p-3 text-left hover:bg-qc-accent-tertiary transition-colors">
            <p className="text-[11px] uppercase tracking-[0.2em] text-qc-text-tertiary">Quick action</p>
            <p className="font-medium text-qc-text-primary mt-1">Create group</p>
          </button>
          <button onClick={() => onViewChange('stories')} className="rounded-2xl border border-qc-border bg-qc-surface-hover p-3 text-left hover:bg-qc-accent-tertiary transition-colors">
            <p className="text-[11px] uppercase tracking-[0.2em] text-qc-text-tertiary">Quick action</p>
            <p className="font-medium text-qc-text-primary mt-1">Post story</p>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingUsers ? (
          <div className="p-6 text-center text-qc-text-secondary text-sm">Finding people...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-qc-text-secondary text-sm">No people found. Try another search term.</div>
        ) : (
          users.map(person => (
            <button
              key={person.id}
              onClick={() => { onStartChat(person.id); onViewChange('chats'); }}
              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-qc-surface-hover transition-colors text-left border-b border-qc-border"
            >
              <div className="w-12 h-12 rounded-2xl overflow-hidden bg-qc-accent-tertiary flex items-center justify-center flex-shrink-0">
                {person.avatar ? <img src={person.avatar} alt="" className="w-full h-full object-cover" /> : <User size={20} className="text-qc-text-secondary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-qc-text-primary text-[15px] truncate">{person.name}</p>
                <p className="text-[13px] text-qc-text-secondary truncate">{person.bio || person.email}</p>
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-qc-text-tertiary">
                {person.online ? 'Live' : 'Reach out'}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-qc-surface w-full overflow-hidden relative">
      <div className="flex-1 min-h-0">{renderChats()}</div>

      {view === 'newChat' && renderNewChat()}

      {!hideFooterNav && <div className="grid grid-cols-5 gap-1 p-2 border-t border-qc-border bg-qc-surface backdrop-blur-xl">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`rounded-2xl px-2 py-2.5 flex flex-col items-center justify-center gap-1 transition-all ${
                isActive
                  ? 'bg-qc-text-primary text-white'
                  : 'text-qc-text-secondary hover:bg-qc-surface-hover'
              }`}
            >
              <Icon size={18} />
              <span className="text-[11px]">{item.label}</span>
            </button>
          );
        })}
      </div>}
    </div>
  );
}

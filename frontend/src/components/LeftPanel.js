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
  Camera,
  Bookmark,
  Archive,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import axios from 'axios';
import { API } from '../lib/api';
import QuantLogo from './QuantLogo';

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

function formatConversationSnippet(lastMessage) {
  if (!lastMessage) return '';
  if (typeof lastMessage === 'string' && lastMessage.startsWith('data:image')) return 'Photo';
  if (typeof lastMessage === 'string' && lastMessage.startsWith('data:audio')) return 'Voice note';
  try {
    const parsed = JSON.parse(lastMessage);
    if (parsed?.name) {
      return `File: ${parsed.name}`;
    }
  } catch {}
  return lastMessage;
}

export default function LeftPanel({
  user,
  logout,
  conversations,
  activeConv,
  onSelectConv,
  onStartChat,
  onlineUsers,
  typingUsers,
  onReloadConversations,
  token,
  view,
  onViewChange,
  onOpenCamera,
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
  const [storyGroups, setStoryGroups] = useState([]);
  const [savedMessages, setSavedMessages] = useState([]);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
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

  useEffect(() => {
    const fetchStories = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const { data } = await axios.get(`${API}/api/stories`, { headers });
        setStoryGroups(data.stories || []);
      } catch {
        setStoryGroups([]);
      }
    };
    fetchStories();
  }, [token]);

  useEffect(() => {
    if (view !== 'saved') return;
    const loadSavedMessages = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const { data } = await axios.get(`${API}/api/saved-messages`, { headers });
        setSavedMessages(data.saved_messages || []);
      } catch {
        setSavedMessages([]);
      }
    };
    loadSavedMessages();
  }, [token, view]);

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
  const onlineDirectConversations = conversations.filter(conv => conv.type === 'direct' && onlineUsers.has(conv.other_user?.user_id)).length;
  const groupCount = conversations.filter(conv => conv.type === 'group').length;
  const directCount = conversations.filter((conv) => conv.type === 'direct').length;
  const orbitPeople = conversations
    .filter((conv) => conv.type === 'direct')
    .slice(0, 8)
    .map((conv) => ({
      id: conv.id,
      name: conv.other_user?.name || conv.participants?.find(p => p.user_id !== user?.id)?.name || 'Unknown',
      avatar: conv.other_user?.avatar || conv.participants?.find(p => p.user_id !== user?.id)?.avatar || '',
      online: onlineUsers.has(conv.other_user?.user_id || conv.participants?.find(p => p.user_id !== user?.id)?.user_id),
    }));
  const compactStories = storyGroups.filter((group) => group.user_id !== user?.id).slice(0, 8);
  const mobileCategoryPills = [
    { id: 'all', label: 'All', count: conversations.length },
    { id: 'direct', label: 'DMs', count: directCount },
    { id: 'groups', label: 'Groups', count: groupCount },
    { id: 'unread', label: 'Unread', count: totalUnread },
  ];

  const filteredConversations = conversations.filter(conv => {
    if (chatFilter === 'unread' && !conv.unread_count) return false;
    if (chatFilter === 'groups' && conv.type !== 'group') return false;
    if (chatFilter === 'direct' && conv.type !== 'direct') return false;

    if (!searchQuery) return true;

    const name = conv.type === 'group'
      ? conv.name
      : (conv.other_user?.name || conv.participants?.find(p => p.user_id !== user?.id)?.name || '');

    return name.toLowerCase().includes(searchQuery.toLowerCase()) || formatConversationSnippet(conv.last_message).toLowerCase().includes(searchQuery.toLowerCase());
  });

  const navItems = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'feed', label: 'Feed', icon: CircleDashed },
    { id: 'reels', label: 'Spotlight', icon: Clapperboard },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'profile', label: 'Profile', icon: SettingsIcon },
  ];

  const renderTopShell = () => (
    <>
      <div ref={menuRef} className={`px-4 border-b border-qc-border bg-qc-surface backdrop-blur-xl relative ${isMobile ? 'pt-3 pb-2' : 'pt-4 pb-3'}`}>
        {isMobile ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <button data-testid="leftpanel-mobile-brand-button" onClick={() => onViewChange('chats')} className="flex items-center gap-3 min-w-0 text-left">
                <QuantLogo compact />
                <div className="min-w-0">
                  <h2 className="text-[1.6rem] leading-none font-semibold text-qc-text-primary">QuantChat</h2>
                  <p className="text-xs text-qc-text-secondary mt-1">Super social shell</p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <button data-testid="leftpanel-mobile-camera-button" onClick={onOpenCamera} className="w-10 h-10 rounded-full bg-[#223041] text-qc-text-primary flex items-center justify-center" title="Camera">
                  <Camera size={18} />
                </button>
                <button
                  data-testid="leftpanel-mobile-search-toggle"
                  onClick={() => setChatFilter('all')}
                  className="w-10 h-10 rounded-full bg-[#223041] text-qc-text-primary flex items-center justify-center"
                  title="Search"
                >
                  <Search size={19} />
                </button>
                <button
                  data-testid="leftpanel-mobile-menu-toggle"
                  onClick={() => setShowMenu((value) => !value)}
                  className="w-10 h-10 rounded-full text-qc-text-primary hover:bg-white/5 flex items-center justify-center"
                  title="Menu"
                >
                  <MoreVertical size={20} />
                </button>

                {showMenu && (
                  <div className="absolute top-14 right-4 w-56 bg-qc-surface border border-qc-border rounded-2xl shadow-xl py-2 z-50 animate-fadeIn">
                    <button onClick={() => { setChatFilter('groups'); onViewChange('chats'); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover flex items-center gap-2">
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

            <div className="mt-4 relative flex items-center rounded-full bg-[#213042] border border-white/5 px-3 py-3">
              <Search size={17} className="text-qc-text-secondary" />
              <input
                data-testid="leftpanel-mobile-search-input"
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="ml-3 flex-1 bg-transparent text-qc-text-primary text-sm placeholder:text-qc-text-secondary focus:outline-none"
              />
            </div>

            {compactStories.length > 0 && (
              <div className="mt-4 flex gap-3 overflow-x-auto hide-scrollbar">
                {compactStories.map((group) => (
                  <button key={group.user_id} data-testid={`chat-story-circle-${group.user_id}`} onClick={() => onStartChat?.(group.user_id, `Saw your story`) } className="shrink-0 flex flex-col items-center gap-1.5 text-center">
                    <div className="rounded-full p-[2px] bg-[linear-gradient(135deg,#ffe56a,#ff914d,#9f7aea)]">
                      <div className="w-14 h-14 rounded-full bg-[#09111d] overflow-hidden flex items-center justify-center">
                        {group.user_avatar ? <img src={group.user_avatar} alt="" className="w-full h-full object-cover" /> : <User size={16} className="text-qc-text-secondary" />}
                      </div>
                    </div>
                    <span className="max-w-[58px] truncate text-[11px] text-qc-text-secondary">{group.user_name || 'Story'}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
              {mobileCategoryPills.map((filter) => (
                <button
                  data-testid={`leftpanel-mobile-filter-${filter.id}`}
                  key={filter.id}
                  onClick={() => setChatFilter(filter.id)}
                  className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-all ${
                    chatFilter === filter.id
                      ? 'bg-[#244463] text-[#66beff]'
                      : 'bg-[#1a2734] text-qc-text-secondary'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${chatFilter === filter.id ? 'bg-[#2f577c] text-[#8fd0ff]' : 'bg-[#243342] text-qc-text-secondary'}`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <button
                data-testid="archived-chats-button"
                onClick={() => setChatFilter('unread')}
                className="w-full rounded-[24px] bg-[#1b2a38] border border-white/5 px-4 py-3 flex items-center gap-3 text-left"
              >
                <div className="w-12 h-12 rounded-full bg-[#6d7f93] flex items-center justify-center text-white">
                  <Archive size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-qc-text-primary text-[15px] font-semibold">Archived Chats</p>
                  <p className="text-qc-text-secondary text-sm truncate">Unread stack, catch-up lane and older threads</p>
                </div>
                {totalUnread > 0 && (
                  <span className="min-w-[28px] h-7 rounded-full bg-[#40a7ff] px-2 flex items-center justify-center text-white text-xs font-bold">
                    {totalUnread}
                  </span>
                )}
              </button>

              <button
                data-testid="saved-space-button"
                onClick={() => onViewChange('saved')}
                className="w-full rounded-[24px] bg-[#1b2a38] border border-white/5 px-4 py-3 flex items-center gap-3 text-left"
              >
                <div className="w-12 h-12 rounded-full bg-[#2ca8ff] flex items-center justify-center text-white">
                  <Bookmark size={21} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-qc-text-primary text-[15px] font-semibold">Saved Space</p>
                  <p className="text-qc-text-secondary text-sm truncate">Start a fresh DM, pin ideas and jump faster</p>
                </div>
              </button>
            </div>
          </>
        ) : (
          <>
        <div className="flex items-start justify-between gap-3">
          <button data-testid="leftpanel-desktop-brand-button" onClick={() => onViewChange('chats')} className="flex items-center gap-3 text-left">
            <QuantLogo />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-qc-text-tertiary">QuantChat Hub</p>
              <h2 className="font-heading text-xl text-qc-text-primary truncate">Future social stack</h2>
            </div>
          </button>

          <div className="flex items-center gap-2 relative">
            <button data-testid="leftpanel-desktop-camera-button" onClick={onOpenCamera} className="w-10 h-10 rounded-2xl flex items-center justify-center text-qc-text-secondary hover:bg-qc-accent-tertiary transition-colors" title="Open camera">
              <Camera size={18} />
            </button>
            <button data-testid="leftpanel-desktop-newchat-button" onClick={() => onViewChange('newChat')} className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-qc-accent-primary hover:bg-qc-accent-secondary transition-colors shadow-glow" title="Start a chat">
              <MessageSquare size={18} />
            </button>
            <button data-testid="leftpanel-desktop-menu-toggle" onClick={() => setShowMenu(value => !value)} className="w-10 h-10 rounded-2xl flex items-center justify-center text-qc-text-secondary hover:bg-qc-accent-tertiary transition-colors" title="Open menu">
              <MoreVertical size={18} />
            </button>

            {showMenu && (
              <div className="absolute top-12 right-0 w-56 bg-qc-surface border border-qc-border rounded-2xl shadow-xl py-2 z-50 animate-fadeIn">
                <button onClick={() => { setChatFilter('groups'); onViewChange('chats'); setShowMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-qc-text-primary hover:bg-qc-surface-hover flex items-center gap-2">
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

        <div className={`mt-3 rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,18,29,0.98),rgba(18,25,41,0.96))] text-white shadow-[0_20px_50px_rgba(0,0,0,0.28)] ${isMobile ? 'p-3.5' : 'p-4.5'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#ffe56a]/78">Snap lane</p>
              <h3 className={`font-heading leading-none mt-1 ${isMobile ? 'text-lg' : 'text-xl'}`}>Social cockpit</h3>
              <p className="text-xs text-white/70 mt-2 max-w-[18rem]">{isMobile ? 'Fast switch between chats, stories aur spotlight.' : 'Chats pinned rakho, baaki stories aur spotlight ab main stage par open hote hain.'}</p>
            </div>
            <div className={`rounded-3xl border border-white/10 bg-white/6 text-right min-w-[78px] ${isMobile ? 'px-3 py-1.5' : 'px-3 py-2'}`}>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/58">Unread</p>
              <p className="text-xl font-semibold">{totalUnread}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 grid-cols-3">
            <div className={`rounded-2xl border border-white/8 bg-white/6 ${isMobile ? 'px-2.5 py-2' : 'px-3 py-2'}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/48">Online</p>
              <p className="text-base font-semibold">{onlineDirectConversations}</p>
            </div>
            <div className={`rounded-2xl border border-white/8 bg-white/6 ${isMobile ? 'px-2.5 py-2' : 'px-3 py-2'}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/48">Squads</p>
              <p className="text-base font-semibold">{groupCount}</p>
            </div>
            <div className={`rounded-2xl border border-white/8 bg-white/6 ${isMobile ? 'px-2.5 py-2' : 'px-3 py-2'}`}>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/48">Profile</p>
              <p className="text-base font-semibold truncate">{user?.role || 'user'}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
            <button data-testid="leftpanel-story-orbit-button" onClick={() => onViewChange('feed')} className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[#ffe56a]/25 bg-[#ffe56a]/12 px-3 py-2 text-[12px] font-medium text-[#ffe56a]">
              <CircleDashed size={14} />
              Feed lane
            </button>
            <button data-testid="leftpanel-spotlight-button" onClick={() => onViewChange('reels')} className="shrink-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/84">
              <Clapperboard size={14} />
              Spotlight
            </button>
            <button data-testid="leftpanel-ai-chip-button" onClick={() => onViewChange('ai')} className="shrink-0 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/84">
              <Sparkles size={14} />
              AI bots
            </button>
          </div>
          </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-b border-qc-border bg-qc-surface backdrop-blur-md">
        {!isMobile && (compactStories.length > 0 || orbitPeople.length > 0) && (
          <div className="mb-3 flex gap-3 overflow-x-auto hide-scrollbar">
            {(compactStories.length > 0 ? compactStories.map((group) => ({ id: group.user_id, name: group.user_name, avatar: group.user_avatar, online: true })) : orbitPeople).map((person) => (
              <button
                data-testid={`orbit-person-${person.id}`}
                key={person.id}
                onClick={() => {
                  const conv = conversations.find((item) => item.id === person.id);
                  if (conv) onSelectConv(conv);
                  else onStartChat?.(person.id, 'Saw your story');
                }}
                className="shrink-0 flex flex-col items-center gap-1.5 text-center"
              >
                <div className="relative rounded-full p-[2px] bg-[linear-gradient(135deg,#ffe56a,#ff914d,#9f7aea)]">
                  <div className="w-14 h-14 rounded-full bg-qc-surface overflow-hidden flex items-center justify-center">
                    {person.avatar ? <img src={person.avatar} alt="" className="w-full h-full object-cover" /> : <User size={18} className="text-qc-text-secondary" />}
                  </div>
                  {person.online && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-qc-surface bg-[#31d17c]" />}
                </div>
                <span className="text-[11px] text-qc-text-secondary max-w-[58px] truncate">{person.name}</span>
              </button>
            ))}
          </div>
        )}

        {!isMobile && <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-qc-text-secondary" />
          </div>
          <input
            data-testid="leftpanel-desktop-search-input"
            type="text"
            placeholder="Search chats, names, snippets..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-qc-surface-hover text-qc-text-primary text-sm rounded-2xl pl-10 pr-4 py-2.5 border border-transparent focus:border-qc-border focus:bg-qc-surface focus:outline-none transition-all"
          />
          <button
            data-testid="leftpanel-unread-filter-toggle"
            onClick={() => setChatFilter(current => current === 'unread' ? 'all' : 'unread')}
            className={`ml-2 p-2 rounded-2xl transition-colors ${chatFilter === 'unread' ? 'bg-qc-accent-tertiary text-qc-accent-primary' : 'text-qc-text-secondary hover:bg-qc-accent-tertiary'}`}
            title="Toggle unread filter"
          >
            <Filter size={18} />
          </button>
        </div>}

        {!isMobile && <div className="flex gap-2 mt-3 overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: 'All chats' },
            { id: 'unread', label: 'Unread' },
            { id: 'direct', label: 'Direct' },
            { id: 'groups', label: 'Groups' },
          ].map(filter => (
            <button
              data-testid={`leftpanel-filter-${filter.id}`}
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
        </div>}
      </div>
    </>
  );

  const renderChats = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      {renderTopShell()}
      {view !== 'chats' && showPreviewHints && (
        <div className="px-4 py-3 border-b border-qc-border bg-qc-accent-tertiary/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-qc-text-tertiary">Active space</p>
              <p className="text-sm font-medium text-qc-text-primary">
                {view === 'feed' && 'Public feed is open in the main panel'}
                {view === 'reels' && 'Spotlight is open in the main panel'}
                {view === 'ai' && 'AI workspace is open in the main panel'}
                {view === 'profile' && 'Profile hub is open in the main panel'}
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
      <div className="bg-qc-surface">
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
                data-testid={`chat-item-${conv.id}`}
                key={conv.id}
                onClick={() => onSelectConv(conv)}
                className={`w-full flex items-center gap-3 ${isMobile ? 'px-4 py-3' : 'px-4 py-3.5'} hover:bg-qc-surface-hover transition-colors text-left border-b border-qc-border/80 ${
                  activeConv?.id === conv.id ? (isMobile ? 'bg-[#21374c]' : 'bg-qc-accent-tertiary') : ''
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className={`${isMobile ? 'w-[54px] h-[54px] rounded-full' : 'w-12 h-12 rounded-2xl'} overflow-hidden bg-qc-accent-tertiary flex items-center justify-center`}>
                    {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (isGroup ? <Users size={20} className="text-qc-text-secondary" /> : <User size={20} className="text-qc-text-secondary" />)}
                  </div>
                  {isOnline && <div className={`absolute -bottom-1 -right-1 ${isMobile ? 'w-[13px] h-[13px]' : 'w-4 h-4'} bg-qc-accent-primary border-2 border-qc-surface rounded-full`} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-3 mb-1">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`font-medium text-qc-text-primary truncate ${isMobile ? 'text-[17px]' : 'text-[15px]'}`}>{name}</span>
                      {conv.streak_count > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-qc-accent-tertiary text-qc-accent-primary font-medium whitespace-nowrap">
                          {'\u{1F525}'} {conv.streak_count}
                        </span>
                      )}
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
                          <span className={`${isMobile ? 'text-[14px]' : 'text-[13px]'} text-qc-text-secondary truncate block`}>
                            {formatConversationSnippet(conv.last_message) || (isGroup ? 'Group ready for activity' : 'Say hi to kick things off')}
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
        <button data-testid="new-chat-back-button" onClick={() => onViewChange('chats')} className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-qc-surface">
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
            data-testid="new-chat-search-input"
            type="text"
            placeholder="Search by name or email"
            value={newChatSearch}
            onChange={(event) => setNewChatSearch(event.target.value)}
            className="w-full bg-qc-surface-hover rounded-2xl border border-qc-border px-10 py-3 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <button data-testid="new-chat-create-group-button" onClick={() => { setChatFilter('groups'); onViewChange('chats'); }} className="rounded-2xl border border-qc-border bg-qc-surface-hover p-3 text-left hover:bg-qc-accent-tertiary transition-colors">
            <p className="text-[11px] uppercase tracking-[0.2em] text-qc-text-tertiary">Quick action</p>
            <p className="font-medium text-qc-text-primary mt-1">Create group</p>
          </button>
          <button data-testid="new-chat-post-story-button" onClick={() => onViewChange('feed')} className="rounded-2xl border border-qc-border bg-qc-surface-hover p-3 text-left hover:bg-qc-accent-tertiary transition-colors">
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
              data-testid={`new-chat-person-${person.id}`}
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

  const renderSavedSpace = () => (
    <div className="absolute inset-0 z-30 bg-qc-surface flex flex-col animate-slideIn">
      <div className="px-4 py-4 border-b border-qc-border flex items-center gap-3 bg-qc-surface-hover">
        <button data-testid="saved-space-back-button" onClick={() => onViewChange('chats')} className="w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-qc-surface">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-qc-text-tertiary">Saved space</p>
          <h3 className="font-heading text-xl text-qc-text-primary">Saved messages</h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {savedMessages.length === 0 ? (
          <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4 text-sm text-qc-text-secondary">
            Save a message from any chat menu and it will appear here.
          </div>
        ) : savedMessages.map((item) => {
          const linkedConversation = conversations.find((conv) => conv.id === item.conversation_id);
          return (
            <button
              key={item.id}
              data-testid={`saved-message-${item.id}`}
              onClick={() => {
                if (linkedConversation) {
                  onSelectConv(linkedConversation);
                  onViewChange('chats');
                }
              }}
              className="w-full rounded-[24px] border border-qc-border bg-qc-surface-hover p-4 text-left hover:bg-qc-accent-tertiary transition-colors"
            >
              <div className="text-[11px] uppercase tracking-[0.2em] text-qc-text-tertiary">{linkedConversation?.name || linkedConversation?.other_user?.name || 'Saved message'}</div>
              <div className="mt-2 text-sm text-qc-text-primary line-clamp-3">{item.message?.content || 'Saved message'}</div>
              <div className="mt-3 text-xs text-qc-text-secondary">Tap to jump back into the conversation</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (view === 'newChat') {
    return renderNewChat();
  }

  if (view === 'saved') {
    return renderSavedSpace();
  }

  return (
    <div className="flex flex-col h-full bg-qc-surface w-full overflow-hidden relative">
      <div className="flex-1 min-h-0">{renderChats()}</div>

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

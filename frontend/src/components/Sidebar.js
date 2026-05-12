import React from 'react';
import { MessageSquare, Search, Settings, LogOut, User, Users, Radio, Contact } from 'lucide-react';

export default function Sidebar({ view, setView, user, logout }) {
  const items = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'contacts', icon: Contact, label: 'Contacts' },
    { id: 'groups', icon: Users, label: 'Groups' },
    { id: 'stories', icon: Radio, label: 'Stories' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div
      data-testid="sidebar"
      className="w-[68px] flex-shrink-0 flex flex-col items-center py-5 gap-2 relative z-20"
      style={{ background: 'linear-gradient(180deg,#0a0c13 0%,#070810 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div
        data-testid="sidebar-logo"
        className="w-10 h-10 rounded-[14px] flex items-center justify-center mb-4 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#4f8cff,#a259ff)', boxShadow: '0 4px 20px rgba(79,140,255,0.35)' }}
      >
        <span className="font-black text-white text-lg leading-none">Q</span>
      </div>

      <div className="flex-1 flex flex-col items-center gap-1 w-full px-3">
        {items.map(({ id, icon: Icon, label }) => {
          const active = view === id;
          return (
            <button
              key={id}
              data-testid={`sidebar-${id}-btn`}
              onClick={() => setView(id)}
              title={label}
              style={active ? {
                background: 'linear-gradient(135deg,rgba(79,140,255,0.22),rgba(79,140,255,0.10))',
                borderColor: 'rgba(79,140,255,0.35)',
                color: '#4f8cff',
                boxShadow: '0 0 18px rgba(79,140,255,0.18)',
              } : {
                background: 'transparent',
                borderColor: 'transparent',
                color: 'rgba(255,255,255,0.38)',
              }}
              className="w-11 h-11 rounded-[14px] border flex items-center justify-center transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white/70"
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-2 px-3 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          data-testid="sidebar-user-avatar"
          onClick={() => setView('profile')}
          title="Profile"
          className="w-10 h-10 rounded-[14px] overflow-hidden flex items-center justify-center cursor-pointer"
          style={{ background: 'linear-gradient(135deg,#1e2030,#12141f)', border: '1.5px solid rgba(255,255,255,0.10)' }}
        >
          {user?.avatar
            ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            : <User size={18} style={{ color: 'rgba(255,255,255,0.5)' }} />
          }
        </div>

        <button
          data-testid="sidebar-logout-btn"
          onClick={logout}
          title="Logout"
          className="w-10 h-10 rounded-[14px] flex items-center justify-center transition-all hover:bg-red-500/20"
          style={{ color: 'rgba(255,80,80,0.7)', border: '1.5px solid rgba(255,80,80,0.18)' }}
        >
          <LogOut size={17} />
        </button>
      </div>
    </div>
  );
}

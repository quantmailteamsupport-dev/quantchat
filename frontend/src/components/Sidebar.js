import React from 'react';
import { MessageSquare, Search, Settings, LogOut, User, Users, Radio, Contact, Moon, Sun } from 'lucide-react';

export default function Sidebar({ view, setView, user, logout, darkMode, toggleTheme }) {
  const items = [
    { id: 'chats', icon: MessageSquare, label: 'CHATS' },
    { id: 'contacts', icon: Contact, label: 'CONTACTS' },
    { id: 'groups', icon: Users, label: 'GROUPS' },
    { id: 'stories', icon: Radio, label: 'STORIES' },
    { id: 'search', icon: Search, label: 'SEARCH' },
    { id: 'settings', icon: Settings, label: 'SETTINGS' },
  ];

  return (
    <div data-testid="sidebar" className="w-20 bg-qc-surface border-r-2 border-qc-border flex flex-col items-center py-6 flex-shrink-0 relative z-20">
      <div data-testid="sidebar-logo" className="w-12 h-12 bg-qc-accent-primary border-2 border-qc-border shadow-brutal flex items-center justify-center mb-8">
        <span className="font-heading font-black text-qc-text-primary text-2xl">Q</span>
      </div>
      
      <div className="flex-1 flex flex-col items-center gap-4 w-full px-2">
        {items.map(({ id, icon: Icon, label }) => (
          <button key={id} data-testid={`sidebar-${id}-btn`} onClick={() => setView(id)}
            className={`w-12 h-12 flex items-center justify-center border-2 border-qc-border transition-all ${
              view === id 
              ? 'bg-qc-accent-secondary shadow-brutal translate-y-[-2px] translate-x-[-2px]' 
              : 'bg-qc-bg hover:bg-qc-accent-tertiary hover:shadow-brutal hover:translate-y-[-2px] hover:translate-x-[-2px]'
            }`}
            title={label}>
            <Icon size={22} className="text-qc-text-primary" />
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 w-full px-2 mt-4 pt-4 border-t-2 border-qc-border">
        <button onClick={toggleTheme} className="w-12 h-12 flex items-center justify-center border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-primary hover:shadow-brutal transition-all" title="Toggle Theme">
          {darkMode ? <Sun size={20} className="text-qc-text-primary" /> : <Moon size={20} className="text-qc-text-primary" />}
        </button>

        <div data-testid="sidebar-user-avatar" className="w-12 h-12 overflow-hidden border-2 border-qc-border bg-qc-bg flex items-center justify-center">
          {user?.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover grayscale contrast-125" /> : <User size={20} className="text-qc-text-primary" />}
        </div>

        <button data-testid="sidebar-logout-btn" onClick={logout} className="w-12 h-12 flex items-center justify-center border-2 border-qc-border bg-[#FF3333] hover:shadow-brutal hover:translate-y-[-2px] hover:translate-x-[-2px] transition-all" title="Logout">
          <LogOut size={20} className="text-white" />
        </button>
      </div>
    </div>
  );
}

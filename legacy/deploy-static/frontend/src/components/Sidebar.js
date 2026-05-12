import React from 'react';
import { MessageSquare, Search, Settings, LogOut, User } from 'lucide-react';

export default function Sidebar({ view, setView, user, logout }) {
  const items = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div data-testid="sidebar" className="w-16 bg-qc-bg border-r border-qc-border flex flex-col items-center py-4 flex-shrink-0 hidden sm:flex">
      {/* Logo */}
      <div data-testid="sidebar-logo" className="w-9 h-9 bg-qc-accent flex items-center justify-center mb-8">
        <span className="font-heading font-black text-white text-lg">Q</span>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col items-center gap-1">
        {items.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            data-testid={`sidebar-${id}-btn`}
            onClick={() => setView(id)}
            className={`w-10 h-10 flex items-center justify-center transition-colors duration-150 ${
              view === id
                ? 'bg-qc-elevated text-qc-accent'
                : 'text-qc-text-secondary hover:text-white hover:bg-qc-elevated'
            }`}
            title={label}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>

      {/* User avatar & logout */}
      <div className="flex flex-col items-center gap-2">
        <div data-testid="sidebar-user-avatar" className="w-8 h-8 rounded-md overflow-hidden bg-qc-elevated flex items-center justify-center">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <User size={16} className="text-qc-text-secondary" />
          )}
        </div>
        <button
          data-testid="sidebar-logout-btn"
          onClick={logout}
          className="w-10 h-10 flex items-center justify-center text-qc-text-tertiary hover:text-qc-error transition-colors duration-150"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}

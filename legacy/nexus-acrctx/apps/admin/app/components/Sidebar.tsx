"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Cpu,
  Users,
  Menu,
  X,
  Radio,
  Activity,
} from "lucide-react";

const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/nodes", label: "Active Nodes", icon: Cpu },
  { href: "/users", label: "User Matrix", icon: Users },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile hamburger */}
      <button
        aria-label="Toggle navigation"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 glass-panel rounded-lg border border-white/10"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <X size={20} className="text-white" />
        ) : (
          <Menu size={20} className="text-white" />
        )}
      </button>

      {/* Sidebar panel */}
      <aside
        className={[
          "fixed top-0 left-0 z-40 h-screen w-64 flex flex-col",
          "glass-panel border-r border-white/10",
          "transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Brand */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Radio size={20} className="text-[var(--color-neon-blue)]" />
            <span className="text-lg font-black uppercase tracking-widest text-[var(--color-neon-blue)] neon-text">
              Nexus
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono">Admin Override v2</p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={[
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all",
                  active
                    ? "bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)] border border-[var(--color-neon-blue)]/30 neon-text"
                    : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent",
                ].join(" ")}
              >
                <Icon size={16} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* System status footer */}
        <div className="p-4 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2 px-2">
            <Activity size={14} className="text-green-400" />
            <span className="text-xs font-mono text-gray-400">Telemetry Stream Active</span>
          </div>
          <div className="flex items-center gap-2 px-2">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-xs font-mono text-gray-500">DB status shown on dashboard</span>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}

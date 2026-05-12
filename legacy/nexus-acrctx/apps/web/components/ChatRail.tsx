"use client";
import React from "react";
import { Icon, Avatar } from "./qc-shared";

export default function ChatRail({ activeId }: { activeId?: string }) {
  return (
    <aside style={{
      borderRight: "1px solid var(--qc-line)",
      background: "var(--qc-bg-2)",
      display: "flex", flexDirection: "column",
      padding: "14px 14px 16px",
      gap: 18, minHeight: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="logo" size={26}/>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: "-0.02em" }}>QuantChat</div>
          <div style={{ fontSize: 10, color: "var(--qc-ink-3)", fontFamily: "var(--qc-font-mono)" }}>infinity-trinity ▸ desk</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[
          { id: "chats",    label: "Chats",         icon: "users",    badge: 4, active: true },
          { id: "calls",    label: "Calls",         icon: "phone" },
          { id: "vault",    label: "Vault",         icon: "shield" },
          { id: "devices",  label: "Devices",       icon: "device-phone", badge: "1" },
          { id: "settings", label: "Settings",      icon: "settings" },
        ].map(item => (
          <button key={item.id} className="qc-btn qc-btn-ghost" style={{
            justifyContent: "flex-start", width: "100%",
            background: item.active ? "var(--qc-bg-3)" : "transparent",
            color: item.active ? "var(--qc-ink)" : "var(--qc-ink-2)",
            fontWeight: item.active ? 600 : 500,
            padding: "7px 10px",
          }}>
            <Icon name={item.icon} size={14}/>
            <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>
            {item.badge && <span style={{
              background: item.id === "devices" ? "var(--qc-warn-bg)" : "var(--qc-bg)",
              color: item.id === "devices" ? "var(--qc-warn)" : "var(--qc-ink-3)",
              border: `1px solid ${item.id === "devices" ? "oklch(from var(--qc-warn) 0.85 0.08 h)" : "var(--qc-line)"}`,
              borderRadius: 999, fontSize: 9.5, fontWeight: 700,
              padding: "1px 6px", letterSpacing: "0.02em",
            }}>{item.badge}</span>}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{
          padding: 10, border: "1px solid var(--qc-line)", borderRadius: 8,
          background: "var(--qc-bg)",
          fontSize: 11, color: "var(--qc-ink-2)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--qc-accent-ink)", fontWeight: 600 }}>
              <Icon name="shield-check" size={12}/> Secure
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--qc-ink-3)" }}>p95 84ms</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--qc-ink-3)", lineHeight: 1.4 }}>
            E2EE · 2 keys verified · session bridge OK
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name="You Alvarez" size={28}/>
          <div style={{ flex: 1, fontSize: 12, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600 }}>You Alvarez</div>
            <div style={{ color: "var(--qc-ink-3)", fontSize: 10 }} className="mono">@you · vol-desk</div>
          </div>
          <button className="qc-btn qc-btn-ghost" style={{ padding: 6 }}><Icon name="more" size={14}/></button>
        </div>
      </div>
    </aside>
  );
}

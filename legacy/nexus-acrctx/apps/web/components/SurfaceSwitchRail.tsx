"use client";

import Link from "next/link";

export type SurfaceKey = "chat" | "channels" | "feed" | "call";

interface SurfaceSwitchRailProps {
  active: SurfaceKey;
  callHref: string;
  channelHref?: string;
  compact?: boolean;
}

interface SurfaceItem {
  key: SurfaceKey;
  label: string;
  href: string;
}

export default function SurfaceSwitchRail({
  active,
  callHref,
  channelHref = "/channels/family",
  compact = false,
}: SurfaceSwitchRailProps) {
  const items: SurfaceItem[] = [
    { key: "chat", label: "Chat", href: "/chat" },
    { key: "channels", label: "Channels", href: channelHref },
    { key: "feed", label: "Feed", href: "/feed" },
    { key: "call", label: "Call", href: callHref },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: compact ? 6 : 8,
        overflowX: "auto",
        scrollbarWidth: "none",
        paddingBottom: 1,
      }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link key={item.key} href={item.href} style={{ textDecoration: "none", flexShrink: 0 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                padding: compact ? "5px 10px" : "6px 11px",
                border: isActive ? "1px solid rgba(0,168,132,0.72)" : "1px solid rgba(255,255,255,0.14)",
                background: isActive ? "rgba(0,168,132,0.22)" : "rgba(17,27,33,0.72)",
                color: isActive ? "#d9fff4" : "#aebac1",
                fontSize: compact ? 11 : 11.5,
                fontWeight: isActive ? 700 : 600,
                fontFamily: "-apple-system, sans-serif",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

"use client";
import React from "react";

// ─── Icons (hand-tuned strokes, all single-stroke geometric) ───
export const Icon = ({ name, size = 16, stroke = 1.6, ...rest }: any) => {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: stroke,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    ...rest,
  };
  switch (name) {
    case "search":      return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/></svg>;
    case "send":        return <svg {...common}><path d="M5 12l14-7-5 16-3-7-6-2z"/></svg>;
    case "plus":        return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "lock":        return <svg {...common}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>;
    case "shield":      return <svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>;
    case "shield-check":return <svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>;
    case "phone":       return <svg {...common}><path d="M5 4h3l2 5-2 1a11 11 0 006 6l1-2 5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg>;
    case "video":       return <svg {...common}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>;
    case "mic":         return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 19v3"/></svg>;
    case "mic-off":     return <svg {...common}><path d="M3 3l18 18"/><path d="M9 9v2a3 3 0 005.5 1.7M15 11V6a3 3 0 00-6 0"/><path d="M5 11a7 7 0 0011 5.5"/></svg>;
    case "video-off":   return <svg {...common}><path d="M3 3l18 18"/><path d="M16 16H5a2 2 0 01-2-2V8M16 8V7a1 1 0 011-1h.5L21 4v12"/></svg>;
    case "settings":    return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1A2 2 0 114.2 17l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8L4.2 7A2 2 0 117 4.2l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3L17 4.2A2 2 0 1119.8 7l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>;
    case "more":        return <svg {...common}><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>;
    case "check":       return <svg {...common}><path d="M5 12l5 5L20 7"/></svg>;
    case "check-double":return <svg {...common}><path d="M2 12l5 5L17 7M11 17L21 7"/></svg>;
    case "x":           return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "device-phone":return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="18" r="0.8"/></svg>;
    case "device-laptop":return <svg {...common}><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>;
    case "device-tablet":return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="18" r="0.8"/></svg>;
    case "device-watch":return <svg {...common}><rect x="7" y="6" width="10" height="12" rx="2"/><path d="M9 6V3h6v3M9 18v3h6v-3"/></svg>;
    case "qr":          return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3M14 17v4M17 17h2v2M21 14v3M19 21h2"/></svg>;
    case "key":         return <svg {...common}><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8 2 2-2 2 2 2-2 2-2-2-2 2"/></svg>;
    case "sparkle":     return <svg {...common}><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M19 16l.6 1.6L21 18l-1.4.4L19 20l-.6-1.6L17 18l1.4-.4z"/></svg>;
    case "hash":        return <svg {...common}><path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/></svg>;
    case "users":       return <svg {...common}><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0112 0M16 11a3 3 0 100-6M21 20a5 5 0 00-4-5"/></svg>;
    case "user":        return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>;
    case "bell":        return <svg {...common}><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 004 0"/></svg>;
    case "trash":       return <svg {...common}><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/></svg>;
    case "alert":       return <svg {...common}><path d="M12 4l10 17H2L12 4z"/><path d="M12 10v5M12 18v0.5"/></svg>;
    case "info":        return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v0.5M11.5 11.5h0.5V16h0.5"/></svg>;
    case "wifi":        return <svg {...common}><path d="M2 9a16 16 0 0120 0M5 13a10 10 0 0114 0M8.5 16.5a5 5 0 017 0"/><circle cx="12" cy="20" r="0.8" fill="currentColor"/></svg>;
    case "wifi-off":    return <svg {...common}><path d="M3 3l18 18"/><path d="M2 9a16 16 0 0114-4M22 9a16 16 0 00-3-2M5 13a10 10 0 0110-2M8.5 16.5a5 5 0 015-1.5"/></svg>;
    case "globe":       return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18"/></svg>;
    case "paperclip":   return <svg {...common}><path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8"/></svg>;
    case "smile":       return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9 14a4 4 0 006 0M9 9.5v.5M15 9.5v.5"/></svg>;
    case "edit":        return <svg {...common}><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>;
    case "chevron-r":   return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case "chevron-d":   return <svg {...common}><path d="M6 9l6 6 6-6"/></svg>;
    case "arrow-left":  return <svg {...common}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
    case "fingerprint": return <svg {...common}><path d="M5 13a7 7 0 0114 0v1M8 17a9 9 0 008 0M12 9v6a3 3 0 003 3M9 21c-1-2-1-4-1-6"/></svg>;
    case "logo":        return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--qc-accent)"/>
        <path d="M6 12.5l3.5 3.5L18 7.5" stroke="var(--qc-accent-fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="17.5" cy="17.5" r="2.5" fill="var(--qc-accent-fg)"/>
        <circle cx="17.5" cy="17.5" r="1" fill="var(--qc-accent)"/>
      </svg>
    );
    default: return null;
  }
};

export function hashHue(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export { ContactAvatar as Avatar };

export function ContactAvatar({ contact, size = 32 }: { contact: any; size?: number }) {
  const initials = contact.avatarLetter || contact.name?.[0]?.toUpperCase() || "?";
  const hue = contact.avatarHue ?? hashHue(contact.id || contact.name || "");
  const isBot = contact.isBot;
  return (
    <span
      className={`qc-avatar ${isBot ? "qc-avatar-bot" : ""}`}
      style={{
        width: size, height: size, fontSize: Math.max(9, size * 0.36),
        background: isBot ? undefined : `oklch(0.92 0.03 ${hue})`,
        color: isBot ? undefined : `oklch(0.30 0.06 ${hue})`,
        borderColor: isBot ? undefined : `oklch(0.86 0.05 ${hue})`,
      }}
    >{isBot ? "AI" : initials}</span>
  );
}

export function Pill({ children, tone = "default", mono = false, icon }: any) {
  const cls = `qc-pill ${tone === "accent" ? "qc-pill-accent" : tone === "warn" ? "qc-pill-warn" : ""} ${mono ? "qc-pill-mono" : ""}`;
  return <span className={cls}>{icon}{children}</span>;
}

export function Switch({ checked, onChange }: any) {
  return (
    <button className="qc-switch" aria-checked={checked} onClick={() => onChange?.(!checked)} role="switch"/>
  );
}

export function Segmented({ value, onChange, options }: any) {
  return (
    <div className="qc-seg">
      {options.map((o: any) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button key={v} aria-pressed={value === v} onClick={() => onChange?.(v)}>{l}</button>
        );
      })}
    </div>
  );
}

export function Btn({ variant = "default", size, children, icon, iconRight, ...rest }: any) {
  const cls = `qc-btn ${variant === "primary" ? "qc-btn-primary" : variant === "danger" ? "qc-btn-danger" : variant === "ghost" ? "qc-btn-ghost" : ""} ${size === "sm" ? "qc-btn-sm" : ""}`;
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 12 : 14}/>}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 12 : 14}/>}
    </button>
  );
}

export function Card({ title, subtitle, action, children, style }: any) {
  return (
    <section className="qc-card" style={style}>
      {(title || action) && (
        <header className="qc-card-h">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Receipt({ state }: any) {
  const map: any = {
    queued:    { name: "check", color: "var(--qc-ink-4)", title: "Queued" },
    sent:      { name: "check", color: "var(--qc-ink-3)", title: "Sent" },
    delivered: { name: "check-double", color: "var(--qc-ink-3)", title: "Delivered" },
    read:      { name: "check-double", color: "var(--qc-accent)", title: "Read" },
    failed:    { name: "alert", color: "var(--qc-warn)", title: "Failed" },
  };
  const c = map[state] || map.sent;
  return <span title={c.title} style={{ color: c.color, display: "inline-flex" }}><Icon name={c.name} size={12}/></span>;
}

export function LockBadge({ children = "E2EE", title }: any) {
  return (
    <span className="qc-lock" title={title}>
      <Icon name="lock" size={10} stroke={2}/> {children}
    </span>
  );
}

export function SectionHead({ children, action }: any) {
  return (
    <div className="qc-section-h">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function FingerprintGrid({ seed = "qc", size = 5, cell = 6 }: any) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < Math.ceil(size / 2); x++) {
      h = Math.imul(h ^ (h >>> 13), 2654435761);
      const on = (h & 7) > 2;
      cells.push({ x, y, on });
      if (x !== size - 1 - x) cells.push({ x: size - 1 - x, y, on });
    }
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${size}, ${cell}px)`,
      gap: 1, width: "fit-content",
    }}>
      {cells.map((c, i) =>
        <span key={i} style={{
          width: cell, height: cell, borderRadius: 1,
          background: c.on ? "var(--qc-accent)" : "var(--qc-line-soft)",
        }}/>
      )}
    </div>
  );
}

export function makeCode(seed: string, groups = 6, len = 4) {
  let h = 5381 >>> 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0; }
  const out = [];
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let i = 0; i < len; i++) {
      h = Math.imul(h ^ (h >>> 13), 2654435761);
      s += "0123456789ABCDEF"[(h >>> (i * 4)) & 15];
    }
    out.push(s);
  }
  return out.join(" ");
}

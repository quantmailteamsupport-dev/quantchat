import Link from "next/link";

const metrics: Array<[string, string]> = [
  ["<140ms", "Realtime median delivery target"],
  ["E2EE", "Device-keyed conversations"],
  ["24/7", "Health endpoints and ops visibility"],
];

const capabilities = [
  "Biometric trust checks",
  "Disappearing messages",
  "Voice rooms and calls",
  "Admin telemetry",
];

const features = [
  {
    id: "e2ee",
    icon: "🔐",
    title: "End-to-End Encrypted",
    description:
      "Every message is encrypted on-device with keys that never leave your hardware. Zero server-side plaintext — ever.",
  },
  {
    id: "fast-delivery",
    icon: "⚡",
    title: "Fast Delivery",
    description:
      "Sub-140 ms median delivery over a globally distributed relay network. Realtime feel with none of the compromise.",
  },
  {
    id: "cross-device",
    icon: "📱",
    title: "Cross-Device Sync",
    description:
      "Your encrypted history follows you across trusted devices via secure key-linking — no plaintext ever leaves your mesh.",
  },
];

export default function Home() {
  return (
    <main data-testid="quantchat-home-page" className="qc-home-page">
      <nav data-testid="quantchat-home-nav" className="qc-home-nav">
        <Link data-testid="quantchat-home-brand-link" href="/" style={{ display: "flex", alignItems: "center", gap: 12, color: "#09090b", textDecoration: "none" }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, display: "grid", placeItems: "center", background: "#002FA7", color: "white", fontFamily: "var(--qc-font-mono)", fontWeight: 800 }}>Q</span>
          <span className="qc-display" style={{ fontSize: 24, fontWeight: 900 }}>QuantChat</span>
        </Link>
        <div data-testid="quantchat-home-nav-actions" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link data-testid="quantchat-home-docs-link" className="qc-home-secondary-link" href="/workspace">Workspace</Link>
          <Link data-testid="quantchat-home-login-link" className="qc-home-primary-link" href="/login">Sign in</Link>
        </div>
      </nav>

      <section data-testid="quantchat-home-hero" className="qc-home-shell qc-home-grid">
        <div className="qc-home-panel" style={{ minHeight: 560, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <p data-testid="quantchat-home-kicker" className="mono" style={{ color: "#002FA7", fontSize: 12, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", margin: 0 }}>
              Secure communications control room
            </p>
            <h1 data-testid="quantchat-home-title" className="qc-display" style={{ fontSize: "clamp(52px, 8vw, 104px)", lineHeight: 0.88, fontWeight: 900, margin: "26px 0 28px", maxWidth: 950 }}>
              Private chat with operational certainty.
            </h1>
            <p data-testid="quantchat-home-description" style={{ maxWidth: 720, color: "#52525B", fontSize: 18, lineHeight: 1.75, margin: 0 }}>
              QuantChat combines realtime messaging, trusted-device identity, disappearing conversations, voice collaboration, and production-grade telemetry for teams that cannot afford noisy tools.
            </p>
          </div>
          <div data-testid="quantchat-home-actions" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 34 }}>
            <Link data-testid="quantchat-home-open-chat-link" className="qc-home-primary-link" href="/chat">Open secure chat</Link>
            <Link data-testid="quantchat-home-view-settings-link" className="qc-home-secondary-link" href="/settings/key-verification">Verify trust model</Link>
          </div>
        </div>

        <aside data-testid="quantchat-home-control-panel" className="qc-home-panel" style={{ display: "grid", gap: 18, alignContent: "start", background: "#F8F9FA" }}>
          <div data-testid="quantchat-home-live-status" style={{ border: "1px solid rgba(9,9,11,.12)", background: "#fff", padding: 20 }}>
            <div className="mono" style={{ color: "#002FA7", fontSize: 11, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase" }}>Live system posture</div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginTop: 16 }}>
              <strong className="qc-display" style={{ fontSize: 52, lineHeight: 1 }}>99.99</strong>
              <span style={{ color: "#00C853", fontWeight: 800 }}>READY</span>
            </div>
          </div>

          {metrics.map(([value, label]) => (
            <div data-testid={`quantchat-home-metric-${value.replace(/[^a-z0-9]/gi, "").toLowerCase()}`} className="qc-home-kpi" key={value}>
              <strong className="qc-display" style={{ display: "block", fontSize: 34, lineHeight: 1 }}>{value}</strong>
              <span style={{ color: "#52525B", fontSize: 14 }}>{label}</span>
            </div>
          ))}

          <div data-testid="quantchat-home-capabilities" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            {capabilities.map((item) => (
              <span data-testid={`quantchat-capability-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={item} className="mono" style={{ border: "1px solid rgba(0,47,167,.18)", background: "rgba(0,47,167,.06)", color: "#002FA7", padding: "10px 12px", fontSize: 11, fontWeight: 800 }}>
                {item}
              </span>
            ))}
          </div>
        </aside>
      </section>

      {/* ── Features section ── */}
      <section
        data-testid="quantchat-home-features"
        style={{
          padding: "clamp(40px, 6vw, 80px) clamp(20px, 5vw, 72px)",
          borderTop: "1px solid rgba(9,9,11,0.1)",
        }}
      >
        <h2
          className="qc-display"
          style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, margin: "0 0 40px", textAlign: "center" }}
        >
          Built for teams that demand more
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {features.map((f) => (
            <div
              key={f.id}
              data-testid={`quantchat-feature-${f.id}`}
              style={{
                background: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(9,9,11,0.12)",
                padding: "28px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
              }}
              className="qc-home-panel"
            >
              <span style={{ fontSize: 32 }} aria-hidden="true">{f.icon}</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#09090b" }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "#52525B" }}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        data-testid="quantchat-home-footer"
        style={{
          borderTop: "1px solid rgba(9,9,11,0.1)",
          padding: "28px clamp(20px, 5vw, 72px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          background: "rgba(255,255,255,0.72)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, color: "#09090b", textDecoration: "none", fontWeight: 700 }}>
          <span aria-hidden="true" style={{ width: 26, height: 26, display: "grid", placeItems: "center", background: "#002FA7", color: "white", fontFamily: "var(--qc-font-mono)", fontWeight: 800, fontSize: 13 }}>Q</span>
          QuantChat
        </span>
        <p style={{ margin: 0, fontSize: 12, color: "#71717A" }}>
          &copy; {new Date().getFullYear()} QuantChat. Secure by design.
        </p>
      </footer>
    </main>
  );
}

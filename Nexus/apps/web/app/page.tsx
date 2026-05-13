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
  {
    id: "voice-rooms",
    icon: "🎙️",
    title: "Voice Rooms",
    description:
      "Crystal-clear encrypted voice collaboration with spatial audio, push-to-talk mode, and noise suppression built in.",
  },
  {
    id: "admin-telemetry",
    icon: "📊",
    title: "Admin Telemetry",
    description:
      "Real-time visibility into message delivery, latency heatmaps, and security events — all without reading message content.",
  },
  {
    id: "disappearing",
    icon: "💨",
    title: "Disappearing Messages",
    description:
      "Set auto-expiry per conversation or globally. Keys are destroyed server-side, messages vanish from all devices simultaneously.",
  },
];

const steps = [
  {
    number: "01",
    title: "Sign in securely",
    description: "Authenticate with your Google workspace account. QuantChat creates a device-bound key pair on first sign-in.",
  },
  {
    number: "02",
    title: "Create your workspace",
    description: "Invite trusted team members, set conversation policies, and configure disappearing-message timers per channel.",
  },
  {
    number: "03",
    title: "Communicate with certainty",
    description: "Messages, voice calls, and file transfers are E2EE. The server relays ciphertext — it never sees your content.",
  },
];

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "For individuals and small teams",
    cta: "Get started",
    ctaHref: "/login",
    primary: false,
    perks: [
      "Up to 5 workspace members",
      "10 000 messages / month",
      "7-day message history",
      "Standard E2EE encryption",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    period: "per seat / mo",
    tagline: "For growing teams with real security needs",
    cta: "Start free trial",
    ctaHref: "/login",
    primary: true,
    perks: [
      "Unlimited workspace members",
      "Unlimited message history",
      "Voice rooms & calls",
      "Admin telemetry dashboard",
      "Disappearing messages",
      "Priority support (24 h SLA)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "billed annually",
    tagline: "For regulated industries and large orgs",
    cta: "Contact sales",
    ctaHref: "mailto:sales@quantchat.app",
    primary: false,
    perks: [
      "Everything in Pro",
      "On-premise / VPC deployment",
      "SAML / SSO integration",
      "Custom data-retention policy",
      "Dedicated success manager",
      "99.99% uptime SLA",
    ],
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
        <div data-testid="quantchat-home-nav-actions" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <a href="#how-it-works" style={{ color: "#52525B", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>How it works</a>
          <a href="#pricing" style={{ color: "#52525B", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>Pricing</a>
          <Link data-testid="quantchat-home-docs-link" className="qc-home-secondary-link" href="/workspace">Workspace</Link>
          <Link data-testid="quantchat-home-login-link" className="qc-home-primary-link" href="/login">Sign in</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
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
            <Link data-testid="quantchat-home-open-chat-link" className="qc-home-primary-link" href="/login">Start for free</Link>
            <a href="#how-it-works" className="qc-home-secondary-link">See how it works</a>
          </div>
        </div>

        <aside data-testid="quantchat-home-control-panel" className="qc-home-panel" style={{ display: "grid", gap: 18, alignContent: "start", background: "#F8F9FA" }}>
          <div data-testid="quantchat-home-live-status" style={{ border: "1px solid rgba(9,9,11,.12)", background: "#fff", padding: 20 }}>
            <div className="mono" style={{ color: "#002FA7", fontSize: 11, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase" }}>Live system posture</div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginTop: 16 }}>
              <strong className="qc-display" style={{ fontSize: 52, lineHeight: 1 }}>99.99</strong>
              <span style={{ color: "#00C853", fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00C853", display: "inline-block", animation: "pulse 2s infinite" }} />
                READY
              </span>
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

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        data-testid="quantchat-home-how-it-works"
        style={{
          padding: "clamp(40px, 6vw, 96px) clamp(20px, 5vw, 72px)",
          borderTop: "1px solid rgba(9,9,11,0.1)",
          background: "#F8F9FA",
        }}
      >
        <p className="mono" style={{ color: "#002FA7", fontSize: 11, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", textAlign: "center", margin: "0 0 14px" }}>
          Simple to start
        </p>
        <h2
          className="qc-display"
          style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, margin: "0 0 56px", textAlign: "center" }}
        >
          Up and running in 60 seconds
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 32,
            position: "relative",
          }}
        >
          {steps.map((step, i) => (
            <div
              key={step.number}
              data-testid={`quantchat-step-${i + 1}`}
              style={{
                background: "#fff",
                border: "1px solid rgba(9,9,11,0.12)",
                padding: "32px 28px",
                position: "relative",
              }}
            >
              <div className="mono" style={{ fontSize: 48, fontWeight: 900, color: "rgba(0,47,167,0.12)", lineHeight: 1, marginBottom: 16 }}>
                {step.number}
              </div>
              <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: "#09090b" }}>{step.title}</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: "#52525B" }}>{step.description}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 48 }}>
          <Link className="qc-home-primary-link" href="/login">Get started free →</Link>
        </div>
      </section>

      {/* ── Features section ── */}
      <section
        data-testid="quantchat-home-features"
        style={{
          padding: "clamp(40px, 6vw, 96px) clamp(20px, 5vw, 72px)",
          borderTop: "1px solid rgba(9,9,11,0.1)",
        }}
      >
        <p className="mono" style={{ color: "#002FA7", fontSize: 11, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", textAlign: "center", margin: "0 0 14px" }}>
          Platform capabilities
        </p>
        <h2
          className="qc-display"
          style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, margin: "0 0 48px", textAlign: "center" }}
        >
          Built for teams that demand more
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
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

      {/* ── Pricing ── */}
      <section
        id="pricing"
        data-testid="quantchat-home-pricing"
        style={{
          padding: "clamp(40px, 6vw, 96px) clamp(20px, 5vw, 72px)",
          borderTop: "1px solid rgba(9,9,11,0.1)",
          background: "#F8F9FA",
        }}
      >
        <p className="mono" style={{ color: "#002FA7", fontSize: 11, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", textAlign: "center", margin: "0 0 14px" }}>
          Transparent pricing
        </p>
        <h2
          className="qc-display"
          style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 900, margin: "0 0 12px", textAlign: "center" }}
        >
          Start free. Scale on your terms.
        </h2>
        <p style={{ textAlign: "center", color: "#52525B", fontSize: 16, margin: "0 0 56px", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          No data harvesting, no ads. You pay for compute — nothing else.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
            maxWidth: 1080,
            margin: "0 auto",
          }}
        >
          {plans.map((plan) => (
            <div
              key={plan.id}
              data-testid={`quantchat-plan-${plan.id}`}
              style={{
                background: plan.primary ? "#002FA7" : "#fff",
                border: plan.primary ? "2px solid #002FA7" : "1px solid rgba(9,9,11,0.12)",
                padding: "36px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                position: "relative",
              }}
            >
              {plan.primary && (
                <div
                  className="mono"
                  style={{
                    position: "absolute",
                    top: -14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#002FA7",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    padding: "4px 14px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Most popular
                </div>
              )}

              <div>
                <p className="mono" style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", margin: "0 0 8px", color: plan.primary ? "rgba(255,255,255,0.6)" : "#52525B" }}>
                  {plan.name}
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <strong className="qc-display" style={{ fontSize: 48, lineHeight: 1, color: plan.primary ? "#fff" : "#09090b" }}>{plan.price}</strong>
                  <span style={{ fontSize: 13, color: plan.primary ? "rgba(255,255,255,0.6)" : "#71717A" }}>{plan.period}</span>
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: plan.primary ? "rgba(255,255,255,0.75)" : "#52525B" }}>{plan.tagline}</p>
              </div>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {plan.perks.map((perk) => (
                  <li key={perk} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: plan.primary ? "rgba(255,255,255,0.9)" : "#52525B" }}>
                    <span style={{ color: plan.primary ? "#7BC8A4" : "#00C853", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>✓</span>
                    {perk}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                data-testid={`quantchat-plan-cta-${plan.id}`}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "13px 0",
                  fontWeight: 800,
                  fontSize: 14,
                  textDecoration: "none",
                  marginTop: "auto",
                  ...(plan.primary
                    ? { background: "#fff", color: "#002FA7", border: "2px solid #fff" }
                    : { background: "transparent", color: "#002FA7", border: "2px solid #002FA7" }),
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust bar ── */}
      <section
        data-testid="quantchat-home-trust"
        style={{
          borderTop: "1px solid rgba(9,9,11,0.1)",
          padding: "clamp(28px, 4vw, 48px) clamp(20px, 5vw, 72px)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px 48px",
        }}
      >
        {[
          ["SOC 2", "Type II compliant"],
          ["GDPR", "Data residency controls"],
          ["HIPAA", "Ready architecture"],
          ["ISO 27001", "Security framework"],
        ].map(([badge, label]) => (
          <div key={badge} style={{ textAlign: "center" }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 900, color: "#09090b", letterSpacing: ".08em" }}>{badge}</div>
            <div style={{ fontSize: 11, color: "#71717A", marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer
        data-testid="quantchat-home-footer"
        style={{
          borderTop: "1px solid rgba(9,9,11,0.1)",
          padding: "36px clamp(20px, 5vw, 72px)",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: "16px 32px",
          background: "#09090b",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", textDecoration: "none", fontWeight: 700 }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, display: "grid", placeItems: "center", background: "#002FA7", color: "white", fontFamily: "var(--qc-font-mono)", fontWeight: 800, fontSize: 13 }}>Q</span>
          <span className="qc-display" style={{ fontSize: 18 }}>QuantChat</span>
        </span>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            ["Chat", "/chat"],
            ["Workspace", "/workspace"],
            ["Settings", "/settings"],
            ["Privacy", "/settings/privacy"],
          ].map(([label, href]) => (
            <Link key={label} href={href} style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none", fontWeight: 600 }}>
              {label}
            </Link>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          &copy; {new Date().getFullYear()} QuantChat. Secure by design.
        </p>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </main>
  );
}

import Link from "next/link";

const sections: Array<[string, string, string]> = [
  ["01", "Start", "Understand the secure messaging model, runtime services, and live app URLs."],
  ["02", "Operate", "Monitor health, readiness, Redis, PostgreSQL, and encrypted device registration."],
  ["03", "Integrate", "Wire chat, channels, files, websocket sessions, and admin access controls."],
  ["04", "Harden", "Finalize ingress, secrets, S3 credentials, backups, and production observability."],
];

export default function Home() {
  return (
    <main data-testid="docs-home-page" style={{ minHeight: "100svh", padding: "clamp(24px, 5vw, 72px)", color: "#09090b" }}>
      <nav data-testid="docs-home-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, marginBottom: 56 }}>
        <strong data-testid="docs-home-brand" className="docs-display" style={{ fontSize: 28 }}>QuantChat Docs</strong>
        <Link data-testid="docs-api-health-link" href="/" style={{ border: "1px solid #09090b", padding: "12px 16px", fontWeight: 800 }}>Operator index</Link>
      </nav>

      <section data-testid="docs-home-hero" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(280px,.8fr)", gap: 28 }}>
        <div style={{ background: "rgba(255,255,255,.9)", border: "1px solid var(--line)", padding: "clamp(28px, 5vw, 56px)" }}>
          <p data-testid="docs-home-kicker" style={{ color: "var(--blue)", fontFamily: "JetBrains Mono", fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", fontWeight: 800 }}>Production runbook</p>
          <h1 data-testid="docs-home-title" className="docs-display" style={{ fontSize: "clamp(48px, 7vw, 96px)", lineHeight: .9, margin: "20px 0", fontWeight: 900 }}>Clear docs for a serious secure chat system.</h1>
          <p data-testid="docs-home-description" style={{ color: "var(--muted)", fontSize: 18, lineHeight: 1.75, maxWidth: 760 }}>Everything an operator needs: service map, deployment health, API checks, admin controls, realtime messaging flows, and hardening tasks.</p>
        </div>
        <aside data-testid="docs-home-status-card" style={{ background: "#002FA7", color: "white", padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 360 }}>
          <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase" }}>Current release</span>
          <div>
            <strong className="docs-display" style={{ display: "block", fontSize: 64, lineHeight: 1 }}>A1</strong>
            <p style={{ marginTop: 12, lineHeight: 1.6 }}>Web, docs, admin, API, database, and Redis are documented as one production system.</p>
          </div>
        </aside>
      </section>

      <section data-testid="docs-home-sections" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 0, marginTop: 32, border: "1px solid var(--line)", background: "white" }}>
        {sections.map(([number, title, text]) => (
          <article data-testid={`docs-section-${title.toLowerCase()}`} key={title} style={{ padding: 26, borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "JetBrains Mono", color: "var(--blue)", fontWeight: 800 }}>{number}</span>
            <h2 className="docs-display" style={{ fontSize: 30, margin: "14px 0 10px" }}>{title}</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.65 }}>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

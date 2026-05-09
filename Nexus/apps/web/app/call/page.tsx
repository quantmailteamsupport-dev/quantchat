import Link from "next/link";

export default function CallIndexPage() {
  return (
    <main data-testid="call-index-page" className="qc-home-page" style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: "clamp(24px, 5vw, 72px)" }}>
      <section className="qc-home-panel" style={{ maxWidth: 760 }}>
        <p className="mono" style={{ color: "#002FA7", fontSize: 12, fontWeight: 800, letterSpacing: ".22em", textTransform: "uppercase" }}>Encrypted calls</p>
        <h1 data-testid="call-index-title" className="qc-display" style={{ fontSize: "clamp(48px, 7vw, 86px)", lineHeight: .9, margin: "18px 0", fontWeight: 900 }}>Choose a trusted conversation first.</h1>
        <p data-testid="call-index-description" style={{ color: "#52525B", fontSize: 18, lineHeight: 1.7 }}>Calls are launched from a verified chat, channel, or contact context so receipts and identity checks stay attached.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <Link data-testid="call-index-chat-link" className="qc-home-primary-link" href="/chat">Open chat</Link>
          <Link data-testid="call-index-workspace-link" className="qc-home-secondary-link" href="/workspace">Go to workspace</Link>
        </div>
      </section>
    </main>
  );
}
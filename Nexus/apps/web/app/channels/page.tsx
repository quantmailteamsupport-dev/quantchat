import Link from "next/link";

export default function ChannelsIndexPage() {
  return (
    <main data-testid="channels-index-page" className="qc-home-page" style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: "clamp(24px, 5vw, 72px)" }}>
      <section className="qc-home-panel" style={{ maxWidth: 760 }}>
        <p className="mono" style={{ color: "#002FA7", fontSize: 12, fontWeight: 800, letterSpacing: ".22em", textTransform: "uppercase" }}>Secure channels</p>
        <h1 data-testid="channels-index-title" className="qc-display" style={{ fontSize: "clamp(48px, 7vw, 86px)", lineHeight: .9, margin: "18px 0", fontWeight: 900 }}>Pick a channel workspace.</h1>
        <p data-testid="channels-index-description" style={{ color: "#52525B", fontSize: 18, lineHeight: 1.7 }}>Team channels are available by workspace context. Start with chat, feed, or a known channel to keep routing precise.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <Link data-testid="channels-index-chat-link" className="qc-home-primary-link" href="/chat">Open chat</Link>
          <Link data-testid="channels-index-family-link" className="qc-home-secondary-link" href="/channels/family">Family channel</Link>
        </div>
      </section>
    </main>
  );
}
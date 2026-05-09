import Link from "next/link";

export default function Home() {
  return (
    <main
      data-testid="quantchat-home-page"
      style={{
        minHeight: "100vh",
        padding: "72px clamp(20px, 5vw, 84px)",
        background:
          "radial-gradient(circle at top left, rgba(0,245,255,0.18), transparent 34%), linear-gradient(135deg, #071117 0%, #0d1620 48%, #111827 100%)",
        color: "#e9edef",
        display: "grid",
        alignItems: "center",
      }}
    >
      <section data-testid="quantchat-home-hero" style={{ maxWidth: 980 }}>
        <p
          data-testid="quantchat-home-kicker"
          style={{ color: "#53bdeb", fontSize: 13, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}
        >
          QuantChat Secure Messaging
        </p>
        <h1
          data-testid="quantchat-home-title"
          style={{ fontSize: "clamp(44px, 8vw, 88px)", lineHeight: 0.95, letterSpacing: "-0.06em", margin: "18px 0" }}
        >
          Private realtime chat for high-trust teams.
        </h1>
        <p
          data-testid="quantchat-home-description"
          style={{ maxWidth: 680, color: "#aebac1", fontSize: 18, lineHeight: 1.7, marginBottom: 34 }}
        >
          End-to-end encrypted messaging, device-aware sessions, voice rooms, disappearing messages, and consent-first AI assistance in one focused workspace.
        </p>
        <div data-testid="quantchat-home-actions" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link
            data-testid="quantchat-home-open-chat-link"
            href="/chat"
            style={{
              borderRadius: 999,
              padding: "14px 22px",
              background: "#00a884",
              color: "#03130f",
              fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 18px 38px rgba(0,168,132,0.28)",
            }}
          >
            Open secure chat
          </Link>
          <Link
            data-testid="quantchat-home-login-link"
            href="/login"
            style={{
              borderRadius: 999,
              padding: "14px 22px",
              border: "1px solid rgba(233,237,239,0.18)",
              color: "#e9edef",
              fontWeight: 700,
              textDecoration: "none",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

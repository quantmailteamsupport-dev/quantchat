"use client";

/**
 * login/page.tsx
 *
 * BLOCKER-AUTH FIX: NextAuth login page
 * Supports:
 * - Google OAuth 2.0
 * - GitHub OAuth (configured in lib/auth.ts)
 * - Quantmail SSO Bridge
 */

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="text-white text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <p className="mt-4 text-lg">Loading...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl") || "/chat";

  // If already authenticated, redirect to chat
  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      router.push(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await signIn("google", {
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Sign-in error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div data-testid="login-loading-state" className="qc-home-page" style={{ minHeight: "100svh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, border: "2px solid rgba(0,47,167,.16)", borderTopColor: "#002FA7", borderRadius: 999, margin: "0 auto", animation: "qc-spin 1s linear infinite" }} />
          <p className="mono" style={{ marginTop: 16, color: "#52525B" }}>Loading secure session...</p>
        </div>
      </div>
    );
  }

  return (
    <main data-testid="login-page" className="qc-home-page" style={{ minHeight: "100svh", padding: "clamp(24px, 5vw, 72px)", display: "grid", alignItems: "center" }}>
      <section data-testid="login-shell" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(320px,.72fr)", gap: 24, maxWidth: 1180, width: "100%", margin: "0 auto" }}>
        <div data-testid="login-brand-panel" className="qc-home-panel" style={{ minHeight: 520, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <p className="mono" style={{ color: "#002FA7", fontSize: 12, letterSpacing: ".22em", textTransform: "uppercase", fontWeight: 800 }}>Identity gate</p>
            <h1 data-testid="login-title" className="qc-display" style={{ fontSize: "clamp(48px, 7vw, 92px)", lineHeight: .9, margin: "22px 0", fontWeight: 900 }}>Enter the secure chat control room.</h1>
            <p data-testid="login-description" style={{ color: "#52525B", fontSize: 18, lineHeight: 1.75, maxWidth: 680 }}>QuantChat verifies your session before opening encrypted realtime conversations, trust checks, device controls, and voice collaboration.</p>
          </div>
          <div data-testid="login-trust-strip" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 28 }}>
            {[
              ["E2EE", "Message privacy"],
              ["SSO", "Verified identity"],
              ["LIVE", "Realtime ready"],
            ].map(([value, label]) => (
              <div key={value} style={{ borderTop: "1px solid rgba(9,9,11,.14)", paddingTop: 14 }}>
                <strong className="qc-display" style={{ display: "block", fontSize: 30 }}>{value}</strong>
                <span style={{ color: "#52525B", fontSize: 13 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div data-testid="login-action-panel" className="qc-home-panel" style={{ background: "#F8F9FA", alignSelf: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
            <span aria-hidden="true" style={{ width: 38, height: 38, display: "grid", placeItems: "center", background: "#002FA7", color: "white", fontFamily: "var(--qc-font-mono)", fontWeight: 800 }}>Q</span>
            <div>
              <h2 data-testid="login-card-title" className="qc-display" style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>QuantChat</h2>
              <p style={{ margin: "2px 0 0", color: "#52525B" }}>Secure, low-latency messaging</p>
            </div>
          </div>

          {error && (
            <div data-testid="login-error-message" style={{ marginBottom: 18, padding: 14, background: "#FFF1F0", border: "1px solid rgba(255,42,0,.25)", color: "#9F1D00" }}>
              <p style={{ margin: 0, fontSize: 14 }}>{error}</p>
            </div>
          )}

          <button
            data-testid="login-google-button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            style={{
              width: "100%",
              minHeight: 54,
              border: "1px solid #002FA7",
              background: isLoading ? "rgba(0,47,167,.68)" : "#002FA7",
              color: "#fff",
              fontWeight: 900,
              fontSize: 15,
              cursor: isLoading ? "wait" : "pointer",
              transition: "transform 180ms ease, background-color 180ms ease",
            }}
          >
            {isLoading ? "Signing in..." : "Sign in with Google"}
          </button>

          <div data-testid="login-policy-copy" style={{ marginTop: 22, color: "#52525B", fontSize: 13, lineHeight: 1.6 }}>
            By signing in, you agree to the secure workspace terms and privacy policy.
          </div>

          <div data-testid="login-security-copy" className="mono" style={{ marginTop: 28, borderTop: "1px solid rgba(9,9,11,.12)", paddingTop: 18, color: "#002FA7", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
            End-to-end encryption · Session-persistent across devices
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginLoading() {
  return (
    <div data-testid="login-loading-state" className={`qc-home-page ${styles.loadingShell}`}>
      <div style={{ textAlign: "center" }}>
        <div className={styles.spinner} />
        <p className={`mono ${styles.loadingText}`}>Loading secure session…</p>
      </div>
    </div>
  );
}

const TRUST_STRIP: Array<[string, string]> = [
  ["E2EE", "Message privacy"],
  ["SSO", "Verified identity"],
  ["LIVE", "Realtime ready"],
];

function LoginPageContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl") || "/chat";

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      router.push(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await signIn("google", { callbackUrl, redirect: false });
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
    return <LoginLoading />;
  }

  return (
    <main data-testid="login-page" className={`qc-home-page ${styles.page}`}>
      <section data-testid="login-shell" className={styles.shell}>
        <div data-testid="login-brand-panel" className={`qc-home-panel ${styles.brandPanel}`}>
          <div>
            <p className={`mono ${styles.eyebrow}`}>Identity gate</p>
            <h1 data-testid="login-title" className={`qc-display ${styles.title}`}>
              Enter the secure chat control room.
            </h1>
            <p data-testid="login-description" className={styles.lede}>
              QuantChat verifies your session before opening encrypted realtime
              conversations, trust checks, device controls, and voice
              collaboration.
            </p>
          </div>
          <div data-testid="login-trust-strip" className={styles.trustStrip}>
            {TRUST_STRIP.map(([value, label]) => (
              <div key={value} className={styles.trustItem}>
                <strong className={`qc-display ${styles.trustValue}`}>{value}</strong>
                <span className={styles.trustLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div data-testid="login-action-panel" className={`qc-home-panel ${styles.actionPanel}`}>
          <div className={styles.brandRow}>
            <span aria-hidden="true" className={styles.brandMark}>Q</span>
            <div>
              <h2 data-testid="login-card-title" className={`qc-display ${styles.brandName}`}>
                QuantChat
              </h2>
              <p className={styles.brandTagline}>Secure, low-latency messaging</p>
            </div>
          </div>

          {error && (
            <div data-testid="login-error-message" role="alert" className={styles.errorBox}>
              {error}
            </div>
          )}

          <button
            data-testid="login-google-button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className={styles.signinButton}
            type="button"
          >
            {isLoading ? "Signing in…" : "Sign in with Google"}
          </button>

          <p data-testid="login-policy-copy" className={styles.policy}>
            By signing in, you agree to the secure workspace terms and privacy policy.
          </p>

          <p data-testid="login-security-copy" className={`mono ${styles.securityCopy}`}>
            End-to-end encryption · Session-persistent across devices
          </p>
        </div>
      </section>
    </main>
  );
}

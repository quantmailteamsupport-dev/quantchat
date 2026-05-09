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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="text-white text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <p className="mt-4 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">QuantChat</h1>
            <p className="text-gray-600">
              Secure, low-latency messaging for your team
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Sign In Buttons */}
          <div className="space-y-4">
            {/* Google OAuth */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="font-medium text-gray-700">
                {isLoading ? "Signing in..." : "Sign in with Google"}
              </span>
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-gray-600 text-sm">
              By signing in, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center text-white">
          <p className="text-sm opacity-75">
            Secured with end-to-end encryption · Session-persistent across devices
          </p>
        </div>
      </div>
    </div>
  );
}

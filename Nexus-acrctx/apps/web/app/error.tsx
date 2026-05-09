"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Unexpected error</h1>
      <p>{error.message}</p>
      <button onClick={() => reset()} style={{ marginTop: 12 }}>
        Retry
      </button>
    </main>
  );
}

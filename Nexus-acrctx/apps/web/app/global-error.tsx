"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: 24 }}>
        <h2>Something went wrong.</h2>
        <p style={{ opacity: 0.8 }}>{error.message}</p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

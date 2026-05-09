import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "Quantchat | Nexus Admin",
  description: "Real-time system monitoring and tokenomics dashboard for Quantchat Web3.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="admin-swiss antialiased min-h-screen bg-[var(--color-background-dark)]">
        {/* Ambient background glow */}
        <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
          <div className="absolute inset-0 admin-grid-bg" />
        </div>

        {/* Sidebar navigation */}
        <Sidebar />

        {/* Main content — offset by sidebar width on lg+ */}
        <main className="relative z-10 lg:ml-64 min-h-screen">
          <div className="max-w-7xl mx-auto p-6 pt-16 lg:pt-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

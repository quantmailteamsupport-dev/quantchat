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
      <body className="antialiased min-h-screen bg-[var(--color-background-dark)]">
        {/* Ambient background glow */}
        <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--color-neon-purple)] opacity-10 blur-[150px] rounded-full" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[var(--color-neon-blue)] opacity-10 blur-[150px] rounded-full" />
          <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] bg-[var(--color-neon-pink)] opacity-5 blur-[120px] rounded-full" />
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

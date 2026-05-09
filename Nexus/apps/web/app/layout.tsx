import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "../components/AppShell";
import AuthProviders from "../components/AuthProviders";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "QuantChat | Secure realtime messaging",
  description: "Private realtime chat, trusted devices, and operational controls for high-trust teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="qc" data-theme="light">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProviders>
          <AppShell>
            {children}
          </AppShell>
        </AuthProviders>
      </body>
    </html>
  );
}

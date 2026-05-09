import type { CapacitorConfig } from '@capacitor/cli';

// Phase 17: Native Mobile Device Wrapper
// This config instructs Capacitor how to wrap the Next.js exported web assets
// into native iOS and Android binaries.

const config: CapacitorConfig = {
  appId: 'ai.quantchat.nexus',
  appName: 'Quantchat',
  // Next.js 'export' output folder
  webDir: 'out',
  plugins: {
    // Enable seamless native vibrations for Swipe-to-Reply and Reels double-tap
    Haptics: {},
    // Expose the native secure enclave area for storing the E2EE keys safely
    SecureStoragePlugin: {}
  },
  server: {
    // Force mobile shells to load the deployed live app
    url: process.env.CAP_SERVER_URL ?? 'https://quantchat-web.whiteisland-ac726785.centralindia.azurecontainerapps.io',
    // On iOS devices, prefer https scheme when serving remote web content
    iosScheme: 'https',
    androidScheme: 'https',
    cleartext: false
  }
};

export default config;

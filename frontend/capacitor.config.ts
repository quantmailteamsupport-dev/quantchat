import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.quantchat.mobile',
  appName: 'QuantChat',
  webDir: 'build',
  server: {
    url: process.env.CAP_SERVER_URL ?? 'http://52.66.196.236',
    cleartext: true,
    iosScheme: 'http',
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;

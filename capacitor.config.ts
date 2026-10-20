import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.scalaris.burgerhouse3',
  appName: 'Burger House 3',
  webDir: 'dist-native',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#11100e',
  },
};

export default config;

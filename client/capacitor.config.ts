import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.lootsurvivor.mobile',
  appName: 'loot-survivor-2',
  webDir: 'dist',
  server: {
    hostname: "lootsurvivor.io",
    androidScheme: "https",
    iosScheme: "capacitor",
  },
};

export default config;

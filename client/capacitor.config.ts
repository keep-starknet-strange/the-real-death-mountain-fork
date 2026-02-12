import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.lootsurvivor.mobile',
  appName: 'loot-survivor-2',
  webDir: 'dist',
  "plugins": {
    "SystemBars": {
      "insetsHandling": "css",
      "style": "DARK",
      "hidden": false,
      "animation": "NONE"
    }
  }
};

export default config;

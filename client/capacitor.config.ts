import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lootsurvivor.app',
  appName: 'Loot Survivor',
  webDir: 'dist',
  server: {
    // Development server configuration
    // For iOS Simulator, use localhost
    // For physical device, use your Mac's local IP address (e.g., 192.168.1.x)
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow cleartext traffic (only for development)
    cleartext: false
  },
  loggingBehavior: 'none' // Disable Capacitor debug logs
};

export default config;

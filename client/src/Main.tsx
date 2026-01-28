import { createRoot } from "react-dom/client";

import App from "./App.tsx";

// Dojo related imports
import { init } from "@dojoengine/sdk";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import { MetagameProvider } from "@/contexts/metagame.tsx";
import {
  DynamicConnectorProvider,
  useDynamicConnector,
} from "@/contexts/starknet.tsx";
import { createDojoConfig } from "@dojoengine/core";
import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import { PostHogProvider } from "posthog-js/react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { ChainId, getNetworkConfig } from "@/utils/networkConfig";

const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2025-05-24" as const,
};

function DojoApp() {
  const { currentNetworkConfig } = useDynamicConnector();
  const [sdk, setSdk] = useState<any>(null);

  useEffect(() => {
    async function initializeSdk() {
      try {
        const initializedSdk = await init({
          client: {
            toriiUrl: currentNetworkConfig.toriiUrl,
            worldAddress: currentNetworkConfig.manifest.world.address,
          },
          domain: {
            name: "Loot Survivor",
            version: "1.0",
            chainId: currentNetworkConfig.chainId,
            revision: "1",
          },
        });
        setSdk(initializedSdk);
      } catch (error) {
        console.error("Failed to initialize SDK:", error);
      }
    }

    if (currentNetworkConfig) {
      initializeSdk();
    }
  }, [currentNetworkConfig]);

  return (
    <DojoSdkProvider
      sdk={sdk}
      dojoConfig={createDojoConfig(currentNetworkConfig)}
      clientFn={() => { }}
    >
      <MetagameProvider>
        <App />
      </MetagameProvider>
    </DojoSdkProvider>
  );
}

async function main() {
  // Filter out noisy logs
  const originalConsoleLog = console.log;
  console.log = (...args: any[]) => {
    const message = args.join(' ');
    if (message.includes('[MetagameClient.getConfig]')) return;
    if (message.includes('To Native ->') || message.includes('TO JS')) return;
    originalConsoleLog.apply(console, args);
  };

  // Set up deep link handling for native platforms
    const isNative = Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android";
  
  if (isNative) {
    // Add Browser listeners once (not inside window.open)
    // These listeners help us track when the browser page loads
    try {
      Browser.addListener('browserPageLoaded', () => {
        // Browser page loaded
      });
      
      Browser.addListener('browserFinished', async () => {
        // When browser closes, check for deep link (startapp etc.; in practice session is only restored via localStorage).
        await new Promise(resolve => setTimeout(resolve, 1500));
        let hadDeepLink = false;
        for (let attempt = 1; attempt <= 10; attempt++) {
          try {
            const launchUrl = await CapacitorApp.getLaunchUrl();
            if (launchUrl?.url) {
              console.log(`✅ Found launch URL:`, launchUrl.url);
              await handleDeepLink(launchUrl.url);
              hadDeepLink = true;
              break;
            }
          } catch (error) {
            // Silently continue on error
          }
          if (attempt < 10) {
            const delay = Math.min(1000 * attempt, 3000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        // Only trigger logout when no deep link was processed (e.g. user logged out and clicked Done on x.cartridge.gg/account/).
        if (!hadDeepLink) {
          window.dispatchEvent(new CustomEvent('cartridgeBrowserFinished', { detail: { hadDeepLink: false } }));
        }
      });
    } catch (error) {
      console.error("❌ Failed to set up browserFinished listener:", error);
    }
    
    // Override window.open to use Capacitor Browser plugin on native platforms
    // This is needed because SessionConnector uses window.open() which doesn't work in WebView
    const originalWindowOpen = window.open;
    window.open = (url: string | URL | undefined, target?: string, features?: string): Window | null => {
      
      // Convert url to string if it's a URL object
      let urlString: string | undefined;
      if (typeof url === 'string') {
        urlString = url;
      } else if (url instanceof URL) {
        urlString = url.toString();
      } else {
        urlString = undefined;
      }
      
      if (urlString && urlString.startsWith('http')) {
        
        // Parse and properly encode all URL parameters
        // The SessionProvider doesn't properly URL-encode some parameters
        // Note: searchParams.set() automatically encodes values, so we don't need to encode manually
        try {
          const urlObj = new URL(urlString);
          
          // Add namespace, slot, and preset to route to Loot Survivor login
          // These parameters are needed to identify which app/game the session is for
          // SessionConnector might not include them, so we add them here
          const controllerConfig = getNetworkConfig(ChainId.SN_MAIN);
          if (!urlObj.searchParams.has('namespace')) {
            urlObj.searchParams.set('namespace', controllerConfig.namespace);
          }
          if (!urlObj.searchParams.has('slot')) {
            urlObj.searchParams.set('slot', controllerConfig.slot);
          }
          if (!urlObj.searchParams.has('preset')) {
            urlObj.searchParams.set('preset', controllerConfig.preset);
          }
          
          // Fix redirect_uri - if it's not encoded in the original URL string, 
          // searchParams.get() will return the decoded value, and set() will encode it
          const redirectUri = urlObj.searchParams.get('redirect_uri');
          
          if (redirectUri) {
            // Ensure redirect_uri is set correctly
            if (redirectUri !== 'lootsurvivor://open') {
              urlObj.searchParams.set('redirect_uri', 'lootsurvivor://open');
            } else {
              // Even if it's correct, ensure it's properly encoded by setting it again
              urlObj.searchParams.set('redirect_uri', 'lootsurvivor://open');
            }
          } else {
            // Redirect URI is missing - add it
            urlObj.searchParams.set('redirect_uri', 'lootsurvivor://open');
          }
          
          // Also ensure redirect_query_name is set to 'startapp'
          if (!urlObj.searchParams.has('redirect_query_name')) {
            urlObj.searchParams.set('redirect_query_name', 'startapp');
          } else {
            const queryName = urlObj.searchParams.get('redirect_query_name');
            if (queryName !== 'startapp') {
              urlObj.searchParams.set('redirect_query_name', 'startapp');
            }
          }
          
          // Fix policies parameter - check if it's a JSON string that needs proper encoding
          const policies = urlObj.searchParams.get('policies');
          if (policies) {
            try {
              // Try to parse as JSON to see if it's valid
              JSON.parse(policies);
              // If it parses, it's a JSON string
              // Check if the original URL had it unencoded (contains { or })
              if (urlString.includes('policies={') || urlString.includes('policies={"')) {
                // The original URL had unencoded JSON, searchParams decoded it
                // Just set it back - set() will encode it properly
                urlObj.searchParams.set('policies', policies);
              }
            } catch (e) {
              // Not JSON, might already be encoded or in a different format
            }
          }
          
          // Get the properly encoded URL
          urlString = urlObj.toString();
        } catch (error) {
          console.error("Error parsing/encoding URL:", error);
          // Fallback: manually fix the redirect_uri if URL parsing fails
          if (urlString && urlString.includes('redirect_uri=lootsurvivor://')) {
            urlString = urlString.replace(
              'redirect_uri=lootsurvivor://open',
              'redirect_uri=' + encodeURIComponent('lootsurvivor://open')
            );
            console.log("Fallback: Fixed redirect_uri encoding in URL");
          }
        }
        
        // Ensure urlString is defined before using it
        if (!urlString) {
          console.error("❌ URL is undefined or invalid, cannot open browser");
          return null;
        }
        
        // TypeScript narrowing: urlString is guaranteed to be string here
        const finalUrl: string = urlString;
        
        // Open browser asynchronously with proper error handling
        Browser.open({ url: finalUrl })
          .catch((error) => {
            console.error("❌ Browser.open failed:", error);
          });
        
        // Return a mock window object that has a close method
        // SessionConnector expects this to have a close() method
        return {
          close: () => {
            Browser.close().catch((error) => {
              console.debug("Browser close error:", error);
            });
          },
          closed: false,
          location: { href: url } as Location
        } as unknown as Window;
      }
      // For non-HTTP URLs or if not a string, use original window.open
      return originalWindowOpen.call(window, url, target, features);
    };
    
    // Add a global debug helper function to check deep link status
    (window as any).debugDeepLink = async () => {
      console.log("🔍🔍🔍 DEEP LINK DEBUG INFO 🔍🔍🔍");
      try {
        const launchUrl = await CapacitorApp.getLaunchUrl();
        console.log("Current launch URL:", launchUrl);
        console.log("Current window.location.href:", window.location.href);
        console.log("Current window.location.search:", window.location.search);
        
        const urlParams = new URLSearchParams(window.location.search);
        const startapp = urlParams.get("startapp");
        console.log("startapp parameter in URL:", startapp);
        
        // Check localStorage for session data
        console.log("Checking localStorage for session data...");
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("controller") || key.includes("session") || key.includes("cartridge"))) {
            console.log(`  ${key}:`, localStorage.getItem(key)?.substring(0, 100));
          }
        }
        
        // Check if SessionConnector has account
        const sessionConnector = (window as any).starknet_controller_session;
        if (sessionConnector) {
          console.log("SessionConnector found:", !!sessionConnector);
          console.log("SessionConnector has account:", !!sessionConnector.account);
          if (sessionConnector.account) {
            console.log("Account address:", sessionConnector.account.address);
          }
        } else {
          console.log("SessionConnector not found in window.starknet_controller_session");
        }
      } catch (error) {
        console.error("Error in debugDeepLink:", error);
      }
    };
    
    // Helper function to handle deep link URLs
    // Accepts ANY URL format that might contain a session token
    const handleDeepLink = async (url: string) => {
      // Explicit logout: if Cartridge redirects to e.g. lootsurvivor://open?logout=1
      // or startapp=logout, we handle it here so the app disconnects immediately.
      try {
        const normalized = url.replace(/^lootsurvivor:\/\//, "https://placeholder/");
        const u = new URL(normalized);
        const logoutParam = u.searchParams.get("logout");
        const startappParam = u.searchParams.get("startapp");
        const isLogout =
          (logoutParam !== null && /^1|true$/i.test(logoutParam)) ||
          startappParam === "logout";
        if (isLogout) {
          window.dispatchEvent(new CustomEvent("cartridgeLogout"));
          return;
        }
      } catch {
        // Not a parseable URL or no logout param; continue with normal deep link handling
      }

      // Be very flexible - accept ANY URL that might contain session info
      // Check for startapp parameter in any format
      const hasStartapp = url.includes("startapp=");
      const isLootsurvivorScheme = url.startsWith("lootsurvivor://");
      const isCustomScheme = url.includes("://") && !url.startsWith("http://") && !url.startsWith("https://");
      
      // Try to extract startapp parameter from ANY URL format
      if (hasStartapp || isLootsurvivorScheme || isCustomScheme) {
        
        try {
          // Try multiple parsing strategies
          let urlObj: URL | null = null;
          let startappParam: string | null = null;
          
          // Strategy 1: If it's a custom scheme, convert to https:// for parsing
          if (url.startsWith("lootsurvivor://")) {
            try {
              urlObj = new URL(url.replace("lootsurvivor://", "https://"));
              startappParam = urlObj.searchParams.get("startapp");
            } catch (e) {
              // Continue to next strategy
            }
          }
          
          // Strategy 2: If it's http/https, parse directly
          if (!startappParam && (url.startsWith("http://") || url.startsWith("https://"))) {
            try {
              urlObj = new URL(url);
              startappParam = urlObj.searchParams.get("startapp");
            } catch (e) {
              // Continue to next strategy
            }
          }
          
          // Strategy 3: Try to extract startapp from the raw URL string using regex
          if (!startappParam && url.includes("startapp=")) {
            try {
              const match = url.match(/[?&]startapp=([^&?#]+)/);
              if (match && match[1]) {
                startappParam = decodeURIComponent(match[1]);
              }
            } catch (e) {
              // Continue to next strategy
            }
          }
          
          // Strategy 4: Try parsing with window.location.origin as base
          if (!startappParam) {
            try {
              urlObj = new URL(url, window.location.origin);
              startappParam = urlObj.searchParams.get("startapp");
            } catch (e) {
              // Continue
            }
          }
          
          if (startappParam) {
            // Update window.location to include the startapp parameter
            // This allows SessionConnector to retrieve the session
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set("startapp", startappParam);
            window.history.replaceState({}, document.title, currentUrl.toString());
            
            // Dispatch a custom event to notify that the deep link was processed
            const deepLinkEvent = new CustomEvent('deepLinkProcessed', {
              detail: { startapp: startappParam, url: url }
            });
            window.dispatchEvent(deepLinkEvent);
            
            // Also store in a global variable for immediate access
            (window as any).__lastStartappParam = startappParam;
            (window as any).__deepLinkProcessed = true;
            
            // Trigger a small delay to ensure SessionConnector can process the parameter
            setTimeout(() => {
              // Also dispatch a custom event that the controller context can listen to
              const sessionRetrievalEvent = new CustomEvent('triggerSessionRetrieval', {
                detail: { startapp: startappParam }
              });
              window.dispatchEvent(sessionRetrievalEvent);
            }, 500);
          } else {
            // Still try to process it - maybe SessionConnector can handle it
            const fallbackEvent = new CustomEvent('deepLinkProcessed', {
              detail: { startapp: null, url: url }
            });
            window.dispatchEvent(fallbackEvent);
          }
        } catch (error) {
          console.error("❌ Error parsing deep link URL:", error);
          // Still try to dispatch event in case the raw URL can be used
          const errorEvent = new CustomEvent('deepLinkProcessed', {
            detail: { startapp: null, url: url, error: String(error) }
          });
          window.dispatchEvent(errorEvent);
        }
      }
    };
    
    // Store handleDeepLink globally so it can be accessed from other contexts if needed
    (window as any).handleDeepLink = handleDeepLink;

    // Check for initial deep link on app startup
    // Try multiple times as the deep link might arrive slightly after app starts
    const checkInitialLaunchUrl = async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const launchUrl = await CapacitorApp.getLaunchUrl();
          if (launchUrl?.url) {
            console.log(`✅ Found initial launch URL:`, launchUrl.url);
            await handleDeepLink(launchUrl.url);
            return; // Exit if we found it
          }
        } catch (error) {
          // Silently continue on error
        }
        
        // Wait before next attempt (except on last attempt)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    };
    
    // Check immediately
    await checkInitialLaunchUrl();
    
    // Also check again after a short delay (deep link might arrive late)
    setTimeout(async () => {
      await checkInitialLaunchUrl();
    }, 2000);

    // Handle app URL open events (deep links when app is already running)
    // Following Cartridge docs: https://docs.cartridge.gg/controller/native/capacitor
    CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      
      // Accept ANY URL format - be very flexible
      // Cartridge might redirect in different formats
      if (url) {
        await handleDeepLink(url);
        
        // Per Cartridge docs: Close the browser immediately after handling the deep link
        try {
          await Browser.close();
        } catch (error) {
          // Browser may already be closed - this is expected
        }
      }
    });

    // Also handle app state changes (when app comes to foreground)
    CapacitorApp.addListener("appStateChange", async ({ isActive }) => {
      if (isActive) {
        // When app becomes active, check for launch URL (deep link might have been missed)
        try {
          const launchUrl = await CapacitorApp.getLaunchUrl();
          if (launchUrl?.url) {
            await handleDeepLink(launchUrl.url);
          }
        } catch (error) {
          // Silently continue on error
        }
        
        // Check if we have a deep link in the URL when app becomes active
        const urlParams = new URLSearchParams(window.location.search);
        const startappParam = urlParams.get("startapp");
        
        if (startappParam) {
          await handleDeepLink(`lootsurvivor://open?startapp=${startappParam}`);
          try {
            await Browser.close();
          } catch (error) {
            // Browser may already be closed
          }
        }
      }
    });
    
    // Set up a periodic check for deep links (fallback if appUrlOpen doesn't fire)
    // This is a safety net in case the event listener misses the deep link
    let deepLinkCheckInterval: ReturnType<typeof setInterval> | null = null;
    if (isNative) {
      deepLinkCheckInterval = setInterval(async () => {
        try {
          const launchUrl = await CapacitorApp.getLaunchUrl();
          if (launchUrl?.url) {
            await handleDeepLink(launchUrl.url);
            // Clear interval once we find it
            if (deepLinkCheckInterval) {
              clearInterval(deepLinkCheckInterval);
              deepLinkCheckInterval = null;
            }
          }
        } catch (error) {
          // Ignore errors in periodic check
        }
      }, 1000); // Check every 1 second
      
      // Clear the interval after 60 seconds
      setTimeout(() => {
        if (deepLinkCheckInterval) {
          clearInterval(deepLinkCheckInterval);
          deepLinkCheckInterval = null;
        }
      }, 60000);
    }
  }

  createRoot(document.getElementById("root")!).render(
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={options}
    >
      <DynamicConnectorProvider>
        <Analytics />
        <DojoApp />
      </DynamicConnectorProvider>
    </PostHogProvider>
  );
}

main().catch((error) => {
  console.error("Failed to initialize the application:", error);
});

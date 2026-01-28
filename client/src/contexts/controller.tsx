import { useStarknetApi } from "@/api/starknet";
import { useGameTokens } from "@/dojo/useGameTokens";
import { useSystemCalls } from "@/dojo/useSystemCalls";
import { useGameStore } from "@/stores/gameStore";
import { useUIStore } from "@/stores/uiStore";
import { Payment } from "@/types/game";
import { useAnalytics } from "@/utils/analytics";
import { ChainId, NETWORKS, getNetworkConfig } from "@/utils/networkConfig";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Account, RpcProvider } from "starknet";
import { useDynamicConnector } from "./starknet";
import { delay, stringToFelt } from "@/utils/utils";
import { useDungeon } from "@/dojo/useDungeon";

export interface ControllerContext {
  account: any;
  address: string | undefined;
  playerName: string;
  isPending: boolean;
  tokenBalances: Record<string, string>;
  goldenPassIds: number[];
  openProfile: () => void;
  login: () => void;
  logout: () => void;
  enterDungeon: (payment: Payment, txs: any[]) => void;
  showTermsOfService: boolean;
  acceptTermsOfService: () => void;
  openBuyTicket: () => void;
  bulkMintGames: (amount: number, callback: () => void) => void;
}

// Create a context
const ControllerContext = createContext<ControllerContext>(
  {} as ControllerContext
);

// Create a provider component
export const ControllerProvider = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const { setShowOverlay } = useGameStore();
  const { account, address, isConnecting } = useAccount();
  const { buyGame } = useSystemCalls();
  const { connector, connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const dungeon = useDungeon();
  const { currentNetworkConfig } = useDynamicConnector();
  const { createBurnerAccount, getTokenBalances, goldenPassReady } =
    useStarknetApi();
  const { getGameTokens } = useGameTokens();
  const { skipIntroOutro } = useUIStore();
  const [burner, setBurner] = useState<Account | null>(null);
  const [userName, setUserName] = useState<string>();
  const [creatingBurner, setCreatingBurner] = useState(false);
  const [tokenBalances, setTokenBalances] = useState({});
  const [goldenPassIds, setGoldenPassIds] = useState<number[]>([]);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false); // Local state to track login attempts
  const { identifyAddress } = useAnalytics();

  const demoRpcProvider = useMemo(
    () => new RpcProvider({ nodeUrl: NETWORKS.WP_PG_SLOT.rpcUrl }),
    []
  );

  useEffect(() => {
    if (account) {
      fetchTokenBalances();
      identifyAddress({ address: account.address });
      
      // Clear login state when account becomes available
      setIsLoggingIn(false);

      // Check if terms have been accepted
      const termsAccepted = typeof window !== 'undefined'
        ? localStorage.getItem('termsOfServiceAccepted')
        : null;

      if (!termsAccepted) {
        setShowTermsOfService(true);
      }
    } else {
      setIsLoggingIn(false);
    }
  }, [account]);

  // Listen for explicit logout from Cartridge: when the browser redirects to
  // e.g. lootsurvivor://open?logout=1 or startapp=logout, Main.tsx dispatches
  // "cartridgeLogout". Clear session/localStorage and reload.
  useEffect(() => {
    const isNative = typeof window !== "undefined" &&
      (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
    if (!isNative) return;

    const onCartridgeLogout = () => {
      const connectorId = "controller_session";
      const foundConnector = connectors.find((conn) => conn.id === connectorId);
      if (foundConnector && (foundConnector as any).controller) {
        const controller = (foundConnector as any).controller;
        if (typeof controller.clearStoredSession === "function") {
          controller.clearStoredSession();
        }
        if (controller.account != null) (controller as any).account = undefined;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("controller") || key.includes("session") || key.includes("cartridge"))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        ["session", "sessionSigner", "sessionPolicies", "lastUsedConnector"].forEach((key) => {
          if (localStorage.getItem(key) != null) localStorage.removeItem(key);
        });
      }
      disconnect();
      window.location.reload();
    };

    window.addEventListener("cartridgeLogout", onCartridgeLogout);
    return () => window.removeEventListener("cartridgeLogout", onCartridgeLogout);
  }, [connectors, disconnect]);

  // When the in-app browser closes without a deep link (e.g. user logged out on x.cartridge.gg/account/ and clicked Done).
  // Clear all session/localStorage and refresh the page so logout is immediate; no time-based logic.
  useEffect(() => {
    const isNative = typeof window !== "undefined" &&
      (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
    if (!isNative) return;

    const clearSessionStorageAndReload = (e: Event) => {
      if ((e as CustomEvent).detail?.hadDeepLink === true) return;
      if (!account) return;
      const connectorId = "controller_session";
      const foundConnector = connectors.find((conn) => conn.id === connectorId);
      if (foundConnector && (foundConnector as any).controller) {
        const controller = (foundConnector as any).controller;
        if (typeof controller.clearStoredSession === "function") {
          controller.clearStoredSession();
        }
        if (controller.account != null) (controller as any).account = undefined;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("controller") || key.includes("session") || key.includes("cartridge"))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        ["session", "sessionSigner", "sessionPolicies", "lastUsedConnector"].forEach((key) => {
          if (localStorage.getItem(key) != null) localStorage.removeItem(key);
        });
      }
      disconnect();
      window.location.reload();
    };

    window.addEventListener("cartridgeBrowserFinished", clearSessionStorageAndReload);
    return () => window.removeEventListener("cartridgeBrowserFinished", clearSessionStorageAndReload);
  }, [account, connectors, disconnect]);

  useEffect(() => {
    if (
      localStorage.getItem("burner") &&
      localStorage.getItem("burner_version") === "6"
    ) {
      let burner = JSON.parse(localStorage.getItem("burner") as string);
      setBurner(
        new Account({
          provider: demoRpcProvider,
          address: burner.address,
          signer: burner.privateKey,
        })
      );
    } else {
      createBurner();
    }
  }, []);

  // Get username when connector changes
  useEffect(() => {
    const getUsername = async () => {
      try {
        const name = await (connector as any)?.username();
        if (name) setUserName(name);
      } catch (error) {
        console.error("Error getting username:", error);
      }
    };

    if (connector) getUsername();
  }, [connector]);

  const resolvePlayerName = () => {
    const candidateName = (userName || "Adventurer").trim();
    const truncatedName = candidateName.slice(0, 31);
    try {
      stringToFelt(truncatedName);
      return truncatedName;
    } catch {
      return "Adventurer";
    }
  };

  const enterDungeon = async (payment: Payment, txs: any[]) => {
    if (!account) return;
    const resolvedName = resolvePlayerName();
    const resolvedRecipient = account.address;

    let gameId = await buyGame(
      account,
      payment,
      resolvedName,
      txs,
      1,
      () => {
        navigate(`/${dungeon.id}/play?mode=entering`);
      },
      resolvedRecipient
    );

    if (gameId) {
      await delay(2000);
      navigate(`/${dungeon.id}/play?id=${gameId}`, { replace: true });
      fetchTokenBalances();
      if (!skipIntroOutro) {
        setShowOverlay(false);
      }
    } else {
      navigate(`/${dungeon.id}`, { replace: true });
    }
  };

  const bulkMintGames = async (amount: number, callback: () => void) => {
    amount = Math.min(amount, 50);
    const resolvedName = resolvePlayerName();

    await buyGame(
      account,
      { paymentType: "Ticket" },
      resolvedName,
      [],
      amount,
      () => {
        setTokenBalances(prev => ({
          ...prev,
          "TICKET": (Number((prev as any)["TICKET"]) - amount).toString()
        }));
        callback();
      }
    );
  };

  const createBurner = async () => {
    setCreatingBurner(true);
    let account = await createBurnerAccount(demoRpcProvider);

    if (account) {
      setBurner(account);
    }
    setCreatingBurner(false);
  };

  async function fetchTokenBalances() {
    let balances = await getTokenBalances(NETWORKS.SN_MAIN.paymentTokens);
    setTokenBalances(balances);

    let goldenTokenAddress = NETWORKS.SN_MAIN.goldenToken;
    const allTokens = await getGameTokens(address!, goldenTokenAddress);

    if (allTokens.length > 0) {
      const cooldowns = await goldenPassReady(goldenTokenAddress, allTokens);
      setGoldenPassIds(cooldowns);
    }
  }

  const acceptTermsOfService = () => {
    setShowTermsOfService(false);
  };

  // Get account from controller if useAccount() hook doesn't have it
  // This is a fallback for when connector isn't set but controller has the account
  const accountToExpose = useMemo(() => {
    if (currentNetworkConfig.chainId === ChainId.WP_PG_SLOT) {
      return burner;
    }
    
    // If useAccount() hook has account, use it
    if (account) {
      return account;
    }
    
    // Fallback: Try to get account from the connector's controller
    // This handles the case where session is retrieved but connector isn't set yet
    if (connector && (connector as any).controller) {
      const controllerAccount = (connector as any).controller.account;
      if (controllerAccount) {
        return controllerAccount;
      }
    }
    
    // Try to find the connector and get account from it
    const isNative = typeof window !== "undefined" && 
      (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
    const connectorId = isNative ? "controller_session" : "controller";
    const foundConnector = connectors.find((conn) => conn.id === connectorId);
    if (foundConnector && (foundConnector as any).controller) {
      const controllerAccount = (foundConnector as any).controller.account;
      if (controllerAccount) {
        return controllerAccount;
      }
    }
    
    return account;
  }, [currentNetworkConfig.chainId, burner, account, connector, connectors]);
  
  const addressToExpose = useMemo(() => {
    if (currentNetworkConfig.chainId === ChainId.WP_PG_SLOT) {
      return burner?.address;
    }
    return address || accountToExpose?.address;
  }, [currentNetworkConfig.chainId, burner, address, accountToExpose]);

  return (
    <ControllerContext.Provider
      value={{
        account: accountToExpose,
        address: addressToExpose,
        playerName: userName || "Adventurer",
        isPending: isConnecting || isPending || creatingBurner || isLoggingIn,
        tokenBalances,
        goldenPassIds,
        showTermsOfService,
        acceptTermsOfService,

        openProfile: async () => {
          // Try to get connector from useConnect hook first
          let targetConnector = connector;
          
          // If connector is not available, try to find it from connectors list
          if (!targetConnector) {
            const isNative = typeof window !== "undefined" && 
              (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
            const connectorId = isNative ? "controller_session" : "controller";
            targetConnector = connectors.find((conn) => conn.id === connectorId);
          }
          
          if (!targetConnector) {
            console.error("❌ No connector available");
            return;
          }
          
          const controller = (targetConnector as any)?.controller;
          if (!controller) {
            console.error("❌ No controller available on connector");
            return;
          }
          
          // Try openProfile first (ControllerConnector)
          if (typeof controller.openProfile === 'function') {
            try {
              controller.openProfile();
              return;
            } catch (error) {
              console.error("❌ Error calling controller.openProfile():", error);
            }
          }
          
          // Try openSession as fallback (SessionConnector might use this)
          if (typeof controller.openSession === 'function') {
            try {
              controller.openSession();
              return;
            } catch (error) {
              console.error("❌ Error calling controller.openSession():", error);
            }
          }
          
          // If neither method exists, open Cartridge profile URL directly
          // SessionConnector doesn't have openProfile, so we need to open the profile page in browser
          try {
            const isNative = typeof window !== "undefined" && 
              (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
            
            // Get username from controller or from state
            let profileUsername = userName;
            
            // Try to get username from controller if not available in state
            if (!profileUsername && controller && typeof controller.username === 'function') {
              try {
                profileUsername = await controller.username();
              } catch (error) {
                // Silently continue
              }
            }
            
            if (!profileUsername) {
              console.error("❌ No username available - cannot construct profile URL");
              return;
            }
            
            // Construct profile URL: https://x.cartridge.gg/account/{username}/inventory
            const profileUrl = `https://x.cartridge.gg/account/${encodeURIComponent(profileUsername)}/inventory`;
            
            if (isNative) {
              await Browser.open({ url: profileUrl });
            } else {
              window.open(profileUrl, "_blank");
            }
          } catch (error) {
            console.error("❌ Error opening profile page:", error);
          }
        },
        openBuyTicket: () => {
          const controller = (connector as any)?.controller;
          if (controller && typeof controller.openStarterPack === 'function') {
            try {
              controller.openStarterPack(3);
            } catch (error) {
              console.error("❌ Error calling controller.openStarterPack():", error);
            }
          }
        },
        login: () => {
          setIsLoggingIn(true);
          
          const maxLoginTimeout = setTimeout(() => {
            setIsLoggingIn(false);
          }, 45000);
          
          const isNative = typeof window !== "undefined" && 
            (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
          const connectorId = isNative ? "controller_session" : "controller";
          const foundConnector = connectors.find((conn) => conn.id === connectorId);
          
          if (!foundConnector) {
            console.error("Connector not found:", connectorId);
            setIsLoggingIn(false);
            clearTimeout(maxLoginTimeout);
            return;
          }
          
          // Based on Jokers of Neon's approach: call the connector's connect method directly
          // The @starknet-react/core connect() hook might not trigger SessionConnector's connect()
          const connectorAny = foundConnector as any;
          
          // Helper to clear login state
          const clearLoginState = () => {
            setIsLoggingIn(false);
            clearTimeout(maxLoginTimeout);
          };
          
          // Set up deep link event listeners BEFORE opening the browser
          // This ensures we catch the deep link even if it arrives very quickly
          let sessionRetrieved = false;
          let handlersRemoved = false;
          let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
          
          const removeHandlers = () => {
            if (!handlersRemoved) {
              window.removeEventListener('deepLinkProcessed', deepLinkHandler as EventListener);
              window.removeEventListener('triggerSessionRetrieval', triggerRetrievalHandler as EventListener);
              handlersRemoved = true;
            }
            if (loadingTimeout) {
              clearTimeout(loadingTimeout);
              loadingTimeout = null;
            }
          };
          
            const attemptSessionRetrieval = async (forceFromStorage = false) => {
              if (sessionRetrieved) return;
              
              await new Promise(resolve => setTimeout(resolve, 500));
              const urlParams = new URLSearchParams(window.location.search);
              const startappParam = urlParams.get("startapp");
            
            // Try to retrieve the session
            // tryRetrieveFromQueryOrStorage can retrieve from:
            // 1. Query parameters (startapp in URL)
            // 2. localStorage (if SessionConnector stored it during browser flow)
            try {
              if (connectorAny.controller?.tryRetrieveFromQueryOrStorage) {
                
                let retrievedSession: any = null;
                try {
                  retrievedSession = await connectorAny.controller.tryRetrieveFromQueryOrStorage();
                } catch (methodError) {
                  console.error("❌❌❌ tryRetrieveFromQueryOrStorage threw an error!");
                  console.error("❌ Error type:", typeof methodError);
                  console.error("❌ Error:", methodError);
                  const errorMessage = methodError instanceof Error ? methodError.message : String(methodError);
                  console.error("❌ Error message:", errorMessage);
                  console.error("❌ Error stack:", methodError instanceof Error ? methodError.stack : 'No stack');
                  
                  // Check if this is the "Invalid Felt" error
                  if (errorMessage.includes('Invalid Felt') || errorMessage.includes('invalid dec string')) {
                    console.error("❌❌❌ CRITICAL: Invalid Felt error detected!");
                    console.error("❌ SessionConnector is trying to parse a value as a Felt (Starknet number) but it's not a valid decimal string");
                    console.error("❌ The session data appears valid (has username, address, signer, etc.)");
                    console.error("❌ But there's a configuration mismatch - the stored session format doesn't match current config");
                    console.error("❌ Possible causes:");
                    console.error("  - chainId format mismatch: stored session might have different chainId format");
                    console.error("  - Session was created with different SessionConnector configuration");
                    console.error("  - SessionConnector version mismatch");
                    console.error("❌ Current SessionConnector configuration:");
                    console.error("  - chainId:", connectorAny.controller?.chainId, "(type:", typeof connectorAny.controller?.chainId, ")");
                    console.error("  - rpc:", connectorAny.controller?.rpc);
                    console.error("  - namespace:", connectorAny.controller?.namespace);
                    console.error("❌ The session data is NOT corrupted - it's just incompatible with current config");
                    console.error("❌ Clearing session to allow fresh login with current configuration...");
                    
                    // Clear the session-related localStorage keys
                    try {
                      const keysToRemove: string[] = [];
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.includes("controller") || key.includes("session") || key.includes("cartridge"))) {
                          keysToRemove.push(key);
                        }
                      }
                      keysToRemove.forEach(key => localStorage.removeItem(key));
                      
                      // Don't re-throw - instead, clear login state and let user try again
                      removeHandlers();
                      clearLoginState();
                      return; // Exit early - can't retrieve session with current configuration
                    } catch (clearError) {
                      console.error("❌ Failed to clear session data:", clearError);
                    }
                  }
                  
                  // Try to stringify the error
                  try {
                    const errorStr = JSON.stringify(methodError, Object.getOwnPropertyNames(methodError));
                    console.error("❌ Error JSON:", errorStr);
                  } catch (e) {
                    console.error("❌ Could not stringify error, trying toString():", String(methodError));
                  }
                  
                  // Check if this is a specific error type
                  if (methodError && typeof methodError === 'object') {
                    console.error("❌ Error keys:", Object.keys(methodError));
                    for (const key of Object.keys(methodError)) {
                      console.error(`❌ Error.${key}:`, (methodError as any)[key]);
                    }
                  }
                  
                  // Re-throw to be caught by outer catch
                  throw methodError;
                }
                
                if (retrievedSession) {
                  console.log("✅ Session retrieved successfully");
                  sessionRetrieved = true;
                  
                  // Clear timeout since we got the session
                  if (loadingTimeout) {
                    clearTimeout(loadingTimeout);
                    loadingTimeout = null;
                  }
                  
                  // Wait a bit more to ensure session is fully processed
                  await new Promise(resolve => setTimeout(resolve, 300));
                  
                  // Call connect hook to register the session with backend
                  // This will trigger session registration/authorization transaction
                  try {
                    const connectPromise = connect({
                      connector: foundConnector,
                    });
                    
                    // Wait for the connect promise to resolve
                    // This may involve sending a transaction to register/authorize the session
                    await connectPromise;
                    console.log("✅ Session registered successfully");
                    
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    removeHandlers();
                    clearLoginState();
                    
                    let finalCheckCount = 0;
                    const finalCheckInterval = setInterval(() => {
                      finalCheckCount++;
                      if (connectorAny.controller?.account) {
                        clearInterval(finalCheckInterval);
                        clearLoginState();
                      } else if (finalCheckCount >= 10) {
                        clearInterval(finalCheckInterval);
                        clearLoginState();
                      }
                    }, 500);
                  } catch (error) {
                    console.error("Session registration failed:", error instanceof Error ? error.message : error);
                    removeHandlers();
                    clearLoginState();
                  }
                } else {
                  // Clear login state if no session found
                  clearLoginState();
                }
              } else {
                // Clear login state if method not available
                clearLoginState();
              }
            } catch (error) {
              console.error("Session retrieval failed:", error instanceof Error ? error.message : error);
              removeHandlers();
              // Clear login state on error
              clearLoginState();
            }
          };
          
          const deepLinkHandler = async (event: CustomEvent) => {
            await attemptSessionRetrieval();
          };
          
          const triggerRetrievalHandler = async (event: CustomEvent) => {
            await attemptSessionRetrieval();
          };
          
          // Add listeners before opening browser
          window.addEventListener('deepLinkProcessed', deepLinkHandler as EventListener);
          window.addEventListener('triggerSessionRetrieval', triggerRetrievalHandler as EventListener);
          
          // Set up a timeout to clear loading state if session retrieval takes too long
          // This prevents the button from staying in loading state forever
          loadingTimeout = setTimeout(() => {
            if (!sessionRetrieved) {
              removeHandlers();
              clearLoginState();
              attemptSessionRetrieval().catch(() => clearLoginState());
            }
          }, 30000);
          
          // Set reopenBrowser to true (like Jokers of Neon does)
          if (connectorAny.controller) {
            if (typeof connectorAny.controller.clearStoredSession === 'function') {
              try {
                connectorAny.controller.clearStoredSession();
              } catch (err) {
                console.error("Error clearing stored session:", err);
              }
            }
            
            if (typeof window !== "undefined" && window.localStorage) {
              try {
                const keysToRemove: string[] = [];
                for (let i = 0; i < window.localStorage.length; i++) {
                  const key = window.localStorage.key(i);
                  if (key && (key.includes("controller") || key.includes("session") || key.includes("cartridge"))) {
                    keysToRemove.push(key);
                  }
                }
                keysToRemove.forEach(key => window.localStorage.removeItem(key));
              } catch (err) {
                console.error("Error clearing localStorage:", err);
              }
            }
            
            connectorAny.controller.reopenBrowser = true;
            // SessionProvider stores RPC as protected _rpcUrl; it is set in starknet.tsx when creating the connector.
          }
          
          // Call the connector's connect method directly (like Jokers of Neon wrapper does)
          // But first check if there's already an account (like Jokers of Neon does)
          // Note: We cleared the session above, so this check might not be needed, but keeping it for safety
          if (connectorAny.controller?.account) {
            connect({ connector: foundConnector });
            return;
          }
          
          if (connectorAny.controller?.connect && typeof connectorAny.controller.connect === 'function') {
            try {
              const controllerConnectResult = connectorAny.controller.connect();
              
              if (controllerConnectResult && typeof controllerConnectResult.then === 'function') {
                controllerConnectResult.then(
                  async (res: any) => {
                    const immediateParams = new URLSearchParams(window.location.search);
                    const immediateStartapp = immediateParams.get("startapp");
                    
                    if (immediateStartapp) {
                      await attemptSessionRetrieval();
                    } else {
                      try {
                        await attemptSessionRetrieval(true);
                        if (sessionRetrieved) return;
                      } catch (_storageError) {
                        // Continue to polling
                      }
                      
                      // Also check getLaunchUrl() immediately and periodically
                      // This is a backup in case appUrlOpen doesn't fire
                      const checkLaunchUrl = async () => {
                        try {
                          const launchUrl = await CapacitorApp.getLaunchUrl();
                          if (launchUrl?.url) {
                            // Use the global handleDeepLink function - it will try to extract startapp from any format
                            if (typeof (window as any).handleDeepLink === 'function') {
                              await (window as any).handleDeepLink(launchUrl.url);
                            }
                            return true;
                          }
                        } catch (error) {
                          // Silently continue
                        }
                        return false;
                      };
                      
                      // Check immediately
                      const foundImmediately = await checkLaunchUrl();
                      if (foundImmediately) {
                        return; // Exit if we found it
                      }
                      
                      // Set up a polling mechanism as a fallback if events don't fire
                      let pollCount = 0;
                      const maxPolls = 40; // Poll for 20 seconds (40 * 500ms)
                      const pollInterval = setInterval(async () => {
                        pollCount++;
                        const urlParams = new URLSearchParams(window.location.search);
                        const startappParam = urlParams.get("startapp");
                        
                        // Check getLaunchUrl() every 5 attempts (every 2.5 seconds)
                        if (pollCount % 5 === 0) {
                          const found = await checkLaunchUrl();
                          if (found) {
                            clearInterval(pollInterval);
                            return;
                          }
                        }
                        
                        if (startappParam) {
                          clearInterval(pollInterval);
                          await attemptSessionRetrieval();
                        } else if (pollCount >= maxPolls) {
                          // Final attempt: try to retrieve from storage even without deep link
                          try {
                            await attemptSessionRetrieval(true); // forceFromStorage = true
                          } catch (finalError) {
                            // Silently handle error
                          }
                          clearInterval(pollInterval);
                          removeHandlers();
                          clearLoginState();
                        }
                      }, 500); // Poll every 500ms
                    }
                  },
                  (err: any) => {
                    console.error("Controller connect rejected:", err);
                    console.error("Rejection details:", JSON.stringify(err));
                    console.error("Error type:", typeof err);
                    console.error("Error keys:", err ? Object.keys(err) : 'no keys');
                    
                    // The rejection might be expected if browser was opened
                    // Check if we have a startapp parameter (deep link might have arrived)
                    setTimeout(async () => {
                      console.log("After rejection - checking for deep link...");
                      const urlParams = new URLSearchParams(window.location.search);
                      const startappParam = urlParams.get("startapp");
                      
                      if (startappParam) {
                        console.log("✅ Found startapp parameter after rejection, attempting session retrieval...");
                        await attemptSessionRetrieval();
                      } else {
                        console.log("No startapp parameter found after rejection");
                        // Still try to call connect hook in case session is stored
                        try {
                          await connect({
                            connector: foundConnector,
                          });
                          // Wait a bit and clear login state
                          setTimeout(() => {
                            clearLoginState();
                          }, 2000);
                        } catch (connectError) {
                          console.error("Connect hook also failed:", connectError);
                          clearLoginState();
                        }
                        // Remove handlers to prevent infinite loading
                        removeHandlers();
                        // Clear login state after timeout
                        setTimeout(() => {
                          clearLoginState();
                        }, 5000);
                      }
                    }, 2000);
                  }
                );
                return; // Don't try connector.connect() if controller.connect() worked
              }
            } catch (err) {
              console.error("Error calling controller.connect():", err);
            }
          }
          
          // Fallback to connector.connect() if controller.connect() didn't work
          if (connectorAny.connect && typeof connectorAny.connect === 'function') {
            console.log("Calling connector.connect() directly...");
            try {
              // The connect method should be async and trigger window.open
              const connectResult = connectorAny.connect();
              console.log("Connect result:", connectResult);
              console.log("Connect result type:", typeof connectResult);
              console.log("Is promise?", connectResult && typeof connectResult.then === 'function');
              
              // Check if it's a promise
              if (connectResult && typeof connectResult.then === 'function') {
                console.log("Waiting for connect promise...");
                connectResult.then(
                  async (res: any) => {
                    console.log("Connector connect resolved:", res);
                    
                    // Wait a bit for the browser to close and any deep link to arrive
                    console.log("Waiting for browser to close and deep link to arrive (2s)...");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Try to manually retrieve session from query or storage
                    // SessionConnector has a tryRetrieveFromQueryOrStorage method that can get the session
                    // even if the deep link wasn't captured
                    // Try multiple times with increasing delays
                    let sessionRetrieved = false;
                    for (let attempt = 1; attempt <= 5; attempt++) {
                      try {
                        if (connectorAny.controller?.tryRetrieveFromQueryOrStorage) {
                          console.log(`Attempt ${attempt}/5: Trying to retrieve session from query or storage...`);
                          const retrievedSession = await connectorAny.controller.tryRetrieveFromQueryOrStorage();
                          console.log(`tryRetrieveFromQueryOrStorage result (attempt ${attempt}):`, retrievedSession);
                          
                          if (retrievedSession) {
                            console.log("✅ Session retrieved successfully!");
                            sessionRetrieved = true;
                            
                            // Wait a bit to ensure session is fully processed
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Trigger connect hook to update React state
                            // This will register the session with Cartridge's backend
                            console.log("🔵🔵🔵 Calling connect() to register session with backend...");
                            console.log("🔵 This will attempt to register and authorize the session on-chain");
                            console.log("🔵 RPC URL:", connectorAny.controller?.rpc || "Not available");
                            
                            try {
                              const connectPromise = connect({
                                connector: foundConnector,
                              });
                              
                              // Wait for the connect promise to resolve
                              await connectPromise;
                              console.log("✅✅✅ Connect promise resolved successfully!");
                            } catch (error) {
                              console.error("❌❌❌ Connect promise error during session registration:", error);
                              
                              // Check for RPC/GraphQL errors
                              const errorStr = error ? JSON.stringify(error) : String(error);
                              if (errorStr.includes('Session not registered') || errorStr.includes('rpc error') || errorStr.includes('GraphQL')) {
                                console.error("❌❌❌ CRITICAL: Session registration failed with RPC/GraphQL error!");
                                console.error("❌ This explains why the deep link isn't arriving");
                                console.error("❌ Cartridge won't redirect if session registration fails");
                              };
                              console.error("Error type:", typeof error);
                              console.error("Error message:", error instanceof Error ? error.message : String(error));
                              
                              // Check if this is a transaction error
                              if (error && typeof error === 'object' && 'message' in error) {
                                const errorMessage = String((error as any).message || '');
                                if (errorMessage.includes('transaction') || errorMessage.includes('revert') || errorMessage.includes('rejected')) {
                                  console.error("❌ Transaction error - session registration/authorization may have failed");
                                }
                              }
                            }
                            
                            // Wait for registration to complete and state to update
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            console.log("Session should now be registered with backend");
                            
                            // Verify the account is actually connected
                            if (connectorAny.controller?.account) {
                              console.log("✅ Connector has account after connect:", connectorAny.controller.account);
                            } else {
                              console.log("⚠️ Connector doesn't have account yet");
                            }
                            
                            break; // Exit the loop if session was retrieved
                          }
                        }
                      } catch (error) {
                        console.log(`Error calling tryRetrieveFromQueryOrStorage (attempt ${attempt}):`, error);
                      }
                      
                      // Wait before next attempt (exponential backoff)
                      if (attempt < 5) {
                        const delay = attempt * 500; // 500ms, 1000ms, 1500ms, 2000ms
                        console.log(`Waiting ${delay}ms before next attempt...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                      }
                    }
                    
                    if (!sessionRetrieved) {
                      console.log("⚠️ Session not retrieved after all attempts");
                    }
                    
                    // Check localStorage for session data
                    try {
                      console.log("Checking localStorage for session data...");
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.includes("controller") || key.includes("session") || key.includes("cartridge"))) {
                          console.log("Found localStorage key:", key, "value:", localStorage.getItem(key)?.substring(0, 100));
                        }
                      }
                    } catch (error) {
                      console.log("Error checking localStorage:", error);
                    }
                    
                    // Immediately check for startapp parameter (might already be there)
                    let urlParams = new URLSearchParams(window.location.search);
                    let startappParam = urlParams.get("startapp");
                    console.log("Immediate check - startapp parameter:", startappParam);
                    console.log("Immediate check - window.location.search:", window.location.search);
                    console.log("Immediate check - window.location.href:", window.location.href);
                    
                    // Wait a bit for the deep link to be processed
                    // The browser might have just closed and the deep link might be coming
                    console.log("Waiting for deep link to arrive (1s)...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Check again after waiting
                    urlParams = new URLSearchParams(window.location.search);
                    startappParam = urlParams.get("startapp");
                    console.log("After 1s wait - startapp parameter:", startappParam);
                    console.log("After 1s wait - window.location.search:", window.location.search);
                    
                    // Check launch URL in case the deep link was missed
                    try {
                      const { App } = await import("@capacitor/app");
                      const launchUrl = await App.getLaunchUrl();
                      console.log("Launch URL after connect:", launchUrl);
                      if (launchUrl?.url) {
                        console.log("✅ Found launch URL after connect, processing...");
                        console.log("Launch URL:", launchUrl.url);
                        // Use the global handleDeepLink function if available
                        if (typeof (window as any).handleDeepLink === 'function') {
                          console.log("Calling handleDeepLink from controller context...");
                          await (window as any).handleDeepLink(launchUrl.url);
                        } else {
                          console.log("⚠️ handleDeepLink not available, deep link URL:", launchUrl.url);
                        }
                      } else {
                        console.log("No launch URL found");
                      }
                    } catch (error) {
                      console.log("Error checking launch URL:", error);
                    }
                    
                    // Wait a bit more for deep link processing
                    console.log("Waiting for deep link processing (1s more)...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Final check for startapp parameter
                    urlParams = new URLSearchParams(window.location.search);
                    startappParam = urlParams.get("startapp");
                    console.log("Final check - startapp parameter:", startappParam);
                    console.log("Final check - window.location.search:", window.location.search);
                    console.log("Final check - window.location.href:", window.location.href);
                    
                    // Set up polling to check for deep link (in case appUrlOpen didn't fire)
                    // Poll every 500ms for up to 10 seconds
                    let pollCount = 0;
                    const maxPolls = 20; // 20 * 500ms = 10 seconds
                    const pollInterval = setInterval(async () => {
                      pollCount++;
                      console.log(`Polling for deep link (attempt ${pollCount}/${maxPolls})...`);
                      
                      // Check launch URL
                      try {
                        const { App } = await import("@capacitor/app");
                        const launchUrl = await App.getLaunchUrl();
                        if (launchUrl?.url && launchUrl.url.includes("startapp=")) {
                          console.log("✅ Found deep link via polling:", launchUrl.url);
                          clearInterval(pollInterval);
                          if (typeof (window as any).handleDeepLink === 'function') {
                            await (window as any).handleDeepLink(launchUrl.url);
                          }
                        }
                      } catch (error) {
                        console.log("Poll error:", error);
                      }
                      
                      // Check window.location
                      const currentParams = new URLSearchParams(window.location.search);
                      const currentStartapp = currentParams.get("startapp");
                      if (currentStartapp) {
                        console.log("✅ Found startapp in window.location via polling:", currentStartapp);
                        clearInterval(pollInterval);
                        // Wait a bit to ensure startapp parameter is processed
                        await new Promise(resolve => setTimeout(resolve, 500));
                        // Trigger session retrieval and registration
                        console.log("Calling connect() to retrieve and register session with startapp parameter...");
                        connect({
                          connector: foundConnector,
                        });
                        // Wait for session registration to complete
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        console.log("Session should now be registered with backend");
                        // Also check if account is connected after a delay
                        setTimeout(() => {
                          console.log("Checking if session was retrieved and registered...");
                          // The account should now be available if session was retrieved
                        }, 1000);
                      }
                      
                      // Also check for the custom event or global variable
                      if ((window as any).__deepLinkProcessed && (window as any).__lastStartappParam) {
                        console.log("✅ Found deep link via global variable:", (window as any).__lastStartappParam);
                        clearInterval(pollInterval);
                        // Update window.location if not already updated
                        const urlParams = new URLSearchParams(window.location.search);
                        if (!urlParams.get("startapp")) {
                          urlParams.set("startapp", (window as any).__lastStartappParam);
                          window.history.replaceState({}, document.title, 
                            `${window.location.pathname}?${urlParams.toString()}`);
                          console.log("Updated window.location from global variable");
                        }
                        // Wait a bit to ensure startapp parameter is processed
                        await new Promise(resolve => setTimeout(resolve, 500));
                        // Trigger session retrieval and registration
                        console.log("Calling connect() to retrieve and register session...");
                        const connectPromise = connect({
                          connector: foundConnector,
                        });
                        // Wait for the connect promise to resolve
                        try {
                          await connectPromise;
                          console.log("✅ Connect promise resolved");
                        } catch (error) {
                          console.log("Connect promise error:", error);
                        }
                        // Wait for session registration to complete and state to update
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        console.log("Session should now be registered with backend");
                        
                        // Verify the account is actually connected
                        if (connectorAny.controller?.account) {
                          console.log("✅ Connector has account after connect:", connectorAny.controller.account);
                        }
                        
                        // Clear the global variable
                        (window as any).__deepLinkProcessed = false;
                      }
                      
                      // Try to manually retrieve session periodically
                      if (pollCount % 4 === 0) { // Every 2 seconds (4 * 500ms)
                        try {
                          if (connectorAny.controller?.tryRetrieveFromQueryOrStorage) {
                            console.log("Periodic attempt to retrieve session from query or storage...");
                            const retrievedSession = await connectorAny.controller.tryRetrieveFromQueryOrStorage();
                            if (retrievedSession) {
                              console.log("✅ Session retrieved via tryRetrieveFromQueryOrStorage!");
                              clearInterval(pollInterval);
                              // Wait a bit to ensure session is fully processed
                              await new Promise(resolve => setTimeout(resolve, 500));
                              // Call connect to register the session with backend
                              console.log("Calling connect() to register session with backend...");
                              const connectPromise = connect({
                                connector: foundConnector,
                              });
                              // Wait for the connect promise to resolve
                              try {
                                await connectPromise;
                                console.log("✅ Connect promise resolved");
                              } catch (error) {
                                console.log("Connect promise error:", error);
                              }
                              // Wait for registration to complete and state to update
                              await new Promise(resolve => setTimeout(resolve, 1000));
                              console.log("Session should now be registered with backend");
                              
                              // Verify the account is actually connected
                              if (connectorAny.controller?.account) {
                                console.log("✅ Connector has account after connect:", connectorAny.controller.account);
                              }
                              
                              return;
                            }
                          }
                        } catch (error) {
                          console.log("Error in periodic session retrieval:", error);
                        }
                      }
                      
                      if (pollCount >= maxPolls) {
                        console.log("Polling timeout - no deep link found");
                        clearInterval(pollInterval);
                        
                        // Final attempt to retrieve session
                        try {
                          if (connectorAny.controller?.tryRetrieveFromQueryOrStorage) {
                            console.log("Final attempt to retrieve session from query or storage...");
                            const retrievedSession = await connectorAny.controller.tryRetrieveFromQueryOrStorage();
                            if (retrievedSession) {
                              console.log("✅ Session retrieved on final attempt!");
                              // Wait a bit to ensure session is fully processed
                              await new Promise(resolve => setTimeout(resolve, 500));
                              // Call connect to register the session with backend
                              console.log("Calling connect() to register session with backend...");
                              const connectPromise = connect({
                                connector: foundConnector,
                              });
                              // Wait for the connect promise to resolve
                              try {
                                await connectPromise;
                                console.log("✅ Connect promise resolved");
                              } catch (error) {
                                console.log("Connect promise error:", error);
                              }
                              // Wait for registration to complete and state to update
                              await new Promise(resolve => setTimeout(resolve, 1000));
                              console.log("Session should now be registered with backend");
                              
                              // Verify the account is actually connected
                              if (connectorAny.controller?.account) {
                                console.log("✅ Connector has account after connect:", connectorAny.controller.account);
                              }
                              
                              return;
                            }
                          }
                        } catch (error) {
                          console.log("Error in final session retrieval:", error);
                        }
                        
                        // Still try to connect in case session was stored
                        connect({
                          connector: foundConnector,
                        });
                      }
                    }, 500);
                    
                    // After successful connection, also call the hook to update state
                    // This will trigger SessionConnector to retrieve the session if startapp is present
                    console.log("Calling connect hook to retrieve session...");
                    
                    // Try one more time to retrieve session before calling connect
                    try {
                      if (connectorAny.controller?.tryRetrieveFromQueryOrStorage) {
                        console.log("Final attempt before connect hook - tryRetrieveFromQueryOrStorage...");
                        const retrievedSession = await connectorAny.controller.tryRetrieveFromQueryOrStorage();
                        if (retrievedSession) {
                          console.log("✅ Session retrieved before connect hook!");
                        }
                      }
                    } catch (error) {
                      console.log("Error in final tryRetrieveFromQueryOrStorage:", error);
                    }
                    
                    connect({
                      connector: foundConnector,
                    });
                    
                    // Give it a moment, then check if account is connected
                    // Poll multiple times to catch when the state updates
                    let checkCount = 0;
                    const maxChecks = 10; // Check for up to 5 seconds (10 * 500ms)
                    const checkInterval = setInterval(() => {
                      checkCount++;
                      console.log(`Checking account connection status (attempt ${checkCount}/${maxChecks})...`);
                      console.log("Account from useAccount:", account);
                      console.log("Address from useAccount:", address);
                      console.log("Is connecting:", isConnecting);
                      console.log("Is pending:", isPending);
                      console.log("Connector:", connector);
                      
                      // If account is available, clear the interval
                      if (account && address) {
                        console.log("✅ Account is connected! Address:", address);
                        clearInterval(checkInterval);
                        return;
                      }
                      
                      // Check if the connector has the account
                      if (connectorAny.controller?.account) {
                        console.log("✅ Connector has account:", connectorAny.controller.account);
                        if (!account || !address) {
                          console.log("⚠️ Connector has account but React hooks haven't updated yet.");
                          console.log("⚠️ This might indicate a React state update issue.");
                        }
                      }
                      
                      // Stop checking after max attempts
                      if (checkCount >= maxChecks) {
                        console.log("⚠️ Max checks reached. Account connection status:", {
                          hasAccount: !!account,
                          hasAddress: !!address,
                          isConnecting,
                          isPending,
                          connectorHasAccount: !!connectorAny.controller?.account
                        });
                        clearInterval(checkInterval);
                        // Clear login state after max checks
                        clearLoginState();
                      }
                    }, 500); // Check every 500ms
                  },
                  (err: any) => {
                    console.error("Connector connect rejected:", err);
                    // Still try the hook in case it helps
                    try {
                      connect({
                        connector: foundConnector,
                      });
                    } catch (error) {
                      // Clear login state if connect fails
                      clearLoginState();
                    }
                    // Clear login state after timeout even if connect succeeds
                    setTimeout(() => {
                      clearLoginState();
                    }, 5000);
                  }
                );
              } else {
                console.log("Connect returned non-promise, checking if window.open was called...");
                // Give it a moment to see if window.open gets called
                setTimeout(() => {
                  console.log("After connect timeout - window.open should have been called by now");
                }, 500);
                
                // Still call the hook
                console.log("Calling connect hook as fallback...");
                try {
                  connect({
                    connector: foundConnector,
                  });
                } catch (error) {
                  clearLoginState();
                }
                console.log("Connect hook called");
                // Clear login state after timeout
                setTimeout(() => {
                  clearLoginState();
                }, 10000);
              }
            } catch (err) {
              console.error("Error calling connector.connect():", err);
              console.error("Error details:", err instanceof Error ? err.message : String(err));
              console.error("Error stack:", err instanceof Error ? err.stack : 'No stack');
              // Fallback to hook
              console.log("Calling connect hook as error fallback...");
              try {
                connect({
                  connector: foundConnector,
                });
              } catch (error) {
                clearLoginState();
              }
              // Clear login state after timeout
              setTimeout(() => {
                clearLoginState();
              }, 10000);
            }
          } else {
            // Fallback to hook if no direct connect method
            console.log("No direct connect method, using hook");
            try {
              connect({
                connector: foundConnector,
              });
            } catch (error) {
              clearLoginState();
            }
            // Clear login state after timeout
            setTimeout(() => {
              clearLoginState();
            }, 10000);
          }
          console.log("=== LOGIN FUNCTION END ===");
        },
        logout: async () => {
          console.log("🔵 Logout called");
          try {
            // Clear stored session from SessionConnector if available
            const isNative = typeof window !== "undefined" && 
              (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
            const connectorId = isNative ? "controller_session" : "controller";
            const foundConnector = connectors.find((conn) => conn.id === connectorId);
            
            if (foundConnector && (foundConnector as any).controller) {
              const controller = (foundConnector as any).controller;
              if (typeof controller.clearStoredSession === 'function') {
                console.log("🔵 Clearing stored session from SessionConnector");
                controller.clearStoredSession();
              }
            }
            
            // Call disconnect hook
            await disconnect();
            console.log("✅ Logout completed");
          } catch (error) {
            console.error("❌ Error during logout:", error);
            // Still try to disconnect even if clearing session fails
            try {
              await disconnect();
            } catch (disconnectError) {
              console.error("❌ Error calling disconnect:", disconnectError);
            }
          }
        },
        enterDungeon,
        bulkMintGames,
      }}
    >
      {children}
    </ControllerContext.Provider>
  );
};

export const useController = () => {
  const context = useContext(ControllerContext);
  if (!context) {
    throw new Error("useController must be used within a ControllerProvider");
  }
  return context;
};

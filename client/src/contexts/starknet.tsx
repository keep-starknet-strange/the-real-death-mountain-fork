import {
  ChainId,
  getNetworkConfig,
  NetworkConfig,
} from "@/utils/networkConfig";
import { stringToFelt } from "@/utils/utils";
import ControllerConnector from "@cartridge/connector/controller";
import SessionConnector from "@cartridge/connector/session";
import { Capacitor } from "@capacitor/core";
import { mainnet } from "@starknet-react/chains";
import { jsonRpcProvider, StarknetConfig, voyager } from "@starknet-react/core";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useState
} from "react";

interface DynamicConnectorContext {
  setCurrentNetworkConfig: (network: NetworkConfig) => void;
  currentNetworkConfig: NetworkConfig;
}

const DynamicConnectorContext = createContext<DynamicConnectorContext | null>(
  null
);

const controllerConfig = getNetworkConfig(ChainId.SN_MAIN);

// Detect if we're on a native platform
const isNative = typeof window !== "undefined" && 
  (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
const isAndroid = typeof window !== "undefined" && Capacitor.getPlatform() === "android";

// Custom URL scheme for deep links - always use custom scheme for native apps
// This matches the Jokers of Neon approach: use custom scheme even during development
const redirectUrl = "lootsurvivor://open";

// SessionConnector expects chainId as a numeric Felt value (string representation of number)
// NOT the string identifier like "SN_MAINNET"
// Convert our chainId string to the numeric Felt format that SessionConnector expects
// This matches what ControllerConnector does: stringToFelt(chainId).toString()
const getSessionConnectorChainId = (chainId: string): string => {
  // Convert string chainId to Felt numeric value (same as ControllerConnector does)
  // This ensures SessionConnector can parse it correctly when storing/retrieving sessions
  // stringToFelt uses shortString.encodeShortString which converts "SN_MAIN" to a Felt number
  return stringToFelt(chainId).toString();
};

const sessionChainId = getSessionConnectorChainId(controllerConfig.chainId);

// Signup options - remove webauthn for Android as per Cartridge docs
// Android does not support WebAuthn passkeys in in-app browsers
const signupOptions = isAndroid
  ? ["google", "discord", "password"]
  : ["google", "discord", "webauthn", "password"];

const cartridgeController =
  typeof window !== "undefined"
    ? isNative
      ? new SessionConnector({
          policies: controllerConfig.policies,
          rpc: controllerConfig.chains[0].rpcUrl,
          chainId: sessionChainId,
          redirectUrl,
          disconnectRedirectUrl: redirectUrl, // Per Cartridge docs
          signupOptions, // Per Cartridge docs - webauthn removed for Android
          // Add namespace, slot, and preset to route to Loot Survivor login
          // These are required to identify which app/game the session is for
          namespace: controllerConfig.namespace,
          slot: controllerConfig.slot,
          preset: controllerConfig.preset,
        } as any)
      : new ControllerConnector({
          policies: controllerConfig.policies,
          namespace: controllerConfig.namespace,
          slot: controllerConfig.slot,
          preset: controllerConfig.preset,
          chains: controllerConfig.chains,
          defaultChainId: stringToFelt(controllerConfig.chainId).toString(),
        })
    : null;

export function DynamicConnectorProvider({ children }: PropsWithChildren) {
  const [currentNetworkConfig, setCurrentNetworkConfig] =
    useState<NetworkConfig>(getNetworkConfig(ChainId.SN_MAIN));

  const rpc = useCallback(() => {
    return { nodeUrl: controllerConfig.chains[0].rpcUrl };
  }, []);

  return (
    <DynamicConnectorContext.Provider
      value={{
        setCurrentNetworkConfig,
        currentNetworkConfig,
      }}
    >
      <StarknetConfig
        chains={[mainnet]}
        provider={jsonRpcProvider({ rpc })}
        connectors={[cartridgeController as any]}
        explorer={voyager}
        autoConnect={false}
      >
        {children}
      </StarknetConfig>
    </DynamicConnectorContext.Provider>
  );
}

export function useDynamicConnector() {
  const context = useContext(DynamicConnectorContext);
  if (!context) {
    throw new Error(
      "useDynamicConnector must be used within a DynamicConnectorProvider"
    );
  }
  return context;
}

import {ChainId, getNativePolicies, getNetworkConfig, NetworkConfig,} from "@/utils/networkConfig";
import {mainnet} from "@starknet-react/chains";
import {jsonRpcProvider, StarknetConfig, voyager,} from "@starknet-react/core";
import {createContext, PropsWithChildren, useCallback, useContext, useState,} from "react";
import {num} from "starknet";
import {isNative, stringToFelt} from "@/utils/utils.ts";
import ControllerConnector from "@cartridge/connector/controller";
import NativeConnector from "@/contexts/connector/NativeConnector.ts";

interface DynamicConnectorContext {
    setCurrentNetworkConfig: (network: NetworkConfig) => void;
    currentNetworkConfig: NetworkConfig;
}

const DynamicConnectorContext = createContext<DynamicConnectorContext | null>(
    null
);

const controllerConfig = getNetworkConfig(ChainId.SN_MAIN);

function createConnector() {
    if (typeof window === "undefined") return null;
    if (isNative()) {
        return new NativeConnector({
            rpc: controllerConfig.rpcUrl,
            chainId: num.toHex(stringToFelt(controllerConfig.chainId)),
            redirectUrl: "lootsurvivor://session",
            policies: getNativePolicies(ChainId.SN_MAIN),
        });
    }
    return new ControllerConnector({
        policies: controllerConfig.policies,
        namespace: controllerConfig.namespace,
        slot: controllerConfig.slot,
        preset: controllerConfig.preset,
        chains: controllerConfig.chains,
        defaultChainId: stringToFelt(controllerConfig.chainId).toString(),
    });
}

const cartridgeController = createConnector();

export function DynamicConnectorProvider({children}: PropsWithChildren) {
    const [currentNetworkConfig, setCurrentNetworkConfig] =
        useState<NetworkConfig>(getNetworkConfig(ChainId.SN_MAIN));

    const rpc = useCallback(() => {
        return {nodeUrl: controllerConfig.chains[0].rpcUrl};
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
                provider={jsonRpcProvider({rpc})}
                connectors={[cartridgeController!]}
                explorer={voyager}
                autoConnect={true}
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

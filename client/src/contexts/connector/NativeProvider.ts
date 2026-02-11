import SessionProvider, {SessionOptions} from "@cartridge/controller/session";
import {ec, encode, stark, WalletAccount} from "starknet";
import {signerToGuid, subscribeCreateSession} from "@cartridge/controller-wasm";

interface SessionRegistration {
    username: string;
    address: string;
    ownerGuid: string;
    transactionHash?: string;
    expiresAt: string;
    guardianKeyGuid: string;
    metadataHash: string;
    sessionKeyGuid: string;
    allowedPoliciesRoot?: string;
}

export type NativeOptions = SessionOptions & {
    /** The project name of Slot instance. */
    slot?: string;
    /** The namespace to use to fetch trophies data from indexer. Will be mandatory once profile page is in production */
    namespace?: string;
    /** The preset to use */
    preset?: string;
};

export default class NativeProvider extends SessionProvider {
    private readonly slot?: string;
    private readonly namespace?: string;
    private readonly preset?: string;

    constructor(props: NativeOptions) {
        super(props);

        this.slot = props.slot;
        this.namespace = props.namespace;
        this.preset = props.preset;
    }


    async connect(): Promise<WalletAccount | undefined> {
        if (this.account) {
            return this.account;
        }

        this.account = this.tryRetrieveFromQueryOrStorage();
        if (this.account) {
            return this.account;
        }

        localStorage.setItem("sessionPolicies", JSON.stringify(this._policies));
        localStorage.setItem("lastUsedConnector", this.id);

        try {
            if (this.reopenBrowser) {
                const pk = stark.randomAddress();
                this._publicKey = ec.starkCurve.getStarkKey(pk);

                localStorage.setItem(
                    "sessionSigner",
                    JSON.stringify({
                        privKey: pk,
                        pubKey: this._publicKey,
                    }),
                );
                this._sessionKeyGuid = signerToGuid({
                    starknet: { privateKey: encode.addHexPrefix(pk) },
                });
                let url = `${
                    this._keychainUrl
                }/session?public_key=${this._publicKey}&redirect_uri=${
                    this._redirectUrl
                }&redirect_query_name=startapp&policies=${JSON.stringify(
                    this._policies,
                )}&rpc_url=${this._rpcUrl}`;

                if (this._signupOptions) {
                    url += `&signers=${encodeURIComponent(JSON.stringify(this._signupOptions))}`;
                }

                if (this.preset) {
                    url += `&preset=${this.preset}`;
                }

                if (this.slot) {
                    url += `&ps==${this.slot}`;
                }

                if (this.namespace) {
                    url += `&ns=${this.namespace}`;
                }

                console.log("BAKOS URL", url);
                window.open(url, "_blank");
            }

            const sessionResult = await subscribeCreateSession(
                this._sessionKeyGuid,
                this._apiUrl,
            );

            // auth is: [shortstring!('authorization-by-registered'), owner_guid]
            const ownerGuid = sessionResult.authorization[1];
            const session: SessionRegistration = {
                username: sessionResult.controller.accountID,
                address: sessionResult.controller.address,
                ownerGuid,
                expiresAt: sessionResult.expiresAt,
                guardianKeyGuid: "0x0",
                metadataHash: "0x0",
                sessionKeyGuid: this._sessionKeyGuid,
            };
            localStorage.setItem("session", JSON.stringify(session));

            this.tryRetrieveFromQueryOrStorage();

            return this.account;
        } catch (e) {
            console.log(e);
            throw e;
        }
    }
}
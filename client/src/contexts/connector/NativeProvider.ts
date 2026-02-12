import SessionProvider from "@cartridge/controller/session";

export default class NativeProvider extends SessionProvider {

    /** Open keychain profile in browser (no iframe), so passkeys work in Capacitor. */
    async openProfile(tab: string = "inventory"): Promise<void> {
        if (!this.account) return;
        const username = await this.username();
        if (!username) return;
        const params = new URLSearchParams();
        params.set("redirect_uri", this._redirectUrl);
        params.set("public_key", this._publicKey);
        params.set("redirect_query_name", "startapp");
        const qs = params.toString();
        const path = `/account/${encodeURIComponent(username)}/${tab}?${qs}`;
        window.open(`${this._keychainUrl}${path}`, "_blank");
    }

    /**
     * Open keychain starter pack in browser (no iframe).
     * Path is a best guess; if "Buy ticket" lands on the wrong page, verify Cartridge keychain routes (e.g. /store/{id}) and update.
     */
    async openStarterPack(id: string | number): Promise<void> {
        const params = new URLSearchParams();
        const qs = params.toString();
        const path = `/starterpack/${id}${qs ? `?${qs}` : ""}`;
        window.open(`${this._keychainUrl}${path}`, "_blank");
    }
}
/** gateway testinin `createClient`i — o anki sahte istemciyi döner (bkz. gateway-kimlik.test.mjs). */
export function createClient() {
    return globalThis.__gatewayAdmin();
}

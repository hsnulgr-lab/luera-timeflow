/** staff-api düzeneğinin `createClient`i — o anki sahte istemciyi döner (bkz. staff-api-harness.mjs). */
export function createClient() {
    return globalThis.__staffApiAdmin();
}

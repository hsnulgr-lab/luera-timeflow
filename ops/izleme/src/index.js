// Cloudflare Worker girişi. HTTP adresi yok (wrangler.toml: workers_dev =
// false); yalnız zamanlayıcıyla, 2 dakikada bir çalışır. Mantık kontroller.js'te.
import { calistir } from './kontroller.js';

export default {
    async scheduled(controller, env) {
        // fetch'i sarmalayarak ver: Workers'ta nesne üstünden çağrılan fetch
        // "Illegal invocation" fırlatır.
        await calistir({ zaman: controller.scheduledTime, env, fetchImpl: (...a) => fetch(...a) });
    },
};

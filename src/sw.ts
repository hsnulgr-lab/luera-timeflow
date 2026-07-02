/// <reference lib="webworker" />
// Luera TimeFlow özel service worker (injectManifest).
// Workbox precache + Web Push (mobil kumanda bildirimleri).
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// ── Precache (eski generateSW davranışının korunması) ──
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

// ── Web Push: gelen bildirim ──
self.addEventListener('push', (event: PushEvent) => {
    let data: { title?: string; body?: string; url?: string; tag?: string } = {};
    try {
        data = event.data?.json() ?? {};
    } catch {
        data = { body: event.data?.text() };
    }
    const title = data.title || 'Luera TimeFlow';
    const options: NotificationOptions = {
        body: data.body || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: data.tag,                 // aynı tag'li bildirimler üst üste yığılmaz
        data: { url: data.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// ── Bildirime tıklama: ilgili sayfayı aç/odakla ──
self.addEventListener('notificationclick', (event: NotificationEvent) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                const wc = client as WindowClient;
                if ('focus' in wc) {
                    wc.navigate(url).catch(() => {});
                    return wc.focus();
                }
            }
            return self.clients.openWindow(url);
        })
    );
});

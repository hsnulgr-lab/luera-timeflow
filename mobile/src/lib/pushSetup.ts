import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { rememberIntent, takeIntent } from './pushIntent.ts';
import { pushHrefOf, type PushActor } from './pushRoute.ts';

/**
 * Bildirimlerin uygulama tarafı kurulumu — davranış ve dokunma.
 *
 * Modül içe aktarıldığı anda kurulum yapılıyor (kök kabukta, `splashHandoff`
 * ile aynı yuvadan): işleyici ilk bildirim düşmeden önce yerinde olmalı,
 * yoksa uygulama açıkken gelen ilk bildirim sessizce yutulur.
 */

/**
 * UYGULAMA AÇIKKEN: banner düşüyor ve SES ÇALIYOR (kullanıcı kararı,
 * 2026-09-23).
 *
 * Canlı zil ekranı zaten tazeliyor, yani bilgi ekranda. Ama personel o anda
 * müşteri kartına bakıyor olabilir ve olay başka bir ekranı ilgilendirir.
 *
 * Android'de ayrıca ZORUNLU: `shouldPlaySound: false` verildiğinde açılır
 * uyarı hiç görünmüyor (kurulu tiplerin kendi notu, Notifications.types.d.ts).
 * Yani "sessiz banner" Android'de banner'sızlık demekti.
 *
 * ROZET YÖNETİLMİYOR: rozet "okunmamış" vaadidir ve üründe hiçbir yerde
 * "okundu" kavramı yok. Hiç temizlenmeyen bir sayı, hiç olmayan sayıdan kötü.
 */
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/**
 * Android kanalı. Sunucu `channelId: 'randevu'` gönderiyor; kanal yoksa
 * Android varsayılana düşüyor — bildirim kaybolmuyor, yalnız önem ve ses
 * ayarı bizim istediğimiz olmuyor.
 */
if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('randevu', {
        name: 'Randevular',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
    }).catch((cause: unknown) => console.warn('bildirim kanalı kurulamadı', String(cause)));
}

/**
 * Bildirime dokunuldu → doğru ekran.
 *
 * ── Neden kabuk düzeninde, kökte değil ──────────────────────────────────────
 * Hedef role göre değişiyor (`/calendar` personelde başka, müdürde başka) ve
 * rol ancak kabukta biliniyor. Ayrıca kökte gezinmek erken olurdu: `enterShell`
 * yığını sıfırlıyor, `useShellIsRoot` kabuğu köke çekiyor — o sıfırlamalardan
 * önce yapılan bir gezinme siliniyor.
 *
 * ── Neden `useLastNotificationResponse` ─────────────────────────────────────
 * Uygulama KAPALIYKEN bildirime basıldığında olay, React ağacı kurulmadan önce
 * düşüyor; bir `useEffect` içindeki dinleyici onu kaçırıyor. Bu kanca hem
 * açılış yanıtını hem sonraki dokunuşları veriyor.
 *
 * `ready` false iken (oturum hâlâ okunuyor) hedef yalnız SAKLANIYOR; kapı
 * geçilince tüketiliyor.
 */
export function usePushIntent(actor: PushActor, ready: boolean): void {
    const router = useRouter();
    const response = Notifications.useLastNotificationResponse();

    useEffect(() => {
        if (!response) return;
        const data = response.notification.request.content.data as { url?: unknown } | undefined;
        const href = pushHrefOf(typeof data?.url === 'string' ? data.url : null, actor);
        // Tanınmayan hedef: hiçbir şey yapılmıyor. Tahmin edilmiş bir adrese
        // gitmek, hiç gitmemekten kötü.
        if (href) rememberIntent({ href, actor, at: Date.now() });
    }, [response, actor]);

    useEffect(() => {
        if (!ready) return undefined;
        const href = takeIntent(actor, Date.now());
        if (!href) return undefined;
        /*
         * ÇİZİM SIRASINDA GEZİNİLMİYOR. Düzenin ilk çiziminde `router.push`
         * çağırmak, `shellRoot` sıfırlamasıyla yarışıyor ve
         * "GO_BACK was not handled by any navigator" ailesini üretiyor.
         */
        const id = setTimeout(() => router.push(href as never), 0);
        return () => clearTimeout(id);
    }, [ready, actor, router]);
}

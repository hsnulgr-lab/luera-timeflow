import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { router } from 'expo-router';

import { api, flushQueue, onStaffSessionStop, tokens } from '../api/staff';
import { myActor, myStaffId } from './me.ts';
import { syncManagerPush, syncPush } from './push.ts';
import { syncArrivalStart } from './arrivalActivityDevice';
import { onTenantReset } from './tenantReset';
import type { SessionStop } from './staffIdentity.ts';

/**
 * Uygulamanın arka plan işleri — kuyruğu boşaltmak ve token'ı tazelemek.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * `flushQueue()` yazıldı ve HİÇBİR YERDEN çağrılmıyordu: kuyruğa giren iş
 * orada sonsuza kadar kalıyordu. Yani çevrimdışı yazma "kaydedildi, sinyal
 * gelince gidecek" diyordu ve gitmiyordu.
 *
 * İki tetik var, ikisi de gerçek olay:
 *   • bağlantı geri geldi  — kuyruk hemen boşalır
 *   • uygulama öne döndü   — telefon cebe girip çıktı, arada her şey olmuş
 *                            olabilir
 *
 * Zamanlayıcı YOK. Arka planda saniye saniye yoklamak pili yer ve kazandığı
 * şey, kullanıcı ekranı açtığında zaten olacak olan.
 *
 * Token 12 saat yaşıyor ve süresi dolmuş bir token KENDİNİ YENİLEYEMİYOR
 * (`session.refresh` de geçerli token istiyor). O yüzden yenileme öne
 * dönüşte, saatte bir yapılıyor: uygulama günde en az bir kez açıldığı
 * sürece token hiç ölmüyor.
 */

/** Tazeleme sıklığı. Her öne dönüşte istek atmak gereksiz trafik. */
const REFRESH_EVERY_MS = 60 * 60_000;

let lastRefresh = 0;

/** Testlerin ve oturum kapatmanın sayacı sıfırlaması için. */
export function resetSyncClock(): void {
    lastRefresh = 0;
}

// Çıkışta / salon değişiminde saat sıfırlanıyor: yeni kişinin jetonu ilk
// öne dönüşte tazelensin, öncekinin saatini miras almasın.
onTenantReset(resetSyncClock);

/**
 * OTURUM DURDU → doğru kapı (2026-11-12).
 *
 * `staff.ts · call()` 401 `revoked`/`invalid_token` ya da 403
 * `subscription_inactive` görünce buraya haber veriyor. Koparılmış oturum
 * PIN ekranına (eşleşme duruyor; telefon da koparıldıysa PIN ekranı kadroyu
 * okuyamaz ve eşleştirmeye gönderir), biten abonelik kapalı kapıya.
 *
 * Aynı anda birkaç istek düşebiliyor (gün + takvim + zil): ekran bir kez
 * değişsin diye kısa bir kilit var.
 */
const STOP_QUIET_MS = 5_000;
let lastStop: { stop: SessionStop; at: number } | null = null;

export function routeForStop(stop: SessionStop): '/(auth)/staff/pin' | '/(auth)/locked' {
    return stop === 'locked' ? '/(auth)/locked' : '/(auth)/staff/pin';
}

onStaffSessionStop((stop) => {
    const now = Date.now();
    if (lastStop && lastStop.stop === stop && now - lastStop.at < STOP_QUIET_MS) return;
    lastStop = { stop, at: now };
    void myActor().catch(() => null).then((actor) => {
        /*
         * PIN ekranı YALNIZ personelin kapısı. Tek kişilik sahipte jeton
         * sessizce yeniden alınıyor (`solo.session`); soğuk açılışta tazeleyici
         * takılmadan önce süresi dolmuş jetonla düşen bir istek sahibi PIN
         * ekranına atmamalı. Kapalı kapı ise iki role de doğru.
         */
        if (stop === 'revoked' && actor !== 'staff') return;
        try {
            if (router.canDismiss()) router.dismissAll();
            router.replace(routeForStop(stop));
        } catch (cause) {
            // Yönlendirici henüz kurulmadıysa (açılışın ilk anı) bir sonraki
            // istek yeniden haber verecek.
            console.warn('[oturum] kapıya yönlendirilemedi', String(cause));
        }
    });
});

async function refreshIfStale(now: number): Promise<void> {
    if (now - lastRefresh < REFRESH_EVERY_MS) return;
    if (!(await tokens.staff())) return;
    lastRefresh = now;
    await api.refresh();
}

/** Bir tur: önce token tazelenir, sonra kuyruk boşaltılır, sonra bildirim. */
export async function syncNow(now = Date.now()): Promise<void> {
    // SIRA ÖNEMLİ: kuyruk ölü bir token'la boşaltılırsa her iş 401 alır ve
    // `fateOf` onları KALICI sayıp atar — kuyruğu boşaltmak değil, silmek olur.
    await refreshIfStale(now);
    await flushQueue();
    /*
     * BİLDİRİM JETONU (103) — turun SONUNDA, kullanıcının işini geciktirmeden.
     *
     * Öne dönüş bu iş için doğru an: telefon cepteyken jeton dönmüş, izin
     * ayarlardan kapatılmış ya da ORTAK TELEFONDA başka personel girmiş
     * olabilir. Kendi hatasını yutuyor — bildirim bir hızlandırıcı, uygulamanın
     * çalışması ona bağlı değil.
     */
    const actor = await myActor().catch(() => null);
    if (actor === 'manager') await syncManagerPush().catch(() => undefined);
    else await syncPush(await myStaffId()).catch(() => undefined);
    // "Müşteri bekliyor" başlatma jetonu (144) — yalnız personel oturumunda
    // (`myStaffId` müdür / tek kişilik oturumda null). Kendi hatasını yutuyor.
    if (actor !== 'manager') await syncArrivalStart(await myStaffId()).catch(() => undefined);
}

export function useBackgroundSync(): void {
    useEffect(() => {
        let alive = true;
        const run = () => {
            if (!alive) return;
            syncNow().catch(() => {
                // Eşitleme sessiz: başarısızlığı kullanıcıya bildiren yer
                // çevrimdışı bandı ve kuyruk sayacı.
            });
        };

        run();

        const onState = (state: AppStateStatus) => { if (state === 'active') run(); };
        const appSub = AppState.addEventListener('change', onState);

        let wasOffline = false;
        const onNetwork = (state: Network.NetworkState) => {
            const offline = state.isConnected === false || state.isInternetReachable === false;
            // YALNIZ geçişte: bağlantı zaten varken gelen her olayda kuyruğu
            // yeniden taramanın anlamı yok.
            if (wasOffline && !offline) run();
            wasOffline = offline;
        };
        Network.getNetworkStateAsync().then(onNetwork).catch(() => undefined);
        const netSub = Network.addNetworkStateListener(onNetwork);

        return () => { alive = false; appSub.remove(); netSub.remove(); };
    }, []);
}

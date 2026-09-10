import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

import { api, flushQueue, tokens } from '../api/staff';

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

async function refreshIfStale(now: number): Promise<void> {
    if (now - lastRefresh < REFRESH_EVERY_MS) return;
    if (!(await tokens.staff())) return;
    lastRefresh = now;
    await api.refresh();
}

/** Bir tur: önce token tazelenir, sonra kuyruk boşaltılır. */
export async function syncNow(now = Date.now()): Promise<void> {
    // SIRA ÖNEMLİ: kuyruk ölü bir token'la boşaltılırsa her iş 401 alır ve
    // `fateOf` onları KALICI sayıp atar — kuyruğu boşaltmak değil, silmek olur.
    await refreshIfStale(now);
    await flushQueue();
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

import { useEffect, useState } from 'react';
import * as Network from 'expo-network';
import { queueLength } from '../api/staff';

/**
 * Çevrimdışı durumu ve bekleyen yazma sayısı.
 *
 * İKİ AYRI ŞEY, tek yerde birleşiyor:
 *   • bağlantı  — cihazda ağ var mı, internete çıkıyor mu
 *   • kuyruk    — gönderilememiş kaç yazma isteği bekliyor
 *
 * Bandın metni ikisini birden söylüyor ("Çevrimdışı · 3 işlem sırada"), ama
 * kuyruk bağlantı geri geldikten sonra da bir süre dolu kalabilir. Bu yüzden
 * bant, bağlantı yokken VEYA kuyrukta iş varken görünür.
 *
 * `isInternetReachable` bilinmiyorsa (null) çevrimdışı SAYILMAZ: bilinmezliği
 * arıza gibi göstermek, sorunsuz çalışan bir salonda kalıcı sarı bant demekti.
 */
export interface Connectivity {
    offline: boolean;
    queued: number;
}

/** Kuyruk yoklama aralığı. Saniyede bir okumak AsyncStorage'ı boşuna yorar. */
const QUEUE_POLL_MS = 5000;

export function useConnectivity(): Connectivity {
    const [offline, setOffline] = useState(false);
    const [queued, setQueued] = useState(0);

    useEffect(() => {
        let alive = true;

        const apply = (state: Network.NetworkState) => {
            if (!alive) return;
            const reachable = state.isInternetReachable;
            setOffline(state.isConnected === false || reachable === false);
        };

        Network.getNetworkStateAsync().then(apply).catch(() => {
            // Durum okunamıyorsa çevrimiçi kabul et; yanlış alarm vermeyelim.
        });
        const sub = Network.addNetworkStateListener(apply);

        return () => { alive = false; sub.remove(); };
    }, []);

    useEffect(() => {
        let alive = true;

        const read = () => {
            queueLength()
                .then((count) => { if (alive) setQueued(count); })
                .catch(() => { /* kuyruk okunamazsa sayı değişmez */ });
        };

        read();
        const id = setInterval(read, QUEUE_POLL_MS);
        return () => { alive = false; clearInterval(id); };
    }, []);

    return { offline, queued };
}

// Bandın metni saf katmanda: bu dosya expo-network'e bağlı olduğu için node
// testleri onu buradan okuyamaz.
export { offlineBannerText } from './offline';

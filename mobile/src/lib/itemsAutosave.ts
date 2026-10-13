/**
 * KUMANDADA KALEMLER ANINDA KAYDEDİLİYOR — saf karar (2026-10-14 · notu 2).
 *
 * Telefonda bulundu: kalemler yalnız "kasaya gönder"de yazılıyordu; geri
 * çıkınca eklenenler gidiyordu. Kullanıcı: "anında yazılması lazım"; ekipte
 * müdür ve masaüstü de anında görsün.
 *
 * Yazma `visitWrite.saveVisitItems`te; burada NE ZAMAN yazılacağı.
 *
 * Saf — React ve Expo taşımıyor; Node testleri doğrudan okuyor.
 */

import { sendableOf, type AdisyonLine } from './adisyon.ts';

/**
 * Son dokunuştan sonra bekleme. Art arda "+ + +" tek yazma olsun; personel
 * geri çıkmadan önce yazma çoktan gitmiş olsun.
 */
export const ITEMS_SAVE_MS = 700;

/**
 * Kaydın anahtarı — sunucuya GİDECEK listenin kendisi (silinmek üzere olan
 * satır hariç). Ekrandaki sıra ve sunucunun çözdüğü adlar anahtara girmiyor:
 * aynı liste iki kez yazılmasın.
 */
export function itemsKey(lines: readonly AdisyonLine[]): string {
    return JSON.stringify(sendableOf(lines).items);
}

export interface SaveGate {
    /** Ziyaret okundu. */
    loaded: boolean;
    /** Gönderim makinesi boşta — "kasaya gönder" süreci kalemleri kendisi yazıyor. */
    sendIdle: boolean;
    /** Adisyon kasada ya da ödendi: değişmez. */
    delivered: boolean;
    /** Başka bir cihaz yazdı: önce kişi karar versin (şerit), üstüne yazılmasın. */
    foreignChange: boolean;
    /** Silme penceresi açık (5 sn geri al): pencere kapanınca yazılır. */
    deleting: boolean;
    /** Listenin anahtarı ve en son yazılan / sunucudan benimsenen anahtar. */
    key: string;
    savedKey: string;
}

export function shouldSaveItems(gate: SaveGate): boolean {
    if (!gate.loaded || !gate.sendIdle || gate.delivered) return false;
    if (gate.foreignChange || gate.deleting) return false;
    return gate.key !== gate.savedKey;
}

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

import { linesDiffer, linesFromItems, sendableOf, type AdisyonLine } from './adisyon.ts';

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

/**
 * EKRAN AYRILIRKEN ya da ARKA PLANA GEÇERKEN — bekleyen yazma HEMEN gider
 * (D4, 2026-10-16).
 *
 * Zamanlayıcı ekran kapanınca iptal ediliyordu: kalem ekleyip 0,7 sn içinde
 * "Geri"ye basan kişinin kalemi kayboluyordu. Silme penceresi de öyle: bir
 * kalemi kaldırıp pencere dolmadan başka kalem ekleyip çıkan kişinin
 * eklediği gidiyor, sildiği geri geliyordu.
 *
 * Silme penceresi o anda KAPANIYOR: "Geri al" ekranla birlikte gidiyor.
 * Silinmek üzere olan satır gidecek listede zaten yok (`sendableOf`), yani
 * yazılan liste silmeyi uyguluyor. Öteki kapılar aynı: gönderim sürerken,
 * kasadaki adisyonda ve başka cihaz yazmışken yazılmıyor.
 */
export function shouldFlushItems(gate: Omit<SaveGate, 'deleting'>): boolean {
    return shouldSaveItems({ ...gate, deleting: false });
}

/**
 * Sıradaki yazmanın kilit damgası — YOLDAKİ yazma bitmeden yenisi başlamıyor
 * (D4).
 *
 * Yavaş ağda (gidiş-dönüş > 0,7 sn) iki yazma aynı damgayla üst üste
 * biniyordu: ikincisi birincinin ilerlettiği damgaya çarpıp `items_stale`
 * alıyor, `savedKey` yüzünden yeniden denenmiyor ve kısa süre sahte "başka
 * cihazda değişti" şeridi çıkıyordu. Artık ikincisi birincinin sonucunu
 * bekliyor ve onun döndüğü YENİ damgayla gidiyor. Birincisi başkasına
 * takıldıysa ya da kuyruğa girdiyse (`fresh` yok) ekranın kilidi geçerli —
 * kimsenin kalemi ezilmez.
 */
export function chainedStamp(fresh: string | null, lockStamp: string | null): string | null {
    return fresh ?? lockStamp;
}

/**
 * BAYAT CEVAPTA NE YAPILACAK (2026-11-12 · Paket C, madde 2).
 *
 * Telefonda bulunan kusur: not kaydı (ya da başlatma, formül, bekleme)
 * sunucuda `updated_at`i ilerletiyor (092). Ardından eklenen kalemin
 * otomatik kaydı eski damgayla gidip `items_stale` alıyordu; kumanda yalnız
 * GÖZLEYİP yeniden denemiyordu ve `savedKey` o listeyi "yazıldı" saydığı için
 * kalem sunucuya hiç gitmiyordu — ekrandan çıkınca kayboluyordu.
 *
 *   'landed'  — sunucudaki kalemler zaten yazmak istediğimiz liste
 *               (kuyruktan sonradan giden kendi işimiz). Yazılacak bir şey yok.
 *   'retry'   — sunucudaki kalemler benimsenen temel liste ya da kendi son
 *               yazmamızla AYNI: damgayı adisyon dışı bir alan ilerletmiş.
 *               Yeni damgayla BİR KEZ daha denenir.
 *   'foreign' — kalemlere gerçekten başka biri dokunmuş. Ezilmez; "değişti"
 *               şeridi eskisi gibi çizilir.
 */
export type StaleVerdict = 'landed' | 'retry' | 'foreign';

export function staleVerdict(input: {
    /** Sunucunun reddinde dönen güncel kalemler. */
    staleItems: unknown;
    /** Yazmak istediğimiz liste. */
    list: readonly AdisyonLine[];
    /** Benimsenmiş temel kalemler. */
    baseItems: unknown;
    /** Kumandanın son BAŞARIYLA yazdığı kalemler; yoksa `null`. */
    ownItems: unknown;
}): StaleVerdict {
    const server = linesFromItems(input.staleItems);
    if (!linesDiffer(input.list, server)) return 'landed';
    if (!linesDiffer(linesFromItems(input.baseItems), server)) return 'retry';
    if (input.ownItems != null && !linesDiffer(linesFromItems(input.ownItems), server)) return 'retry';
    return 'foreign';
}

/**
 * Kumandanın KİLİT DAMGASI — kimin değiştirdiği sorusu. Saf.
 *
 * ── Kusur (2026-09-15, telefonda bulundu) ───────────────────────────────────
 * Personel işlemi başlatıyor. Sunucu `arrived_at` yazıyor ve tetikleyici
 * (092) satırın `updated_at`ini ilerletiyor. Kumanda bu yeni damgayı
 * BENİMSEMİYORDU: yirmi beş saniye sonraki yoklama iki damgayı farklı görüp
 * "Adisyon başka bir cihazda değişti" diyordu — oysa değiştiren personelin
 * KENDİSİYDİ. "Listeyi tazele"ye basınca sunucunun boş listesi benimseniyor
 * ve gönderilmemiş kalemler siliniyordu. Formül yazmak da aynısını yapıyordu.
 *
 * Kusur okumayı "benimse / gözle" diye ikiye ayıran önceki düzeltmeden doğdu:
 * kilidi başkasının değişikliğine karşı korurken kumandanın KENDİ yazmaları
 * hesaba katılmamıştı.
 *
 * ── Kural ───────────────────────────────────────────────────────────────────
 * Damganın değişmesi tek başına bir şey söylemiyor. Kilidin korumakla görevli
 * olduğu şey ADİSYON. Sunucudaki kalemler şu üçünden biriyle aynıysa değişiklik
 * yabancı DEĞİL ve yeni damga güvenle benimsenir:
 *   • benimsenmiş temel liste  → değişen başka bir alan (başlatma, formül)
 *   • kumandanın son yazdığı    → kendi kalem yazmamız
 *   • ekrandaki yerel liste     → kuyruktan sonradan giden kendi işimiz
 * Üçüyle de ayrışıyorsa gerçekten biri adisyona dokunmuş demek.
 */

import { linesDiffer, linesFromItems, type AdisyonLine } from './adisyon.ts';

/** Sunucunun bir cevabından okunan gözlem: damga + o anki kalemler. */
export interface StampObservation {
    stamp: string;
    items: unknown;
}

/**
 * Yazma cevabından gözlem çıkarır.
 *
 * `visit.start` ve `visit.formula` satırın tamamını (`reservation`) dönüyor;
 * `visit.items` yalnız damgayı (`updatedAt`) ve yazdığı kalemleri. Kuyruğa
 * giren yazmanın cevabında damga YOK — o bir gözlem değil.
 */
export function observationOf(response: unknown, sentItems?: unknown): StampObservation | null {
    const body = (response ?? {}) as {
        queued?: boolean;
        updatedAt?: string | null;
        items?: unknown;
        reservation?: { updated_at?: string | null; adisyon_items?: unknown } | null;
    };
    if (body.queued === true) return null;
    if (body.reservation?.updated_at) {
        return { stamp: String(body.reservation.updated_at), items: body.reservation.adisyon_items ?? [] };
    }
    /*
     * Kalem yazmasında SUNUCUNUN çözdüğü liste esas.
     *
     * Gönderilen gövde yalnız kimlik ve adet taşıyor, ad taşımıyor; satır
     * dönüştürücüsü adı olmayan kalemi atıyor. Gönderileni kullanmak "kendi
     * yazdığımız liste"yi BOŞ gösterir ve yabancı değişiklik kararını bozardı.
     * Sunucu kalemleri adıyla, fiyatıyla çözüp geri dönüyor.
     */
    if (body.updatedAt) return { stamp: String(body.updatedAt), items: body.items ?? sentItems ?? [] };
    return null;
}

/**
 * İki damgadan yenisi mi?
 *
 * Yoklama isteği kendi yazmamızdan ÖNCE yola çıkıp SONRA dönebiliyor. O geç
 * cevabın eski damgası, az önce benimsenen yeniyi ezerse yabancı değişiklik
 * uyarısı geri gelirdi.
 */
export function isNewer(candidate: string | null | undefined, current: string | null | undefined): boolean {
    if (!candidate) return false;
    if (!current) return true;
    const a = Date.parse(candidate);
    const b = Date.parse(current);
    // Çözülemeyen damga karşılaştırılamaz — metin eşitsizliği yeni sayılıyor,
    // çünkü sunucunun söylediğini yok saymak daha tehlikeli.
    if (!Number.isFinite(a) || !Number.isFinite(b)) return candidate !== current;
    return a >= b;
}

export interface LockInput {
    /** Benimsenmiş damga (açılış ya da personelin tazelemesi). */
    adopted: string | null;
    /** Sunucuda en son görülen damga. */
    seen: string | null;
    /** Benimsenmiş temel kalemler — ekran bu listeden kuruldu. */
    baseItems: unknown;
    /** Sunucuda en son görülen kalemler. */
    seenItems: unknown;
    /** Kumandanın son BAŞARIYLA yazdığı kalemler; yoksa `null`. */
    ownItems: unknown;
    /** Ekrandaki yerel liste. */
    lines: readonly AdisyonLine[];
}

/** Adisyona gerçekten BAŞKA biri mi dokundu? */
export function isForeignChange(input: LockInput): boolean {
    if (!input.adopted || !input.seen || input.adopted === input.seen) return false;
    const seen = linesFromItems(input.seenItems);
    if (!linesDiffer(linesFromItems(input.baseItems), seen)) return false;
    if (input.ownItems != null && !linesDiffer(linesFromItems(input.ownItems), seen)) return false;
    if (!linesDiffer(input.lines, seen)) return false;
    return true;
}

/**
 * Yazmada kullanılacak kilit damgası.
 *
 * Yabancı değişiklik YOKSA sunucunun gördüğümüz en yeni damgası: aksi hâlde
 * kumanda kendi yazmasına takılıp `items_stale` alırdı. Yabancı değişiklik
 * VARSA benimsenen eski damga: sunucu yazmayı reddetsin ve kimsenin kalemi
 * sessizce ezilmesin — kilidin var olma sebebi.
 */
export function lockStampOf(input: LockInput): string | null {
    if (!input.seen || input.adopted === input.seen) return input.adopted;
    return isForeignChange(input) ? input.adopted : input.seen;
}

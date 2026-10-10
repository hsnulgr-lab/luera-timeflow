/**
 * Tahsilat — kumandanın SON adımı, tek kişilik modda (108 · v4 K3/K4).
 *
 * Saf karar katmanı: ekran çizmiyor, istek atmıyor. Buradaki her cümle
 * testle kilitli, çünkü para yazan bir akışın kelimeleri sessizce
 * kaymamalı.
 *
 * ── Neden iki ayrı düğme ────────────────────────────────────────────────────
 * Ekip modunda son adım "Adisyonu kasaya gönder": personel işi kapatır, parayı
 * başkası alır. Tek kişilik modda o başkası yok ve aynı kişi hem bitiriyor hem
 * tahsil ediyor. v4 bu yüzden son adımı ikiye ayırıyor:
 *
 *   Kartla tahsil et  → adisyon kasaya gider VE para kaydı yazılır
 *   Sonra tahsil et   → adisyon kasaya gider, para BEKLER (Gün'de G4 kartı)
 *
 * İkisi de aynı gönderimi yapıyor; ayrışma yalnız ikinci adımda.
 */

export type CollectMethod = 'cash' | 'card' | 'transfer';

/** Seçicinin sırası ve yazısı — Kasa'nın kendi yöntem adlarıyla aynı. */
export const COLLECT_METHODS: readonly { key: CollectMethod; label: string }[] = [
    { key: 'cash', label: 'Nakit' },
    { key: 'card', label: 'Kart' },
    { key: 'transfer', label: 'Havale' },
] as const;

/**
 * Düğmenin yazısı YÖNTEMLE BİRLİKTE adlanıyor (v4 · K3 notu).
 *
 * "Tahsil et" tek başına ne yapacağını söylemiyor; para alınırken hangi
 * yoldan alındığı kaydın kendisi kadar önemli ve kullanıcı dokunmadan ÖNCE
 * görmeli. Yöntem seçilmeden düğme kapalı: varsayılan bir yöntem koymak,
 * nakit alınan işi karta yazmanın en kolay yolu olurdu.
 */
export function collectLabel(method: CollectMethod | null): { label: string; enabled: boolean } {
    if (method === 'cash') return { label: 'Nakit tahsil et', enabled: true };
    if (method === 'card') return { label: 'Kartla tahsil et', enabled: true };
    if (method === 'transfer') return { label: 'Havaleyle tahsil et', enabled: true };
    return { label: 'Ödeme yöntemini seçin', enabled: false };
}

/**
 * Denemenin nerede durduğu.
 *
 * `closed` ayrı tutuluyor çünkü iki başarısızlık AYNI DEĞİL: gönderim
 * düştüyse kasaya hiçbir şey yazılmadı, gönderim geçip tahsilat düştüyse
 * adisyon kasada AÇIK duruyor. İkisine aynı cümleyi yazmak, ikincisinde
 * yalan söylemek olurdu.
 */
export type CollectStage =
    /** Henüz denenmedi. */
    | 'idle'
    /** İstek gidiyor. */
    | 'sending'
    /** Gönderim de tahsilat da oldu. */
    | 'done'
    /** Gönderim oldu, para BEKLİYOR — kullanıcı "Sonra tahsil et" dedi. */
    | 'pending'
    /** Gönderim düştü: kasaya hiçbir şey yazılmadı. */
    | 'send_failed'
    /** Gönderim oldu, tahsilat düştü: adisyon kasada AÇIK. */
    | 'collect_failed';

/**
 * Hatanın altındaki cümle — düğmenin hemen üstünde (v4 · K4).
 *
 * "Ekran sunucu kabul etmeden değişmez. Ret sebebi kullanıcının baktığı
 * yerde." Sebep bilinmiyorsa uydurulmuyor: genel cümle de bir bilgidir,
 * yanlış sebep değildir.
 */
export function collectErrorLine(stage: CollectStage, code: string | null): string | null {
    if (stage !== 'send_failed' && stage !== 'collect_failed') return null;

    // Kasaya ne yazıldığı, ikisinde FARKLI. Cümlenin ikinci yarısı bu yüzden
    // hâle bağlı; birinci yarısı sebebi söylüyor.
    const tail = stage === 'send_failed'
        ? 'Kasaya bir şey yazılmadı.'
        : 'Adisyon kasada açık kaldı; tekrar deneyebilirsiniz.';

    if (code === 'offline') return `Tahsilat kaydedilmedi: bağlantı yok. ${tail}`;
    if (code === 'zero_amount') {
        // Burada "tekrar dene" demek anlamsız: aynı sonuç çıkar.
        return 'Tahsil edilecek tutar çıkmadı. Hizmetin fiyatı yazılmamış ya da adisyon boş olabilir.';
    }
    if (code === 'not_finished') return `İşlem henüz kapanmadı. ${tail}`;
    if (code === 'subscription_inactive') return 'Aboneliğiniz kapalı; tahsilat kaydedilemiyor.';
    return `Tahsilat kaydedilmedi. ${tail}`;
}

/** Yeniden denemede düğme "Tekrar dene · …" oluyor (v4 · K4). */
export function collectRetryLabel(stage: CollectStage, method: CollectMethod | null): string {
    const base = collectLabel(method);
    if (stage !== 'send_failed' && stage !== 'collect_failed') return base.label;
    if (!base.enabled) return base.label;
    // İlk harf küçülüyor: "Tekrar dene · kartla tahsil et".
    return `Tekrar dene · ${base.label.charAt(0).toLocaleLowerCase('tr-TR')}${base.label.slice(1)}`;
}

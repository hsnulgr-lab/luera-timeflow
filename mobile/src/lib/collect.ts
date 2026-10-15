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

import type { SendState } from './sendToCash.ts';

/**
 * `package` bir para yöntemi DEĞİL (1.0.1): hizmeti paketten ve başka tutarı
 * olmayan adisyonda "Hesabı kapat · pakete dahil". Seçicide yok; kumanda
 * onu kendisi koyuyor (`collectMethodFor`) ve sunucu yalnız tutar ₺0 iken
 * kabul ediyor — para kaydı yazmadan adisyonu kapatıyor.
 */
export type CollectMethod = 'cash' | 'card' | 'transfer' | 'package';

/** Seçicinin sırası ve yazısı — Kasa'nın kendi yöntem adlarıyla aynı. */
export const COLLECT_METHODS: readonly { key: Exclude<CollectMethod, 'package'>; label: string }[] = [
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
    if (method === 'package') return { label: 'Hesabı kapat · pakete dahil', enabled: true };
    if (method === 'cash') return { label: 'Nakit tahsil et', enabled: true };
    if (method === 'card') return { label: 'Kartla tahsil et', enabled: true };
    if (method === 'transfer') return { label: 'Havaleyle tahsil et', enabled: true };
    return { label: 'Ödeme yöntemini seçin', enabled: false };
}

/**
 * Tahsilatın yöntemi — paketli seansta (1.0.1).
 *
 * Hizmeti paketten ve toplam ₺0 ise yöntem SORULMAZ: para alınmıyor, adisyon
 * kapanıyor (`package`). Toplam ₺0'dan büyükse (ürün, ekstra) seçilen yöntem —
 * ve kalem silinip toplam yeniden ₺0 olursa eski seçim düşer, `package`
 * döner. Toplam bilinmiyorsa (`null`) kapatma teklif edilmez.
 */
export function collectMethodFor(
    covered: boolean,
    total: number | null,
    picked: CollectMethod | null,
): CollectMethod | null {
    if (covered && total === 0) return 'package';
    return picked === 'package' ? null : picked;
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
 * "… tahsil et" ya da "Sonra tahsil et"e basınca GÖNDERİME ne olacak
 * (D3, 2026-10-16).
 *
 * Eskiden yalnız `idle` ve `window` gönderimi başlatıyordu. Gönderim bir kez
 * düştüyse (`error`) ya da kuyruğa girdiyse (`queued`) makine o hâlden hiç
 * çıkmıyordu: "Tekrar dene · nakit tahsil et" ağa istek bile atmadan
 * yeniden `send_failed` yazıyordu, "Sonra tahsil et" de boşa dönüyordu.
 * Ölü düğme, dönüşü olmayan bir hâlden doğmuştu.
 *
 *   send   → gönderim hiç yapılmadı ya da pencerede: şimdi yola çıksın
 *   resend → düştü ya da kuyrukta: önce kuyruk boşaltılır ve damga taze
 *            okunur, SONRA yeniden gönderilir (`prepareResend`) — kuyruğa
 *            aynı adisyonun ikinci kopyası girmesin
 *   wait   → yolda ya da olmuş: gönderime dokunulmaz, tahsilat sırasını bekler
 */
export type CollectSendStep = 'send' | 'resend' | 'wait';

export function collectSendStep(send: SendState): CollectSendStep {
    if (send === 'idle' || send === 'window') return 'send';
    if (send === 'error' || send === 'queued') return 'resend';
    return 'wait';
}

/**
 * Gönderim sonuçlanınca tahsilatın hâli.
 *
 *   wait   → gönderim sürüyor
 *   failed → gönderim düştü ya da kuyrukta: `send_failed`, kasaya bir şey
 *            yazılmadı
 *   collect→ gönderim oldu: para kaydı şimdi
 *   none   → yapılacak bir şey yok
 *
 * "SONRA TAHSİL ET" DE SONUCU SÖYLÜYOR (D3). Para beklemede ama adisyon kasaya
 * gitmeli. Eskiden gönderimi düşünce ekran hiçbir şey demiyordu ve kişi
 * adisyonun kasada beklediğini sanıyordu.
 */
export type CollectAfterSend = 'none' | 'wait' | 'failed' | 'collect';

export function collectAfterSend(stage: CollectStage, send: SendState): CollectAfterSend {
    if (stage === 'sending') {
        if (send === 'going' || send === 'window') return 'wait';
        if (send === 'sent' || send === 'sealed') return 'collect';
        return 'failed';
    }
    if (stage === 'pending' && (send === 'error' || send === 'queued')) return 'failed';
    return 'none';
}

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
    // D6: paket / indirim / kısmi / grup — tutarı Kasa hesaplıyor. "Tekrar
    // dene" aynı cevabı alır; kumanda bu kodda güverteyi kasaya gönderime çeviriyor.
    if (code === 'collect_in_kasa') {
        return 'Bu adisyonun tutarını Kasa hesaplıyor (paket, indirim, ön ödeme ya da grup). Tahsilatı masaüstündeki Kasa\'dan yapın.';
    }
    // 1.0.1: ekran ₺0 görürken araya ücretli kalem girdi — kapatılmadı.
    if (code === 'collect_amount_changed') {
        return 'Adisyona ücretli kalem eklenmiş; hesap kapatılmadı. Ödeme yöntemini seçip tahsil edin.';
    }
    // D2: gönderim katalogda olmayan bir kalemde düştü — sebebi o kalem.
    if (code === 'invalid_catalog_item') return `Adisyonda katalogda olmayan bir kalem var; onu kaldırıp tekrar deneyin. ${tail}`;
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

/**
 * Güvertenin hâli — tahsilattan SONRASI dahil (2026-10-13, telefon).
 *
 * Tahsilat bittiğinde düğme hâlâ "Kartla tahsil et" diyordu. Kumanda tahsil
 * edilmiş bir ziyarette yeniden açıldığında da aynısı oluyordu: aynı parayı
 * ikinci kez almaya davet eden etkin bir düğme. Personel kumandasındaki
 * "Kasaya gönderildi" gibi iki adım:
 *
 *   collected → yeşil DOLGU, "Kartla tahsil edildi" — az önce oldu, `SEAL_MS`
 *   paid      → sönük yeşil KAYIT, "Tahsil edildi" — kalıcı
 *
 * `paid` sunucunun gerçeği (`cardState` · `is_paid`). Kumanda yeniden
 * açılınca yerel hâl yine `idle` başlıyor; kaydı sunucu söylüyor.
 */
export type CollectView = 'pick' | 'collected' | 'paid';

export function collectView(stage: CollectStage, paid: boolean, settled: boolean): CollectView {
    if (stage === 'done') return settled ? 'paid' : 'collected';
    // İstek yoldayken sunucunun eski kopyası "ödendi" diyemez; denemenin
    // kendisi ekranda kalıyor.
    if (stage === 'sending') return 'pick';
    return paid ? 'paid' : 'pick';
}

/** Yeşil dolgunun yazısı: yöntemle, düğmenin kendi kelimesiyle. */
export function collectedLabel(method: CollectMethod | null): string {
    if (method === 'package') return 'Hesap kapandı · pakete dahil';
    if (method === 'cash') return 'Nakit tahsil edildi';
    if (method === 'card') return 'Kartla tahsil edildi';
    if (method === 'transfer') return 'Havaleyle tahsil edildi';
    return 'Tahsil edildi';
}

/**
 * Kapanış kadranının rakamı ve kalem sayısı — TAHSİL EDİLECEK olan
 * (2026-10-13, telefon).
 *
 * Ekipte kadran adisyonu gösteriyor: randevunun hizmetini personel değil
 * kasa alıyor. Tek kişilikte aynı kişi tahsil ediyor ve sunucu
 * (`visit.collect`) randevunun hizmet ücretini adisyonun üstüne ekliyor.
 * Kadran yalnız adisyonu gösterince "₺900" yazıyor, kasaya ₺1.650
 * yazılıyordu; Gün ve Kasa da ₺1.650 diyordu.
 *
 * `service` yalnız tek kişilikte ve okunduysa gelir (`fetchServiceCharge`).
 * Okuma sürerken ya da düştüyse kadran adisyonda kalır — tahsilat zaten
 * sunucuya ulaşmadan yapılamıyor.
 */
export function collectDial(input: {
    itemsTotal: number;
    itemCount: number;
    service: { amount: number; count: number } | null;
}): { total: number; count: number } {
    if (!input.service) return { total: input.itemsTotal, count: input.itemCount };
    return {
        // Kuruş yuvarlaması sunucununkiyle aynı: `Math.round(x * 100) / 100`.
        total: Math.round((input.service.amount + input.itemsTotal) * 100) / 100,
        count: input.service.count + input.itemCount,
    };
}

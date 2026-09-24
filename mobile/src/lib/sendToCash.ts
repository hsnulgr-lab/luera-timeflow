/**
 * Personel 11 — adisyonun kasaya gönderilmesi. Saf karar katmanı.
 *
 * Turun tek büyük kararı şu: **bastıktan sonraki 6 saniye boyunca hiçbir şey
 * gönderilmiyor.** Düğme amber'e döner, gövdesi açılır, sağında "Geri al"
 * durur ve altındaki fitil erir. Pencere dolduğunda istek yola çıkar.
 *
 * Bunun sonucu, "gönderilmiş bir şeyi geri çağırma" ucunun HİÇ gerekmemesi:
 * geri alınacak bir şey yok, çünkü henüz gitmedi. Sunucuda böyle bir uç da
 * yok; pencere tamamen istemcide yaşıyor.
 *
 * Bedeli: adisyon kasaya 6 saniye gecikmeli düşüyor. Tahsilat zaten
 * personelin göndermesinden sonra kasada başladığı için bu gecikme salonda
 * görünmüyor.
 *
 * İkinci karar: **"sıraya alındı" yeşilin kısık hâli DEĞİL.** Üç şey birden
 * ayrışıyor — renk (amber/yeşil), gövde (çerçeve/dolgu) ve kelime. Kısık bir
 * yeşil "gitti ama zayıf gitti" diye okunurdu; gerçek şu: gitmedi.
 *
 * Saf: React yok, react-native yok.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Personel 11 Kasaya Gonderme.html`.
 */

export type SendState =
    /** Henüz basılmadı. Turuncu dolgu — turuncu EYLEM demek. */
    | 'idle'
    /** 6 saniyelik geri alma penceresi. İstek YOK. */
    | 'window'
    /** İstek yolda, geri alma kapısı kapandı. */
    | 'going'
    /** Sunucu aldı. Yeşil dolgu — bu üründe dolgu "bitti" demek. */
    | 'sent'
    /** Gönderildikten 2.6 sn sonraki kalıcı hâl. */
    | 'sealed'
    /** Ağ yok: kuyrukta bekliyor. Amber ÇERÇEVE, dolgu yok. */
    | 'queued'
    /** Sunucu konuştu ve hayır dedi. Kuyruğa GİRMEZ. */
    | 'error';

/** Geri alma penceresi. Fitil ve sayaç aynı kaynaktan bunu okuyor. */
export const WINDOW_MS = 6000;

/** Yeşil dolgunun sönük mühre dönmesi. */
export const SEAL_MS = 2600;

/** "Geri alındı" şeridi ne kadar durur. */
export const UNDO_NOTE_MS = 2600;

/**
 * Kilit VERİDEN geliyor. `going` kilitli DEĞİL: istek yolda ama henüz
 * kabul edilmedi; ekranı o aralıkta mühürlemek erken bir söz olurdu.
 */
export function isSealed(state: SendState): boolean {
    return state === 'sent' || state === 'sealed' || state === 'queued';
}

/** Geri alma yalnız pencerede mümkün — başka hiçbir hâlde. */
export function canUndo(state: SendState): boolean {
    return state === 'window';
}

/**
 * Kimlik plakasının hâl kelimesi. `queued` KASADA demez: orada değil.
 *
 * ── Bugün kartıyla AYNI (kullanıcı kararı, 2026-09-15) ──────────────────────
 * İki kaynaktan bakıyor: bu oturumdaki gönderim (`state`) ve sunucunun
 * söylediği (`card` — Bugün kartını çizen `cardState`in türü). Kasaya
 * gönderilmiş bir ziyaret yeniden açılınca oturumda gönderim YOK (`idle`);
 * eskiden plaka o yüzden sarı "Adisyon açık" diyordu, hemen altında
 * "mühürlü · değiştirilemez" yazarken.
 *
 * Tahsil edilmişse "Tahsil edildi": Bugün kartı da öyle diyor. Tutar
 * GÖSTERİLMİYOR — yalnız ödendiği bilgisi.
 */
export function plateWord(
    state: SendState,
    card?: 'atcash' | 'paid' | null,
): { word: string; tone: 'am' | 'gr' } {
    // Ödenmiş ziyaret her şeyin üstünde: sunucu tahsilatı kesin biliyor.
    if (card === 'paid') return { word: 'Tahsil edildi', tone: 'gr' };
    if (state === 'queued') return { word: 'Sırada', tone: 'am' };
    if (state === 'sent' || state === 'sealed' || card === 'atcash') return { word: 'Kasada', tone: 'gr' };
    return { word: 'Adisyon açık', tone: 'am' };
}

/** Kalan saniye. Fitil ve rakam TEK kaynaktan türüyor, asla ayrışmıyor. */
export function secondsLeft(startedAt: number, now: number): number {
    return Math.max(0, Math.ceil((startedAt + WINDOW_MS - now) / 1000));
}

/**
 * Pencerenin cümlesi.
 *
 * `reduceMotion` açıkken fitil çizilmiyor ama SÜRE DURMUYOR: rakam saniyede
 * bir düşmeye devam ediyor ve pencere aynı 6 saniyede kapanıyor.
 */
export function windowLine(seconds: number, reduceMotion: boolean, small = false): string {
    if (reduceMotion || small) return `geri alma penceresi · ${seconds} sn`;
    return `${seconds} sn içinde geri alabilirsiniz`;
}

/**
 * Çubuğun ÇİZİLECEK hâli — sunucu gerçeği yerel makineyi yener.
 *
 * `SendState` yerel bir makine ve kart her açılışta `idle` başlıyor. Ziyaret
 * zaten tahsil edilmişse ya da kasadaysa yalnız ona bakmak, olmuş bitmiş bir
 * işi yeniden teklif etmek demekti: 2026-09-24'te kullanıcı tahsil edilmiş
 * bir kartta "Adisyonu kasaya gönder" düğmesini basılabilir buldu. Plakanın
 * üstü "Tahsil edildi" derken altı gönderim teklif ediyordu.
 *
 * YOLDAKİ İŞ İSTİSNA: `window` (geri alma penceresi açık) ve `going` (istek
 * yolda) hâllerinde yerel makine kazanıyor. O iki hâl saniyeler sürüyor ve
 * araya giren bir sunucu okuması kullanıcının elindeki işi ezmemeli.
 */
export type BarView = SendState | 'paid';

export function barView(state: SendState, closed: 'atcash' | 'paid' | null): BarView {
    if (state === 'window' || state === 'going') return state;
    if (closed === 'paid') return 'paid';
    if (closed === 'atcash' && state === 'idle') return 'sealed';
    return state;
}

/** Düğmenin üstündeki başlık. */
export function barTitle(state: BarView, at?: string): string {
    switch (state) {
        // Tahsil edilmiş ziyarette gönderilecek bir şey yok; çubuk artık bir
        // düğme değil, bir cümle.
        case 'paid': return 'Tahsil edildi';
        case 'idle': return 'Adisyonu kasaya gönder';
        case 'window': return 'Kasaya gidiyor';
        case 'going': return 'Gönderiliyor';
        case 'sent': return 'Kasaya gönderildi';
        case 'sealed': return `${at ?? ''}’te kasaya gönderildi`;
        case 'queued': return 'Sırada · gönderilmedi';
        case 'error': return 'Kasaya gönderilemedi';
    }
}

/**
 * Düğmenin altındaki cümle.
 *
 * `sealed` ve `sent`te bu cümle §2'nin cevabı: düzeltme isteği DÜĞMESİ
 * çizilmedi çünkü sunucuda karşılığı yok. Ölü bir düğme yerine nereye
 * söyleneceğini yazan bir satır duruyor.
 */
export function barFoot(state: BarView): string | null {
    switch (state) {
        case 'paid':
            return 'Tahsilat tamamlandı ve adisyon kapandı.';
        case 'window':
            return 'Pencere kapanana kadar istek gönderilmiyor.';
        case 'sent':
        case 'sealed':
            return 'Adisyon artık kasada. Bir kalem yanlışsa kasaya söylemeniz gerekiyor; buradan değiştirilemez.';
        case 'queued':
            return 'Adisyon telefonunuzda bekliyor. Sinyal gelince kendisi gidecek — tekrar basmanız gerekmiyor.';
        case 'error':
            // Tekrar dene düğmesi YOK: 403 ve 409 tekrar denemekle düzelmiyor.
            return 'Kuyruğa alınmadı: tekrar denemek düzeltmez. Kasadaki adisyonu kontrol ettirin.';
        default:
            return null;
    }
}

/**
 * Gönderimin sonucu — hangi hâle düşüyoruz.
 *
 * Ekran bunu KENDİ BAŞINA karar veremezdi ve vermiyordu da: 900 ms sonra
 * koşulsuz `sent` yazıyordu. `queued` ve `error` hâlleri tasarlanmış,
 * yazılmış, test edilmişti ama hiçbir yerden tetiklenemiyordu — yani ekran
 * her zaman "gönderildi" diyordu, adisyon gerçekten gitmemiş olsa bile.
 *
 * Sıra ÖNEMLİ. Sunucu konuştuysa kuyruk devreye girmez: 403 ve 409 tekrar
 * denemekle düzelmez, kuyrukta sonsuza kadar dönerdi. Aynı kural istemcinin
 * yazma katmanında da yazılı (`api/staff.ts` · write()).
 */
export function sendOutcome(input: {
    offline: boolean;
    /** Sunucunun hata kodu. Varsa sunucuya ULAŞILDI demektir. */
    serverCode?: string | null;
}): { state: 'sent' | 'queued' | 'error'; code: string | null } {
    if (input.serverCode) return { state: 'error', code: input.serverCode };
    if (input.offline) return { state: 'queued', code: null };
    return { state: 'sent', code: null };
}

/**
 * Kuyruk şeridinin cümlesi.
 *
 * Sayı UYDURULMUYOR: ekranda sabit "Sırada 3 yazma" yazıyordu. Gerçek kuyruk
 * boşken bir sayı yazmak, olmayan işleri varmış gibi göstermek olurdu — ama
 * "bu adisyon sırada" her hâlde doğru.
 */
export function queuedBandLabel(queueLength: number): string {
    return queueLength > 0 ? `Sırada ${queueLength} yazma` : 'Bu adisyon sırada';
}

/** Sunucunun hayırını personelin diline çeviren tek yer. */
export function errorLine(code: string | null | undefined): string {
    switch (code) {
        case 'already_open': return 'Kasadaki adisyon açıldı';
        case 'already_finished': return 'Bu ziyaret kasada zaten kapandı';
        case 'forbidden': return 'Bu adisyonu gönderme yetkiniz yok';
        case 'formula_locked': return 'Bu ziyaret kasada kilitli';
        // İyimser kilit: arada başka bir cihaz aynı adisyona yazdı. Kullanıcı
        // SUÇLANMIYOR — listeyi tazeleyip kalemini yeniden eklemesi gerekiyor.
        case 'items_stale': return 'Adisyon başka bir cihazda değişti';
        case 'items_unsendable': return 'Bir kalem gönderilemiyor · listeyi tazeleyin';
        case 'writes_disabled': return 'Telefondan gönderim şu an kapalı';
        default: return 'Bu adisyon kasada zaten açık';
    }
}

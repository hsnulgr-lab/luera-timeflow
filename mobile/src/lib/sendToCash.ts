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

/** Kimlik plakasının hâl kelimesi. `queued` KASADA demez: orada değil. */
export function plateWord(state: SendState): { word: string; tone: 'am' | 'gr' } {
    if (state === 'queued') return { word: 'Sırada', tone: 'am' };
    if (state === 'sent' || state === 'sealed') return { word: 'Kasada', tone: 'gr' };
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

/** Düğmenin üstündeki başlık. */
export function barTitle(state: SendState, at?: string): string {
    switch (state) {
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
export function barFoot(state: SendState): string | null {
    switch (state) {
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

/** Sunucunun hayırını personelin diline çeviren tek yer. */
export function errorLine(code: string | null | undefined): string {
    switch (code) {
        case 'already_open': return 'Kasadaki adisyon açıldı';
        case 'forbidden': return 'Bu adisyonu gönderme yetkiniz yok';
        case 'formula_locked': return 'Bu ziyaret kasada kilitli';
        default: return 'Bu adisyon kasada zaten açık';
    }
}

/**
 * Yazma isteklerinin KADERİ — saf karar katmanı.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * `api/staff.ts` iki yerde karar veriyordu ve ikisi de fazla kabaydı:
 *
 *   write()       "sunucu konuştuysa kuyruğa girme" — 403 için doğru, ama 500
 *                 de sunucunun konuşmasıdır ve o TEKRAR DENENMELİ. Bu kuralla
 *                 sunucunun bir dakikalık aksaması, personelin yazdığı
 *                 adisyonu kaybettiriyordu.
 *
 *   flushQueue()  "sunucu reddettiyse at" — 500 alan bir işi KALICI sayıp
 *                 kuyruktan siliyordu. Kuyruğu devreye almak, bu hâliyle
 *                 veri kaybını devreye almak demekti.
 *
 * Ayrım üç değil İKİ uçlu tutuluyor ve bilinmeyen GEÇİCİ sayılıyor: yanlış
 * "kalıcı" kararı işi siler, yanlış "geçici" kararı yalnız birkaç kez
 * gereksiz dener. İkisinin bedeli aynı değil.
 *
 * Saf: React yok, react-native yok, fetch yok.
 */

export type Fate =
    /** Tekrar denemek DÜZELTMEZ. İş atılır ve kullanıcıya söylenir. */
    | 'permanent'
    /** Şimdi olmadı, sonra olabilir. Kuyrukta kalır. */
    | 'transient';

/**
 * İsteğin kaderi.
 *
 * `status` yoksa sunucuya HİÇ ULAŞILAMADI demektir (ağ hatası, zaman aşımı,
 * DNS) — bunlar tanımı gereği geçici.
 */
export function fateOf(input: { status?: number | null }): Fate {
    const status = input.status;
    if (typeof status !== 'number') return 'transient';
    // 408 zaman aşımı, 429 çok fazla istek: ikisi de "sonra gel" demek.
    if (status === 408 || status === 429) return 'transient';
    // 5xx sunucunun kendi arızası; istek geçerliydi.
    if (status >= 500) return 'transient';
    // Geri kalan 4xx: istek YANLIŞ. 403 yetkisiz, 409 çakışma, 400 bozuk
    // gövde — hiçbiri tekrar denemekle düzelmiyor.
    if (status >= 400) return 'permanent';
    // 2xx/3xx buraya hiç gelmemeli; geldiyse bilmiyoruz demektir.
    return 'transient';
}

/** Kaçıncı denemeden sonra pes ediliyor. */
export const MAX_ATTEMPTS = 6;

/** Kuyruğun üst sınırı. Aşılırsa kullanıcıya SÖYLENİR, sessizce kırpılmaz. */
export const QUEUE_LIMIT = 200;

const BASE_MS = 1000;
const CEILING_MS = 60_000;

/**
 * Bir sonraki denemeye kalan süre.
 *
 * Üssel + JİTTER. Jitter olmadan, sinyal geri geldiği anda kuyruktaki bütün
 * işler aynı milisaniyede yola çıkar; bodrumdan çıkan beş telefon sunucuya
 * aynı anda vurur ve 5xx'i kendileri üretir.
 *
 * `random` dışarıdan geliyor ki test edilebilsin — `Math.random` burada
 * çağrılsaydı bu fonksiyon saf olmazdı.
 */
export function backoffMs(attempt: number, random: number): number {
    const step = Math.min(BASE_MS * 2 ** Math.max(0, attempt), CEILING_MS);
    // ±%25: aralığın kendisi de üssel büyüyor.
    const jitter = step * 0.25 * (random * 2 - 1);
    return Math.max(0, Math.round(step + jitter));
}

/** Bu iş için uğraşmaya devam ediliyor mu. */
export function shouldRetry(attempts: number): boolean {
    return attempts < MAX_ATTEMPTS;
}

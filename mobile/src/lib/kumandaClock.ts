/**
 * Kumanda kökünün SAATİ (Hız 2 · 2026-11-12). Saf — testte çalıştırılıyor.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Kumanda kökü `setInterval(() => setNow(Date.now()), 1000)` ile iş sürerken
 * ve bekleme varken HER SANİYE baştan çiziliyordu — 2600 satırlık ekran,
 * boya beklemesi boyunca 30–40 dakika. Oysa kökün `now`'dan türettiği her
 * şey DAKİKA ya da EŞİK hassasiyetinde:
 *
 *   • plan çubuğu ve "n dk kaldı"   geçen DAKİKA (`planBar`)
 *   • kadran (başlamaya / gecikme / bekliyor)   duvar ya da varış dakikası
 *   • "Gönderilmedi" şeridindeki saat   duvar dakikası
 *   • ışığın rengi   beklemenin 5 dk ve 0 eşiği (`waitLevel`)
 *
 * Saniyeyi gösteren iki şey (geçen süre sayacı, bekleme halkası) kendi
 * küçük bileşenlerinde sayıyor. Kök artık yalnız BİR SONRAKİ değişim anında
 * uyanıyor; bekleme bittiği an da o anlardan biri — ekran o saniyede
 * tepki veriyor, bir dakika sonra değil.
 */

export const MINUTE_MS = 60_000;

/** Son beş dakika: `waitLevel`'in "hot" eşiği (saniye). */
export const WAIT_HOT_SEC = 300;

/**
 * Zamanlayıcılar nadiren de olsa birkaç ms ERKEN uyanabiliyor; o zaman
 * `floor` henüz dönmemiş olur ve kök boşuna çizilip bir tur geç kalır.
 */
export const TICK_MARGIN_MS = 25;

export interface ClockInputs {
    /** İş başladıysa ve bitmediyse başlama anı (ms). */
    runningSince: number | null;
    /** Müşteri geldi ama iş başlamadıysa geliş anı (ms) — "n dk bekliyor". */
    customerSince: number | null;
    /** Bekleme kuruluysa bitiş anı (ms). */
    waitEndsAt: number | null;
}

/** `origin`'den sayılan bir sonraki tam dakika sınırı (`now`'dan SONRA). */
function nextMinuteFrom(origin: number, now: number): number {
    const passed = Math.floor((now - origin) / MINUTE_MS);
    return origin + (passed + 1) * MINUTE_MS;
}

/**
 * Kökün bir sonraki uyanma anı (ms).
 *
 * Duvar dakikası HER ZAMAN aday: başlamamış randevunun kadranı (randevu
 * saati tam dakikada) ve şeritteki saat ona bağlı. Ötekiler varsa eklenir.
 */
export function nextRootTick(now: number, inputs: ClockInputs): number {
    const candidates = [nextMinuteFrom(0, now)];
    if (inputs.runningSince !== null && Number.isFinite(inputs.runningSince)) {
        candidates.push(nextMinuteFrom(inputs.runningSince, now));
    }
    if (inputs.customerSince !== null && Number.isFinite(inputs.customerSince)) {
        candidates.push(nextMinuteFrom(inputs.customerSince, now));
    }
    if (inputs.waitEndsAt !== null && Number.isFinite(inputs.waitEndsAt)) {
        const hot = inputs.waitEndsAt - WAIT_HOT_SEC * 1000;
        if (hot > now) candidates.push(hot);
        if (inputs.waitEndsAt > now) candidates.push(inputs.waitEndsAt);
    }
    return Math.min(...candidates.filter((at) => at > now));
}

/**
 * Kökün `setTimeout` gecikmesi.
 *
 * Sınır, kökün SON ÇİZDİĞİ ana (`renderedNow`) göre hesaplanıyor, duvar
 * saatine göre değil. Arada bir olay geldiyse (iş başka cihazda başladı,
 * bekleme kuruldu) ve çizilen an bir sınırı çoktan geride bıraktıysa
 * gecikme sıfır çıkıyor: kök HEMEN yeniden çiziliyor.
 */
export function rootTickDelay(renderedNow: number, wallNow: number, inputs: ClockInputs): number {
    return Math.max(0, nextRootTick(renderedNow, inputs) - wallNow) + TICK_MARGIN_MS;
}

/**
 * Saniyelik sayaçların bir sonraki tik gecikmesi — `origin`'e HİZALI.
 *
 * `setInterval(…, 1000)` bağlandığı andan sayıyordu; sayaç ise başlama ya
 * da bitiş anından. İkisi kaydığında ekranda bir saniye iki kez görünüp
 * sonraki atlanıyordu. Hizalı tik her saniyeyi tam bir kez gösteriyor.
 */
export function nextSecondDelay(now: number, origin: number): number {
    const into = (((now - origin) % 1000) + 1000) % 1000;
    return 1000 - into + TICK_MARGIN_MS;
}

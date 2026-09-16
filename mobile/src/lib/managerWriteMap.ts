/**
 * Müdürün yazmalarının SAF kuralları — sorgu kurmayan, React görmeyen kısım.
 *
 * Müdürün ilk yazma yolu bu. Personel `staff-api` üzerinden yazıyor ve orada
 * idempotens kütüğü, kuyruk, kader ayrımı var. Müdür doğrudan Postgres'e
 * yazıyor — masaüstünün yaptığının aynısı — ve oradaki korumalar başka:
 * iyimser kilit (092) ve çakışma tetikleyicisi (060).
 */

/** Yazmanın sonucu. Üç hâl, üç ayrı ekran davranışı. */
export type WriteOutcome =
    /** Yazıldı. Yeni `updated_at` taşınıyor: sonraki yazma onu kullanacak. */
    | { ok: true; updatedAt: string | null }
    /**
     * Başkası önce değiştirdi. EZİLMEDİ — ekran okuyup farkı gösterecek.
     * 092'nin personel tarafında engellediği şeyin müdür karşılığı.
     */
    | { ok: false; kind: 'stale' }
    /** Sunucudaki çakışma koruması reddetti (060). */
    | { ok: false; kind: 'conflict'; message: string }
    /** Yazma vanası kapalı (095 · `MANAGER_WRITES_ENABLED`). */
    | { ok: false; kind: 'paused' }
    /** Öteki her şey. */
    | { ok: false; kind: 'failed' };

/**
 * 060'ın attığı hatanın MÜDÜRE söylenecek hâli.
 *
 * Tetikleyici `raise exception` ile konuşuyor ve mesajı teknik. Ekranda
 * "kaydedilemedi" yazmak, müdüre NE YAPACAĞINI söylememek olurdu: çakışma
 * düzeltilebilir bir şey, saati değiştirmek yeter.
 *
 * Personelin adı biliniyorsa cümleye giriyor — "o saatte Merve'nin başka
 * randevusu var" ile "o saat dolu" arasındaki fark, müdürün bir sonraki
 * hamlesini belirliyor.
 */
export function conflictLine(staffName: string | null | undefined): string {
    const who = String(staffName ?? '').trim();
    return who
        ? `O saatte ${who} zaten başka bir randevuda.`
        : 'O saat dolu — aynı anda iki randevu olamaz.';
}

/**
 * Veritabanı hatasını sonuca çevirir.
 *
 * ── Neden mesaj METNİNE bakılıyor ───────────────────────────────────────────
 * 060 kendi hatasını `raise exception` ile atıyor ve PostgREST onu tek bir
 * koda (`P0001`) indiriyor. Ayırt edecek başka bir alan yok. Metin eşleşmesi
 * kırılgan, evet — ama alternatifi bütün `P0001`leri "bilinmeyen hata" diye
 * göstermek ve müdüre düzeltilebilir bir şeyi düzeltilemez gibi sunmak.
 */
export function outcomeOf(
    error: { code?: string | null; message?: string | null } | null,
    staffName: string | null | undefined,
    rowsWritten: number,
): WriteOutcome {
    if (error) {
        const text = String(error.message ?? '').toLocaleLowerCase('tr-TR');
        if (/çakış|conflict|overlap|dolu|kapasite/.test(text)) {
            return { ok: false, kind: 'conflict', message: conflictLine(staffName) };
        }
        return { ok: false, kind: 'failed' };
    }
    /*
     * HATA YOK AMA SATIR DA YOK.
     *
     * İyimser kilit tam olarak böyle konuşuyor: `.eq('updated_at', beklenen)`
     * eşleşmeyince UPDATE sıfır satır günceller ve bu bir HATA DEĞİLDİR.
     * Kontrol edilmezse yazma "başarılı" görünür ve müdür yapılmamış bir
     * değişikliği yapılmış sanır — kilidin hiç olmamasından kötü.
     */
    if (rowsWritten === 0) return { ok: false, kind: 'stale' };
    return { ok: true, updatedAt: null };
}

/** Kilit tutmayınca ekranın söyleyeceği söz. */
export const STALE_TITLE = 'Bu randevu başka bir cihazda değişti';
export const STALE_LINE = 'Değişikliğiniz uygulanmadı. Güncel hâli getirdik — yeniden deneyin.';

/**
 * Randevunun YAZILABİLİR alanları.
 *
 * Ekran her değişikliği önce yerel saf yardımcılarla uyguluyor
 * (`applyMove`, `applyService`, `applyNote`) ve elinde tam bir `Appt` oluyor.
 * Buradan yalnız sütuna karşılığı olan ve MÜDÜRÜN değiştirebileceği alanlar
 * süzülüyor.
 *
 * Dışarıda kalanlar bilerek:
 *   • `arrived_at` ve `service_ended_at` — PERSONELİN damgaları. Müdürün
 *     kartından yazılsalardı, müdür hizmeti başlatmış gibi görünürdü.
 *   • `customer_name` / `customer_phone` / `customer_id` — müşteri kaydının
 *     alanları; randevudan değiştirilirse müşteri kartıyla ayrışırlar.
 *   • `is_paid`, `adisyon_items` — Kasa'nın ve kumandanın alanları.
 */
export function writablePatch(next: {
    date: string; start_time: string; end_time: string;
    service: string; service_color: string | null;
    status: string; staff_id?: string | null; notes: string | null;
    customer_arrived_at?: string | null;
}): Record<string, unknown> {
    return {
        date: next.date,
        start_time: next.start_time,
        end_time: next.end_time,
        service: next.service,
        service_color: next.service_color,
        status: next.status,
        staff_id: next.staff_id ?? null,
        notes: next.notes,
        customer_arrived_at: next.customer_arrived_at ?? null,
    };
}

/**
 * Bildirime dokununca NEREYE gidilecek — saf karar katmanı, React'siz.
 *
 * ── Sunucu masaüstü rotası yazıyor ──────────────────────────────────────────
 * `payload.url` 037'den beri var ve MASAÜSTÜ için yazıldı: `/calendar`,
 * `/personel`, `/kasa`, `/takvim?date=…`, `/mesajlar`. Telefonun rotaları
 * bambaşka (`/personel/calendar`, `/mudur/cash`) ve bazılarının mobil karşılığı
 * HİÇ YOK. Yani gelen dizge doğrudan kullanılamaz.
 *
 * ── Neden BEYAZ LİSTE, neden birleştirme yok ────────────────────────────────
 * Sunucudan gelen dizgeyi bir rotayla birleştirmek şuna yol açardı:
 * `/personel` + bir çöp parça = `/personel/<çöp>` — ve bu adres MÜDÜRÜN
 * personel-günü ekranı. Yani personele gelen bir bildirim, müdüre ait bir
 * ekranı açabilirdi. İki rota aynı segmenti paylaşıyor ve bu ayrım elle
 * yapılmak zorunda.
 *
 * ── Tanınmayan hedef `null` ─────────────────────────────────────────────────
 * Tahmin edilmiş bir adrese gitmek, hiç gitmemekten kötü: kullanıcı bildirime
 * dokunur, alakasız bir ekran açılır ve ne olduğunu anlamaz. `null` demek
 * "uygulamayı aç, kabuğun kökünde bırak" demek — dürüst ve zararsız.
 */

export type PushActor = 'manager' | 'staff';

/** `?date=2026-09-23` biçimini doğrulamadan taşımıyoruz. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sunucunun yazdığı adres → telefonun rotası. Rol başına ayrı liste, çünkü
 * aynı dizge iki rolde iki ayrı ekran demek (`/calendar`).
 *
 * Listede OLMAYANLAR bilinçli: `/mesajlar` ve faturalama ekranı mobilde YOK,
 * `/masa` modülü telefona hiç gelmedi. Onlar `null`'a düşüyor.
 */
const MAP: Record<PushActor, Record<string, string>> = {
    staff: {
        '/calendar': '/personel/calendar',
        '/personel': '/personel',
    },
    manager: {
        '/calendar': '/mudur/calendar',
        '/takvim': '/mudur/calendar',
        '/kasa': '/mudur/cash',
    },
};

/**
 * Bildirimin hedefi. `null` = tanınmadı, kabuğun kökünde kal.
 *
 * `date` sorgu parametresi TAŞINMIYOR, YENİDEN KURULUYOR: yalnız biçimi
 * doğrulanmış bir tarih hedefe ekleniyor.
 */
export function pushHrefOf(url: string | null | undefined, actor: PushActor): string | null {
    if (typeof url !== 'string' || !url.startsWith('/')) return null;
    const [path, query = ''] = url.split('?');
    const target = MAP[actor][path];
    if (!target) return null;

    const date = new URLSearchParams(query).get('date');
    if (date && ISO_DATE.test(date)) return `${target}?date=${date}`;
    return target;
}

/**
 * Randevu kimliği — sunucunun `tag`inden (`assign-<uuid>`, `moved-<uuid>`…).
 *
 * Sunucuyu değiştirmeye gerek yok: etiket zaten kimliği taşıyor ve `send-push`
 * onu `data.tag` içinde iletiyor. Bugün kullanılmıyor; tek randevuyu doğrudan
 * açmak istendiğinde burada hazır.
 */
export function reservationIdOf(tag: string | null | undefined): string | null {
    if (typeof tag !== 'string') return null;
    const at = tag.indexOf('-');
    if (at < 0) return null;
    const id = tag.slice(at + 1);
    return /^[0-9a-fA-F-]{36}$/.test(id) ? id : null;
}

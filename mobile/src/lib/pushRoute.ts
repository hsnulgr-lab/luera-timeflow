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

/**
 * Bildirimi kimin kabuğu açıyor. `solo` (2026-10-14): tek kişilik kabuk da
 * müdür olarak kayıtlı, ama ekranları `/tek/…` — `manager` eşlemesiyle açılınca
 * müdür kabuğuna düşüyordu.
 */
export type PushActor = 'manager' | 'staff' | 'solo';

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
    // Personelin bütün bildirimleri Bugün'ü açıyor (kullanıcı kararı
    // 2026-10-14). Başka güne ait bildirimin hangi günü açacağı ayrıca
    // konuşulacak — o güne kadar Bugün, bugünde.
    staff: {
        '/calendar': '/personel',
        '/personel': '/personel',
    },
    manager: {
        '/calendar': '/mudur/calendar',
        '/takvim': '/mudur/calendar',
        '/kasa': '/mudur/cash',
    },
    solo: {
        '/calendar': '/tek/calendar',
        '/takvim': '/tek/calendar',
        '/kasa': '/tek/cash',
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

/** Etiket = tür + "-" + randevu kimliği. Tür kendisi tire taşıyabilir (`iptal-mudur`). */
const TAGGED = /^([a-z]+(?:-[a-z]+)*)-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/**
 * Randevu kimliği — sunucunun `tag`inden (`assign-<uuid>`, `moved-<uuid>`,
 * `iptal-mudur-<uuid>`…). Sunucuyu değiştirmeye gerek yok: etiket kimliği
 * zaten taşıyor ve `send-push` onu `data.tag` içinde iletiyor.
 */
export function reservationIdOf(tag: string | null | undefined): string | null {
    if (typeof tag !== 'string') return null;
    return TAGGED.exec(tag)?.[2] ?? null;
}

/** Etiketin türü (`booked`, `res`, `kasa`, `wait`…); kimliksiz etikette `null`. */
export function tagKindOf(tag: string | null | undefined): string | null {
    if (typeof tag !== 'string') return null;
    return TAGGED.exec(tag)?.[1] ?? null;
}

/**
 * Müdüre (ve tek kişiliğe) giden, RANDEVUNUN KARTINI açan türler — kullanıcı
 * kararı 2026-10-14: "yeni randevu, iptal, ertelendi → randevu kartı".
 *   booked      · müşteri randevu aldı (tetikleyici, 107)
 *   iptal-mudur · randevu iptal edildi (tetikleyici, 116)
 *   res         · WhatsApp ve "randevumu yönet" (yeni, iptal, ertelendi)
 *   soon        · sıradaki randevu yaklaşıyor (tek kişilikte müdüre, remind)
 */
const CARD_KINDS = new Set(['booked', 'iptal-mudur', 'res', 'soon']);

/** Adresin `?date=`i — yalnız biçimi tutuyorsa. */
function dateOf(url: string | null): string | null {
    if (!url) return null;
    const date = new URLSearchParams(url.split('?')[1] ?? '').get('date');
    return date && ISO_DATE.test(date) ? date : null;
}

/** Bildirimin `data`sı — sunucu `{ url, tag }` yazıyor, cihaz da aynı biçimde. */
export interface PushData {
    url?: unknown;
    tag?: unknown;
}

/**
 * BİLDİRİME DOKUNUNCA NERESİ (2026-10-14, kullanıcı kararları).
 *
 * Önce ETİKET — randevunun kendisi:
 *   müdür / tek kişilik · yeni, iptal, ertelendi, yaklaşıyor → randevu kartı
 *   müdür / tek kişilik · adisyon kasada → Kasa, tahsil edilmedi listesi açık
 *   personel / tek kişilik · bekleme bitti → o işin kumandası
 *   personel · geri kalan her şey → Bugün (`pushHrefOf`)
 * Etiket bir şey söylemiyorsa ADRES (`pushHrefOf`); o da tanınmazsa `null`.
 * WhatsApp "görüşmek istiyor" (`/mesajlar`) bilerek `null` — ayrıca konuşulacak.
 */
export function pushTargetOf(data: PushData | null | undefined, actor: PushActor): string | null {
    const url = typeof data?.url === 'string' ? data.url : null;
    const tag = typeof data?.tag === 'string' ? data.tag : null;
    const kind = tagKindOf(tag);
    const id = reservationIdOf(tag);

    if (kind === 'wait' && id) {
        if (actor === 'manager') return null;
        const date = dateOf(url);
        const query = new URLSearchParams({ id, ...(actor === 'solo' ? { from: 'tek' } : {}), ...(date ? { date } : {}) });
        return `/kumanda?${query.toString()}`;
    }
    if (actor !== 'staff' && kind && id) {
        if (CARD_KINDS.has(kind)) return `/randevu/${id}`;
        if (kind === 'kasa') return `${actor === 'solo' ? '/tek/cash' : '/mudur/cash'}?bekleyen=1`;
    }
    return pushHrefOf(url, actor);
}

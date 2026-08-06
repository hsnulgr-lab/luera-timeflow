// Veri taşıma kuralları — TEK KAYNAK (Faz 2.6 / 2.6b).
//
// Neden var: salon sahibi "verimi istediğimde alabilir miyim" diye sorar ve
// cevap "hayır" ise ürünü değiştirmez. Aynı şekilde elindeki müşteri listesini
// taşıyamıyorsa da bağlanmaz. İkisi de satış engelidir, süs değil.
//
// Bu dosya SAFtır: Supabase, React, DOM yok. Sütun tanımları ve içe aktarma
// doğrulaması burada yaşar; okuma/yazma useDataTransfer'da.

// Göreli + uzantılı import: bu modül node ile doğrudan test edilir ve orada
// '@/' alias'ı çözülmez (bkz. serviceEligibility.ts).
import { foldTr } from './serviceEligibility.ts';
import { normalizePhone } from './phone.ts';

// ── Dışa aktarma ────────────────────────────────────────────────────────────

export type ExportDatasetId =
    | 'customers' | 'reservations' | 'payments' | 'services' | 'plans' | 'products';

export interface ExportDataset {
    id: ExportDatasetId;
    label: string;
    /** Hangi tablodan okunacağı; 'settings' tabloya değil ayarlara bakar. */
    table: string | null;
    /** Dosya adı gövdesi (tarih eklenir). */
    file: string;
    hint: string;
}

export const EXPORT_DATASETS: ExportDataset[] = [
    { id: 'customers', label: 'Müşteriler', table: 'customers', file: 'musteriler', hint: 'Ad, telefon, e-posta, not, damga, sektöre özel alanlar' },
    { id: 'reservations', label: 'Randevular', table: 'reservations', file: 'randevular', hint: 'Tarih, saat, hizmet, personel, durum, tutar' },
    { id: 'payments', label: 'Tahsilatlar', table: 'payments', file: 'tahsilatlar', hint: 'Tarih, tutar, yöntem, müşteri' },
    { id: 'services', label: 'Hizmetler', table: null, file: 'hizmetler', hint: 'Ad, süre, fiyat, dönüş periyodu, etiketler' },
    { id: 'plans', label: 'Paketler / Planlar', table: 'treatment_plans', file: 'paketler', hint: 'Başlık, seans, kullanılan, tutar, durum' },
    { id: 'products', label: 'Ürünler / Stok', table: 'products', file: 'urunler', hint: 'Ad, fiyat, birim, maliyet, kritik eşik' },
];

/** `musteriler-2026-08-06.csv` */
export function exportFileName(dataset: ExportDataset, today: string): string {
    return `${dataset.file}-${today}.csv`;
}

/** Ham satır — Supabase'den geldiği gibi (snake_case). */
export type RawRow = Record<string, unknown>;

/** Kimlikleri okunabilir ada çeviren bağlam; eşleşmezse boş bırakılır. */
export interface ExportContext {
    customerName: (id: unknown) => string;
    staffName: (id: unknown) => string;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number | '' => (v === null || v === undefined || v === '' ? '' : Number(v));
const bool = (v: unknown): string => (v ? 'Evet' : 'Hayır');
const time = (v: unknown): string => str(v).slice(0, 5);
const json = (v: unknown): string => {
    if (!v || typeof v !== 'object') return '';
    const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== '' && val !== null && val !== undefined);
    return entries.map(([k, val]) => `${k}=${typeof val === 'boolean' ? (val ? 'evet' : 'hayır') : String(val)}`).join(' | ');
};

const RESERVATION_STATUS: Record<string, string> = {
    pending: 'Onay bekliyor', confirmed: 'Onaylı', completed: 'Tamamlandı',
    cancelled: 'İptal', 'no-show': 'Gelmedi',
};
const PAYMENT_METHOD: Record<string, string> = {
    cash: 'Nakit', card: 'Kart', transfer: 'Havale/EFT', other: 'Diğer',
};

/**
 * Dışa aktarma sütunları. Başlıklar TÜRKÇE ve insan okuyabilir — dosyanın
 * gideceği yer çoğu zaman muhasebeci ya da başka bir yazılım değil, salon
 * sahibinin kendi Excel'i. Ham kolon adı (customer_id, is_paid) orada işe yaramaz.
 */
export function exportColumns(id: ExportDatasetId, ctx: ExportContext): { header: string; value: (r: RawRow) => string | number | boolean | null | undefined }[] {
    switch (id) {
        case 'customers':
            return [
                { header: 'Ad Soyad', value: (r) => str(r.name) },
                { header: 'Telefon', value: (r) => str(r.phone) },
                { header: 'E-posta', value: (r) => str(r.email) },
                { header: 'Not', value: (r) => str(r.notes) },
                { header: 'Sadakat Damgası', value: (r) => num(r.loyalty_stamps) },
                { header: 'Son Ziyaret', value: (r) => str(r.last_visit) },
                { header: 'Dönüş Tarihi', value: (r) => str(r.recall_date) },
                { header: 'Ek Bilgiler', value: (r) => json(r.custom_fields) },
                { header: 'Kayıt Tarihi', value: (r) => str(r.created_at).slice(0, 10) },
            ];
        case 'reservations':
            return [
                { header: 'Tarih', value: (r) => str(r.date) },
                { header: 'Saat', value: (r) => time(r.start_time) },
                { header: 'Bitiş', value: (r) => time(r.end_time) },
                { header: 'Müşteri', value: (r) => str(r.customer_name) },
                { header: 'Telefon', value: (r) => str(r.customer_phone) },
                { header: 'Hizmet', value: (r) => str(r.service) },
                { header: 'Personel', value: (r) => ctx.staffName(r.staff_id) },
                { header: 'Durum', value: (r) => RESERVATION_STATUS[str(r.status)] || str(r.status) },
                { header: 'Ödendi', value: (r) => bool(r.is_paid) },
                { header: 'Kaynak', value: (r) => str(r.source) },
                { header: 'Not', value: (r) => str(r.notes) },
            ];
        case 'payments':
            return [
                { header: 'Tarih', value: (r) => str(r.paid_at).slice(0, 10) },
                { header: 'Saat', value: (r) => str(r.paid_at).slice(11, 16) },
                { header: 'Müşteri', value: (r) => ctx.customerName(r.customer_id) },
                { header: 'Tutar', value: (r) => num(r.amount) },
                { header: 'Yöntem', value: (r) => PAYMENT_METHOD[str(r.method)] || str(r.method) },
                { header: 'Tür', value: (r) => str(r.type) },
                { header: 'Açıklama', value: (r) => str(r.description) },
                { header: 'Personel', value: (r) => ctx.staffName(r.staff_id) },
            ];
        case 'plans':
            return [
                { header: 'Başlık', value: (r) => str(r.title) },
                { header: 'Müşteri', value: (r) => ctx.customerName(r.customer_id) },
                { header: 'Tür', value: (r) => str(r.plan_kind) },
                { header: 'Toplam Seans', value: (r) => num(r.session_count) },
                { header: 'Kullanılan', value: (r) => num(r.sessions_done) },
                { header: 'Tutar', value: (r) => num(r.total_amount) },
                { header: 'Durum', value: (r) => str(r.status) },
                { header: 'Oluşturma', value: (r) => str(r.created_at).slice(0, 10) },
            ];
        case 'products':
            return [
                { header: 'Ürün Adı', value: (r) => str(r.name) },
                { header: 'Kategori', value: (r) => str(r.category) },
                { header: 'Satış Fiyatı', value: (r) => num(r.price) },
                { header: 'Alış Maliyeti', value: (r) => num(r.cost) },
                { header: 'Birim', value: (r) => str(r.unit) },
                { header: 'Kritik Eşik', value: (r) => num(r.threshold) },
                { header: 'Aktif', value: (r) => bool(r.is_active) },
            ];
        case 'services':
            // Hizmetler tabloda değil, ayarların içinde (settings.services) yaşar.
            return [
                { header: 'Hizmet Adı', value: (r) => str(r.name) },
                { header: 'Süre (dk)', value: (r) => num(r.duration) },
                { header: 'Fiyat', value: (r) => num(r.price) },
                { header: 'Dönüş (gün)', value: (r) => num(r.recallDays) },
                { header: 'Etiketler', value: (r) => (Array.isArray(r.tags) ? (r.tags as string[]).join(', ') : '') },
            ];
    }
}

// ── İçe aktarma ─────────────────────────────────────────────────────────────

export type ImportDatasetId = 'customers' | 'services' | 'products';

export type FieldType = 'text' | 'number' | 'phone';

export interface ImportField {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    /**
     * Başlık takma adları. Salonun elindeki dosya "Müşteri Adı", "AD SOYAD",
     * "isim", "Name"… olabiliyor; kullanıcıyı sütun eşlemeye zorlamadan önce
     * tahmin etmeye çalışıyoruz. Eşleşme foldTr ile Türkçe duyarlı.
     */
    aliases: string[];
}

export interface ImportSpec {
    id: ImportDatasetId;
    label: string;
    fields: ImportField[];
    /** Mükerrer tespitinde kullanılacak alan. */
    dedupeKey: string;
    sample: string[][];
}

export const IMPORT_SPECS: ImportSpec[] = [
    {
        id: 'customers',
        label: 'Müşteriler',
        dedupeKey: 'phone',
        fields: [
            { key: 'name', label: 'Ad Soyad', type: 'text', required: true, aliases: ['ad soyad', 'ad', 'isim', 'adi', 'adı soyadı', 'musteri', 'musteri adi', 'hasta', 'hasta adi', 'name', 'full name', 'customer'] },
            { key: 'phone', label: 'Telefon', type: 'phone', required: true, aliases: ['telefon', 'tel', 'gsm', 'cep', 'cep telefonu', 'telefon no', 'phone', 'mobile'] },
            { key: 'email', label: 'E-posta', type: 'text', aliases: ['e-posta', 'eposta', 'mail', 'e mail', 'email'] },
            { key: 'notes', label: 'Not', type: 'text', aliases: ['not', 'notlar', 'aciklama', 'açıklama', 'note', 'notes'] },
        ],
        sample: [['Ad Soyad', 'Telefon', 'E-posta', 'Not'], ['Ayşe Yılmaz', '0532 111 22 33', 'ayse@ornek.com', 'Cilt tipi kuru']],
    },
    {
        id: 'services',
        label: 'Hizmetler',
        dedupeKey: 'name',
        fields: [
            { key: 'name', label: 'Hizmet Adı', type: 'text', required: true, aliases: ['hizmet', 'hizmet adi', 'islem', 'işlem', 'ad', 'adi', 'name', 'service'] },
            // Süre bilinçli olarak zorunlu DEĞİL: salonun listesinde çoğu zaman
            // yalnız ad ve fiyat vardır, süre sonradan girilir. Zorunlu yapmak
            // tüm dosyayı "hatalı" gösterip aktarmayı boşa çıkarırdı; boş kalan
            // hizmet 30 dk ile açılır.
            { key: 'duration', label: 'Süre (dk)', type: 'number', aliases: ['sure', 'süre', 'sure dk', 'dakika', 'dk', 'duration', 'minutes'] },
            { key: 'price', label: 'Fiyat', type: 'number', aliases: ['fiyat', 'ucret', 'ücret', 'tutar', 'price', 'amount'] },
            { key: 'recallDays', label: 'Dönüş (gün)', type: 'number', aliases: ['donus', 'dönüş', 'donus gun', 'kontrol', 'recall', 'recall days'] },
        ],
        sample: [['Hizmet Adı', 'Süre (dk)', 'Fiyat', 'Dönüş (gün)'], ['Cilt Bakımı', '60', '1200', '30']],
    },
    {
        id: 'products',
        label: 'Ürünler',
        dedupeKey: 'name',
        fields: [
            { key: 'name', label: 'Ürün Adı', type: 'text', required: true, aliases: ['urun', 'ürün', 'urun adi', 'malzeme', 'ad', 'adi', 'name', 'product'] },
            { key: 'price', label: 'Satış Fiyatı', type: 'number', aliases: ['fiyat', 'satis fiyati', 'satış fiyatı', 'price'] },
            { key: 'cost', label: 'Alış Maliyeti', type: 'number', aliases: ['maliyet', 'alis', 'alış', 'alis fiyati', 'cost'] },
            { key: 'category', label: 'Kategori', type: 'text', aliases: ['kategori', 'grup', 'category'] },
            { key: 'unit', label: 'Birim', type: 'text', aliases: ['birim', 'olcu', 'ölçü', 'unit'] },
        ],
        sample: [['Ürün Adı', 'Satış Fiyatı', 'Alış Maliyeti', 'Kategori', 'Birim'], ['Nemlendirici Krem', '450', '210', 'Bakım', 'adet']],
    },
];

export const importSpec = (id: ImportDatasetId): ImportSpec =>
    IMPORT_SPECS.find((s) => s.id === id) as ImportSpec;

/** Başlıkları alan anahtarlarına eşler. Eşleşmeyen alan null kalır. */
export function autoMapHeaders(headers: string[], spec: ImportSpec): Record<string, number | null> {
    const folded = headers.map((h) => foldTr(h).replace(/[^a-z0-9]+/g, ' ').trim());
    const used = new Set<number>();
    const mapping: Record<string, number | null> = {};
    // Zorunlu alanlar önce eşlensin: "ad" hem müşteri hem ürün takma adı olduğu
    // için sıra, çakışmada hangi alanın sütunu kaptığını belirler.
    const ordered = [...spec.fields].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
    for (const field of ordered) {
        const wanted = field.aliases.map((a) => foldTr(a).replace(/[^a-z0-9]+/g, ' ').trim());
        let hit = folded.findIndex((h, i) => !used.has(i) && h !== '' && wanted.includes(h));
        if (hit === -1) {
            // Tam eşleşme yoksa içerme: "Müşteri Telefonu" → telefon
            hit = folded.findIndex((h, i) => !used.has(i) && h !== '' && wanted.some((w) => h.includes(w)));
        }
        mapping[field.key] = hit === -1 ? null : hit;
        if (hit !== -1) used.add(hit);
    }
    return mapping;
}

/**
 * Türkçe sayı biçimi. "1.250,50" → 1250.5, "1,250.50" → 1250.5, "₺1.200" → 1200.
 * Ayırt etme kuralı: SON ayraç ondalıktır.
 */
export function parseNumberTr(raw: string): number | null {
    const s = (raw || '').replace(/[^\d.,-]/g, '').trim();
    if (!s) return null;
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    let normalized: string;
    if (hasComma && hasDot) {
        // İkisi birden varsa SON ayraç ondalıktır: "1.250,50" ve "1,250.50".
        normalized = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')
            : s.replace(/,/g, '');
    } else if (hasComma || hasDot) {
        // Tek tür ayraç belirsiz: "1.200" Türkçede bindir, "1.5" ondalıktır.
        // Ayırt etme kuralı — ayraçtan sonra TAM 3 hane varsa bindir ayracıdır.
        // ("₺1.200" fiyatını 1,2 okumak sessiz ve pahalı bir hatadır.)
        const sep = hasComma ? ',' : '.';
        const parts = s.split(sep);
        const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
        normalized = thousands
            ? parts.join('')
            : s.replace(sep, '.');
    } else normalized = s;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

export type RowStatus = 'new' | 'duplicate' | 'invalid';

export interface PreparedRow {
    line: number;                       // dosyadaki satır no (başlık = 1)
    values: Record<string, string | number>;
    status: RowStatus;
    problem?: string;
}

export interface PreparedImport {
    rows: PreparedRow[];
    counts: Record<RowStatus, number>;
}

/**
 * Ayrıştırılmış satırları doğrular ve mükerrerleri işaretler.
 *
 * `existingKeys` mevcut kayıtların dedupe anahtarları (telefon için
 * normalizePhone'dan geçmiş). Dosyanın KENDİ İÇİNDEKİ tekrarlar da yakalanır —
 * salonun listesinde aynı müşteri iki kez olması olağan.
 */
export function prepareImport(
    rows: string[][],
    spec: ImportSpec,
    mapping: Record<string, number | null>,
    existingKeys: Set<string>,
): PreparedImport {
    const seen = new Set(existingKeys);
    const prepared: PreparedRow[] = [];

    rows.forEach((cells, i) => {
        const values: Record<string, string | number> = {};
        let problem: string | undefined;

        for (const field of spec.fields) {
            const index = mapping[field.key];
            const raw = index === null || index === undefined ? '' : (cells[index] ?? '').trim();

            if (field.type === 'phone') {
                const normalized = normalizePhone(raw);
                if (!normalized) {
                    if (field.required && !problem) problem = raw ? `Telefon okunamadı: "${raw}"` : 'Telefon boş';
                } else values[field.key] = normalized;
                continue;
            }
            if (field.type === 'number') {
                const n = parseNumberTr(raw);
                if (n === null) {
                    if (field.required && !problem) problem = raw ? `${field.label} sayı değil: "${raw}"` : `${field.label} boş`;
                } else values[field.key] = n;
                continue;
            }
            if (!raw) {
                if (field.required && !problem) problem = `${field.label} boş`;
                continue;
            }
            values[field.key] = raw;
        }

        let status: RowStatus = problem ? 'invalid' : 'new';
        if (!problem) {
            const key = String(values[spec.dedupeKey] ?? '');
            const folded = spec.dedupeKey === 'phone' ? key : foldTr(key);
            if (folded && seen.has(folded)) { status = 'duplicate'; problem = 'Zaten kayıtlı'; }
            else if (folded) seen.add(folded);
        }
        prepared.push({ line: i + 2, values, status, problem });
    });

    return {
        rows: prepared,
        counts: {
            new: prepared.filter((r) => r.status === 'new').length,
            duplicate: prepared.filter((r) => r.status === 'duplicate').length,
            invalid: prepared.filter((r) => r.status === 'invalid').length,
        },
    };
}

/** Mükerrer anahtar kümesi — dedupeKey'e göre normalize edilmiş. */
export function existingKeySet(values: string[], dedupeKey: string): Set<string> {
    const set = new Set<string>();
    for (const v of values) {
        const key = dedupeKey === 'phone' ? normalizePhone(v) : foldTr(v || '').trim();
        if (key) set.add(key);
    }
    return set;
}

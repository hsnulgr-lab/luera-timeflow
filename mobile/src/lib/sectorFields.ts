/**
 * Sektörün müşteri alanları — Müdür 23 v2 kartının "MÜŞTERİ BİLGİLERİ"
 * ızgarası. Saf, React'siz.
 *
 * Tanımların kaynağı masaüstü: `src/lib/sectorProfiles.ts ·
 * customFieldTemplates`. Değerler müşterinin `custom_fields`ında. Org bazlı
 * `organizations.custom_field_defs` override'ı var ama hiçbir yer onu
 * okumuyor ve yazmıyor — masaüstünün gösterdiği de şablon. Kopya
 * `tests/mobil-musteri-karti-v2.test.mjs` ile masaüstüne kilitli: bir
 * etiket orada değişirse test burada kırılır.
 */

export interface CustomerFieldDef {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
}

const t = (key: string, label: string, type: CustomerFieldDef['type'] = 'text'): CustomerFieldDef => ({ key, label, type });

export const SECTOR_CUSTOMER_FIELDS: Record<string, readonly CustomerFieldDef[]> = {
    genel: [],
    guzellik: [t('cilt_tipi', 'Cilt tipi', 'select'), t('alerji', 'Alerji bilgisi'), t('hamilelik', 'Hamilelik', 'checkbox')],
    kuafor: [
        t('sac_tipi', 'Saç tipi', 'select'), t('sac_dokusu', 'Saç dokusu', 'select'),
        t('alerji', 'Kimyasal / ürün hassasiyeti'), t('tercih_notu', 'Saç ve stil tercihi'),
        t('kf_formula', 'Son renk formülü'),
    ],
    berber: [],
    estetik: [t('alerji', 'Alerji bilgisi'), t('kronik', 'Kronik rahatsızlık')],
    dis: [t('alerji', 'Alerji bilgisi'), t('ilaclar', 'Kullandığı ilaçlar'), t('kronik', 'Kronik rahatsızlık')],
    saglik: [t('alerji', 'Alerji bilgisi')],
    fizyoterapi: [
        t('islevsel_hedef', 'İşlevsel hedef'), t('klinik_uyari', 'Klinik uyarı (düşme riski vb.)'),
        t('ev_programi', 'Ev programı'), t('ev_programi_gun', 'Haftalık uygulanan gün (0-7)', 'number'),
    ],
    tattoo: [t('alerji', 'Alerji bilgisi')],
    avukat: [t('dosya_no', 'Dosya numarası'), t('mahkeme', 'Mahkeme'), t('dava_turu', 'Dava türü')],
    danismanlik: [],
    gym: [t('hedef', 'Hedef'), t('saglik_notu', 'Sağlık notu')],
    gelinlikci: [t('beden', 'Beden'), t('olculer', 'Ölçüler'), t('dugun_tarihi', 'Düğün tarihi', 'date')],
    restoran: [],
};

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function valueText(def: CustomerFieldDef, raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;
    if (def.type === 'checkbox') return raw === true ? 'Evet' : null;
    if (def.type === 'date' && typeof raw === 'string') {
        const [y, m, d] = raw.split('-').map(Number);
        if (y && m && d) return `${d} ${MONTHS[m - 1]} ${y}`;
    }
    const text = String(raw).trim();
    return text || null;
}

/**
 * Izgaranın hücreleri: yalnız DOLU alanlar, şablon sırasıyla. Boş alan
 * çizilmiyor — "Alerji bilgisi: —" bir bilgi değil, bir boşluk.
 *
 * Bayrak üreten alan (hamilelik → risk bloğu) burada TEKRAR EDİLMİYOR: aynı
 * bilgi iki yerde iki ağırlıkta durmasın; bayrak daha ağır olanı.
 */
export function customerFieldCells(
    sector: string | null | undefined,
    fields: Record<string, unknown> | null | undefined,
    flaggedKeys: readonly string[] = [],
): { label: string; value: string }[] {
    const defs = SECTOR_CUSTOMER_FIELDS[sector ?? ''] ?? [];
    const cells: { label: string; value: string }[] = [];
    for (const def of defs) {
        if (flaggedKeys.includes(def.key)) continue;
        const value = valueText(def, fields?.[def.key]);
        if (value) cells.push({ label: def.label, value });
    }
    return cells;
}

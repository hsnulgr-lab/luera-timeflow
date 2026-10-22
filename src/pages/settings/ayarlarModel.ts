/**
 * Ayarlar — React'siz model (tasarım: "Luera Masaustu - Ayarlar v1.1").
 *
 * ── Neden ayrı dosya ────────────────────────────────────────────────────────
 *
 * Bölüm listesi, eski `?tab=` adreslerinin karşılığı, arama sözlüğü ve birkaç
 * metin kuralı burada. Hepsi saf; `tests/masaustu-ayarlar.test.mjs` doğrudan
 * import edip çalıştırıyor. Bu yüzden `@/` alias'ı YOK (node çözemez).
 *
 * ── Eski adresler ───────────────────────────────────────────────────────────
 *
 * Uygulamanın başka yerleri ve sunucunun bildirim adresleri hâlâ
 * `/settings?tab=billing` gibi eski biçimi kullanıyor (push `url`'leri,
 * e-postalar, Kurulum). Hiçbiri kırılmamalı. `?tab=veri` bugün KIRIKTI —
 * Kurulum öyle yazıyordu ama sekmenin adı `data`'ydı; boş bir kart açılıyordu.
 * İkisi de Verileriniz'e gider.
 */

export type SectionId =
    | 'ozet' | 'isletme' | 'calisma-saatleri' | 'hizmetler' | 'kaynaklar' | 'moduller'
    | 'online-randevu' | 'whatsapp' | 'sadakat'
    | 'hesabim' | 'bildirimler' | 'abonelik' | 'verileriniz'
    | 'webhook';

export type SectionGroup = 'isletme' | 'iletisim' | 'hesap' | 'gelismis' | null;

export interface SectionDef {
    id: SectionId;
    /** `/settings/<path>`; Özet için boş. */
    path: string;
    label: string;
    group: SectionGroup;
}

export const GROUP_LABEL: Record<Exclude<SectionGroup, null>, string> = {
    isletme: 'İŞLETME',
    iletisim: 'MÜŞTERİLERLE İLETİŞİM',
    hesap: 'HESAP',
    gelismis: 'GELİŞMİŞ',
};

/**
 * Menünün sırası. `kaynaklar`ın etiketi sektörden gelir (Kabinler, Koltuklar,
 * Üniteler…) ve sektörde kaynak yoksa satır hiç çizilmez — bkz. `visibleSections`.
 * Adres sektörden BAĞIMSIZ (`/kaynaklar`): sektör değişince bağlantı kırılmaz.
 */
export const SECTIONS: readonly SectionDef[] = [
    { id: 'ozet', path: '', label: 'Özet', group: null },
    { id: 'isletme', path: 'isletme', label: 'İşletme profili', group: 'isletme' },
    { id: 'calisma-saatleri', path: 'calisma-saatleri', label: 'Çalışma saatleri', group: 'isletme' },
    { id: 'hizmetler', path: 'hizmetler', label: 'Hizmetler', group: 'isletme' },
    { id: 'kaynaklar', path: 'kaynaklar', label: 'Kaynaklar', group: 'isletme' },
    { id: 'moduller', path: 'moduller', label: 'Modüller', group: 'isletme' },
    { id: 'online-randevu', path: 'online-randevu', label: 'Online randevu', group: 'iletisim' },
    { id: 'whatsapp', path: 'whatsapp', label: 'WhatsApp', group: 'iletisim' },
    { id: 'sadakat', path: 'sadakat', label: 'Sadakat kartı', group: 'iletisim' },
    { id: 'hesabim', path: 'hesabim', label: 'Hesabım', group: 'hesap' },
    { id: 'bildirimler', path: 'bildirimler', label: 'Bildirimler', group: 'hesap' },
    { id: 'abonelik', path: 'abonelik', label: 'Abonelik ve faturalar', group: 'hesap' },
    { id: 'verileriniz', path: 'verileriniz', label: 'Verileriniz', group: 'hesap' },
    { id: 'webhook', path: 'webhook', label: 'Webhook', group: 'gelismis' },
];

export function sectionById(id: SectionId): SectionDef {
    return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

export function sectionHref(id: SectionId): string {
    const s = sectionById(id);
    return s.path ? `/settings/${s.path}` : '/settings';
}

/** `/settings/<x>` → bölüm; tanınmayan ya da boş yol Özet'tir. */
export function sectionFromPath(pathname: string): SectionId {
    const rest = pathname.replace(/^\/settings\/?/, '').split('/')[0] ?? '';
    return SECTIONS.find((s) => s.path === rest && s.path !== '')?.id ?? 'ozet';
}

/**
 * Kaynak bölümünün adı — sektörün ilk kaynak türünden çoğul ("Kabinler").
 * Tür yoksa `null`: menü satırı ve bölüm hiç çizilmez.
 */
export function resourcesLabel(resourceTypes: readonly string[]): string | null {
    const first = resourceTypes[0];
    if (!first) return null;
    return pluralTr(first);
}

/**
 * Türkçe çoğul eki — büyük ünlü uyumu (son ünlü kalın → -lar, ince → -ler).
 * Tamlamada iyelik eki çoğulun ARKASINA geçer: "Terapi alanı" → "Terapi
 * alanları", "Toplantı odası" → "Toplantı odaları" ("odasılar" değil).
 */
export function pluralTr(word: string): string {
    const backOf = (s: string) => {
        const vowels = s.toLocaleLowerCase('tr').match(/[aıouâeiöüî]/g);
        const last = vowels ? vowels[vowels.length - 1] : 'e';
        return 'aıouâ'.includes(last);
    };
    const parts = word.split(' ');
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /[ıiuü]$/.test(last)) {
        const stem = /s[ıiuü]$/.test(last) ? last.slice(0, -2) : last.slice(0, -1);
        parts[parts.length - 1] = stem + (backOf(stem) ? 'ları' : 'leri');
        return parts.join(' ');
    }
    return word + (backOf(word) ? 'lar' : 'ler');
}

/** Görünen bölümler — kaynak türü olmayan sektörde Kaynaklar düşer. */
export function visibleSections(hasResources: boolean): SectionDef[] {
    return SECTIONS.filter((s) => s.id !== 'kaynaklar' || hasResources);
}

// ── Eski ?tab= adresleri ────────────────────────────────────────────────────

const LEGACY_TAB: Record<string, SectionId> = {
    general: 'isletme',
    modules: 'moduller',
    hours: 'calisma-saatleri',
    services: 'hizmetler',
    booking: 'online-randevu',
    webhooks: 'webhook',
    integrations: 'ozet',
    whatsapp: 'whatsapp',
    billing: 'abonelik',
    data: 'verileriniz',
    // Kurulum sihirbazının yazdığı ve bugün KIRIK olan adres.
    veri: 'verileriniz',
};

/** `?tab=` değeri → yeni adres; değer yoksa ya da tanınmıyorsa `null`. */
export function legacyTabTarget(tab: string | null | undefined): string | null {
    if (!tab) return null;
    const id = LEGACY_TAB[tab];
    return id ? sectionHref(id) : null;
}

/**
 * Eski `?tab=` adresinin tam yönlendirmesi: öteki parametreler KORUNUR.
 * Dodo dönüşü `/settings?tab=billing&checkout=success` geliyor; parametre
 * düşünce Abonelik ödeme bildirimini ve yoklamayı hiç başlatmıyordu.
 */
export function legacyRedirect(search: string): string | null {
    const params = new URLSearchParams(search);
    const target = legacyTabTarget(params.get('tab'));
    if (!target) return null;
    params.delete('tab');
    const rest = params.toString();
    return rest ? `${target}?${rest}` : target;
}

// ── Arama ───────────────────────────────────────────────────────────────────

export interface SearchEntry {
    /** Sonuçta görünen ad. */
    name: string;
    /** Gri yol: "İşletme · Hizmetler". */
    path: string;
    section: SectionId;
    /** Varsa bölümde alanın `id`si — gidince oraya kaydırılır ve vurgulanır. */
    anchor?: string;
    keys: string[];
}

/**
 * Eş anlamlılar sözlüğü. Tasarımdaki tabloyla birebir başlar; sonra
 * tasarımda adı geçmeyen ama bölümlerde duran ayarlar eklenir. Sonuç yoksa
 * öneri UYDURULMAZ — liste "bulunamadı" der.
 */
export const SEARCH_INDEX: readonly SearchEntry[] = [
    { name: 'Ücret', path: 'İşletme · Hizmetler', section: 'hizmetler', anchor: 'ay-hizmet-tablo', keys: ['fiyat', 'ücret', 'tutar'] },
    { name: 'Çalışma saatleri', path: 'İşletme', section: 'calisma-saatleri', keys: ['saat', 'mesai', 'kapalı gün', 'kapalı'] },
    { name: 'Logo', path: 'İşletme · İşletme profili', section: 'isletme', anchor: 'ay-logo', keys: ['logo', 'kapak', 'galeri', 'fotoğraf'] },
    { name: 'Görseller', path: 'Müşterilerle iletişim · Online randevu', section: 'online-randevu', anchor: 'ay-gorseller', keys: ['logo', 'kapak', 'galeri', 'fotoğraf'] },
    { name: 'Randevu adresi', path: 'Müşterilerle iletişim · Online randevu', section: 'online-randevu', anchor: 'ay-adres', keys: ['link', 'adres', 'bio', 'instagram'] },
    { name: 'İşletme profili', path: 'İşletme', section: 'isletme', keys: ['link', 'adres', 'bio', 'instagram'] },
    { name: 'Google değerlendirme', path: 'Müşterilerle iletişim · WhatsApp', section: 'whatsapp', anchor: 'ay-google', keys: ['yorum', 'google', 'değerlendirme'] },
    { name: 'İndirim teklifi', path: 'WhatsApp · Sizi özledik', section: 'whatsapp', anchor: 'ay-indirim', keys: ['indirim', 'kupon'] },
    { name: 'Otomatik onay', path: 'Müşterilerle iletişim · Online randevu', section: 'online-randevu', anchor: 'ay-otomatik-onay', keys: ['onay', 'otomatik onay'] },
    { name: 'Kaynaklar', path: 'İşletme', section: 'kaynaklar', keys: ['kabin', 'koltuk', 'oda', 'ünite'] },
    { name: 'Hesabım', path: 'Hesap', section: 'hesabim', keys: ['şifre', 'e-posta', 'eposta', 'apple', 'google'] },
    { name: 'Hesabı sil', path: 'Hesap · Hesabım', section: 'hesabim', anchor: 'ay-tehlikeli', keys: ['sil', 'hesabı sil', 'kapat'] },
    { name: 'Abonelik ve faturalar', path: 'Hesap', section: 'abonelik', keys: ['fatura', 'ödeme', 'plan', 'iptal'] },
    { name: 'Verileriniz', path: 'Hesap', section: 'verileriniz', keys: ['excel', 'csv', 'yedek', 'aktar'] },
    { name: 'KVKK aydınlatma metni', path: 'Müşterilerle iletişim · Online randevu', section: 'online-randevu', anchor: 'ay-kvkk', keys: ['kvkk', 'aydınlatma'] },
    // ── Tasarımın tablosunda olmayan ama bölümlerde duranlar ──
    { name: 'Randevu aralığı', path: 'İşletme · Çalışma saatleri', section: 'calisma-saatleri', anchor: 'ay-aralik', keys: ['aralık', 'slot', 'süre'] },
    { name: 'Sektör', path: 'İşletme · İşletme profili', section: 'isletme', anchor: 'ay-sektor', keys: ['sektör'] },
    { name: 'Modüller', path: 'İşletme', section: 'moduller', keys: ['modül', 'masa', 'sıra', 'analiz'] },
    { name: 'WhatsApp bağlantısı', path: 'Müşterilerle iletişim · WhatsApp', section: 'whatsapp', keys: ['whatsapp', 'qr', 'hatırlatma', 'mesaj'] },
    { name: 'Sadakat kartı', path: 'Müşterilerle iletişim', section: 'sadakat', keys: ['sadakat', 'damga', 'ödül'] },
    { name: 'Bildirimler', path: 'Hesap', section: 'bildirimler', keys: ['bildirim', 'telefon'] },
    { name: 'Görünüm', path: 'Hesap · Hesabım', section: 'hesabim', anchor: 'ay-gorunum', keys: ['tema', 'koyu', 'açık', 'görünüm'] },
    { name: 'Webhook', path: 'Gelişmiş', section: 'webhook', keys: ['webhook', 'n8n', 'entegrasyon'] },
];

const norm = (s: string) => s.toLocaleLowerCase('tr').trim();

/**
 * Arama. 2 harften kısaysa `null` ("bir şey yazın" hâli). Eşleşme tasarımdaki
 * kural: anahtar sorguyla başlıyorsa ya da (3+ harfte) sorgu anahtarla
 * başlıyorsa, ya da ayarın adı sorguyu içeriyorsa.
 */
export function searchSettings(query: string, index: readonly SearchEntry[] = SEARCH_INDEX): SearchEntry[] | null {
    const t = norm(query);
    if (t.length < 2) return null;
    return index.filter((e) =>
        e.keys.some((k) => k.startsWith(t) || (t.length >= 3 && t.startsWith(k)))
        || norm(e.name).includes(t));
}

// ── Küçük metin kuralları ───────────────────────────────────────────────────

/** Taslak çubuğunun alt satırı: "1 alan · İşletme adı", "3 alan · Adres, Telefon, …". */
export function draftSummary(changed: readonly string[]): string {
    if (changed.length === 0) return '';
    const shown = changed.slice(0, 2).join(', ') + (changed.length > 2 ? ', …' : '');
    return `${changed.length} alan · ${shown}`;
}

/**
 * Reçete taslağının özeti — tasarım A3: "Reçete · 1 satır eklendi".
 * Satırlar ürüne göre eşlenir; aynı ürünün miktarı değiştiyse "değişti".
 */
export function recipeChangeSummary(
    saved: readonly { productId: string; quantity: number }[],
    draft: readonly { productId: string; quantity: number }[],
): string {
    const before = new Map(saved.map((l) => [l.productId, l.quantity]));
    const after = new Set(draft.map((l) => l.productId));
    const added = draft.filter((l) => !before.has(l.productId)).length;
    const changed = draft.filter((l) => before.has(l.productId) && before.get(l.productId) !== l.quantity).length;
    const removed = saved.filter((l) => !after.has(l.productId)).length;
    const parts: string[] = [];
    if (added) parts.push(`${added} satır eklendi`);
    if (removed) parts.push(`${removed} satır silindi`);
    if (changed) parts.push(`${changed} satır değişti`);
    return parts.join(', ');
}

/** Basılı tutma yazısı — tasarım H4: "Bırakmayın · 0,8 sn". */
export function holdCaption(progress: number, done: boolean): string {
    if (done) return 'Siliniyor…';
    if (progress > 0.001) {
        const left = ((1 - progress) * 2).toFixed(1).replace('.', ',');
        return `Bırakmayın · ${left} sn`;
    }
    return 'Silmek için 2 saniye basılı tutun';
}

/** Kayıttaki rolün ekrandaki adı. Bilinmeyen rol uydurulmaz. */
export function roleLabel(role: string | null | undefined): string | null {
    if (role === 'owner') return 'İşletme sahibi';
    if (role === 'admin') return 'Yönetici';
    if (role === 'member') return 'Üye';
    return null;
}

/**
 * Instagram — kayıt tam adres tutuyor ("https://instagram.com/funi.guzellik"),
 * ekran yalnız kullanıcı adını gösteriyor ("@" önekiyle). Tanınmayan bir değer
 * (başka bir adres) olduğu gibi kalır; kullanıcının yazdığı yutulmaz.
 */
export function instagramHandle(stored: string): string {
    const v = (stored || '').trim();
    if (!v) return '';
    const m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i);
    if (m) return m[1];
    return v.replace(/^@/, '');
}

export function instagramUrl(handleOrUrl: string): string {
    const v = (handleOrUrl || '').trim().replace(/^@/, '');
    if (!v) return '';
    if (/^https?:\/\//i.test(v) || /instagram\.com\//i.test(v)) return v;
    if (/[\s/]/.test(v)) return v;
    return `https://instagram.com/${v}`;
}

/** Çalışma saatlerinde bitiş başlangıçtan sonra mı? ("09:00" < "20:00") */
export function hoursValid(start: string, end: string): boolean {
    return Boolean(start) && Boolean(end) && end > start;
}

/** Türkçe tarih: "9 Eylül 2026". */
export function trDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "9 Eylül 2026'dan beri" — iyelik eki rakamın okunuşuna göre. */
export function sinceText(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    return `${trDate(iso)}'${ablativeSuffix(year)} beri`;
}

/**
 * Sayının ayrılma eki: 2026 → "dan" (altı), 2020 → "den" (yirmi),
 * 2030 → "dan" (otuz). Son anlamlı basamağın okunuşu belirler.
 */
export function ablativeSuffix(n: number): string {
    const ones = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
    const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    const abs = Math.abs(Math.trunc(n));
    let word: string;
    if (abs === 0) word = 'sıfır';
    else if (abs % 10 !== 0) word = ones[abs % 10];
    else if (abs % 100 !== 0) word = tens[(abs % 100) / 10];
    else if (abs % 1000 !== 0) word = 'yüz';
    else if (abs % 1000000 !== 0) word = 'bin';
    else word = 'milyon';
    const vowels = word.match(/[aıoueiöü]/g);
    const last = vowels ? vowels[vowels.length - 1] : 'e';
    const back = 'aıou'.includes(last);
    const voiceless = /[çfhkpsşt]$/.test(word);
    return (voiceless ? 't' : 'd') + (back ? 'an' : 'en');
}

// ── Bölüm adlarına ek ───────────────────────────────────────────────────────

const SUFFIX: Record<string, [loc: string, dat: string]> = {
    'Özet': ["'te", "'e"],
    'İşletme profili': ["'nde", "'ne"],
    'Çalışma saatleri': ["'nde", "'ne"],
    'Hizmetler': ["'de", "'e"],
    'Modüller': ["'de", "'e"],
    'Online randevu': ["'da", "'ya"],
    'WhatsApp': ["'ta", "'a"],
    'Sadakat kartı': ["'nda", "'na"],
    'Hesabım': ["'da", "'a"],
    'Bildirimler': ["'de", "'e"],
    'Abonelik ve faturalar': ["'da", "'a"],
    'Verileriniz': ["'de", "'e"],
    'Webhook': ["'ta", "'a"],
};

/**
 * "İşletme profili'nde", "Hizmetler'e" — S2 penceresinin cümlesi. Bilinen
 * bölümler tablodan; kaynak adı sektörden gelir (Kabinler, Terapi alanları):
 * "-lar/-ler" → 'da/'a, "-ları/-leri" (tamlama) → 'nda/'na.
 */
export function withCase(label: string, kind: 'loc' | 'dat'): string {
    const known = SUFFIX[label];
    if (known) return label + (kind === 'loc' ? known[0] : known[1]);
    const back = /l[aı]r[ı]?$/.test(label) || /[aıou][^aıoueiöü]*$/.test(label);
    if (/l(ar|er)[ıi]$/.test(label)) return label + (kind === 'loc' ? (back ? "'nda" : "'nde") : (back ? "'na" : "'ne"));
    return label + (kind === 'loc' ? (back ? "'da" : "'de") : (back ? "'a" : "'e"));
}

/**
 * "1'inin", "3'ünün", "6'sının" — sayıya iyelik + tamlayan eki (Özet:
 * "3 hizmet · 1'inin ücreti yok"). Sayının okunuşunun son kelimesine göre.
 */
export function genitiveOf(n: number): string {
    const ones = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
    const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    const abs = Math.abs(Math.trunc(n));
    let word: string;
    if (abs === 0) word = 'sıfır';
    else if (abs % 10 !== 0) word = ones[abs % 10];
    else if (abs % 100 !== 0) word = tens[(abs % 100) / 10];
    else if (abs % 1000 !== 0) word = 'yüz';
    else word = 'bin';
    const vowels = word.match(/[aıoueiöü]/g);
    const last = vowels ? vowels[vowels.length - 1] : 'e';
    const v = 'aı'.includes(last) ? 'ı' : 'ei'.includes(last) ? 'i' : 'ou'.includes(last) ? 'u' : 'ü';
    const endsVowel = /[aıoueiöü]$/.test(word);
    return `${n}'${endsVowel ? 's' : ''}${v}n${v}n`;
}

// ── Kaynak adına hâl ekleri (Kabinler bölümünün cümleleri) ─────────────────

const lastVowel = (w: string) => {
    const m = w.toLocaleLowerCase('tr').match(/[aıoueiöü]/g);
    return m ? m[m.length - 1] : 'e';
};
const isBack = (w: string) => 'aıou'.includes(lastVowel(w));
const fourWay = (w: string) => { const v = lastVowel(w); return 'aı'.includes(v) ? 'ı' : 'ei'.includes(v) ? 'i' : 'ou'.includes(v) ? 'u' : 'ü'; };
const possessiveCompound = (w: string) => w.includes(' ') && /[ıiuü]$/.test(w);
const soften = (w: string) => (/[aıoueiöü].*[aıoueiöü]/.test(w) && /k$/.test(w) ? w.slice(0, -1) + 'ğ' : w);

/** Yönelme: kabin → kabine, koltuk → koltuğa, oda → odaya, terapi alanı → terapi alanına. */
export function dativeTr(word: string): string {
    const w = word.toLocaleLowerCase('tr');
    const a = isBack(w) ? 'a' : 'e';
    if (possessiveCompound(w)) return `${w}n${a}`;
    if (/[aıoueiöü]$/.test(w)) return `${w}y${a}`;
    return soften(w) + a;
}

/** Tamlayan: kabin → kabinin, koltuk → koltuğun, oda → odanın, prova odası → prova odasının. */
export function genitiveTr(word: string): string {
    const w = word.toLocaleLowerCase('tr');
    const v = fourWay(w);
    if (possessiveCompound(w) || /[aıoueiöü]$/.test(w)) return `${w}n${v}n`;
    return `${soften(w)}${v}n`;
}

/**
 * Özel ada kesme işaretiyle ek: "Fu Ni'nin" / "Luera TimeFlow'un",
 * "Fu Ni'deki" / "Luera TimeFlow'daki". Ünlü uyumu yazılı son ünlüden;
 * sert ünsüzle biten adda bulunma eki "'ta/'te" olur (WhatsApp'ta).
 */
export function nameGenitive(name: string): string {
    const w = name.trim().toLocaleLowerCase('tr');
    return `${name.trim()}'${/[aıoueiöü]$/.test(w) ? 'n' : ''}${fourWay(w)}n`;
}
export function nameLocative(name: string): string {
    const w = name.trim().toLocaleLowerCase('tr');
    return `${name.trim()}'${/[çfhkpsşt]$/.test(w) ? 't' : 'd'}${isBack(w) ? 'a' : 'e'}`;
}

/** "her ayın 9'unda", "1'inde", "6'sında" — sayıya iyelik + bulunma eki. */
export function dayLocative(n: number): string {
    const ones = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
    const tens = ['', 'on', 'yirmi', 'otuz'];
    const word = n % 10 !== 0 ? ones[n % 10] : tens[Math.floor(n / 10)] ?? 'on';
    const vowels = word.match(/[aıoueiöü]/g);
    const last = vowels ? vowels[vowels.length - 1] : 'e';
    const v = 'aı'.includes(last) ? 'ı' : 'ei'.includes(last) ? 'i' : 'ou'.includes(last) ? 'u' : 'ü';
    const a = 'aıou'.includes(last) ? 'a' : 'e';
    return `${n}'${/[aıoueiöü]$/.test(word) ? 's' : ''}${v}nd${a}`;
}

// ── Hizmet renkleri ve randevu adresi ──────────────────────────────────────

/** Tasarımdaki hazır renkler. Mevcut hizmetin rengi bunlardan değilse "Özel". */
export const SERVICE_SWATCHES = ['#4FA3A0', '#5B8FD9', '#8C7BC4', '#C9748F', '#8FA65A', '#7E8A96', '#B58A5A', '#4F7A8C'];

/** Yazarken çevir ama sondaki tireyi yutma ("guzel-" yazılırken kaybolmasın). */
export function slugLive(s: string): string {
    return (s || '')
        .toLocaleLowerCase('tr')
        .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' } as Record<string, string>)[c] || c)
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-+/, '');
}

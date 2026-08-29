/**
 * Müdür 14 — Kasa'nın karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Ekranın işi tek soruyu bir bakışta cevaplamak: "para akıyor mu, bir terslik
 * var mı?" Sıralama müdürün soru sıklığından türedi — ne kadar girdi, neyle
 * girdi, kim aldı, yanlış olan var mı.
 *
 * BU EKRAN TAHSİLAT YAPMAZ. Müdür izler ve düzeltir; para masaüstündeki
 * Kasa'da alınır. Sunucuda ödeme GÜNCELLEME ucu da yok (yalnız ekleme ve
 * silme var), bu yüzden "düzelt" arkada eski kaydı iptal edip yenisini yazar
 * ve listede iz bırakır. İz bırakmak tercih değil zorunluluk: para ekranında
 * izsiz silme, sildiğini kimsenin göremediği bir kasa demektir.
 */

import type { CashMethod, CashStatus } from '../theme/tokens.ts';

export type { CashMethod, CashStatus };

/** Kasa üç dönem gösterir. Gün cetveli BU EKRANDA YOK — Akış'a özel. */
export type CashPeriod = 'today' | 'week' | 'month';

/** Sheet'te tek tek dökülen hesap kalemi. */
export interface MovementLine {
    name: string;
    amount: number;
}

export interface Movement {
    id: string;
    /** HH:MM */
    time: string;
    customer: string;
    /** "MA" — müşterinin baş harfleri. */
    initials: string;
    /** "Kesim + fön" */
    service: string;
    /** Tahsilatı alan personelin adı. */
    staff: string;
    amount: number;
    method: CashMethod;
    status: CashStatus;
    /**
     * Yalnız iptal edilmiş kayıtta: kim ve ne zaman iptal etti.
     * Denetim izinin taşıyıcısı.
     */
    /** İptali yapan. Oturumdan gelir; bilinmiyorsa izde HİÇ yazılmaz. */
    voidedBy?: string | null;
    voidedAt?: string;
    /** "13 Ağustos 2026, 11:12" — sheet'in başlığındaki tam zaman. */
    dateLabel?: string;
    /** "10:15–11:10" — tahsilatın bağlı olduğu randevunun aralığı. */
    range?: string;
    /** Hesap kalemleri; toplamları `amount` etmeli. */
    lines?: MovementLine[];
    /** Serbest açıklama — varsa sheet'te ayrı satır. */
    note?: string;
    /** Bu kayıt bir DÜZELTME ise: iptal edilen eski kaydın kimliği. */
    correctedFrom?: string;
}

// ── Biçimlendirme ───────────────────────────────────────────────────────────

export const CURRENCY = '₺';

/**
 * Tutarın rakam kısmı. ₺ işareti AYRI çizilir çünkü tasarımda rakamla eşit
 * boyda, eşit ağırlıkta ve eşit renkte, satır içinde duruyor — küçültme ya da
 * soluklaştırma yok.
 */
export function formatAmount(value: number): string {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(value));
}

/** "₺8.450" — tek parça gereken yerlerde (sesli okuma, testler). */
export function formatMoney(value: number): string {
    return `${CURRENCY}${formatAmount(value)}`;
}

// ── Dönem ───────────────────────────────────────────────────────────────────

export const PERIODS: readonly { id: CashPeriod; label: string }[] = [
    { id: 'today', label: 'Bugün' },
    { id: 'week', label: 'Bu hafta' },
    { id: 'month', label: 'Bu ay' },
];

/** Kahraman etiketi dönemle değişir. */
export function periodLabel(period: CashPeriod): string {
    switch (period) {
        case 'week': return 'BU HAFTA GİREN';
        case 'month': return 'BU AY GİREN';
        default: return 'BUGÜN GİREN';
    }
}

/** Karşılaştırmanın adı da dönemle değişir. */
export function comparisonLabel(period: CashPeriod): string {
    switch (period) {
        case 'week': return 'geçen haftaya göre';
        case 'month': return 'geçen aya göre';
        default: return 'düne göre';
    }
}

/**
 * Değişim hapı. Yukarı yön yeşil, AŞAĞI YÖN NÖTR — ne yeşil ne kırmızı.
 * Salonun sakin bir günü hata değil; kırmızıyla dramatize etmek müdürü yanlış
 * yönlendirir.
 */
export type DeltaTone = 'up' | 'flat';

export interface Delta {
    percent: number;
    tone: DeltaTone;
    /** "%12 · düne göre" */
    text: string;
}

export function deltaOf(current: number, previous: number, period: CashPeriod): Delta | null {
    // Önceki dönem yoksa oran hesaplanamaz; uydurmak yerine hap çizilmez.
    if (previous <= 0) return null;
    const raw = ((current - previous) / previous) * 100;
    const percent = Math.round(raw);
    if (percent === 0) return null;
    return {
        percent,
        tone: percent > 0 ? 'up' : 'flat',
        text: `%${Math.abs(percent)} · ${comparisonLabel(period)}`,
    };
}

// ── Yöntem ──────────────────────────────────────────────────────────────────

export const METHODS: readonly CashMethod[] = ['cash', 'card', 'transfer', 'other'];

export function methodLabel(method: CashMethod): string {
    switch (method) {
        case 'cash': return 'NAKİT';
        case 'card': return 'KART';
        case 'transfer': return 'HAVALE';
        default: return 'DİĞER';
    }
}

/** Sesli okuma ve cümle içi kullanım — büyük harf değil. */
export function methodWord(method: CashMethod): string {
    switch (method) {
        case 'cash': return 'nakit';
        case 'card': return 'kart';
        case 'transfer': return 'havale';
        default: return 'diğer';
    }
}

// ── Toplamlar ───────────────────────────────────────────────────────────────

export interface MethodShare {
    method: CashMethod;
    amount: number;
    /** Yüzde — oran çubuğunun dilim genişliği bundan türer. */
    percent: number;
}

export interface CashTotals {
    /** İptal edilenler HARİÇ toplam. */
    total: number;
    /** Sayılan işlem adedi. */
    count: number;
    /** İptal edilen adedi — başlıktaki sayaçta ayrı yazar. */
    voidedCount: number;
    shares: MethodShare[];
    /** Gün içindeki en büyük işlem; büyüklük ipucu buna bakar. */
    largest: number;
    /** "11:34" — son sayılan tahsilat. */
    lastTime: string | null;
}

/** İptal edilen kayıt toplama girmez ama listeden de kaybolmaz. */
export function isCounted(movement: Movement): boolean {
    return movement.status !== 'voided';
}

export function totalsOf(movements: readonly Movement[]): CashTotals {
    const counted = movements.filter(isCounted);
    const total = counted.reduce((sum, m) => sum + m.amount, 0);

    const shares: MethodShare[] = METHODS.map((method) => {
        const amount = counted
            .filter((m) => m.method === method)
            .reduce((sum, m) => sum + m.amount, 0);
        return { method, amount, percent: total > 0 ? (amount / total) * 100 : 0 };
    }).filter((s) => s.amount > 0);

    // Son giriş: saat sıralaması listeden bağımsız olsun diye burada bulunuyor.
    let lastTime: string | null = null;
    for (const m of counted) {
        if (lastTime === null || m.time > lastTime) lastTime = m.time;
    }

    return {
        total,
        count: counted.length,
        voidedCount: movements.length - counted.length,
        shares,
        largest: counted.reduce((max, m) => Math.max(max, m.amount), 0),
        lastTime,
    };
}

/** "6 tahsilat · son giriş 11:34" */
export function summaryLine(totals: CashTotals): string {
    if (totals.count === 0) return 'Henüz tahsilat yok';
    const last = totals.lastTime ? ` · son giriş ${totals.lastTime}` : '';
    return `${totals.count} tahsilat${last}`;
}

/** "6 işlem · 1 iptal" — toplamın neyi sayıp saymadığını tek satırda söyler. */
export function counterLine(totals: CashTotals): string {
    const base = `${totals.count} işlem`;
    return totals.voidedCount > 0 ? `${base} · ${totals.voidedCount} iptal` : base;
}

/**
 * Büyüklük ipucu HANE SAYISINDAN: yüzler küçük, binler orta, on binler ve
 * günün en büyük işlemi büyük. Göz büyük işlemi okumadan bulabilsin diye var;
 * kart bir grafiğe dönüşmüyor.
 */
export type AmountSize = 'small' | 'normal' | 'large';

export function amountSize(amount: number, largest: number): AmountSize {
    if (amount >= 10000 || (largest > 0 && amount === largest)) return 'large';
    if (amount >= 1000) return 'normal';
    return 'small';
}

// ── Bekleyen tahsilat ───────────────────────────────────────────────────────

export interface Pending {
    count: number;
    amount: number;
    /** En eski adisyonun bekleme süresi, dakika. */
    oldestMinutes: number;
    /** Dünden devreden adisyon: bekleme süresi saatle yazılır. */
    carriedOver?: boolean;
}

/** "24 dk" · "18 saat" — bir saati geçen bekleme dakikayla okunmuyor. */
export function waitLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} dk`;
    return `${Math.round(minutes / 60)} saat`;
}

/** "2 adisyon tahsil edilmedi" */
export function pendingTitle(pending: Pending): string {
    return `${pending.count} adisyon tahsil edilmedi`;
}

/**
 * "₺2.650 · en eskisi 24 dk bekliyor"
 * "₺900 · dünden kaldı, 18 saat bekliyor"
 */
export function pendingSubtitle(pending: Pending): string {
    const wait = waitLabel(pending.oldestMinutes);
    const head = pending.carriedOver ? 'dünden kaldı, ' : 'en eskisi ';
    return `${formatMoney(pending.amount)} · ${head}${wait} bekliyor`;
}

export function hasPending(pending: Pending | null): pending is Pending {
    return pending !== null && pending.count > 0;
}

// ── Denetim izi ─────────────────────────────────────────────────────────────

/**
 * "İPTAL · AYLA, 11:42" — kaydın listede bıraktığı iz.
 *
 * Kim iptal ettiği BİLİNMİYORSA yazılmaz: iz "İPTAL · 11:42" olur. Eskiden
 * boş isim yüzünden "İPTAL · , 11:42" gibi sakat bir satır çıkabiliyordu ve
 * uydurma bir isim koymak denetim izini yalanlardı.
 */
export function traceLine(movement: Movement): string | null {
    if (movement.status !== 'voided') return null;
    const who = (movement.voidedBy ?? '').trim().toLocaleUpperCase('tr');
    const when = (movement.voidedAt ?? '').trim();
    const parts = [who, when].filter(Boolean);
    return parts.length > 0 ? `İPTAL · ${parts.join(', ')}` : 'İPTAL';
}

// ── Sesli okuma ─────────────────────────────────────────────────────────────

/**
 * Oran çubuğu TEK düğüm olarak okunur; dilimler ayrı ayrı okunmaz.
 * Daireler dekoratiftir — yöntem bilgisi kartın cümlesinde kelime olarak geçer,
 * yani renk tek başına anlam taşımaz.
 */
export function ratioSpeech(totals: CashTotals): string {
    if (totals.shares.length === 0) return 'Yöntem dağılımı yok';
    const parts = totals.shares.map(
        (s) => `${methodWord(s.method)} yüzde ${Math.round(s.percent)}, ${formatAmount(s.amount)} lira`,
    );
    return `Yöntem dağılımı: ${parts.join('; ')}`;
}

/** Kart tek düğüm; iptal kartı "iptal edildi" ile BAŞLAR. */
export function movementSpeech(movement: Movement): string {
    const head = movement.status === 'voided' ? 'İptal edildi. ' : '';
    const chip = movement.status === 'corrected' ? ' Düzeltildi.' : '';
    return `${head}${movement.customer}, ${movement.service}, ${movement.time}, `
        + `${formatAmount(movement.amount)} lira, ${methodWord(movement.method)}, `
        + `${movement.staff} aldı.${chip}`;
}

// ── Sheet · iptal · boş gün ─────────────────────────────────────────────────

/** Sheet'teki bölüm başlıkları. */
export const SHEET_SECTIONS = {
    appointment: 'Randevu',
    lines: 'Hizmetler',
    payment: 'Tahsilat',
} as const;

/**
 * Sheet'teki dürüstlük notu.
 *
 * Veritabanında ödeme güncelleme yolu yok. "Düzelt" arkada eski kaydı iptal
 * edip yenisini yazar; kullanıcı bunu tek eylem olarak görür ama sonucu
 * listede iki satır olur. Bunu gizlemek, müdürün ertesi gün listede
 * anlamadığı bir çift görmesi demekti.
 */
export const CORRECTION_NOTE =
    'Düzeltme kaydı güncellemez: eski kayıt iptal edilir, yenisi yazılır. '
    + 'Listede ikisi de görünür — üstte yeni tutar, altında üstü çizili eski.';

export const ACTION_CORRECT = 'Düzelt';
export const ACTION_VOID = 'İptal et';
export const ACTION_CANCEL = 'Vazgeç';

/**
 * "Zeynep Kaya'nın kartı" · "Merve Aydın'ın kartı" · "Elif Demir'in kartı"
 *
 * Türkçe iyelik eki dört yönlü ünlü uyumuna göre seçiliyor ve ad ünlüyle
 * bitiyorsa araya kaynaştırma "n"si giriyor. Sabit bir "'nin" yazsaydık
 * müşterilerin çoğunun adı yanlış okunurdu.
 */
export function customerCardLabel(name: string): string {
    const trimmed = name.trim();
    const lower = trimmed.toLocaleLowerCase('tr');
    const vowels = 'aeıioöuü';
    let last = '';
    for (const ch of lower) if (vowels.includes(ch)) last = ch;

    const suffix = 'aı'.includes(last) ? 'ın'
        : 'ei'.includes(last) ? 'in'
            : 'ou'.includes(last) ? 'un'
                : 'öü'.includes(last) ? 'ün'
                    : 'in';

    const endsWithVowel = vowels.includes(lower.slice(-1));
    return `${trimmed}'${endsWithVowel ? 'n' : ''}${suffix} kartı`;
}

/**
 * İptal onayı.
 *
 * Bu uygulamada onay diyaloğu YALNIZ silme için var — düzeltme, dönem
 * değişimi, sheet kapama, gün sonu hiçbiri onay istemiyor. Diyaloğun gücü
 * nadirliğinden geliyor.
 *
 * Diyalog "emin misiniz" sormuyor, NE OLACAĞINI söylüyor.
 */
export interface VoidDialogCopy {
    title: string;
    /** Alıntı kutusu: neyin iptal edildiği. */
    who: string;
    what: string;
    warning: string;
    confirm: string;
    cancel: string;
}

export function voidDialog(movement: Movement): VoidDialogCopy {
    return {
        title: 'Tahsilatı iptal et',
        who: movement.customer,
        what: `${formatMoney(movement.amount)} ${methodWord(movement.method)} · ${movement.time} · ${movement.staff} aldı`,
        warning: 'Tutar gün toplamından düşer. Kayıt silinmez, listede iptal izi '
            + 'olarak kalır. Bu işlem geri alınamaz.',
        confirm: ACTION_VOID,
        cancel: ACTION_CANCEL,
    };
}

/**
 * İptali uygula — YEREL katman.
 *
 * Sunucuda müdür ucu yok; bu değişiklik cihazda yaşıyor ve öyle olduğunu
 * gizlemiyoruz. Kayıt SİLİNMİYOR, durumu değişiyor: kart yerinde kalır, tonu
 * kırmızıya döner, tutarı üstü çizilir, izi altına yazılır.
 */
export function applyVoid(
    movements: readonly Movement[],
    id: string,
    by: string | null,
    at: string,
): Movement[] {
    return movements.map((m) =>
        m.id === id && m.status !== 'voided'
            ? { ...m, status: 'voided' as CashStatus, voidedBy: by, voidedAt: at }
            : m,
    );
}

/**
 * Düzeltme alanının okunuşu.
 *
 * Sıfır GEÇERSİZ: bir tahsilat sıfır lira olamaz. Öyle bir şey olduysa
 * yapılacak şey düzeltme değil İPTAL, ve o düğme zaten yanında duruyor.
 */
export function parseAmount(text: string): number | null {
    const digits = text.replace(/\D/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/** Kaydedilebilir mi? Aynı tutar düzeltme DEĞİLDİR — kayıt kalabalığı olur. */
export function canCorrect(text: string, current: number): boolean {
    const value = parseAmount(text);
    return value !== null && value !== current;
}

/**
 * Düzeltmeyi uygula — `applyVoid` ile aynı YEREL katman.
 *
 * Düzeltme bir GÜNCELLEME DEĞİL: eski kayıt iptal edilir, yenisi yazılır.
 * Gerekçe denetim — bir tahsilatın tutarı sessizce değişirse kasadaki farkın
 * ne zaman doğduğu bir daha bulunamaz. Ekranın kendi cümlesi de bunu söylüyor
 * (`CORRECTION_NOTE`), davranış artık o cümleye uyuyor.
 *
 * Yeni kayıt eskisinin ÜSTÜNE giriyor: liste yeniden eskiye doğru akıyor ve
 * düzeltme sonradan oldu.
 *
 * KALEMLER TAŞINMIYOR. Tutar değişti ama hangi kalemin değiştiğini bilmiyoruz;
 * toplamı tutmayan bir döküm, dökümsüzlükten daha çok yanıltır.
 */
export function applyCorrection(
    movements: readonly Movement[],
    id: string,
    amount: number,
    by: string | null,
    at: string,
): Movement[] {
    const old = movements.find((m) => m.id === id);
    // İptal edilmiş kayıt düzeltilmez: düzeltilecek bir şey kalmadı.
    if (!old || old.status === 'voided') return [...movements];

    const voided = applyVoid(movements, id, by, at);
    const fresh: Movement = {
        ...old,
        id: `${old.id}-d`,
        time: at,
        amount,
        status: 'corrected',
        lines: undefined,
        voidedBy: undefined,
        voidedAt: undefined,
        correctedFrom: old.id,
    };
    const index = voided.findIndex((m) => m.id === id);
    return [...voided.slice(0, index), fresh, ...voided.slice(index)];
}

export const EMPTY_TITLE = 'Henüz tahsilat yok. Personel kasaya gönderdikçe burada görünür.';

/** Boş günde değişim hapı çıkmaz; yerine sakin bir karşılaştırma satırı. */
export function emptyComparison(period: CashPeriod): string {
    const when = period === 'today' ? 'dün bu saatte' : period === 'week' ? 'geçen hafta' : 'geçen ay';
    return `${when} de ₺0`;
}

// ── Sahte veri ──────────────────────────────────────────────────────────────
//
// Müdür modu için sunucu ucu HENÜZ YOK (`staff-api` yalnız personel modunu
// besliyor). Ekran bu yüzden sahte veriyle çalışıyor ve bunu gizlemiyor: uç
// yazıldığında yalnız bu blok gidecek, ekranın geri kalanı değişmeyecek.

export const mockMovements: readonly Movement[] = [
    { id: 'p1', time: '11:34', customer: 'Merve Aydın', initials: 'MA', service: 'Kesim + fön', staff: 'Merve', amount: 1800, method: 'card', status: 'normal' },
    {
        id: 'p2', time: '11:12', customer: 'Zeynep Kaya', initials: 'ZK', service: 'Saç boyama',
        staff: 'Merve', amount: 2400, method: 'cash', status: 'corrected',
        dateLabel: '13 Ağustos 2026, 11:12', range: '10:15–11:10',
        lines: [
            { name: 'Saç boyama', amount: 1900 },
            { name: 'Fön', amount: 350 },
            { name: 'Bakım ürünü', amount: 150 },
        ],
        note: 'Ürün indirimi uygulandı',
    },
    { id: 'p3', time: '10:48', customer: 'Elif Demir', initials: 'ED', service: 'Keratin bakımı', staff: 'Selin', amount: 1950, method: 'card', status: 'normal' },
    { id: 'p4', time: '10:20', customer: 'Buket Şen', initials: 'BŞ', service: 'Kaş alma', staff: 'Ece', amount: 700, method: 'cash', status: 'normal' },
    { id: 'p5', time: '10:05', customer: 'Sevil Kanat', initials: 'SK', service: 'Kesim + fön', staff: 'Ece', amount: 1200, method: 'cash', status: 'voided', voidedBy: 'Ayla', voidedAt: '11:42' },
    { id: 'p6', time: '09:52', customer: 'Hale Toprak', initials: 'HT', service: 'Saç bakımı + ürün', staff: 'Deniz', amount: 800, method: 'transfer', status: 'normal' },
    { id: 'p7', time: '09:30', customer: 'Nihan Arı', initials: 'NA', service: 'Kesim', staff: 'Deniz', amount: 800, method: 'card', status: 'normal' },
];

export const mockPending: Pending = { count: 2, amount: 2650, oldestMinutes: 24 };

/** Boş gün: para girmemiş ama bekleyen var — ayrım önemli. */
export const mockEmptyPending: Pending = { count: 1, amount: 900, oldestMinutes: 1080, carriedOver: true };

/** Değişim hapının karşılaştırma tabanı — dönem başına önceki dönem toplamı. */
export const mockPrevious: Record<CashPeriod, number> = {
    today: 7545,
    week: 36800,
    month: 148000,
};

export const DAY_END = 'Gün sonu özeti';

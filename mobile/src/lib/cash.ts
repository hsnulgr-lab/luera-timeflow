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
    /** Hizmeti VEREN personelin adı (`payments.staff_id`); bilinmiyorsa boş. */
    staff: string;
    amount: number;
    method: CashMethod;
    status: CashStatus;
    /** Geri alınmış kayıtta: geri alma saati (HH:MM). İzin taşıyıcısı. */
    voidedAt?: string;
    /** Tahsilatın bağlı olduğu randevu; yoksa serbest satış. */
    reservationId?: string | null;
    /** "13 Ağustos 2026, 11:12" — sheet'in başlığındaki tam zaman. */
    dateLabel?: string;
    /** "10:15–11:10" — tahsilatın bağlı olduğu randevunun aralığı. */
    range?: string;
    /** Hesap kalemleri; toplamları `amount` etmeli. */
    lines?: MovementLine[];
    /** Serbest açıklama — varsa sheet'te ayrı satır. */
    note?: string;
    /** Bu kayıt bir DÜZELTME ise: damgalanan eski kaydın kimliği. */
    correctedFrom?: string;
    /** Düzeltmenin KENDİ saati (HH:MM) — tahsilatınki değil. */
    correctedAt?: string;
    /** Düzeltmeden önceki tutar; iz "önce ₺1.200" diye yazıyor. */
    correctedFromAmount?: number;
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

/**
 * "Gün sonu özeti" düğmesinin başlığı — seçili sekmeye göre değişir (2026-09-22
 * kararı). Masaüstünde bu ekran sabit BUGÜN'dür; mobilde zaten yüklü olan
 * dönem verisi tekrar kullanılıyor, o yüzden isim de dönemi takip ediyor.
 */
export function periodSummaryTitle(period: CashPeriod): string {
    switch (period) {
        case 'week': return 'Hafta özeti';
        case 'month': return 'Ay özeti';
        default: return 'Gün sonu özeti';
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
 * Geri alınmış kaydın altındaki iz — "geri alındı 15:40" (v4 · C2).
 *
 * Satır listeden KAYBOLMUYOR: "Düzeltme ve geri alma Kasa'da saatiyle
 * görünür." Kaybolsaydı, gün toplamının neden düştüğü bir daha
 * açıklanamazdı. Tutar toplama girmiyor (`isCounted`), ama kayıt duruyor.
 *
 * Kimin yaptığı YAZILMIYOR. Tek kişilik modda cevap her zaman "sen"; ekip
 * modunda bu satır zaten çizilmiyor (Kasa orada salt okunur). Boş bir isim
 * uydurmaktansa hiç yazmamak doğru.
 */
export function traceLine(movement: Movement): string | null {
    if (movement.status !== 'voided') return null;
    const when = (movement.voidedAt ?? '').trim();
    return when ? `geri alındı ${when}` : 'geri alındı';
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
    const head = movement.status === 'voided' ? 'Geri alındı. ' : '';
    const chip = movement.status === 'corrected' ? ' Düzeltildi.' : '';
    const who = staffLine(movement);
    return `${head}${movement.customer}, ${movement.service}, ${movement.time}, `
        + `${formatAmount(movement.amount)} lira, ${methodWord(movement.method)}`
        + `${who ? `, ${who}` : ''}.${chip}`;
}

/**
 * "Merve verdi" — kartın üçüncü satırı.
 *
 * "aldı" DEĞİL: masaüstü `payments.staff_id`e randevunun personelini yazıyor,
 * yani hizmeti vereni; parayı kasada alan kişi orada yok. "Merve aldı"
 * demek, kasayı hiç açmamış birine para teslim ettirmek olurdu. Akış da aynı
 * fiili kullanıyor ("Merve verdi · 12 dk bekliyor").
 *
 * Personel bilinmiyorsa (serbest ürün satışı) satır HİÇ yazılmıyor — boş bir
 * " verdi" çizilmiyor.
 */
export function staffLine(movement: Pick<Movement, 'staff'>): string | null {
    const name = movement.staff.trim();
    return name ? `${name} verdi` : null;
}

/** Sheet'teki satırın adı — `staffLine` ile aynı gerekçe. */
export const STAFF_ROW_LABEL = 'Hizmeti veren';

// ── Sheet · iptal · boş gün ─────────────────────────────────────────────────

/** Sheet'teki bölüm başlıkları. */
export const SHEET_SECTIONS = {
    appointment: 'Randevu',
    lines: 'Hizmetler',
    payment: 'Tahsilat',
} as const;

/**
 * Sheet'teki dürüstlük notu — DÜZELTME alanının altında (v4 · C3).
 *
 * Düzeltme bir GÜNCELLEME DEĞİL. `payments`te tutarı değiştiren bir yol yok
 * ve olmamalı: bir tahsilatın tutarı sessizce değişirse kasadaki farkın ne
 * zaman doğduğu bir daha bulunamaz. Sunucu eskiyi damgalar, yenisini yazar
 * (`111 · correct_payment`).
 *
 * Kullanıcı bunu TEK eylem olarak görüyor ve Kasa da tek satır çiziyor —
 * ama satırın altındaki iz iki kaydın var olduğunu söylüyor.
 */
export const CORRECTION_NOTE = 'Eski kayıt silinmez; yanına düzeltme kaydı yazılır.';

/**
 * Eylem satırlarının altındaki not (v4 · C2).
 *
 * `CORRECTION_NOTE`tan ayrı, çünkü burada henüz hangi eylemin seçileceği
 * belli değil: cümle ikisini birden kapsıyor.
 */
export const ACTIONS_NOTE =
    'Eski kayıt silinmez. Düzeltme ve geri alma Kasa\'da saatiyle görünür.';

/**
 * Eylemlerin YERİNDEKİ eski cümle — artık YALNIZ ekip modunda.
 *
 * Ekibi olan salonun müdürü masaüstüne sahip; telefonda düzeltme yapmaması
 * bir eksiklik değil, iş bölümü. Tek kişilik işletmede masaüstü YOK ve bu
 * cümle bir çıkmaz sokak olurdu — v4 onun yerine iki eylem satırı koyuyor
 * (C2). Kabuk ayrımı `useInSoloShell` ile ekranda yapılıyor.
 */
export const READ_ONLY_NOTE = 'Düzeltme ve iptal masaüstündeki Kasa\'dan yapılır.';

/**
 * İki eylem, iki satır (v4 · C2).
 *
 * Alt yazılar süs değil: "Düzelt" neyin düzeltilebildiğini (yalnız tutar ve
 * yöntem), "Geri al" ise sonucunu söylüyor. Geri alma yıkıcı görünmeli ama
 * dolgulu OLMAMALI — yanlışlıkla en cazip görünen şey olmamalı.
 */
export const ACTION_CORRECT = 'Düzelt';
export const ACTION_CORRECT_SUB = 'Tutar ya da yöntem';
/** v4 "İptal et" demiyor: olan şey paranın geri alınması ve adisyonun açılması. */
export const ACTION_VOID = 'Geri al';
export const ACTION_VOID_SUB = 'Adisyon yeniden açılır';
export const ACTION_SAVE = 'Düzeltmeyi kaydet';
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
    /** Tek cümle: ne geri alınıyor ve sonucu ne. */
    message: string;
    confirm: string;
    cancel: string;
}

/**
 * "Geri al" SİSTEM UYARISIYLA onaylanıyor (v4 · C2 notu).
 *
 * Özel bir diyalog değil: yıkıcı onay için uygulamanın kendi kalıbı zaten
 * `Alert.alert` + `style: 'destructive'` (hesap silme). Para geri alan bir
 * eylemin, sistemin tanıdık uyarısını kullanması kullanıcıyı yavaşlatır —
 * istenen de bu.
 *
 * "Adisyon yeniden açılır" YALNIZ randevuya bağlı tahsilatta yazılıyor.
 * Serbest ürün satışının adisyonu yok; o cümleyi orada da yazmak, olmayan
 * bir şeyin açılacağını söylemekti.
 */
export function voidDialog(movement: Movement): VoidDialogCopy {
    const what = `${formatMoney(movement.amount)} ${methodWord(movement.method)} tahsilatı geri alınsın mı?`;
    return {
        title: 'Tahsilatı geri al',
        message: movement.reservationId ? `${what} Adisyon yeniden açılır.` : what,
        confirm: ACTION_VOID,
        cancel: ACTION_CANCEL,
    };
}

/**
 * Düzeltme alanının okunuşu.
 *
 * Sıfır GEÇERSİZ: bir tahsilat sıfır lira olamaz. Öyle bir şey olduysa
 * yapılacak şey düzeltme değil GERİ ALMA, ve o satır zaten yanında duruyor.
 */
export function parseAmount(text: string): number | null {
    const digits = text.replace(/\D/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Kaydedilebilir mi?
 *
 * v4 düzeltmeyi İKİ alana açıyor: tutar ve yöntem (C3). Yalnız yöntemi
 * değiştirmek geçerli bir düzeltme — nakit alınan iş yanlışlıkla karta
 * yazılmış olabilir ve gün sonunda kasa tutmaz.
 *
 * Hiçbiri değişmediyse kaydedilmiyor: sunucu da `no_change` ile reddediyor
 * (`111 · correct_payment`), ama kullanıcıyı oraya kadar götürmeye gerek yok.
 */
export function canCorrect(
    text: string,
    current: number,
    method?: CashMethod | null,
    currentMethod?: CashMethod,
): boolean {
    const value = parseAmount(text);
    if (value === null) return false;
    if (value !== current) return true;
    // Tutar aynı: yöntem değiştiyse hâlâ bir düzeltme var.
    return method != null && currentMethod != null && method !== currentMethod;
}

/**
 * Kasa satırının altındaki DÜZELTME İZİ — "düzeltildi 15:40 · önce ₺1.200"
 * (v4 · C1).
 *
 * Yeri tesadüf değil: tek kişilik modda "Elif Demir verdi" satırı kalkıyor
 * (parayı veren hep kullanıcının kendisi) ve boşalan yuvaya bu iz giriyor.
 *
 * Saat düzeltmenin KENDİ saati, tahsilatınki değil: tahsilat 13:05'te alındı
 * ve satır hâlâ 13:05 diyor. İkisini karıştırmak, paranın ne zaman girdiğini
 * yanlış göstermekti.
 */
export function correctionTrace(movement: Movement): string | null {
    if (!movement.correctedAt) return null;
    const before = typeof movement.correctedFromAmount === 'number'
        ? ` · önce ${formatMoney(movement.correctedFromAmount)}`
        : '';
    return `düzeltildi ${movement.correctedAt}${before}`;
}

/**
 * Boş dönem. "Personel kasaya gönderdikçe" DEĞİL: kasaya gönderilen adisyon
 * burada görünmüyor, turuncu panelde bekliyor. Hareket listesine düşen şey
 * masaüstünde TAHSİL EDİLEN para.
 */
export const EMPTY_TITLE = 'Henüz tahsilat yok. Kasada tahsil edildikçe burada görünür.';

/** Boş günde değişim hapı çıkmaz; yerine sakin bir karşılaştırma satırı. */
export function emptyComparison(period: CashPeriod): string {
    const when = period === 'today' ? 'dün bu saatte' : period === 'week' ? 'geçen hafta' : 'geçen ay';
    return `${when} de ₺0`;
}

// ── Test örnekleri ──────────────────────────────────────────────────────────
//
// Ekran artık bunları OKUMUYOR: hareketler `cashBuild.toMovements`, bekleyen
// adisyonlar akışın canlı olaylarından geliyor. Blok, kuralları sabit
// sayılarla sınayan testlerin örneği olarak duruyor; bir ekran buraya geri
// bağlanırsa `tests/mobile-mudur-kasa-canli.test.mjs` yakalar.

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
    { id: 'p5', time: '10:05', customer: 'Sevil Kanat', initials: 'SK', service: 'Kesim + fön', staff: 'Ece', amount: 1200, method: 'cash', status: 'voided', voidedAt: '11:42' },
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


// Müdür 33 · Eylem hapı — SAF MODEL.
//
// Tasarım: docs/design-reference/Luera Mobil - Mudur 33 Eylem Hapi.html
//
// Hap bir menü değil, bir ALET: tek bir yüzey içinde ayraçlarla bölünmüş
// gözler. Her göz bir eylem, her eylem 3 saniye basılı tutmayla çalışır.
//
// Burada YALNIZ karar var; çizim ve hareket bileşende. Bu dosya React,
// react-native ve Expo import ETMEZ (saf katman kuralı).

import { hasWa } from './phone.ts';

/**
 * Gözün kimliği.
 *
 * `waoff` ayrı bir göz DEĞİL, `wa`nın onarım hâli: salonun WhatsApp'ı bağlı
 * değilken göz silinmiyor, sönük duruyor ve Ayarlar'a götürüyor. Silmek
 * "ölü kontrol yok" kuralına uyar gibi görünür ama burada gidilecek GERÇEK
 * bir yer var; müdürün sebebi bilmesi gerekiyor.
 */
export type CellKey = 'ara' | 'wa' | 'waoff' | 'nox' | 'inf';

export interface CellSpec {
    key: CellKey;
    /** Basılı tutarken hapın üstünde beliren kelime. */
    label: string;
    /** Kelimenin altındaki açıklama — ne olacağını söyler. */
    hint: string;
}

const SPECS: Record<CellKey, Omit<CellSpec, 'key'>> = {
    ara: { label: 'Ara', hint: 'telefon açılır' },
    wa: { label: 'WhatsApp’tan yaz', hint: 'hazır metin, salonun numarası' },
    waoff: { label: 'WhatsApp bağlı değil', hint: 'Ayarlara git' },
    nox: { label: 'Gelmedi', hint: 'geri alınabilir' },
    inf: { label: 'Personele bilgi ver', hint: 'bildirim gider' },
};

/**
 * Gözün kelimesi ve açıklaması.
 *
 * PERSONEL GÖZÜ ADI SÖYLER. Çan simgesi "bir bildirim" diyordu; müdürün
 * kafasındaki şey ise "Selin'e haber ver". Gözde personelin baş harfleri
 * duruyor, açıklamada adı: "Selin'e bildirim gider". Simge yerine VERİ —
 * ve veri yoksa cümle jenerik hâline düşer, uydurulmaz.
 */
export function cellSpec(key: CellKey, staffGiven?: string): CellSpec {
    const spec = SPECS[key];
    if (key === 'inf' && staffGiven?.trim()) {
        return { key, label: spec.label, hint: `${dative(staffGiven.trim())} bildirim gider` };
    }
    return { key, ...spec };
}

/**
 * "Selin" → "Selin'e" · "Merve" → "Merve'ye" · "Deniz" → "Deniz'e".
 *
 * Türkçe yönelme eki son SESLİYE göre değişir, son harfe göre değil. Küçük
 * bir tablo yeterli: personel adları özel isim, kesme işaretiyle ayrılıyor.
 */
function dative(name: string): string {
    const lower = name.toLocaleLowerCase('tr-TR');
    const vowels = [...lower].filter((ch) => 'aeıioöuü'.includes(ch));
    const last = vowels.at(-1) ?? 'a';
    const back = 'aıou'.includes(last);
    const softens = 'aeıioöuü'.includes(lower.at(-1) ?? '');
    const suffix = back ? (softens ? 'ya' : 'a') : (softens ? 'ye' : 'e');
    return `${name}’${suffix}`;
}

/** Gözde çizilecek şey: iki büyük harf VERİ, gerisi simge. */
export function cellGlyph(key: CellKey, staffInitials?: string): string | null {
    if (key !== 'inf') return null;
    const initials = staffInitials?.trim().toLocaleUpperCase('tr-TR');
    return initials && initials.length === 2 ? initials : null;
}

/** Sunucunun gönderim sonucu — `sendWA`nın tanımlı çıktıları. */
export type WaResult = 'ok' | 'not_connected' | 'opt_out' | 'invalid_phone' | 'failed';

export interface PillInput {
    /** Müşterinin telefonu. Yoksa iki kanal da çizilmez. */
    customerPhone?: string | null;
    /** Salonun WhatsApp bağlantısı kurulu mu. */
    waConnected?: boolean;
    /** Bu müşteriye daha önce gönderim denendi mi, sonucu neydi. */
    waResult?: WaResult;
    /** `Gelmedi` gözü çizilsin mi — yalnız `next` kartında anlamlı. */
    canDrop?: boolean;
    /** Personel bildirimi gözü çizilsin mi. */
    canTellStaff?: boolean;
}

/**
 * Hapta hangi gözler çizilecek — VERİDEN türer, sabit değil.
 *
 * Sıra sabit: ulaşma kanalları önce (ara, yaz), sonra kayıt (gelmedi), sonra
 * içeriye haber (personel). Hap daralır ama gözlerin sırası hiç değişmez;
 * kas hafızası bozulmasın.
 */
export function pillCells(input: PillInput): CellKey[] {
    const cells: CellKey[] = [];
    const phone = hasWa(input.customerPhone);

    // Numara geçersizse ARAMA da güvenilmez: aynı numara. İki kanal birlikte
    // düşer, onarım müşteri kartındadır.
    const badNumber = input.waResult === 'invalid_phone';
    if (phone && !badNumber) cells.push('ara');

    if (phone && !badNumber) {
        // Müşteri mesaj istemiyorsa göz BİR DAHA çizilmez — bu, onarılabilir
        // bir hata değil, müşterinin kararı.
        if (input.waResult !== 'opt_out') {
            cells.push(input.waConnected === false ? 'waoff' : 'wa');
        }
    }

    if (input.canDrop) cells.push('nox');
    if (input.canTellStaff) cells.push('inf');
    return cells;
}

/**
 * Hap hiç açılmıyorsa tetikleyici de çizilmez.
 *
 * Tek gözlü bir hap saçmadır: hap seçim sunmak için var. Tek eylem kalırsa
 * kart onu DÜZ DÜĞME olarak göstermeli — bu kararı çağıran verir, burada
 * yalnız sayı söyleniyor.
 */
export function pillOpens(cells: readonly CellKey[]): boolean {
    return cells.length >= 2;
}

// ── Kartın kayıt satırı ─────────────────────────────────────────────────────

export type RecordTone = 'quiet' | 'live' | 'warn';

export interface PillRecord {
    text: string;
    tone: RecordTone;
    /** Bu kayıt bayatlar mı? Bitmemiş iş DÜŞMEZ. */
    stales: boolean;
}

/** Kayıt bu kadar dakika sonra bayatlar ve satır düşer. */
export const RECORD_STALE_MINUTES = 10;

/** "2 dk" · "şimdi" — kaydın yaşı. */
export function recordAge(minutes: number): string {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
    return safe <= 0 ? 'şimdi' : `${safe} dk`;
}

/**
 * `Yaz`ın sonucu kartta ne diyor.
 *
 * DAMGA "GÖNDERİLDİ" DİYEBİLİR — ama yalnız sunucu öyle döndüğünde. Kanal
 * artık salonun numarası ve uygulama dışarı çıkmıyor, yani teslimat GERÇEKTEN
 * biliniyor. Bilinmeyeni yazmıyoruz: `failed` süre yazmaz, çünkü yaş yazan bir
 * kayıt "bitti" der.
 */
export function waRecord(result: WaResult, minutes: number): PillRecord {
    switch (result) {
        case 'ok':
            return { text: `Yazıldı · ${recordAge(minutes)}`, tone: 'quiet', stales: true };
        case 'not_connected':
            return { text: 'Gönderilemedi · bağlantı yok', tone: 'warn', stales: false };
        case 'opt_out':
            return { text: 'Mesaj istemiyor · gönderilmedi', tone: 'quiet', stales: true };
        case 'invalid_phone':
            return { text: 'Numara geçersiz · düzeltilmeli', tone: 'warn', stales: false };
        case 'failed':
            return { text: 'Kuyrukta · bağlantı gelince gider', tone: 'quiet', stales: false };
    }
}

/** Aramanın kaydı. Sonucu bilinmez — yalnız müdürün ne yaptığı yazılır. */
export function callRecord(minutes: number): PillRecord {
    return { text: `Arandı · ${recordAge(minutes)}`, tone: 'quiet', stales: true };
}

/**
 * Personel bildiriminin kaydı.
 *
 * "İletildi" DEĞİL: bildirim kanalı bu eyleme henüz bağlı değil. Kalıp doğru,
 * metin kanal bağlanınca değişir.
 */
export function staffRecord(minutes: number): PillRecord {
    return { text: `Personele söylendi · ${recordAge(minutes)}`, tone: 'quiet', stales: true };
}

/** Kayıt hâlâ çiziliyor mu? Bayatlayan düşer, bitmemiş iş kalır. */
export function recordVisible(record: PillRecord, minutes: number): boolean {
    if (!record.stales) return true;
    return Math.max(0, Math.floor(minutes)) < RECORD_STALE_MINUTES;
}

// ── Gönderim penceresi ──────────────────────────────────────────────────────

/**
 * `Yaz` basıldıktan sonra istek bu kadar saniye BEKLER.
 *
 * Pencere içinde istek HİÇ GİTMEZ; ikinci yuva "Geri al"a takas olur. Kalıp
 * ürünün kendi kalıbı (online randevu reddi de böyle). Üç saniyelik basılı
 * tutma bir kaza koruması, bu ise bir fikir değiştirme payı — ikisi farklı
 * şeyler ve ikisi de gerekli.
 */
export const SEND_WINDOW_SECONDS = 5;

export function sendingRecord(secondsLeft: number): PillRecord {
    const safe = Math.max(0, Math.floor(secondsLeft));
    return { text: `Yazılıyor · ${safe}`, tone: 'live', stales: false };
}

// ── Hareket sözleşmesi ──────────────────────────────────────────────────────
//
// Süreler tasarımdan birebir. Hepsi `opacity` ve `scale` — yükseklik, renk,
// yarıçap ve gölge animasyonlanmıyor. Simgenin kreme dönmesi RENK DEĞİŞİMİ
// DEĞİL: iki simge üst üste duruyor ve çapraz sönüyor.

export const pillMotion = {
    // ── Açılış · toplam 250 ms ────────────────────────────────────────────
    /** Hapın kendi ölçeklenmesi. Gözler bittiğinde çoktan oturmuş olur. */
    open: 140,
    /** Gözler arası gecikme. Kutu belirmiyor, alet KURULUYOR. */
    stagger: 32,
    /** Bir gözün girişi: 0,86 → 1,04 (110 ms), sonra 1,00 (40 ms). */
    cellIn: 110,
    cellSettle: 40,
    cellFrom: 0.86,
    cellOvershoot: 1.04,
    /** Perde. */
    scrim: 120,

    // ── Basılıyken ────────────────────────────────────────────────────────
    /** Basılan göz 1,00 → 1,12, yaylı. */
    pressScale: 1.12,
    press: 140,
    /** Halkası %55 → %100. */
    ringIn: 90,
    /** Komşular 0,94'e küçülüp %32'ye söner. */
    neighborScale: 0.94,
    neighbor: 100,
    dimOpacity: 0.32,
    /** Kelime bloğu — okun KARŞI kenarında. */
    labelIn: 90,

    // ── Dolgu ─────────────────────────────────────────────────────────────
    /**
     * Diskin tamamlanması. Doğrusal — okunan şey halkaya kalan boşluk.
     *
     * 3000 → 1200 → 1000 → 500, hepsi cihazda denenerek. Son değer iOS'un
     * kendi uzun basma eşiğiyle aynı: artık "koruma" değil, standart bir
     * uzun basış. Kaza payı daralıyor ama dördünün de geri dönüşü var —
     * `Gelmedi` geri alınabiliyor ve zaten 30. dakikada kendiliğinden
     * düşüyor, `Yaz` beş saniyelik pencereden geçiyor, `Ara` telefonu
     * açmaktan öteye gitmiyor. Korunacak geri alınamaz bir şey yok.
     */
    hold: 500,
    /** Simge çapraz sönmesi dolgunun neresinde başlar/biter (0–1). */
    crossFrom: 0.45,
    crossTo: 0.77,
    /**
     * Parmak erken kalkınca dolgu geri çekilir. Geri alma cezalandırılmaz:
     * dönüş her zaman dolgunun üçte birinden kısa.
     */
    release: 120,
    /** Kelime bloğunun sönmesi. */
    labelOut: 120,

    // ── Ödül · 220 ms ─────────────────────────────────────────────────────
    /** Disk 1 → 1,14 → 1, yaylı. Bastığının karşılığı burada ödeniyor. */
    doneDisc: 200,
    donePop: 1.14,
    /** Halka dalgası: 1 → 1,7 büyürken %90 → 0 söner. */
    halo: 220,
    haloScale: 1.7,
    haloOpacity: 0.9,
    /** Onay işareti çapraz sönmesi; komşular 0,88'e ve tamamen söner. */
    doneCross: 120,
    doneNeighborScale: 0.88,
    /** Ödül karesi bu kadar durur, sonra hap kapanır. */
    doneHold: 220,

    // ── Kapanış ───────────────────────────────────────────────────────────
    /** Hap ve ok ucu birlikte: opacity + scale 1 → 0,96. TERS KADEME YOK. */
    close: 110,
    closeScale: 0.96,
    /** Çevronun yön değiştirmesi. */
    chevron: 140,
} as const;

/**
 * Simgenin kreme dönme oranı (0–1) — dolgunun ilerlemesinden türer.
 *
 * Dolgu simgeye 0,4'te yaklaşır, 0,7'de tamamen altına alır. Çapraz sönme bu
 * aralıkta olur; öncesinde ve sonrasında sabit durur.
 */
export function crossFade(progress: number): number {
    const { crossFrom, crossTo } = pillMotion;
    const p = Number.isFinite(progress) ? progress : 0;
    return Math.max(0, Math.min(1, (p - crossFrom) / (crossTo - crossFrom)));
}

/**
 * `reduceMotion` açıkken dolgu KADEMELİ ilerler ama DURMAZ.
 *
 * Kural "hareket durur, bilgi durmaz" — ve dolgu bir bilgidir: müdüre daha ne
 * kadar tutması gerektiğini söyleyen tek şey o. Hapın ölçeklenmesi düşer,
 * dolgu düşmez; yalnız sürekli akmak yerine altı basamakta ilerler.
 */
export const REDUCED_STEPS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1] as const;

export function reducedFill(progress: number): number {
    const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const index = Math.min(REDUCED_STEPS.length - 1, Math.floor(p * (REDUCED_STEPS.length - 1)));
    return REDUCED_STEPS[index];
}


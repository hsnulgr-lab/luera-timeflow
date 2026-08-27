/**
 * Müdür 22 — Boş gün ve günler arası geçiş.
 *
 * Boş gün bir çıkmaz değil, gündür. Ekranın eski hâlinde müdür cetvelden boş
 * bir güne kayınca liste boşalıyor, kaydıracak içerik kalmıyor ve cam levha
 * bir daha gelmiyordu: gün değiştirecek hiçbir yol yoktu.
 *
 * Hata boş hâlde değil, LEVHANIN KURALINDAYDI. Levha "sayfa kaydırıldı mı"
 * sorusuna bağlıydı; gerçek kuralı şu: dev başlık günün kimliğini
 * taşıyamıyorsa levha taşır. Boş günde başlığın söyleyeceği bir şey yok,
 * levha o gün kalıcı olur.
 *
 * Boş ekranda HER AN en az iki dokunmatik çıkış vardır — pedal ve cetvel.
 * Yatay kaydırma üçüncüsü ve yalnız hızlandırıcı; biri kaybolursa ekran
 * hâlâ terk edilebilir.
 *
 * Saf: React yok, react-native yok, Expo yok.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 22 Bos Gun.html`.
 */

import { addDaysISO } from './calendar.ts';
import { upperTR } from './text.ts';

// ── Gün kimliği ─────────────────────────────────────────────────────────────

export type DayPosition = 'past' | 'today' | 'future';

/** Seçili gün bugüne göre nerede? */
export function dayPosition(selectedISO: string, todayISO: string): DayPosition {
    if (selectedISO === todayISO) return 'today';
    return selectedISO < todayISO ? 'past' : 'future';
}

/** Aradaki gün sayısı. Yön taşımaz — işareti `dayPosition` söyler. */
export function dayDistance(selectedISO: string, todayISO: string): number {
    const a = Date.parse(`${selectedISO}T00:00:00Z`);
    const b = Date.parse(`${todayISO}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.round(Math.abs(a - b) / 86_400_000);
}

const MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

/** Pazartesi'den başlar — `getUTCDay()` pazar 0 verdiği için kaydırılır. */
const WEEKDAYS = [
    'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
] as const;

const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

function parts(iso: string): { day: number; month: number; weekday: number } | null {
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return {
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        weekday: (date.getUTCDay() + 6) % 7,
    };
}

/** Levhanın tarih satırı: "15 Ağustos, Cuma". Sayı SAYMAZ, gün söyler. */
export function plateDateLine(iso: string): string {
    const p = parts(iso);
    if (!p) return '';
    return `${p.day} ${MONTHS[p.month]}, ${WEEKDAYS[p.weekday]}`;
}

/** Pedal bölmesi: "Per 13". Gün adı HER EKRANDA üç harf — kırpma oluşmaz. */
export function shortDayLabel(iso: string): string {
    const p = parts(iso);
    if (!p) return '';
    return `${WEEKDAYS_SHORT[p.weekday]} ${p.day}`;
}

/** Erişilebilirlik cümlesi için tam gün: "13 Perşembe". */
export function longDayLabel(iso: string): string {
    const p = parts(iso);
    if (!p) return '';
    return `${p.day} ${WEEKDAYS[p.weekday]}`;
}

// ── Boş hâlin cümlesi ───────────────────────────────────────────────────────

export interface EmptyDayCopy {
    /** "İLERİDEKİ GÜN · 5 GÜN SONRA" — zaten büyük harfli, tr-TR ile. */
    label: string;
    /** Yalnız bugünde ve TURUNCU: bugün bir zaman bilgisidir. */
    dot: boolean;
    /** İki satıra kadar; ortalı. Kahraman rakam YOK — ölçülecek bir şey yok. */
    title: string;
    /** Kırpılmaz, sarar. */
    hint: string;
    /**
     * Birincil eylem. Geçmiş günde `null`: geçmişe randevu kurulmaz ve
     * basıldığında hiçbir şey yapmayacak bir düğme çizilmez.
     */
    action: string | null;
    /** Ekran okuyucunun tek cümlede okuduğu hâl. */
    spoken: string;
}

/**
 * Üç boş gün, üç ayrı cümle.
 *
 * "boş geçti" YALNIZ geçmiş gün içindir: gelecek bir gün için geçmiş kip
 * yanlış bilgi verir, gün henüz yaşanmadı. Bugün için "henüz" kelimesi günü
 * açık bırakır.
 *
 * Yasak: tek başına "Kayıt yok", "Hiç", ünlem. Kayıt yokluğu bir hata değil;
 * cümle her zaman GÜNLE başlar — özne gün, eksik olan liste değil.
 */
export function emptyDayCopy(selectedISO: string, todayISO: string): EmptyDayCopy {
    const position = dayPosition(selectedISO, todayISO);
    const distance = dayDistance(selectedISO, todayISO);
    const p = parts(selectedISO);
    const dayName = p ? WEEKDAYS[p.weekday] : '';
    const dayNumber = p ? `${p.day} ${MONTHS[p.month]}` : '';

    if (position === 'today') {
        return {
            label: upperTR('Bugün'),
            dot: true,
            title: 'Bugün henüz bir şey olmadı',
            hint: 'Salon 09:00’da açıldı · ilk kayıt bekleniyor.',
            action: 'Randevu kur',
            spoken: 'Bugün, henüz bir şey olmadı. Randevu kurmak için düğme.',
        };
    }

    if (position === 'future') {
        return {
            label: upperTR(`İlerideki gün · ${distance} gün sonra`),
            dot: false,
            title: `${dayNumber} ${dayName}’da kayıt yok`,
            hint: 'O güne henüz randevu kurulmadı.',
            action: 'O güne randevu kur',
            spoken: `${dayNumber} ${dayName}, ileride, kayıt yok. Randevu kurmak için düğme.`,
        };
    }

    return {
        label: upperTR(`Geçmiş gün · ${distance} gün önce`),
        dot: false,
        title: `${dayName}, ${dayNumber} boş geçti`,
        hint: 'O gün randevu, işlem ve tahsilat kaydı yok.',
        // Geçmişe randevu kurulmaz — satır silinmez, HİÇ çizilmez.
        action: null,
        spoken: `${dayName}, ${dayNumber} boş geçti. O gün randevu, işlem ve tahsilat kaydı yok.`,
    };
}

// ── Cam levhanın kuralı ─────────────────────────────────────────────────────

/**
 * Levha İÇERİĞE bağlı, kaydırmaya değil.
 *
 * Dolu günde günün kimliğini dev başlık taşır, levha kaydırınca gelir.
 * Boş günde başlığın taşıyacağı bir şey yok, levha doğrudan gelir ve gitmez.
 *
 * Tek istisna BUGÜN: bugün boş olsa da başlık ve personel şeridi doğruyu
 * söylüyor (şerit "kim müsait" der, boş sabahta müdürün ilk sorusu budur),
 * o yüzden orada levha yine kaydırmaya bağlı kalır.
 */
export function plateIsPermanent(isEmpty: boolean, isToday: boolean): boolean {
    // Başka gün seçiliyken dev başlığın söyleyebileceği tek şey gün adı;
    // randevu sayısı ve "kaç işlem sürüyor" ŞU ANIN gerçeği, o gün için
    // yazılamaz. Kimliği levha taşır — gün dolu olsa da.
    if (!isToday) return true;
    // Bugün: başlık ve şerit doğruyu söylüyor, levha kaydırınca gelir.
    void isEmpty;
    return false;
}

/**
 * Gün pedalı boş hâlin özel öğesi DEĞİL — bir yerde öğrenilen şey her yerde
 * bulunur. Bugünün dolu akışında gerek yok (zaten oradayız); başka her günde
 * ve boş bugünde durur.
 *
 * Boş günde sabittir (kaydırılacak sayfa yok), dolu günde listenin altında
 * sayfayla birlikte kayar.
 */
export function pedalVisible(isEmpty: boolean, isToday: boolean): boolean {
    return !isToday || isEmpty;
}

/** Pedal sabit mi, listeyle birlikte mi kayıyor? */
export function pedalIsFixed(isEmpty: boolean): boolean {
    return isEmpty;
}

/**
 * Listenin son satırı. "Bugünlük bu kadar" YALNIZ bugün doğrudur; başka
 * günün altında yanlış gün hakkında konuşur.
 */
export function flowEndLabel(isToday: boolean): string {
    return isToday ? 'Bugünlük bu kadar' : 'Günün tamamı bu';
}

/**
 * Boş günde kaydırılacak bir şey yok. Lastik bant sahte bir hareket
 * üretmesin diye düşey kaydırma tamamen kapatılır.
 */
export function scrollEnabledOnDay(isEmpty: boolean, isToday: boolean): boolean {
    // YALNIZ boş başka gün kilitlenir. Dolu başka günde liste kaydırılır;
    // levhanın kalıcı olması kaydırmayı kapatmaz — ikisi ayrı kural.
    return !(isEmpty && !isToday);
}

/**
 * Personel şeridi YALNIZ bugün çizilir — boş olsun ya da olmasın.
 * Şerit "şu an kim işlemde"yi söyler; başka günün başlığı altında yalan olur.
 */
export function staffStripVisible(isToday: boolean): boolean {
    return isToday;
}

// ── Saat rayı ───────────────────────────────────────────────────────────────

export const HOUR_RAIL = ['09', '12', '15', '18', '21'] as const;

/**
 * Boşluğun ölçüsü: beş çizgi, beş rakam. Bir illüstrasyon değil, cetvelin
 * dikey kardeşi.
 *
 * Bugünde "şu an"ın bulunduğu basamak turuncuya döner ve GEÇMİŞ saatlerin
 * çizgisi soluklaşır: ray hem "gün 21'e kadar var" hem "şu an buradayız" der.
 * Başka günlerde hiçbir basamak vurgulanmaz.
 */
export function hourRailRows(isToday: boolean, nowMinutes: number): {
    hour: string;
    now: boolean;
    past: boolean;
}[] {
    return HOUR_RAIL.map((hour) => {
        const at = Number(hour) * 60;
        if (!isToday) return { hour, now: false, past: false };
        const next = at + 3 * 60;
        return {
            hour,
            now: nowMinutes >= at && nowMinutes < next,
            past: nowMinutes >= next,
        };
    });
}

// ── Gün pedalı ──────────────────────────────────────────────────────────────

export interface PedalSection {
    label: string;
    /** Ekran okuyucu cümlesi. */
    spoken: string;
    /** Hedef gün; orta bölme bugünde `null` olur ve dokunulamaz. */
    targetISO: string | null;
    disabled: boolean;
}

export interface DayPedal {
    prev: PedalSection;
    mid: PedalSection;
    next: PedalSection;
}

/**
 * Cetvel tepede, müdürün başparmağı altta. 393 × 852'de ekranın üst 150 pt'si
 * tek elle ulaşılmaz — o yüzden gezinme alt üçte birde durur.
 *
 * Orta bölme bugünde KAYBOLMAZ, kapanır: pedalın üç bölmeli şekli günler
 * arasında sabit kalsın diye.
 */
export function dayPedal(selectedISO: string, todayISO: string): DayPedal {
    const prevISO = addDaysISO(selectedISO, -1);
    const nextISO = addDaysISO(selectedISO, 1);
    const onToday = selectedISO === todayISO;
    const distance = dayDistance(selectedISO, todayISO);
    const ahead = dayPosition(selectedISO, todayISO) === 'future';

    return {
        prev: {
            label: shortDayLabel(prevISO),
            spoken: `Önceki gün, ${longDayLabel(prevISO)}`,
            targetISO: prevISO,
            disabled: false,
        },
        mid: {
            label: onToday ? 'Bugündesiniz' : 'Bugüne dön',
            spoken: onToday
                ? 'Bugündesiniz'
                : `Bugüne dön, ${distance} gün ${ahead ? 'ileri' : 'geri'}`,
            targetISO: onToday ? null : todayISO,
            disabled: onToday,
        },
        next: {
            label: shortDayLabel(nextISO),
            spoken: `Sonraki gün, ${longDayLabel(nextISO)}`,
            targetISO: nextISO,
            disabled: false,
        },
    };
}

// ── Yatay kaydırma jesti ────────────────────────────────────────────────────

/**
 * Jest eşikleri. `react-native-gesture-handler` PROJEDE YOK; jest RN'in kendi
 * `PanResponder`'ıyla kurulur.
 *
 * Eşik yüksek tutuldu: yanılma payı yüksek bir jestin tek çıkış olması kabul
 * edilemezdi — o yüzden pedal var. Jest yalnız hızlandırıcıdır.
 */
export const swipeGesture = {
    /** Jesti yakalama eşiği. */
    claimDx: 12,
    /** Yatay hareket düşeyin en az iki katı olmalı. */
    axisRatio: 2,
    /** Bırakışta gün değiştiren mesafe. */
    commitDx: 48,
    /** …ya da hız. */
    commitVx: 0.3,
    /** Parmağı takip ederken içeriğin gidebileceği en uzak nokta. */
    maxFollow: 40,
} as const;

/** Jest gün değiştirir mi, değiştirirse hangi yöne? */
export function swipeResult(dx: number, vx: number): -1 | 0 | 1 {
    const strong = Math.abs(dx) > swipeGesture.commitDx
        || Math.abs(vx) > swipeGesture.commitVx;
    if (!strong) return 0;
    // Sola çekmek İLERİ gider: sayfa soldan çıkar, sonraki gün girer.
    return dx < 0 ? 1 : -1;
}

/** Jestin yakalanma koşulu — `onMoveShouldSetPanResponder` için. */
export function swipeClaims(dx: number, dy: number): boolean {
    return Math.abs(dx) > swipeGesture.claimDx
        && Math.abs(dx) > swipeGesture.axisRatio * Math.abs(dy);
}

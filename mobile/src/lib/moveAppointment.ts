/**
 * Müdür 07 — randevuyu taşımanın karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * İKİ YOL VAR VE İKİSİ DE GEREKLİ. Sürükleme hızlı yoldur; menü güvenilir
 * yoldur. Biri diğerinin yerine geçmez: sürükleme ıslak parmakla, ayakta,
 * tek elle yapılamaz — menü her koşulda çalışır.
 *
 * İki yol da AYNI hedef çözümleyicisini kullanır; "sürüklerken izin verilen
 * ama menüden yasak" ya da tersi bir durum doğmasın.
 */

import { destructiveOptions } from './appointmentDetail.ts';
import { hhmm, toMinutes, type Appt } from './calendar.ts';
import { COLUMN_GAP, COLUMN_WIDTH, HOUR_HEIGHT, type ColumnStaff } from './managerCalendar.ts';

/** Basılı tutma süresi. Kısa dokunuş detayı açar; ikisi karışmaz. */
export const LONG_PRESS_MS = 250;

/**
 * Sürüklerken saat bu adıma oturur.
 *
 * 5 dakika sürüklemeyi titrek yapardı, 60 dakika salonun gerçek saatlerini
 * (09:40, 10:30, 13:20) ıskalardı. 15 ikisinin arası ve müdürün elle
 * yazdığı saatlerin hepsine denk geliyor.
 */
export const MOVE_SNAP = 15;

/** Kalkan blok %4 büyür; diğerleri geri çekilir. */
export const LIFT_SCALE = 1.04;
export const LIFT_BORDER = 2;
/** Kaldırılmamış bloklar bu saydamlığa iner: ekranda tek bir şey öne çıkar. */
export const DIM_OPACITY = 0.45;
/** Bıraktığı yerde duran kesik çizgili hayalet. */
export const GHOST_OPACITY = 0.4;
export const DRAG_OPACITY = 0.94;

export interface MoveTarget {
    staffId: string;
    staffName: string;
    startMinutes: number;
    endMinutes: number;
    /**
     * Hedef geçerli mi. GEÇERSİZSE BLOK ORAYA YERLEŞMEZ — sessizce üst üste
     * bindirme yok.
     */
    valid: boolean;
    /** Geçersizse sebebi: "Deniz · 13:00–14:30". */
    reason?: string;
    /** Kaynağıyla aynı yer; bırakınca hiçbir şey olmaz. */
    unchanged: boolean;
}

export function durationOf(appointment: Appt): number {
    let duration = toMinutes(appointment.end_time) - toMinutes(appointment.start_time);
    if (duration < 0) duration += 24 * 60;
    return duration;
}

/** Ham dakikayı ızgaraya oturtur ve günün dışına taşmasını engeller. */
export function snapStart(
    rawMinutes: number,
    dayStartMinutes: number,
    dayEndMinutes: number,
    durationMinutes: number,
): number {
    const snapped = Math.round(rawMinutes / MOVE_SNAP) * MOVE_SNAP;
    const latest = dayEndMinutes - durationMinutes;
    return Math.max(dayStartMinutes, Math.min(snapped, Math.max(dayStartMinutes, latest)));
}

/** Yatay kayma kaç sütun ötelediyse. */
export function columnShift(dx: number, columnPitch = COLUMN_WIDTH + COLUMN_GAP): number {
    return Math.round(dx / columnPitch);
}

/**
 * Çakışan randevu. İptal edilmiş randevu yer TUTMAZ; taşınan randevunun
 * kendisi de kendine engel değildir.
 */
export function conflictAt(
    appointments: readonly Appt[],
    staffId: string,
    fromMinutes: number,
    toMinutes_: number,
    excludeId: string,
): Appt | null {
    for (const appointment of appointments) {
        if (appointment.id === excludeId) continue;
        if (appointment.staff_id !== staffId) continue;
        if (appointment.status === 'cancelled') continue;
        if (toMinutes(appointment.start_time) < toMinutes_ && toMinutes(appointment.end_time) > fromMinutes) {
            return appointment;
        }
    }
    return null;
}

/** "Deniz · 13:00–14:30" — doluluğun sebebi. "Dolu" tek başına cevap değil. */
export function conflictReason(blocking: Appt, staffName: string): string {
    return `${staffName} · ${blocking.start_time.slice(0, 5)}–${blocking.end_time.slice(0, 5)}`;
}

/**
 * Sürüklemenin ya da menü seçiminin hedefi.
 *
 * DİKEY taşıma saati, YATAY taşıma personeli değiştirir. İkisi aynı harekette
 * olabilir; bu yüzden tek fonksiyon ikisini birlikte çözüyor.
 */
export function resolveTarget(input: {
    appointment: Appt;
    appointments: readonly Appt[];
    staff: readonly ColumnStaff[];
    /** Bloğun çıktığı sütun. */
    fromIndex: number;
    dx: number;
    dy: number;
    dayStartMinutes: number;
    dayEndMinutes: number;
    hourHeight?: number;
    columnPitch?: number;
}): MoveTarget | null {
    const {
        appointment, appointments, staff, fromIndex, dx, dy,
        dayStartMinutes, dayEndMinutes,
        hourHeight = HOUR_HEIGHT, columnPitch = COLUMN_WIDTH + COLUMN_GAP,
    } = input;

    if (staff.length === 0) return null;

    const index = Math.max(0, Math.min(staff.length - 1, fromIndex + columnShift(dx, columnPitch)));
    const person = staff[index];
    if (!person) return null;

    const duration = durationOf(appointment);
    const raw = toMinutes(appointment.start_time) + (dy * 60) / hourHeight;
    const start = snapStart(raw, dayStartMinutes, dayEndMinutes, duration);
    const end = start + duration;

    const blocking = conflictAt(appointments, person.id, start, end, appointment.id);

    return {
        staffId: person.id,
        staffName: person.name,
        startMinutes: start,
        endMinutes: end,
        valid: blocking === null,
        reason: blocking ? conflictReason(blocking, person.name) : undefined,
        unchanged: blocking === null
            && start === toMinutes(appointment.start_time)
            && person.id === appointment.staff_id,
    };
}

/** "13:30 · Deniz" — hedef slotun üstündeki etiket. */
export function targetLabel(target: MoveTarget): string {
    return `${hhmm(target.startMinutes)} · ${target.staffName}`;
}

/** Kaldırıldı ama henüz kımıldamadı. */
export const MOVE_HINT = 'Parmağınızı kaldırmadan istediğiniz saate veya kişiye taşıyın.';

export type BannerTone = 'neutral' | 'orange' | 'red';

/**
 * Alt bant HER AN ne olacağını yazar. Sürükleme sırasında ekranda değişen
 * tek metin bu; müdür parmağını kaldırmadan sonucu okuyabilmeli.
 */
export function moveBanner(appointment: Appt, target: MoveTarget | null): {
    text: string;
    tone: BannerTone;
} {
    if (!target || target.unchanged) return { text: MOVE_HINT, tone: 'neutral' };
    if (!target.valid) {
        return { text: `Bu saat dolu: ${target.reason}`, tone: 'red' };
    }
    return {
        text: `${appointment.customer_name} · ${appointment.service} → ${targetLabel(target)}. Bırakın, taşıyalım.`,
        tone: 'orange',
    };
}

/** Taşınmış randevunun yeni hâli. Kaynağa yazma işi çağırana ait. */
export function applyMove(appointment: Appt, target: MoveTarget): Appt {
    return {
        ...appointment,
        start_time: hhmm(target.startMinutes),
        end_time: hhmm(target.endMinutes),
        staff_id: target.staffId,
    };
}

// ── Müdür 07c — menüden taşıma ──────────────────────────────────────────────

export type MenuAction = 'time' | 'staff' | 'detail' | 'cancel' | 'delete';

export interface MenuRow {
    action: MenuAction;
    icon: 'clock' | 'swap' | 'note' | 'x' | 'trash';
    title: string;
    /** "Şu an: Selin" — müdürün hafızasına güvenilmiyor. */
    value?: string;
    danger?: boolean;
    /** Üstünde ayraç boşluğu: geri alınamaz olanlar ayrı durur. */
    separated?: boolean;
}

const WEEK_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;

export function weekdayOf(dateISO: string): string {
    const [year, month, day] = dateISO.split('-').map(Number);
    return WEEK_LONG[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
}

/** "Keratin bakımı · 45 dk · Perşembe 12:00 · Selin ile" */
export function menuSubtitle(appointment: Appt, staffName?: string | null): string {
    const parts = [
        appointment.service,
        `${durationOf(appointment)} dk`,
        `${weekdayOf(appointment.date)} ${appointment.start_time.slice(0, 5)}`,
    ];
    if (staffName) parts.push(`${staffName} ile`);
    return parts.join(' · ');
}

/**
 * Kart menüsü — taşıma (07c) ve iptal/silme (10b) TEK menüde.
 *
 * Tasarım ikisini de "kart menüsü" diye tarif ediyor; iki ayrı üç nokta
 * menüsü olamayacağına göre tek liste. Sıra tasarımın kendi kuralı:
 * sık ve zararsız olan üstte, geri alınamaz olan en altta, ayrı ve sessiz.
 */
export function menuRows(appointment: Appt, staffName?: string | null): MenuRow[] {
    const rows: MenuRow[] = [
        { action: 'time', icon: 'clock', title: 'Saati değiştir', value: 'Aynı gün veya başka gün' },
        { action: 'staff', icon: 'swap', title: 'Personeli değiştir', value: `Şu an: ${staffName ?? 'atanmamış'}` },
        { action: 'detail', icon: 'note', title: 'Randevu detayı' },
    ];

    // İptal ve silme metinleri TEK KAYNAKTAN (Müdür 10b). İki yerde iki
    // farklı cümle yazmak, ikisinin zamanla ayrışması demekti.
    let first = true;
    for (const option of destructiveOptions) {
        if (option.action === 'cancel' && appointment.status === 'cancelled') continue;
        rows.push({
            action: option.action,
            icon: option.action === 'cancel' ? 'x' : 'trash',
            // Menüde ÜÇ NOKTA: bu satır işi burada yapmaz, onayın durduğu
            // detay ekranını açar. Noktasız hâli "dokun ve olsun" vaat edip
            // bambaşka bir ekran getiriyordu.
            title: `${option.title}…`,
            value: option.body,
            danger: option.danger,
            separated: first,
        });
        first = false;
    }
    return rows;
}

// ── Müdür 25 · E — taşıma tamamlandı ────────────────────────────────────────

export interface MoveResult {
    appointment: Appt;
    fromStartMinutes: number;
    fromStaffName: string | null;
    toStartMinutes: number;
    toStaffName: string;
}

export interface MoveResultCopy {
    /** "taşındı" ya da "taşındı · geçmiş saate". */
    badge: string;
    /** Geçmiş saate düşmüşse amber: bekleyen şey müdürün kararı. */
    tone: 'ok' | 'warn';
    given: string;
    family: string;
    /** Eski saat — yerinde kalır, üstü çizilir. */
    fromTime: string;
    fromLabel: string;
    /** Yeni saat — soldan kayarak yerine oturur. */
    toTime: string;
    toLabel: string;
    /** Hizmet ve süre; geçmişe düştüyse müdürün NEREDE arayacağı. */
    sub: string;
    undo: string;
    call: string;
    done: string;
}

/** Geri al'ın ömrü. Süre bitince sheet KAPANMAZ, yalnız düğme düşer. */
export const UNDO_MS = 8000;

/**
 * Taşıma ZATEN OLDU. Burada onay istenmiyor.
 *
 * Eski sheet'in tek düğmesi "Evet, yaz"dı ve ne yazacağı belli değildi:
 * uygulamanın müşteriye otomatik mesaj atacak bir kanalı YOK, dolayısıyla
 * bir mesaj vaadi yalan olurdu. Yerine o saniyenin iki gerçek ihtiyacı:
 * yanlışsa GERİ AL, haber verilecekse MÜŞTERİYİ ARA.
 */
export function moveResultCopy(
    result: MoveResult,
    nowMinutes?: number,
    today?: string,
): MoveResultCopy {
    const past = nowMinutes !== undefined && result.toStartMinutes < nowMinutes;
    const sameDay = today !== undefined && result.appointment.date === today;
    const words = result.appointment.customer_name.trim().split(/\s+/).filter(Boolean);

    return {
        badge: past ? 'taşındı · geçmiş saate' : 'taşındı',
        tone: past ? 'warn' : 'ok',
        given: words.length > 1 ? words.slice(0, -1).join(' ') : '',
        family: words.at(-1) ?? '',
        fromTime: hhmm(result.fromStartMinutes),
        fromLabel: result.fromStaffName ?? 'Atanmamış',
        toTime: hhmm(result.toStartMinutes),
        toLabel: result.toStaffName,
        sub: past
            ? 'Bu saat geçti. Randevu geçmişte görünecek.'
            : [
                result.appointment.service,
                `${durationOf(result.appointment)} dk`,
                sameDay ? 'bugün' : null,
            ].filter(Boolean).join(' · '),
        undo: 'Geri al',
        call: 'Müşteriyi ara',
        done: 'Tamam',
    };
}

/** Taşımayı geri alır — randevu eski saatine ve eski personeline döner. */
export function undoMove(result: MoveResult): Appt {
    return {
        ...result.appointment,
        start_time: `${hhmm(result.fromStartMinutes)}:00`,
        end_time: `${hhmm(result.fromStartMinutes + durationOf(result.appointment))}:00`,
    };
}

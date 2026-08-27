/**
 * Müdür 24 — Personel günü karar katmanı. Saf, React'siz.
 *
 * Node testleri bu dosyayı doğrudan içe aktarır: Expo ya da react-native
 * bağımlılığı TAŞIMAZ.
 *
 * Ekran tek bir soruya cevap veriyor:
 * "Bu personel şu an ne yapıyor, ona iş verebilir miyim?"
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 24 Personel Gunu.html`.
 */

import { addDaysISO, formatDayFull, todayISO, toMinutes, type Appt } from './calendar.ts';
import { splitStaffName } from './text.ts';
import type { StaffPresence, StaffState } from './managerFlow.ts';

export { splitStaffName };

export type StaffStateKind = 'running' | 'free' | 'empty' | 'leave' | 'off' | 'ended';

export interface StaffHeroPanel {
    label: string;
    hasPulse: boolean;
    heroValue: string;
    heroUnit?: string;
    /**
     * Sayacın altındaki bağlam satırı. `null` "bilinmiyor" demek ve satır
     * HİÇ çizilmez — uydurma müşteri adı yazmaktansa satır olmaz.
     */
    subText: string | null;
}

export interface StaffShiftBar {
    head: string;
    right: string;
    dash: boolean;
    nowPct: number;
    foot: string;
}

/**
 * Eylemin NE YAPTIĞI etiketten değil bu alandan okunur. Etikete bakarak
 * dallanmak "Randevu ver" ile "Yarına randevu ver"i ayıramaz — ikincisi
 * sessizce ölü kalır.
 */
export type StaffActionCode =
    | 'book-today'
    | 'book-tomorrow'
    | 'call'
    | 'free-staff';

export interface StaffActionItem {
    label: string;
    kind: 'plus' | 'phone' | 'shift';
    filled: boolean;
    action: StaffActionCode;
}

export interface StaffGhostItem {
    label: string;
    kind: 'phone' | 'ghost';
    action: StaffActionCode;
}

export interface StaffDayState {
    kind: StaffStateKind;
    id: string;
    name: string;
    given: string;
    family: string;
    role: string;
    initials: string;
    stampText: string;
    stampTone: 'run' | 'free' | 'am' | 'non';
    badgeText: string | null;
    panel: StaffHeroPanel | null;
    shift: StaffShiftBar | null;
    emptyNote: string | null;
    listTitle: string | null;
    runningAppointment: Appt | null;
    upcomingAppointments: Appt[];
    pastAppointments: Appt[];
    showNowLine: boolean;
    nowLineTime: string;
    isDayEnded: boolean;
    primaryAction: StaffActionItem | null;
    secondaryAction: StaffActionItem | null;
    ghostAction: StaffGhostItem | null;
}


/** Salondaki toplam aktif işlem sayısını hesaplar */
export function activeCountOf(presence: readonly { state: StaffState }[]): number {
    return presence.filter((p) => p.state === 'busy').length;
}

/** Geçen süreyi mm:ss formatında döndürür (ör. "41:00") */
export function formatElapsed(seconds: number): string {
    const totalSecs = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/** Boş süreyi "2sa 6dk" veya "45dk" formatında parçalar */
export function formatFreeDuration(minutes: number): { value: string; unit: string } {
    const totalMins = Math.max(0, Math.floor(minutes));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (hours > 0) {
        return {
            value: String(hours),
            unit: mins > 0 ? `sa ${mins}dk` : 'sa',
        };
    }
    return {
        value: String(mins),
        unit: 'dk',
    };
}

/** Vardiya yüzdesini (0-100) hesaplar */
export function shiftPercentage(
    nowMinutes: number,
    startMinutes: number = 9 * 60,
    endMinutes: number = 19 * 60,
): number {
    if (nowMinutes <= startMinutes) return 0;
    if (nowMinutes >= endMinutes) return 100;
    return Math.round(((nowMinutes - startMinutes) / (endMinutes - startMinutes)) * 100);
}

/** Personelin gün durumunu (H1–H6) tespit eder */
export function resolveStaffStateKind(
    person: StaffPresence,
    appointments: readonly Appt[],
    nowMinutes: number,
): StaffStateKind {
    if (person.state === 'leave') return 'leave';
    if (person.state === 'off') return 'off';

    const activeList = appointments.filter((a) => a.status !== 'cancelled');

    // Sürmekte olan işlem varsa -> H1
    if (person.state === 'busy') return 'running';

    // Eğer randevu yoksa -> H3
    if (activeList.length === 0 && appointments.length === 0) return 'empty';

    /*
     * Bekleyen = iptal/tamamlanmış olmayan VE saati henüz geçmemiş randevu.
     * Gelmeyen bir randevu sonsuza dek "bekliyor" kalmaz; saati geçtiyse gün
     * onun için de kapanmıştır (H6).
     */
    const pending = appointments.filter(
        (a) => a.status !== 'cancelled'
            && a.status !== 'completed'
            && !a.service_ended_at
            && toMinutes(a.end_time) > nowMinutes,
    );
    if (pending.length === 0 && appointments.length > 0) {
        return 'ended';
    }

    // Aksi halde boşta ama randevuları var -> H2
    return 'free';
}

/**
 * Gelmedi mi?
 *
 * "Gelmedi" bir DURUM DEĞİL, bir TÜRETİMDİR — veri modelinde böyle bir değer
 * yok ve bilerek yok (`src/lib/appointmentFlow.ts`). Müdür beyan etmez; saat
 * geçince kendiliğinden görünür ve müşteri geç gelirse kendini düzeltir.
 *
 * Kural web ile BİREBİR aynı olmalı, yoksa aynı müşteri masaüstünde "geldi",
 * cepte "gelmedi" görünür: randevu saati + geç-kalma toleransı (varsayılan
 * 120 dk, salon ayarından değişir).
 */
export const DEFAULT_ARRIVAL_TOLERANCE_MIN = 120;

export function isNoShow(
    appointment: Appt,
    nowMinutes: number,
    toleranceMin: number = DEFAULT_ARRIVAL_TOLERANCE_MIN,
): boolean {
    if (appointment.status === 'cancelled' || appointment.status === 'completed') return false;
    // Onay bekleyen randevu gelmemiş sayılmaz: henüz kurulmuş bile değil.
    if (appointment.status === 'pending') return false;
    // İşlem başladıysa ya da bitti ise gelmiş demektir.
    if (appointment.service_ended_at || appointment.arrived_at) return false;
    // MÜŞTERİ SALONA GELDİYSE gelmemiş sayılmaz — hizmet henüz başlamamış
    // olabilir. Bu kontrol olmadan koltukta oturan müşteri "gelmedi" damgası
    // yiyordu.
    if (appointment.customer_arrived_at) return false;
    return nowMinutes > toMinutes(appointment.start_time) + toleranceMin;
}

/**
 * İzinli personelin DÖNÜŞ TARİHİ.
 *
 * Veritabanında "izin bitişi" diye bir kolon yok ve olmayacak:
 * `staff_time_off` izni gün gün tutuyor (`UNIQUE(staff_id, date)`). Dönüş
 * tarihi bu yüzden bir veri değil, bir ÇIKARIM — bugünden başlayan kesintisiz
 * izin dizisinin bittiği yerin ertesi günü.
 *
 * `null` döndüğü üç hâl var ve üçü de dürüst: liste hiç bilinmiyor, bugün
 * listede yok, ya da dizi bilinen ufkun sonuna kadar sürüyor (o zaman dönüş
 * tarihi gerçekten bilinmiyor — son günü "dönüş" diye yazmak yalan olurdu).
 */
export function returnDateISO(
    leaveDates: readonly string[] | undefined,
    todayISO: string,
): string | null {
    if (!leaveDates || leaveDates.length === 0) return null;
    const off = new Set(leaveDates);
    if (!off.has(todayISO)) return null;

    // Bugünden ileri doğru yürü; ilk izinsiz gün dönüş günüdür.
    let cursor = todayISO;
    // Ufuk: bilinen en son izin günü. Onun ötesini "izin değil" sayamayız,
    // çünkü liste oraya kadar okunmuş olabilir.
    const horizon = [...off].sort().at(-1) as string;
    while (off.has(cursor)) {
        if (cursor > horizon) return null;
        cursor = addDaysISO(cursor, 1);
    }
    return cursor;
}

/** "Dönüş: Cuma 29 Ağustos" — tarih bilinmiyorsa cümle hiç kurulmaz. */
export function returnLine(
    leaveDates: readonly string[] | undefined,
    todayISO: string,
): string | null {
    const back = returnDateISO(leaveDates, todayISO);
    return back ? `Dönüş: ${formatDayFull(back)}` : null;
}

/**
 * "Ara" düğmesi. Numara YOKSA düğme hiç çizilmez — uydurma bir numarayı
 * çevirmek ölü düğmeden de kötüdür.
 */
function callAction(person: StaffPresence, filled = false): StaffActionItem | null {
    if (!person.phone) return null;
    return { label: 'Ara', kind: 'phone', filled, action: 'call' };
}

/**
 * Personel günü için tüm UI karar modelini üretir.
 */
export function buildStaffDayState(
    person: StaffPresence,
    appointments: readonly Appt[],
    allPresence: readonly StaffPresence[],
    nowMinutes: number,
    elapsedSeconds: number = 0,
    role: string = 'Kuaför',
    /** Bakılan gün — izin dönüşü bundan hesaplanır. */
    dayISO: string = todayISO(),
): StaffDayState {
    const { given, family } = splitStaffName(person.name);
    const kind = resolveStaffStateKind(person, appointments, nowMinutes);
    const pct = shiftPercentage(nowMinutes);

    // Canlıdaki randevuyu bul
    const liveAppt = appointments.find(
        (a) => a.status !== 'cancelled' && Boolean(a.arrived_at) && !a.service_ended_at,
    ) ?? null;

    // Kalan randevular (canlı olan listeden ÇIKARILIR)
    const otherAppts = appointments.filter((a) => a.id !== liveAppt?.id);

    // Geçmiş vs Gelecek ayrımı
    const pastAppts = otherAppts.filter((a) => {
        if (a.status === 'cancelled' || a.status === 'completed' || a.service_ended_at) return true;
        return toMinutes(a.start_time) < nowMinutes;
    });

    const upcomingAppts = otherAppts.filter((a) => {
        if (a.status === 'cancelled' || a.status === 'completed' || a.service_ended_at) return false;
        return toMinutes(a.start_time) >= nowMinutes;
    });

    const activeTotalCount = activeCountOf(allPresence);

    // ── H1 · İŞLEMDE ────────────────────────────────────────────────────────
    if (kind === 'running') {
        const minutes = person.minutes ?? (liveAppt ? Math.floor(elapsedSeconds / 60) : 0);
        /*
         * Şerit "işlemde" diyor ama eşleşen randevu yüklenmemiş olabilir.
         * O durumda müşteri/hizmet/bitiş UYDURULMAZ: sayaç gerçek, satır boş.
         */
        const subText = liveAppt
            ? `${liveAppt.customer_name} · ${liveAppt.service} · ${liveAppt.end_time.slice(0, 5)}’te biter`
            : null;

        return {
            kind: 'running',
            id: person.id,
            name: person.name,
            given,
            family,
            role,
            initials: person.initials,
            stampText: 'İŞLEMDE',
            stampTone: 'run',
            badgeText: `${minutes} dk`,
            panel: {
                label: 'SÜRÜYOR',
                hasPulse: true,
                heroValue: formatElapsed(elapsedSeconds > 0 ? elapsedSeconds : minutes * 60),
                subText,
            },
            shift: null,
            emptyNote: null,
            listTitle: `Sıradaki · ${upcomingAppts.length} randevu`,
            runningAppointment: liveAppt,
            upcomingAppointments: upcomingAppts,
            pastAppointments: pastAppts,
            showNowLine: false,
            nowLineTime: '',
            isDayEnded: false,
            primaryAction: { label: 'Randevu ver', kind: 'plus', filled: true, action: 'book-today' },
            secondaryAction: callAction(person),
            ghostAction: null,
        };
    }

    // ── H2 · MÜSAİT ─────────────────────────────────────────────────────────
    if (kind === 'free') {
        const nextAppt = upcomingAppts[0] ?? null;
        let freeMinutes = 0;
        let subText = 'Gün sonuna kadar';

        if (nextAppt) {
            const nextStartMin = toMinutes(nextAppt.start_time);
            freeMinutes = Math.max(0, nextStartMin - nowMinutes);
            subText = `${nextAppt.start_time.slice(0, 5)}’a kadar · sıradaki ${nextAppt.customer_name}`;
        } else {
            freeMinutes = Math.max(0, 19 * 60 - nowMinutes);
        }

        const freeDur = formatFreeDuration(freeMinutes);
        const showNow = pastAppts.length > 0 && upcomingAppts.length > 0;

        const hh = String(Math.floor(nowMinutes / 60)).padStart(2, '0');
        const mm = String(nowMinutes % 60).padStart(2, '0');

        return {
            kind: 'free',
            id: person.id,
            name: person.name,
            given,
            family,
            role,
            initials: person.initials,
            stampText: 'MÜSAİT',
            stampTone: 'free',
            badgeText: null,
            panel: {
                label: 'ŞU AN BOŞ',
                hasPulse: false,
                heroValue: freeDur.value,
                heroUnit: freeDur.unit,
                subText,
            },
            shift: null,
            emptyNote: null,
            listTitle: `Bugün · ${appointments.length} randevu`,
            runningAppointment: null,
            upcomingAppointments: upcomingAppts,
            pastAppointments: pastAppts,
            showNowLine: showNow,
            nowLineTime: `${hh}:${mm}`,
            isDayEnded: false,
            primaryAction: { label: 'Randevu ver', kind: 'plus', filled: true, action: 'book-today' },
            secondaryAction: callAction(person),
            ghostAction: null,
        };
    }

    // ── H3 · MÜSAİT (BUGÜN RANDEVU YOK) ─────────────────────────────────────
    if (kind === 'empty') {
        return {
            kind: 'empty',
            id: person.id,
            name: person.name,
            given,
            family,
            role,
            initials: person.initials,
            stampText: 'MÜSAİT',
            stampTone: 'free',
            badgeText: null,
            panel: {
                label: 'BUGÜN',
                hasPulse: false,
                heroValue: '0',
                heroUnit: 'randevu',
                subText: 'vardiya 09:00 – 19:00 · 8 saat boş',
            },
            shift: {
                head: 'Vardiya',
                right: '09:00 – 19:00',
                dash: false,
                nowPct: pct,
                foot: 'Gün başladı, hâlâ boş.',
            },
            emptyNote: `Salonda şu an ${activeTotalCount} işlem sürüyor. ${given} bugün hiç randevu almadı.`,
            listTitle: null,
            runningAppointment: null,
            upcomingAppointments: [],
            pastAppointments: [],
            showNowLine: false,
            nowLineTime: '',
            isDayEnded: false,
            primaryAction: { label: 'Randevu ver', kind: 'plus', filled: true, action: 'book-today' },
            secondaryAction: callAction(person),
            ghostAction: null,
        };
    }

    // ── H4 · İZİNLİ ─────────────────────────────────────────────────────────
    if (kind === 'leave') {
        return {
            kind: 'leave',
            id: person.id,
            name: person.name,
            given,
            family,
            role,
            initials: person.initials,
            stampText: 'İZİNLİ',
            stampTone: 'am',
            badgeText: null,
            panel: null, // Krem kart YOK
            shift: {
                head: 'Vardiya',
                right: 'bugün yok',
                dash: true,
                nowPct: pct,
                /*
                 * Dönüş tarihi ardışık izin günlerinden TÜRETİLİR; veritabanında
                 * "izin bitişi" kolonu yok. Türetilemiyorsa cümle uydurulmaz,
                 * eksiğin ne olduğu yazılır.
                 */
                foot: returnLine(person.leaveDates, dayISO)
                    ?? 'Dönüş tarihi için izin kaydı gerekiyor.',
            },
            emptyNote: `${given} bugün salonda değil. Bugün randevu yazılamaz; bekleyen müşterileri başka personele verilebilir.`,
            listTitle: null,
            runningAppointment: null,
            upcomingAppointments: [],
            pastAppointments: [],
            showNowLine: false,
            nowLineTime: '',
            isDayEnded: false,
            primaryAction: callAction(person, true),
            secondaryAction: null,
            ghostAction: { label: 'Müsait personeli gör', kind: 'ghost', action: 'free-staff' },
        };
    }

    // ── H5 · BUGÜN ÇALIŞMIYOR ───────────────────────────────────────────────
    if (kind === 'off') {
        return {
            kind: 'off',
            id: person.id,
            name: person.name,
            given,
            family,
            role,
            initials: person.initials,
            stampText: 'BUGÜN ÇALIŞMIYOR',
            stampTone: 'non', // Gri damga
            badgeText: null,
            panel: null, // Krem kart YOK
            shift: {
                head: 'Vardiya',
                right: 'planda yok',
                dash: true,
                nowPct: pct,
                foot: 'Sıradaki vardiyası haftalık planda.',
            },
            emptyNote: `Vardiya planında bugün yok. Salonda eksik yok — ${given}’ın günü zaten kapalı.`,
            listTitle: null,
            runningAppointment: null,
            upcomingAppointments: [],
            pastAppointments: [],
            showNowLine: false,
            nowLineTime: '',
            isDayEnded: false,
            // Hedef "Vardiya planı" ekranı yoksa ölü buton çizilmez; Ara birincil olur
            primaryAction: callAction(person),
            secondaryAction: null,
            ghostAction: null,
        };
    }

    // ── H6 · GÜN BİTTİ ──────────────────────────────────────────────────────
    const completedCount = appointments.filter(
        (a) => a.status === 'completed' || Boolean(a.service_ended_at),
    ).length;
    /*
     * "Gelmedi" iptal DEĞİLDİR: iptali müdür yazar, gelmemeyi müşteri yapar.
     * Gelmeyen = iptal edilmemiş, tamamlanmamış ve hiç başlamamış (arrived_at
     * yok) geçmiş randevu.
     */
    const noshowCount = appointments.filter((a) => isNoShow(a, nowMinutes)).length;

    return {
        kind: 'ended',
        id: person.id,
        name: person.name,
        given,
        family,
        role,
        initials: person.initials,
        stampText: 'GÜNÜN SONU',
        stampTone: 'non',
        badgeText: null,
        panel: {
            label: 'BUGÜN',
            hasPulse: false,
            heroValue: String(appointments.length),
            heroUnit: 'randevu',
            subText: `${completedCount} tamamlandı · ${noshowCount} gelmedi`,
        },
        shift: null,
        emptyNote: null,
        listTitle: 'Bugün · kapandı',
        runningAppointment: null,
        upcomingAppointments: [],
        pastAppointments: [...appointments],
        showNowLine: false,
        nowLineTime: '',
        isDayEnded: true,
        primaryAction: { label: 'Yarına randevu ver', kind: 'plus', filled: true, action: 'book-tomorrow' },
        secondaryAction: callAction(person),
        ghostAction: null,
    };
}

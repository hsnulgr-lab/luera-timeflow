/**
 * Personel · Takvim — SALONUN gününün veri kaynağı.
 *
 * ── Neden `agendaSource`'un yanında ayrı bir dosya ───────────────────────────
 * İki ekran iki ayrı sunucu ucundan besleniyor ve bu bilerek böyle:
 * `agenda` personelin KENDİ günü (üstünde işlem yapılan veri, telefon ve not
 * dâhil), `calendar` ise salonun günü — dar kolonlu, salt okunur, yazma
 * uçlarına girdi olamaz. Aynı ucu iki işe koşmak, "kendi randevusu" kuralının
 * bir gün yanlışlıkla gevşetilmesi demekti.
 *
 * ── Neden `calendarSource.source` kullanılmıyor ──────────────────────────────
 * O kaynak MÜDÜR ekranlarıyla ortak (`mudur/calendar`, `randevu/[id]`,
 * `CreateFlow`, `MoveParts`). Onu canlıya çevirmek müdürü `staff-api`'ye
 * sokardı — oysa müdürün personel token'ı YOK, o uç ona 401 döner. Paylaşılan
 * kaynak sahte kalıyor; personelin takvimi kendi yolundan geçiyor.
 *
 * ── Hâller `agendaSource` ile AYNI ──────────────────────────────────────────
 * loading / ok / error, sessiz yoklama, öne dönüş, sekmeye dönüş. İki ekranın
 * ayrı davranması, aynı arızayı iki kez öğrenmek demekti.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api } from '../api/staff';
import { clockText, type Appt } from './calendar.ts';
import { isStale, POLL_MS } from './freshness.ts';
import { useLiveSignal } from './liveSignal';
import { type ColumnStaff } from './managerCalendar.ts';
import { mockDay } from './managerFlow.ts';
import { mockSource } from './calendarSource.ts';
import { initialsOf } from './text.ts';

export type SalonDayState = 'loading' | 'ok' | 'error';

export interface SalonDaySnapshot {
    state: SalonDayState;
    rows: Appt[];
    /** Sütun başlıkları. Canlıda salonun aktif kadrosu, sahtede `mockDay`. */
    crew: ColumnStaff[];
    /** KENDİ randevularının id'leri — dokunulunca kumanda açılanlar. */
    mine: ReadonlySet<string>;
    /**
     * Şeridin gün sayıları. Canlıda YALNIZ okunan gün sayı taşıyor: sunucuda
     * aralık ucu yok ve uydurma sayı çizmek düpedüz yalan olurdu. Eksik gün
     * "bilinmiyor" diye çiziliyor, sıfır diye değil.
     */
    counts: Record<string, number>;
    /** Son BAŞARILI okumanın anı. */
    at: number | null;
    /**
     * Liste bayatladı mı?
     *
     * Karar EKRANDA değil burada: `Date.now()` çizim sırasında çağrılamıyor
     * (react-hooks/purity) ve ızgara ekranının sayan bir saati yok. Saat
     * burada dönüyor, ekran yalnız sonucu okuyor.
     *
     * Sayaç `setStale`i aynı değerle çağırdığında React yeniden çizmiyor:
     * yani otuz saniyede bir tetiklenen bu iş, ancak bayatlık GERÇEKTEN
     * değiştiğinde ızgaraya dokunuyor.
     */
    stale: boolean;
    /**
     * Görünür yeniden okuma. Söz DÖNÜYOR, çünkü aşağı-çekip-yenileme
     * kaydırıcıyı okuma bitene kadar tutmak zorunda: `attempt` sayacı üzerinden
     * dolaylı tetiklenen bir okumada o anı yakalamanın yolu yok.
     */
    reload: () => Promise<void>;
}

interface DayRead {
    rows: Appt[];
    crew: ColumnStaff[];
    mine: Set<string>;
    counts: Record<string, number>;
}

/** Sunucudan gelen dar satırı ekranın beklediği şekle tamamlar. */
function toAppt(row: Record<string, unknown>): Appt {
    return {
        id: String(row.id),
        // Sunucu bunları BİLEREK göndermiyor: telefon, ayrılan personelin
        // cebinde götürebileceği en değerli şey; not ise takvim verisi değil.
        // `null` burada "yok" değil "bu ekranda görünmüyor" demek.
        customer_id: null,
        customer_name: String(row.customer_name ?? ''),
        customer_phone: null,
        notes: null,
        date: String(row.date),
        start_time: clockText(String(row.start_time)),
        end_time: clockText(String(row.end_time)),
        service: String(row.service ?? ''),
        service_color: (row.service_color as string | null) ?? null,
        status: row.status as Appt['status'],
        staff_id: (row.staff_id as string | null) ?? null,
        arrived_at: (row.arrived_at as string | null) ?? null,
        service_ended_at: (row.service_ended_at as string | null) ?? null,
        info: null,
    };
}

export async function fetchSalonDay(dateISO: string): Promise<DayRead> {
    if (!LIVE_AUTH) {
        const rows = await mockSource.day(dateISO);
        const days = await mockSource.range(dateISO, dateISO);
        return {
            rows,
            crew: mockDay.presence.map((person) => ({
                id: person.id, initials: person.initials, name: person.name,
            })),
            // Sahte kipte "ben" sabit: oturum yok, seçilecek bir kimlik de yok.
            mine: new Set(rows.filter((r) => r.staff_id === MOCK_ME).map((r) => r.id)),
            counts: days,
        };
    }

    const data = await api.calendar(dateISO) as {
        appointments?: Record<string, unknown>[];
        staff?: { id: string; name: string; color?: string | null }[];
    };
    const rows = (data.appointments ?? []).map(toAppt);
    return {
        rows,
        crew: (data.staff ?? []).map((person) => ({
            id: String(person.id),
            name: String(person.name),
            initials: initialsOf(String(person.name)),
            color: person.color ?? undefined,
        })),
        // `mine` SUNUCUDAN geliyor. Ekranda sabit bir 'merve' duruyordu:
        // canlıda herkesin takvimi "hepsi benim" ya da "hiçbiri benim değil"
        // diye okunurdu ve kendi randevusuna dokunmak kumandayı açmazdı.
        mine: new Set(
            (data.appointments ?? [])
                .filter((row) => row.mine === true)
                .map((row) => String(row.id)),
        ),
        counts: { [dateISO]: rows.length },
    };
}

/** Sahte kipteki "ben". Canlıda yerini sunucunun `mine` bayrağı alıyor. */
const MOCK_ME = 'merve';

/**
 * Bayatlık saatinin adımı. Eşikten (120 sn) küçük olması yeter: satırın
 * gecikmesi en fazla bir adım kadar olur.
 */
const STALE_TICK_MS = 30_000;

/**
 * Bu ekranı ilgilendiren tablolar (101). `calendar` ucu YALNIZ bu ikisini
 * okuyor: günün randevuları ve aktif kadro. Bir hizmetin fiyatı değişince
 * salon takvimini tazelemek boşuna istek olurdu.
 */
const LIVE_TABLES = ['reservations', 'staff'] as const;

export function useSalonDay(dateISO: string): SalonDaySnapshot {
    const [state, setState] = useState<SalonDayState>('loading');
    const [day, setDay] = useState<DayRead>(() => ({
        rows: [], crew: [], mine: new Set(), counts: {},
    }));
    const [at, setAt] = useState<number | null>(null);
    const [stale, setStale] = useState(false);
    /** Sayaç `at`i okuyor ama ona BAĞLANMIYOR: her okumada yeniden kurulmasın. */
    const atRef = useRef<number | null>(null);
    /** Geç dönen bir cevap, sonra seçilen günün listesini EZMESİN. */
    const wanted = useRef(dateISO);

    /** Tek okuma yolu, iki ses tonu — bkz. `agendaSource.useAgenda`. */
    const read = useCallback((visible: boolean) => {
        const target = dateISO;
        wanted.current = target;
        return fetchSalonDay(target)
            .then((next) => {
                if (wanted.current !== target) return;
                setDay((current) => ({
                    ...next,
                    // Sayılar BİRİKİYOR: şeritte gezinirken görülen her gün
                    // kendi sayısını bırakıyor. Tek günlük haritayı ezmek,
                    // az önce okunan günü şeritte "bilinmiyor"a düşürürdü.
                    counts: { ...current.counts, ...next.counts },
                }));
                const now = Date.now();
                atRef.current = now;
                setAt(now);
                setStale(false);
                setState('ok');
            })
            .catch(() => {
                if (wanted.current !== target) return;
                // ELDEKİ gün DURUYOR. Sessiz yoklamanın hatası yutuluyor:
                // çalışan bir ekranı bozmak, bayat göstermekten kötü.
                if (visible) setState('error');
            });
    }, [dateISO]);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const id = setInterval(() => {
            if (AppState.currentState !== 'active') return;
            void read(false);
        }, POLL_MS);
        return () => clearInterval(id);
    }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    /*
     * CANLI ZİL (101) — yoklamanın yerine değil, ÜSTÜNE.
     *
     * Meslektaşının randevusu masaüstünden değişince personel bunu 25
     * saniye beklemeden görüyor. Sessiz tur: çalışan bir takvimi
     * "yükleniyor"a düşürmek zili gürültüye çevirirdi.
     */
    useLiveSignal(useCallback(() => { void read(false); }, [read]), true, LIVE_TABLES);

    /** Bayatlık saati. Bkz. `SalonDaySnapshot.stale`. */
    useEffect(() => {
        const id = setInterval(() => {
            setStale(isStale(atRef.current, Date.now()));
        }, STALE_TICK_MS);
        return () => clearInterval(id);
    }, []);

    // Olay işleyicisi — efekt değil; buradaki senkron `setState` bedelsiz.
    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, ...day, at, stale, reload };
}

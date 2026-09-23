import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api, type Appointment } from '../api/staff';
import { demoAgenda, demoAgendaFor, type DemoAppointment } from './staffDemo.ts';
import { clockText } from './calendar.ts';
import { POLL_MS } from './freshness.ts';
import { useLiveSignal } from './liveSignal';
import { AGENDA_CACHE_KEY, cachePayload, parseCache } from './agendaCache.ts';
// Bayatlık kararı saf bir yaprakta: burası React'e ve api katmanına bağlı
// olduğu için testten çağrılamıyor, orası çağrılabiliyor.
export { isStale, POLL_MS, STALE_AFTER_MS } from './freshness.ts';

/**
 * Personel 01 — "Bugün" ekranının veri kaynağı.
 *
 * ── Neden var ────────────────────────────────────────────────────────────────
 * Ekran `demoAgenda`yı doğrudan çağırıyordu ve bu SENKRONDU: veri her zaman
 * anında, her zaman doğru, hiç hata vermeden geliyordu. Gerçek sunucu öyle
 * davranmıyor ve ekranın "yükleniyor" ile "hata" diye bir hâli yoktu —
 * bağlandığı gün okunamayan bir gün, RANDEVUSUZ bir gün gibi görünecekti.
 * O yanlış, personelin gününü kapatmasına yol açar.
 *
 * ── DÖRT hâl AYRI ───────────────────────────────────────────────────────────
 *   loading  henüz bilmiyoruz
 *   error    okuyamadık ve elde kopya da yok — "randevu yok" DEĞİL
 *   cached   sunucuya ulaşamadık, DİSKTEKİ kopyayı çiziyoruz
 *   ok       okuduk; liste boş olabilir ve o zaman gerçekten boştur
 *
 * `cached` ile `ok` bilerek ayrı. Diskten gelen listeyi "okuduk" diye
 * göstermek, iptal edilmiş bir randevuyu duruyor gibi göstermek demek —
 * ekran bunun canlı olmadığını ve NE ZAMAN okunduğunu söylemek zorunda.
 *
 * ── Anahtar ─────────────────────────────────────────────────────────────────
 * `EXPO_PUBLIC_AUTH_MODE=live` verilmeden sahte kaynak sürüyor. Böylece
 * geliştirme akışı bozulmuyor ve canlıya geçiş TEK bir değişkenle geri
 * alınabiliyor.
 */

/** Ekranın bir randevudan istediği alanlar. Sahte ve gerçek kaynak ikisi de bunu karşılıyor. */
export type AgendaRow = DemoAppointment;

export type AgendaState = 'loading' | 'ok' | 'cached' | 'error';

export interface AgendaSnapshot {
    state: AgendaState;
    rows: AgendaRow[];
    /**
     * Son BAŞARILI okumanın anı. Ekranda "son güncelleme HH:MM" olarak
     * gösterilecek: bayat veriye bakıp karar vermek, hiç veri görmemekten
     * tehlikeli.
     *
     * `cached` hâlinde bu DİSKTEKİ kaydın damgası — yani listenin gerçekten
     * ne zaman doğru olduğu. Şimdiyi yazmak, kopyayı taze göstermek olurdu.
     */
    at: number | null;
    /** Aynı günü yeniden okur — aşağı çekip yenileme ve "tekrar dene" için. */
    reload: () => void;
}

/** Sunucudan gelen randevuyu ekranın beklediği şekle indirger. */
function toRow(appointment: Appointment): AgendaRow {
    return {
        id: appointment.id,
        customer_id: appointment.customer_id,
        customer_name: appointment.customer_name,
        customer_phone: appointment.customer_phone,
        service: appointment.service,
        notes: appointment.notes,
        date: appointment.date,
        // Sunucu "13:00:00" gönderiyor, ekran "13:00" bekliyor. Sınırda
        // indirgeniyor ki aşağıdaki hiçbir bileşen iki biçim bilmek zorunda
        // kalmasın.
        start_time: clockText(appointment.start_time),
        end_time: clockText(appointment.end_time),
        status: appointment.status,
        customer_arrived_at: appointment.customer_arrived_at ?? null,
        arrived_at: appointment.arrived_at,
        service_ended_at: appointment.service_ended_at,
        adisyon_items: appointment.adisyon_items,
        is_paid: appointment.is_paid,
    };
}

/**
 * Günün randevuları.
 *
 * Sahte kaynakta `nowMs` gerekiyor (saatler "şimdi"ye göre üretiliyor);
 * gerçek kaynakta hiç kullanılmıyor. Parametrenin varlığı geçici.
 */
export async function fetchAgenda(
    dateISO: string,
    todayISO: string,
    nowMs: number,
): Promise<AgendaRow[]> {
    if (!LIVE_AUTH) {
        return dateISO === todayISO ? demoAgenda(nowMs, dateISO) : demoAgendaFor(dateISO, todayISO);
    }
    const data = await api.agenda(dateISO) as { appointments?: Appointment[] };
    return (data.appointments ?? []).map(toRow);
}

/**
 * Personelin kendi günü YALNIZ `reservations`'tan geliyor — `agenda` ucu
 * başka tabloya bakmıyor (ad ve hizmet satırın üstünde duruyor). Hizmet
 * fiyatı ya da kadro değişince bu listeyi tazelemek boşuna istekti.
 */
const LIVE_TABLES = ['reservations'] as const;

export function useAgenda(dateISO: string, todayISO: string): AgendaSnapshot {
    const [state, setState] = useState<AgendaState>('loading');
    const [rows, setRows] = useState<AgendaRow[]>([]);
    const [at, setAt] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0);
    /** Geç dönen bir cevap, sonra seçilen günün listesini EZMESİN. */
    const wanted = useRef(dateISO);

    /**
     * Tek okuma yolu, iki ses tonu.
     *
     * `visible` okumalar kullanıcının istediği okumalar: açılış ve "tekrar
     * dene". Başarısızlıkları GÖRÜNÜR, çünkü kullanıcı bir cevap bekliyor.
     *
     * `visible` OLMAYAN okumalar arka planda dönen yoklama. Başarısızlıkları
     * YUTULUYOR: elde bayat ama doğru bir liste varken onu "okuyamadık"
     * ekranıyla değiştirmek, çalışan bir ekranı bozmak olurdu. Zaten bayatlık
     * kendini "son güncelleme" satırında söylüyor — bir yoklama turu sessizce
     * kaçtığında görünen şey tam olarak o satır.
     */
    const read = useCallback((visible: boolean) => {
        const target = dateISO;
        wanted.current = target;
        // Zincir BİLEREK `async/await` değil. `await`li bir sürümde derleyici
        // ilk okumayı "efektin içinde senkron setState" sayıp reddediyor
        // (react-hooks/set-state-in-effect); `.then` içindeki aynı yazma
        // kurala uygun, çünkü gerçekten de bir geri çağırmada oluyor.
        return fetchAgenda(target, todayISO, Date.now())
            .then((next) => {
                if (wanted.current !== target) return;
                const now = Date.now();
                setRows(next);
                setAt(now);
                setState('ok');
                // Disk kopyası HER başarılı okumada tazeleniyor. Yazma
                // başarısızlığı yutuluyor: önbellek bir kolaylık, ekranın
                // çalışması ona bağlı değil.
                const body = cachePayload(target, todayISO, now, next);
                if (body) void AsyncStorage.setItem(AGENDA_CACHE_KEY, body).catch(() => undefined);
            })
            .catch(() => {
                if (wanted.current !== target) return;
                // ELDEKİ liste her hâlde DURUYOR: okunamayan bir gün, boş bir
                // gün değildir.
                if (!visible) return;
                /*
                 * Sunucuya ulaşamadık. Diskte BU GÜNE ait bir kopya varsa onu
                 * çiziyoruz — ama `ok` demeden.
                 *
                 * Kopya elde olan listeyi de EZEBİLİR ve bu doğru: kopya zaten
                 * son başarılı okumanın kendisi, yani satırlar aynı. Değişen
                 * tek şey damganın şimdiye değil O ANA işaret etmesi — "tazeleyemedik,
                 * bu 09:14'ten" demenin tek dürüst yolu bu.
                 */
                void AsyncStorage.getItem(AGENDA_CACHE_KEY)
                    .then((raw) => {
                        if (wanted.current !== target) return;
                        const hit = parseCache<AgendaRow>(raw, target);
                        if (!hit) { setState('error'); return; }
                        setRows(hit.rows);
                        setAt(hit.at);
                        setState('cached');
                    })
                    .catch(() => { if (wanted.current === target) setState('error'); });
            });
    }, [dateISO, todayISO]);

    useEffect(() => {
        void read(true);
    }, [read, attempt]);

    /**
     * Yoklama. Uygulama ARKA PLANDAYSA istek gitmiyor: cebindeki telefonun
     * salonun takvimini saniye saniye çekmesi için bir sebep yok, öne
     * dönüldüğünde zaten bir kez okunuyor (aşağıdaki dinleyici).
     */
    useEffect(() => {
        const id = setInterval(() => {
            if (AppState.currentState !== 'active') return;
            void read(false);
        }, POLL_MS);
        return () => clearInterval(id);
    }, [read]);

    /** Öne dönüş. Arka planda geçen süre yoklamadan uzun olabilir. */
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    /**
     * Sekmeye dönüş. Yoklama bunu 25 saniye içinde zaten yakalardı; ama
     * sekme değiştirip dönen personel listeye BAKTIĞI anda taze olmasını
     * bekliyor, 25 saniye sonra değil.
     */
    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    /*
     * CANLI ZİL (100) — yoklamanın yerine değil, ÜSTÜNE.
     *
     * Masaüstünden ya da müdürün telefonundan bir randevu değiştiğinde 25
     * saniye beklemek yerine saniyesinde tazeleniyor. Sessiz tur: çalışan bir
     * ekranı "yükleniyor"a düşürmek zili gürültüye çevirirdi.
     */
    useLiveSignal(useCallback(() => { void read(false); }, [read]), true, LIVE_TABLES);

    // Sıfırlama efektin İÇİNDE değil: orada senkron `setState` zincirleme
    // render tetikliyor (react-hooks/set-state-in-effect).
    const reload = useCallback(() => {
        setState('loading');
        setAttempt((n) => n + 1);
    }, []);

    return { state, rows, at, reload };
}

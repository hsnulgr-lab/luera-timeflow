import { useCallback, useEffect, useRef, useState } from 'react';

import { LIVE_AUTH } from '../api/session';
import { api, type Appointment } from '../api/staff';
import { demoAgenda, demoAgendaFor, type DemoAppointment } from './staffDemo.ts';

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
 * ── Üç hâl AYRI ─────────────────────────────────────────────────────────────
 *   loading  henüz bilmiyoruz
 *   error    okuyamadık — "randevu yok" DEĞİL
 *   ok       okuduk; liste boş olabilir ve o zaman gerçekten boştur
 *
 * ── Anahtar ─────────────────────────────────────────────────────────────────
 * `EXPO_PUBLIC_AUTH_MODE=live` verilmeden sahte kaynak sürüyor. Böylece
 * geliştirme akışı bozulmuyor ve canlıya geçiş TEK bir değişkenle geri
 * alınabiliyor.
 */

/** Ekranın bir randevudan istediği alanlar. Sahte ve gerçek kaynak ikisi de bunu karşılıyor. */
export type AgendaRow = DemoAppointment;

export type AgendaState = 'loading' | 'ok' | 'error';

export interface AgendaSnapshot {
    state: AgendaState;
    rows: AgendaRow[];
    /**
     * Son BAŞARILI okumanın anı. Ekranda "son güncelleme HH:MM" olarak
     * gösterilecek: bayat veriye bakıp karar vermek, hiç veri görmemekten
     * tehlikeli.
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
        start_time: appointment.start_time,
        end_time: appointment.end_time,
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

export function useAgenda(dateISO: string, todayISO: string): AgendaSnapshot {
    const [state, setState] = useState<AgendaState>('loading');
    const [rows, setRows] = useState<AgendaRow[]>([]);
    const [at, setAt] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0);
    /** Geç dönen bir cevap, sonra seçilen günün listesini EZMESİN. */
    const wanted = useRef(dateISO);

    useEffect(() => {
        let alive = true;
        wanted.current = dateISO;
        fetchAgenda(dateISO, todayISO, Date.now())
            .then((next) => {
                if (!alive || wanted.current !== dateISO) return;
                setRows(next);
                setAt(Date.now());
                setState('ok');
            })
            .catch(() => {
                if (!alive || wanted.current !== dateISO) return;
                // ELDEKİ liste DURUYOR: okunamayan bir gün, boş bir gün
                // değildir. Hata ayrı bir hâl olarak söyleniyor.
                setState('error');
            });
        return () => { alive = false; };
    }, [dateISO, todayISO, attempt]);

    // Sıfırlama efektin İÇİNDE değil: orada senkron `setState` zincirleme
    // render tetikliyor (react-hooks/set-state-in-effect).
    const reload = useCallback(() => {
        setState('loading');
        setAttempt((n) => n + 1);
    }, []);

    return { state, rows, at, reload };
}

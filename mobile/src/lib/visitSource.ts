/**
 * Personel 05 — kumandanın açtığı ZİYARETİN kaynağı.
 *
 * Kumanda bir randevuyu kimliğinden açıyor. Bugüne kadar o kimliği sahte
 * ajandada arıyordu ve BULAMAZSA listenin İKİNCİ randevusunu açıyordu
 * (`?? list[1]`). Canlıda bu, yanlış müşterinin kartını açmak demek: adisyon
 * o kişiye yazılır, formül o kişinin dosyasına düşerdi.
 *
 * Bulunamayan randevu artık `missing`. Yanlış bir kart açmaktansa hiçbir şey
 * açmamak — müşteri sayfasındaki kuralın aynısı.
 *
 * ── Sahte kipte SAAT DONUYOR ────────────────────────────────────────────────
 * `demoAgenda` saatleri "şimdi"ye göre üretiyor. Her okumada yeniden
 * üretilirse randevu saatleri kayıyor ve sayaç yerinde saymaya başlıyor; o
 * yüzden çapa kancanın içinde bir kez donduruluyor. Canlıda böyle bir sorun
 * yok: saatler sunucudan geliyor ve değişmiyor.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api, type Appointment } from '../api/staff';
import { clockText, todayISO } from './calendar.ts';
import { demoAgenda, type DemoAppointment } from './staffDemo.ts';

export type VisitState = 'loading' | 'ok' | 'missing' | 'error';

export interface VisitSnapshot {
    state: VisitState;
    visit: DemoAppointment | null;
    reload: () => Promise<void>;
}

/** `agendaSource.toRow` ile AYNI indirgeme — saat biçimi sınırda çözülüyor. */
function toVisit(row: Appointment): DemoAppointment {
    return {
        id: row.id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        service: row.service,
        notes: row.notes,
        date: row.date,
        start_time: clockText(row.start_time),
        end_time: clockText(row.end_time),
        status: row.status,
        customer_arrived_at: row.customer_arrived_at ?? null,
        arrived_at: row.arrived_at,
        service_ended_at: row.service_ended_at,
        adisyon_items: row.adisyon_items,
        is_paid: row.is_paid,
    };
}

export function useVisit(id: string | undefined): VisitSnapshot {
    const [state, setState] = useState<VisitState>('loading');
    const [visit, setVisit] = useState<DemoAppointment | null>(null);
    /**
     * Sahte günün çapası — bkz. dosya başı. `useRef(Date.now())` DEĞİL:
     * o çağrı çizim sırasında oluyor ve derleyici saf olmayan çağrıyı
     * reddediyor (react-hooks/purity). Durum başlatıcısı bir KEZ çalışıyor.
     */
    const [anchor] = useState(() => Date.now());

    const read = useCallback((visible: boolean) => {
        const today = todayISO();
        const load: Promise<DemoAppointment | null> = LIVE_AUTH
            ? api.agenda(today).then((data) => {
                const list = (data as { appointments?: Appointment[] }).appointments ?? [];
                const row = list.find((item) => item.id === id);
                return row ? toVisit(row) : null;
            })
            : Promise.resolve(
                demoAgenda(anchor, today).find((item) => item.id === id) ?? null,
            );
        return load
            .then((next) => {
                setVisit(next);
                setState(next ? 'ok' : 'missing');
            })
            .catch(() => {
                // ELDEKİ kart DURUYOR: okunamayan bir randevu, olmayan bir
                // randevu değildir.
                if (visible) setState('error');
            });
    }, [anchor, id]);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, visit, reload };
}

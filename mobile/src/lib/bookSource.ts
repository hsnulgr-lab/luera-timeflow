/**
 * Personel 09 — müşteri defterinin veri kaynağı.
 *
 * Karar katmanı `customerBook.ts`'te ve SAF kalıyor (testler onu doğrudan
 * çağırıyor); burası yalnız okuma.
 *
 * ── Yoklama YOK, ve bu bilinçli ─────────────────────────────────────────────
 * Ajanda ve takvim 25 saniyede bir yokluyor çünkü gün İÇİNDE değişiyor:
 * müdür randevu ekliyor, meslektaş işe başlıyor. Müşteri defteri öyle değil —
 * yeni bir kayıt ancak yeni bir randevudan doğuyor ve o da nadir. Defteri
 * saniye saniye çekmek, hiçbir soruyu daha iyi cevaplamadan pil ve sunucu
 * harcamak olurdu.
 *
 * Okuma ÜÇ anda oluyor: açılış, sekmeye dönüş, uygulamanın öne dönüşü.
 * Personel deftere baktığı anda taze; bakmadığı sürece kimseyi ilgilendirmiyor.
 *
 * "Son güncelleme" satırı da yok. Bayat bir ajanda tehlikeli — personel
 * olmayan bir randevuya göre karar verir. Bayat bir defter değil: on dakika
 * önceki müşteri listesi bugün de doğru.
 *
 * ── Hata "müşteri yok" DEĞİL ────────────────────────────────────────────────
 * Ekranın iki boş hâli var (kayıt yok · arama eşleşmedi) ve okunamayan bir
 * defterin ikisine de benzemesi yalan olurdu: "Salonda kayıtlı müşteri yok"
 * cümlesi, okuyamadığımız bir listeyi yok saymak demek.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api } from '../api/staff';
import { demoBook, type BookCustomer } from './customerBook.ts';

export type BookState = 'loading' | 'ok' | 'error';

export interface BookSnapshot {
    state: BookState;
    rows: BookCustomer[];
    reload: () => Promise<void>;
}

/**
 * Sunucudan gelen satırı ekranın beklediği şekle indirger.
 *
 * `upcomingTime` YOK: `customers` ucu bugünün BEKLEYEN randevusunu ayrı bir
 * alan olarak göndermiyor. Uydurmak yerine boş bırakılıyor — o alan boşken
 * satır son gelişin etiketini gösteriyor ve bu doğru bir cevap.
 */
function toBookCustomer(row: Record<string, unknown>): BookCustomer {
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        lastVisitDate: (row.lastVisitDate as string | null) ?? null,
        lastService: (row.lastService as string | null) ?? null,
        hasFormula: row.hasFormula === true,
        mine: row.mine === true,
        lastStaffInitials: String(row.lastStaffInitials ?? ''),
        phoneTail: String(row.phoneTail ?? ''),
    };
}

export async function fetchBook(todayISO: string): Promise<BookCustomer[]> {
    if (!LIVE_AUTH) return demoBook(todayISO);
    const data = await api.customers() as { customers?: Record<string, unknown>[] };
    return (data.customers ?? []).map(toBookCustomer);
}

export function useBook(todayISO: string): BookSnapshot {
    const [state, setState] = useState<BookState>('loading');
    const [rows, setRows] = useState<BookCustomer[]>([]);

    /** Tek okuma yolu, iki ses tonu — bkz. `agendaSource.useAgenda`. */
    const read = useCallback((visible: boolean) => {
        // Zincir BİLEREK `async/await` değil: `await`li sürümde derleyici ilk
        // okumayı "efektin içinde senkron setState" sayıp reddediyor.
        return fetchBook(todayISO)
            .then((next) => {
                setRows(next);
                setState('ok');
            })
            .catch(() => {
                // ELDEKİ defter DURUYOR. Sessiz tazelemenin hatası yutuluyor:
                // çalışan bir listeyi boş bir ekranla değiştirmek en kötüsü.
                if (visible) setState('error');
            });
    }, [todayISO]);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    // Olay işleyicisi — efekt değil; buradaki senkron `setState` bedelsiz.
    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, rows, reload };
}

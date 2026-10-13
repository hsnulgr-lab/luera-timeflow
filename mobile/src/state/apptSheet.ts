import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';

import type { Appt } from '../lib/calendar';
import type { ServiceChoice } from '../lib/appointmentDetail';
import type { ServiceOption } from '../lib/createFlow';

/**
 * RANDEVU KARTININ İKİ ALT SAYFASI ↔ RANDEVU KARTI (2026-10-13).
 *
 * "Hizmeti değiştir" ve "Notu düzenle" iOS'un sayfası (`formSheet` ·
 * `fitToContents`): Kasa'nın sayfalarıyla aynı yapı (`state/cashSheet.ts`),
 * kullanıcı "Kasa'daki gibi aşağı çekince kapansın" dedi. Eskiden
 * `BottomSheet`ti: tutamak çizili, sürüklenmiyordu.
 *
 * İçerik boyundaki sistem sayfası ancak yığının bir ekranı olabiliyor;
 * sayfalar rota, verisi ve kaydetme işi randevu kartında. Kart açılacak
 * sayfayı yayınlıyor, rota okuyor; rota kapanınca köprü boşalıyor.
 */
export type ApptSheet =
    | {
        kind: 'service';
        appointment: Appt;
        dayAppointments: readonly Appt[];
        services: readonly ServiceOption[];
        staffName?: string | null;
        solo: boolean;
        /** Sayfa kapandıktan sonra çağrılıyor — kart yazar. */
        onPick: (choice: ServiceChoice) => void;
    }
    | {
        kind: 'note';
        appointment: Appt;
        onSave: (text: string) => void;
    };

let current: ApptSheet | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
const snapshot = () => current;

/** Bir sayfa açıkken ikincisi açılmıyor: hızlı çift dokunuş iki sayfa itmesin. */
export function apptSheetOpen(): boolean {
    return current !== null;
}

export function showApptSheet(sheet: ApptSheet | null) {
    current = sheet;
    for (const listener of listeners) listener();
}

/** Rotanın okuduğu sayfa; başka türden bir sayfa yayınlanmışsa `null`. */
export function useApptSheet<K extends ApptSheet['kind']>(kind: K): Extract<ApptSheet, { kind: K }> | null {
    const sheet = useSyncExternalStore(subscribe, snapshot);
    return sheet?.kind === kind ? (sheet as Extract<ApptSheet, { kind: K }>) : null;
}

/**
 * Rotanın ömrü — `useCashSheetRoute`un eşi. Rota sökülünce köprü boşalıyor
 * (X yok; aşağı çekme, dokunulan karartı ya da Kaydet). Yayınsız açılan rota
 * boş sayfa göstermek yerine kapanıyor. `close` bir kez çalışıyor.
 */
export function useApptSheetRoute(sheet: ApptSheet | null): () => void {
    const router = useRouter();
    const latest = useRef(sheet);
    const closed = useRef(false);
    useEffect(() => { latest.current = sheet; }, [sheet]);
    useEffect(() => () => {
        if (current === latest.current) showApptSheet(null);
    }, []);
    const close = useCallback(() => {
        if (closed.current) return;
        closed.current = true;
        if (router.canGoBack()) router.back();
    }, [router]);
    useEffect(() => {
        if (!sheet) close();
    }, [sheet, close]);
    return close;
}

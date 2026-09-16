/**
 * Müdürün TAŞIMA yazması — takvim ve personel günü için ortak.
 *
 * Randevu kartı bu işi kendi içinde yapıyordu (`commit`), takvim ve personel
 * günü ise YAPMIYORDU: taşıma yalnız ekranda oluyor, sonuç sayfası "taşındı"
 * diyordu. Ekran yenilenince randevu eski yerine dönüyor, masaüstü ve personel
 * hiçbir şey görmüyordu — müdüre olmamış bir işi olmuş gibi gösteren üç
 * ekrandan ikisi buydu.
 *
 * Kural kartla aynı ve tek yerde:
 *   • İYİMSERLİK ÖNCE — müdür bıraktığı bloğun cevabını beklemesin.
 *   • KİLİT (092) — yazma okunan `updated_at`e dayanır; damgası olmayan satır
 *     taşınamaz, çünkü damgasız yazmak kilidi baştan kapatmak olurdu.
 *   • RED YEREL HÂLİ GERİ ALIR — bırakmak, yapılmamış bir taşımayı yapılmış
 *     gibi göstermek demekti; düzeltilen kusur tam olarak buydu.
 */

import { useCallback, useMemo, useState } from 'react';

import type { Appt } from './calendar.ts';
import { updateAppointment } from './managerWrite';
import { writablePatch, type WriteOutcome } from './managerWriteMap.ts';

export interface MoveWriter {
    /** Sunucunun listesi + kabul edilmiş yerel değişiklikler. */
    appointments: Appt[];
    /** `true` dönerse sunucu yazdı; sonuç sayfası yalnız o zaman açılır. */
    commit: (appointment: Appt, next: Appt, staffName?: string | null) => Promise<boolean>;
    /** Reddedilen yazma — ekran kendi durum bloğunu çizer. */
    refused: WriteOutcome | null;
    clearRefusal: () => void;
}

export function useMoveWriter(
    rows: readonly Appt[],
    stamps: ReadonlyMap<string, string>,
    reload: () => unknown,
): MoveWriter {
    /**
     * `from` yazmanın DAYANDIĞI damga, `to` sunucunun döndürdüğü yeni damga.
     * Sunucu hâlâ eski damgayı gösteriyorsa yerel hâl geçerli; damga
     * değiştiği an — ister bizim yazmamız, ister başka bir cihaz yüzünden —
     * sunucununki geçerli. İki gerçek tutmanın anlamı yok.
     */
    const [local, setLocal] = useState<Record<string, { row: Appt; from: string | null; to: string | null }>>({});
    const [refused, setRefused] = useState<WriteOutcome | null>(null);

    const appointments = useMemo(
        () => rows.map((row) => {
            const mine = local[row.id];
            return mine && mine.from === (stamps.get(row.id) ?? null) ? mine.row : row;
        }),
        [rows, stamps, local],
    );

    const commit = useCallback(async (
        appointment: Appt, next: Appt, staffName?: string | null,
    ): Promise<boolean> => {
        const from = stamps.get(appointment.id) ?? null;
        const mine = local[appointment.id];
        const base = mine && mine.from === from ? mine.to : from;
        if (!base) { setRefused({ ok: false, kind: 'failed' }); return false; }
        setRefused(null);
        setLocal((current) => ({ ...current, [appointment.id]: { row: next, from, to: base } }));
        const outcome = await updateAppointment(
            appointment.id, base, writablePatch(next), staffName,
        ).catch(() => ({ ok: false, kind: 'failed' } as WriteOutcome));
        if (outcome.ok) {
            // Yeni damga taşınıyor: ikinci taşıma kendi ilk yazmasına takılmasın.
            setLocal((current) => ({
                ...current,
                [appointment.id]: { row: next, from, to: outcome.updatedAt },
            }));
            return true;
        }
        setLocal((current) => {
            const rest = { ...current };
            delete rest[appointment.id];
            return rest;
        });
        setRefused(outcome);
        // Bayat kilitte güncel hâl getiriliyor — müdür neye baktığını bilsin.
        if (outcome.kind === 'stale') void reload();
        return false;
    }, [stamps, local, reload]);

    const clearRefusal = useCallback(() => setRefused(null), []);

    return { appointments, commit, refused, clearRefusal };
}

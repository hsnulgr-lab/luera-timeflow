import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';

import type { CashMethod, CashPeriod, CashTotals, Movement, Pending } from '../lib/cash';
import type { FlowEvent } from '../lib/managerFlow';

/**
 * KASA'NIN ÜÇ SAYFASI ↔ KASA EKRANI.
 *
 * Hareket fişi, dönem özeti ve "tahsil edilmedi" listesi iOS'un sayfası
 * (`formSheet` · `fitToContents`): randevu kartının kabuğu, ama boyu İÇERİK
 * kadar — kısa fiş kısa, uzun fiş uzun (2026-10-13, kullanıcı: "tahsilata
 * göre zaten uzar kısalır"). İçerik boyunda bir sistem sayfası ancak yığının
 * bir ekranı olabiliyor; RN `Modal` boy seçtirmiyor.
 *
 * Sayfa bu yüzden ayrı bir rota, ama verisi ve eylemleri KASA EKRANINDA
 * yaşıyor (okuma, geri alma, düzeltme, tahsilat). Rotaya fonksiyon parametre
 * olarak geçmiyor; bu köprü ikisini bağlıyor: ekran açık sayfayı yayınlıyor,
 * rota okuyor. Sayfa kapanınca (X, aşağı çekme, eylem) rota `onClosed`ı
 * çağırıyor ve köprüyü boşaltıyor.
 */
export type CashSheet =
    | {
        kind: 'movement';
        movement: Movement;
        /** "Geri al"a basıldı — onay ekranın sistem uyarısında, sayfanın ÜSTÜNDE. */
        onVoid?: () => void;
        onCorrect?: (amount: number, method: CashMethod) => Promise<string | null>;
        note?: string | null;
        onClosed?: () => void;
    }
    | { kind: 'summary'; period: CashPeriod; totals: CashTotals; onClosed?: () => void }
    | {
        kind: 'pending';
        pending: Pending;
        tickets: readonly FlowEvent[];
        /** Sayfa kapandıktan SONRA çağrılıyor — tahsilat adımı yığına itiliyor. */
        onPick: (ticket: FlowEvent) => void;
        onClosed?: () => void;
    };

let current: CashSheet | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
const snapshot = () => current;

/** Ekran açık sayfayı yayınlıyor — açarken ve verisi tazelendikçe. */
export function showCashSheet(sheet: CashSheet | null) {
    current = sheet;
    for (const listener of listeners) listener();
}

/** Rotanın okuduğu sayfa; başka türden bir sayfa yayınlanmışsa `null`. */
export function useCashSheet<K extends CashSheet['kind']>(kind: K): Extract<CashSheet, { kind: K }> | null {
    const sheet = useSyncExternalStore(subscribe, snapshot);
    return sheet?.kind === kind ? (sheet as Extract<CashSheet, { kind: K }>) : null;
}

/**
 * Rotanın ömrü — kapatma yolu ve kapanış haberi.
 *
 * Kapanınca (X, aşağı çekme, eylem — üçü de rotayı söküyor) ekrana haber
 * veriliyor ve köprü boşalıyor. Yayınsız açılan rota (ör. geliştirmede
 * yeniden yükleme köprüyü sildi) boş bir sayfa göstermek yerine kapanıyor.
 * Dönen `close` bir kez çalışıyor: iki kez basılan X yığından iki ekran
 * sökmesin.
 */
export function useCashSheetRoute(sheet: CashSheet | null): () => void {
    const router = useRouter();
    const latest = useRef(sheet);
    const closed = useRef(false);
    useEffect(() => { latest.current = sheet; }, [sheet]);
    useEffect(() => () => {
        latest.current?.onClosed?.();
        if (current === latest.current) showCashSheet(null);
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

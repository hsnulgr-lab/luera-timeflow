/**
 * Arka plan okumalarının ODAK kuralı (Hız 2 · 2026-11-12).
 *
 * Yoklama ve canlı zil yalnız uygulamanın öne mi arkada mı olduğuna
 * bakıyordu, ekranın kendisine değil. Kumanda açıkken alttaki Bugün de 25
 * saniyede bir aynı `agenda`'yı okuyor ve her zile cevap veriyordu — kimse
 * ona bakmıyorken.
 *
 * Artık ODAKTA OLMAYAN ekran okumuyor; kaçırdığı şeyi "kirli" diye not
 * ediyor ve odağa döndüğünde TEK okuma yapıyor. Odaktaki ekranın kuralı
 * aynen duruyor: 25 sn yoklama, zil, öne dönüş, odağa dönüş.
 *
 * Zamanlama kararları `readGate.ts`'te, saf ve sınanmış; burası yalnız
 * React'e bağlama.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { focusNeedsRead, readGate } from './readGate.ts';

export interface QuietReads {
    /** Yoklama ve öne dönüş: odaktaysa hemen (tek uçuş), değilse kirli. */
    poll: () => void;
    /** Canlı zil: odaktaysa susmasını bekle, değilse kirli. */
    ring: () => void;
    /** `useFocusEffect`'e verilecek kararlı geri çağırma. */
    onFocus: () => () => void;
}

/**
 * @param run      sessiz okuma (hata yutar, ekranı "yükleniyor"a düşürmez)
 * @param lastRead son okumanın BAŞLADIĞI an — kaynak her okumada yazıyor;
 *                 açılış okumasıyla odak okuması çiftlenmesin diye.
 */
export function useQuietReads(run: () => unknown, lastRead: RefObject<number | null>): QuietReads {
    // Kapı bir kez kuruluyor; okuma fonksiyonu değişince (gün, kimlik)
    // yalnız hedefi değişiyor. Bu efekt, aşağıdaki odak efektinden ÖNCE
    // çalışıyor — kancayı çağıran kaynak `useFocusEffect`'i sonra çağırıyor.
    const [gate] = useState(() => readGate(run));
    useEffect(() => { gate.retarget(run); }, [gate, run]);
    useEffect(() => () => gate.cancel(), [gate]);

    const focused = useRef(false);
    const dirty = useRef(false);

    const poll = useCallback(() => {
        if (!focused.current) { dirty.current = true; return; }
        gate.fire();
    }, [gate]);

    const ring = useCallback(() => {
        if (!focused.current) { dirty.current = true; return; }
        gate.ring();
    }, [gate]);

    const onFocus = useCallback(() => {
        focused.current = true;
        if (focusNeedsRead(lastRead.current, Date.now(), dirty.current)) gate.fire();
        dirty.current = false;
        return () => { focused.current = false; };
    }, [gate, lastRead]);

    return { poll, ring, onFocus };
}

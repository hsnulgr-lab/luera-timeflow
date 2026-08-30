import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { demoTick, mockDay, sortFlow, type FlowEvent } from '../lib/managerFlow';

/**
 * Müdür modunun ORTAK GÜN VERİSİ.
 *
 * Neden var: sekmeler kendi kopyalarını tutuyordu. Akış'ta "Tahsil et"e
 * basınca o satır akışta tahsilata dönüyor ama Kasa'nın bekleyen paneli
 * hiçbir şey duymuyordu — aynı salonun iki ekranı iki farklı gerçek
 * söylüyordu. Müdür için bu, uygulamaya güvenmemeye yeten bir şey.
 *
 * Sunucu ucu yazıldığında buranın içi değişir, dışı değişmez: ekranlar
 * bugün de yarın da tek kaynaktan okuyor olacak.
 */
export interface ManagerDayValue {
    /** Günün olayları — tek kopya, tek gerçek. */
    events: FlowEvent[];
    /** Bir olayı yerine koyar. */
    replace: (id: string, next: FlowEvent) => void;
    /** Yeni olay ekler — akış kronolojik olduğu için saate göre yerleşir. */
    add: (event: FlowEvent) => void;
    /** Kaynağı yeniden okur (aşağı çekip yenileme). */
    reload: () => void;
    /** Demo saatinin bir tiki — sunucu bağlanınca silinecek. */
    tick: () => void;
}

const ManagerDayContext = createContext<ManagerDayValue | null>(null);

export function ManagerDayProvider({ children }: { children: ReactNode }) {
    // Sıra TEK YERDEN gelir: ilk yükleme, yenileme ve ekleme aynı kuralı
    // kullanır. Üçünden biri atlanınca liste kendi rayına uymuyordu.
    const [events, setEvents] = useState<FlowEvent[]>(() => sortFlow(mockDay.events));

    const replace = useCallback((id: string, next: FlowEvent) => {
        setEvents((list) => list.map((item) => (item.id === id ? next : item)));
    }, []);

    /** Yeni olay kendi saatinin yerine oturur, listenin başına zorlanmaz. */
    const add = useCallback((event: FlowEvent) => {
        setEvents((list) => sortFlow([...list, event]));
    }, []);

    const reload = useCallback(() => setEvents(sortFlow(mockDay.events)), []);
    const tick = useCallback(() => setEvents((list) => list.map(demoTick)), []);

    const value = useMemo(
        () => ({ events, replace, add, reload, tick }),
        [events, replace, add, reload, tick],
    );
    return <ManagerDayContext.Provider value={value}>{children}</ManagerDayContext.Provider>;
}

/**
 * Sağlayıcı yoksa PATLAR — sessizce boş güne düşmez.
 *
 * Sessiz yedek, ekranın veriyi kaybettiğini gizler: müdür boş bir kasa görür
 * ve gerçekten boş sanır. Kurulum hatası kurulum anında görünmeli.
 */
export function useManagerDay(): ManagerDayValue {
    const value = useContext(ManagerDayContext);
    if (!value) throw new Error('useManagerDay: ManagerDayProvider ağacın üstünde yok');
    return value;
}

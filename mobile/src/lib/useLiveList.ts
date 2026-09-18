import { useEffect, useRef, useState } from 'react';

import { LIVE_MOTION, liveDiff, withLeaving, type LiveDiff, type LiveRow } from './liveMotion.ts';

/** Sesli okuma için: bu tazelemede gelen ve giden satırlar (toplu da olsa). */
export interface LiveNews<T> {
    turn: number;
    added: T[];
    removed: T[];
}

interface Model<T> {
    shown: T[];
    /** Hareket kararı verilen son liste (sönen satırlar hariç). */
    base: T[];
    entering: Set<string>;
    leaving: Set<string>;
    reshaped: Set<string>;
    news: LiveNews<T>;
}

const EMPTY = new Set<string>();
const NO_NEWS = { turn: 0, added: [], removed: [] };
const still = <T,>(items: readonly T[], news: LiveNews<T> = NO_NEWS): Model<T> => ({
    shown: [...items], base: [...items], entering: EMPTY, leaving: EMPTY, reshaped: EMPTY, news,
});

/**
 * Canlı listenin ekranda GÖSTERİLEN hâli (`liveMotion.ts`).
 *
 * Kaynak liste değişince karar ÇİZİMDE veriliyor (React'in "önceki değere
 * göre durum ayarla" kalıbı): efektte `setState` bir kare geç kalırdı ve yeni
 * satır bir kare hareketsiz görünürdü.
 *
 * `scope` değişince (başka gün) hiçbir satır "yeni" sayılmaz — liste baştan
 * değişiyor ama bu bir olay değil. `enabled: false` (liste henüz okunmadı,
 * canlı olmayan bir gün): her değişiklik tek karede yerleşir.
 */
export function useLiveList<T>(items: readonly T[], options: {
    scope: string;
    idOf: (item: T) => string;
    shapeOf: (item: T) => string;
    reduceMotion: boolean;
    enabled?: boolean;
    /**
     * Parmak ekrandayken bile BEKLEMEDEN uygulanabilir mi? (B2) Değişen her
     * satır görünen alanın ÜSTÜNDEyse evet: kaydırma sabitleme onu zaten
     * düzeltiyor, parmağın altındaki kart oynamıyor. Karar bir sonraki
     * karede, efektte veriliyor — satırların konumu ref'te, çizimde okunmaz.
     */
    safeWhileTouching?: (diff: LiveDiff, next: readonly T[]) => boolean;
}) {
    const { scope, idOf, shapeOf, reduceMotion } = options;
    const enabled = options.enabled !== false;
    const [model, setModel] = useState<Model<T>>(() => still(items));
    const [seen, setSeen] = useState<{ items: readonly T[]; scope: string }>({ items, scope });
    const [touching, setTouching] = useState(false);
    const [bypass, setBypass] = useState<readonly T[] | null>(null);
    const rowsOf = (list: readonly T[]): LiveRow[] => list.map((item) => ({ id: idOf(item), shape: shapeOf(item) }));

    if (seen.items !== items || seen.scope !== scope) {
        if (seen.scope !== scope || !enabled) {
            setSeen({ items, scope });
            setModel(still(items));
        } else {
            const diff = liveDiff(rowsOf(model.base), rowsOf(items));
            // Parmak aşağıda ve yükseklik değişecek: BEKLE. `seen` ilerlemiyor,
            // parmak kalkınca aynı karşılaştırma yeniden yapılıyor.
            if (!(touching && diff.moves) || bypass === items) {
                setSeen({ items, scope });
                const byId = new Map(model.base.map((item) => [idOf(item), item]));
                const news: LiveNews<T> = {
                    turn: model.news.turn + 1,
                    added: items.filter((item) => diff.added.has(idOf(item))),
                    removed: [...diff.removed].map((id) => byId.get(id)).filter((item): item is T => item !== undefined),
                };
                if (!diff.moves || diff.bulk || reduceMotion) {
                    setModel(still(items, diff.moves ? news : model.news));
                } else {
                    setModel({
                        shown: withLeaving(model.base, items, diff.removed, idOf),
                        base: [...items],
                        entering: diff.added,
                        leaving: diff.removed,
                        reshaped: diff.reshaped,
                        news,
                    });
                }
            }
        }
    }

    // B2 · Bekleyen tazeleme ekranın üstünde mi? Bir sonraki karede bakılıyor.
    const safe = options.safeWhileTouching;
    const waiting = touching && enabled && seen.scope === scope && seen.items !== items;
    useEffect(() => {
        if (!waiting || !safe) return undefined;
        const frame = requestAnimationFrame(() => {
            const diff = liveDiff(rowsOf(model.base), rowsOf(items));
            if (diff.moves && safe(diff, items)) setBypass(items);
        });
        return () => cancelAnimationFrame(frame);
    // `rowsOf` her çizimde yeni; karar yalnız liste ve bekleme değişince.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waiting, items, model.base, safe]);

    // Sönen satırlar sönme bitince listeden çıkar — yer o karede kapanır.
    useEffect(() => {
        if (model.leaving.size === 0) return undefined;
        const gone = model.leaving;
        const id = setTimeout(() => {
            setModel((current) => (current.leaving !== gone ? current : {
                ...current,
                shown: current.shown.filter((item) => !gone.has(idOf(item))),
                leaving: EMPTY,
            }));
        }, LIVE_MOTION.exitMs);
        return () => clearTimeout(id);
    }, [model.leaving, idOf]);

    // Parmak takibi: kalkınca 120 ms sonra; basılı kalsa da en geç 2 sn.
    const release = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cap = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (release.current) clearTimeout(release.current);
        if (cap.current) clearTimeout(cap.current);
    }, []);
    const touchProps = {
        onTouchStart: () => {
            if (release.current) clearTimeout(release.current);
            if (cap.current) clearTimeout(cap.current);
            setTouching(true);
            cap.current = setTimeout(() => setTouching(false), LIVE_MOTION.holdMaxMs);
        },
        onTouchEnd: () => {
            if (cap.current) clearTimeout(cap.current);
            release.current = setTimeout(() => setTouching(false), LIVE_MOTION.releaseMs);
        },
        onTouchCancel: () => {
            if (cap.current) clearTimeout(cap.current);
            release.current = setTimeout(() => setTouching(false), LIVE_MOTION.releaseMs);
        },
    };

    return {
        shown: model.shown,
        entering: model.entering,
        leaving: model.leaving,
        reshaped: model.reshaped,
        news: model.news,
        touchProps,
    };
}

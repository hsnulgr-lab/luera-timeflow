/**
 * Personel 13 — salonun KATALOĞU ve kullanım geçmişi.
 *
 * Kumandanın kalem kutusu buradan besleniyor: altı kutu geçmişten sıralanıyor,
 * kalanı aramadan bulunuyor.
 *
 * ── Katalog tek turda geliyor ───────────────────────────────────────────────
 * Hizmet, ürün ve geçmiş tek istekte: kumanda sık sık bodrum katında açılıyor
 * ve kötü sinyalde iki ayrı istek, ikisinden birinin düşmesi demek. Kararı
 * sunucu veriyor (`staff-api` · catalog), istemci onu bölmüyor.
 *
 * ── Kutudaki kalem TÜRÜ ─────────────────────────────────────────────────────
 * Veritabanı ürünleri ikiye ayırıyor: `consumable` (sarf — boya, oksidan) ve
 * `retail` (satılan ürün). Ekranın dili de aynı ayrımı taşıyor: `material`
 * depodan düşüyor ve müşteriye YAZILMIYOR, `product` yazılıyor. Hizmetler
 * `extra` — adisyona ek hizmet olarak giriyor.
 *
 * Bu eşleme yazma yolunun beklediğiyle aynı olmak zorunda: sunucu `extra`
 * gelirse hizmet kataloğunda, ötekiler için ürün kataloğunda arıyor
 * (`staff-api` · visit.items). Ayrışırsa kalem "bulunamadı" diye reddedilir.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api } from '../api/staff';
import type { CatalogItem, UsageRow } from './adisyon.ts';
import { demoCatalog, demoUsage } from './catalogDemo.ts';
// Saf eşleme yaprakta — `customerFileMap.ts` ile aynı gerekçe.
import { toCatalog, toUsage, type ServerCatalog } from './catalogMap.ts';
import { useLiveSignal } from './liveSignal';
export { lineKindOf, toCatalog, toUsage } from './catalogMap.ts';

export type CatalogState = 'loading' | 'ok' | 'error';

export interface CatalogSnapshot {
    state: CatalogState;
    items: CatalogItem[];
    usage: UsageRow[];
    reload: () => Promise<void>;
}

/**
 * Kataloğu besleyen tablolar (101). `reservations` BİLEREK YOK: oradan
 * yalnız "son günlerde ne kullanıldı" sıralaması geliyor ve her randevu
 * hareketinde kataloğu yeniden okumak, yavaş değişen bir sıralama için
 * gürültü olurdu. O sıralama odağa dönüşte tazeleniyor.
 */
const LIVE_TABLES = ['services', 'products'] as const;

export function useCatalog(): CatalogSnapshot {
    const [state, setState] = useState<CatalogState>('loading');
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [usage, setUsage] = useState<UsageRow[]>([]);

    const read = useCallback((visible: boolean) => {
        const load: Promise<ServerCatalog> = LIVE_AUTH
            ? api.catalog() as Promise<ServerCatalog>
            : Promise.resolve({});
        return load
            .then((data) => {
                setItems(LIVE_AUTH ? toCatalog(data) : demoCatalog());
                setUsage(LIVE_AUTH ? toUsage(data) : demoUsage());
                setState('ok');
            })
            .catch(() => {
                // ELDEKİ katalog DURUYOR. Boş bir katalog "salonda hiçbir şey
                // yok" demek olurdu ve personel kalem ekleyemediğini
                // sanardı — oysa sorun listede değil, bağlantıda.
                if (visible) setState('error');
            });
    }, []);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    /*
     * CANLI ZİL (101). Müdür masaüstünden yeni bir hizmet eklediğinde ya da
     * fiyatı değiştirdiğinde personelin açık kumandası anında görüyor.
     * Eskiden ekranı kapatıp açmak gerekiyordu ve personel olmayan bir
     * hizmeti arayıp duruyordu.
     */
    useLiveSignal(useCallback(() => { void read(false); }, [read]), true, LIVE_TABLES);

    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, items, usage, reload };
}

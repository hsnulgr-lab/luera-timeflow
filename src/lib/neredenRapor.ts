// Analiz › "Müşteriler nereden geliyor?" — saf toplayıcı.
//
// Sayılan şey YENİ müşteri (kullanıcı kararı 2026-11-01): dönemde açılan
// müşteriler nereden geldiklerine göre, onların randevuları, gelen ve
// gelmeyen. Eski müşterilerin bu dönemdeki ziyaretleri tek satır: "Geri
// gelenler". Reklamın yeni müşteri getirip getirmediği böyle görünür; bütün
// randevuları saymak eski müşteriyi de reklama yazardı.
//
// Ziyaret = randevu grubu (çok hizmetli booking'in satırları `groupId`
// paylaşır). Geldi/gelmedi kararı apptPhase'ten — takvimle aynı kural.
//
// Saf modül: tests/nereden-rapor.test.mjs doğrudan import eder.

import { apptPhase } from './appointmentFlow.ts';
import { NEREDEN_KEYS, isNeredenKey, type NeredenKey } from './nereden.ts';

export type NeredenSatirKey = NeredenKey | 'belirtilmemis' | 'geri_gelen';

export interface NeredenSatir {
    key: NeredenSatirKey;
    /** Yeni müşteri sayısı; "Geri gelenler"de dönemde gelen eski müşteri. */
    musteri: number;
    /** İptal edilmemiş ziyaret. */
    randevu: number;
    geldi: number;
    gelmedi: number;
}

export interface NeredenRaporu {
    satirlar: NeredenSatir[];
    /** Dönemde açılan müşteri. */
    yeniToplam: number;
    /** Yeni müşterilerin kaçının nereden geldiği belli (0–1); yeni yoksa null. */
    bilinenOran: number | null;
    /** Müşteriye bağlı olmayan ziyaret — tabloya girmez, dipnotta. */
    kayitsiz: number;
}

export interface RaporMusteri {
    id: string;
    origin: string | null;
}

export interface RaporRandevu {
    id: string;
    customerId: string | null;
    groupId?: string | null;
    date: string;
    startTime: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    arrivedAt?: string | null;
    customerArrivedAt?: string | null;
    noShowAt?: string | null;
}

type Sonuc = 'geldi' | 'gelmedi' | 'bekliyor';

function ziyaretSonucu(rows: RaporRandevu[], now: Date): Sonuc | null {
    if (rows.every((r) => r.status === 'cancelled')) return null;
    let missed = false;
    for (const r of rows) {
        if (r.status === 'cancelled') continue;
        const phase = apptPhase({
            status: r.status,
            date: r.date,
            startTime: r.startTime,
            arrivedAt: r.arrivedAt ?? undefined,
            customerArrivedAt: r.customerArrivedAt ?? undefined,
            noShowAt: r.noShowAt ?? undefined,
        }, { now });
        if (phase === 'done' || phase === 'inService' || r.customerArrivedAt) return 'geldi';
        if (phase === 'missed') missed = true;
    }
    return missed ? 'gelmedi' : 'bekliyor';
}

/**
 * @param yeniMusteriler dönemde açılan (aktif) müşteriler
 * @param randevular dönem başından itibaren bütün randevular (ileri tarih dahil)
 */
export function neredenRaporu(
    yeniMusteriler: RaporMusteri[],
    randevular: RaporRandevu[],
    opts: { now?: Date } = {},
): NeredenRaporu {
    const now = opts.now ?? new Date();
    const originOf = new Map<string, NeredenSatirKey>();
    for (const c of yeniMusteriler) originOf.set(c.id, isNeredenKey(c.origin) ? c.origin : 'belirtilmemis');

    const satir = new Map<NeredenSatirKey, NeredenSatir>();
    const sat = (key: NeredenSatirKey) => {
        let s = satir.get(key);
        if (!s) { s = { key, musteri: 0, randevu: 0, geldi: 0, gelmedi: 0 }; satir.set(key, s); }
        return s;
    };
    for (const key of originOf.values()) sat(key).musteri += 1;

    const ziyaretler = new Map<string, RaporRandevu[]>();
    for (const r of randevular) {
        const k = r.groupId || r.id;
        const list = ziyaretler.get(k);
        if (list) list.push(r); else ziyaretler.set(k, [r]);
    }

    let kayitsiz = 0;
    const geriGelen = new Set<string>();
    for (const rows of ziyaretler.values()) {
        const sonuc = ziyaretSonucu(rows, now);
        if (!sonuc) continue;
        const customerId = rows.find((r) => r.customerId)?.customerId ?? null;
        if (!customerId) { kayitsiz += 1; continue; }
        const key = originOf.get(customerId) ?? 'geri_gelen';
        if (key === 'geri_gelen') geriGelen.add(customerId);
        const s = sat(key);
        s.randevu += 1;
        if (sonuc === 'geldi') s.geldi += 1;
        if (sonuc === 'gelmedi') s.gelmedi += 1;
    }
    if (geriGelen.size) sat('geri_gelen').musteri = geriGelen.size;

    const sira = (k: NeredenSatirKey) =>
        k === 'geri_gelen' ? 2 : k === 'belirtilmemis' ? 1 : 0;
    const satirlar = [...satir.values()]
        .filter((s) => s.musteri > 0 || s.randevu > 0)
        .sort((a, b) =>
            sira(a.key) - sira(b.key)
            || b.musteri - a.musteri
            || b.randevu - a.randevu
            || NEREDEN_KEYS.indexOf(a.key as NeredenKey) - NEREDEN_KEYS.indexOf(b.key as NeredenKey));

    const yeniToplam = yeniMusteriler.length;
    const bilinen = [...originOf.values()].filter((k) => k !== 'belirtilmemis').length;
    return {
        satirlar,
        yeniToplam,
        bilinenOran: yeniToplam ? bilinen / yeniToplam : null,
        kayitsiz,
    };
}

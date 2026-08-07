// Hizmet adı eşleştirme — kural tabanlı, modelsiz.
//
// Neden: "Diş teli" yazan bir müşteriyi anlamak için modele ihtiyaç yok, bu bir
// metin eşleştirme işi. Ama kodda eşleştirmenin tek yolu modeldi: model hizmet
// adını GERİ YAZIYOR, kod da onu listeyle karşılaştırıyordu.
//
// Canlıda bunun bedeli görüldü: model bütçesi dolunca hizmet hiç eşleşmedi ve
// bot her mesaja karşılamayla cevap verip sonsuz döngüye girdi. Müşteri
// "Diş teli", "Lazer", "Plak tedavi" yazdı; bot üçünde de baştan başladı.
//
// Artık eşleştirme 1. katmanda. Model yalnız DOLAYLI ifadeler için kalıyor
// ("saçımı boyatmak istiyorum" → Boya) — orada gerçekten anlam gerekiyor.
//
// Saf modül: tests/wa-booking.test.mjs doğrudan import eder.

import { foldTr } from './dates.ts';

/** Eşleştirmeye katkısı olmayan dolgu kelimeleri. */
const STOP = new Set([
    'icin', 'randevu', 'randevusu', 'almak', 'istiyorum', 'isterim', 'olsun',
    'lutfen', 'bir', 've', 'ile', 'ya', 'da', 'de', 'mi', 'mu', 'yaptirmak',
    'yaptirabilir', 'miyim', 'olur', 'rica', 'ederim', 'merhaba', 'selam',
]);

function tokenize(s: string): string[] {
    return foldTr(s)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0 && !STOP.has(t));
}

/**
 * İki sözcük aynı kökten mi? Türkçe ekleri kural olarak sökmek güvenilmez
 * ("tedavisi" → "tedavi" tamam ama "eli" → "el" değil), o yüzden yalnız önek
 * eşleşmesine bakılır ve en az 3 harf şart koşulur: "tedavi" ⊂ "tedavisi" ✓,
 * "el" ⊄ "eli" (kısa, riskli).
 */
function sameStem(a: string, b: string): boolean {
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return short.length >= 3 && long.startsWith(short);
}

export interface ServiceLike {
    id?: string;
    name: string;
}

export interface ServiceMatch<T extends ServiceLike> {
    /** Tek ve net eşleşme. Belirsizse null. */
    match: T | null;
    /** Birden fazla hizmet aynı ölçüde uyuyorsa: müşteriye sorulacak liste. */
    candidates: T[];
}

/**
 * Mesajdan hizmeti çıkarır.
 *
 * BELİRSİZLİKTE TAHMİN ETMEZ: "diş" hem "Diş teli" hem "Diş temizliği" ile
 * uyuyorsa ikisini de aday olarak döner ve çağıran müşteriye sorar. Yanlış
 * hizmetle randevu, randevusuzluktan kötüdür.
 */
export function matchService<T extends ServiceLike>(text: string, services: T[]): ServiceMatch<T> {
    const empty: ServiceMatch<T> = { match: null, candidates: [] };
    if (!text || !services?.length) return empty;

    const msg = tokenize(text);
    if (msg.length === 0) return empty;

    interface Scored { svc: T; full: boolean; hits: number; size: number }
    const scored: Scored[] = [];

    for (const svc of services) {
        const nameTokens = tokenize(svc.name);
        if (nameTokens.length === 0) continue;
        const hits = nameTokens.filter((nt) => msg.some((mt) => sameStem(nt, mt))).length;
        if (hits === 0) continue;
        scored.push({ svc, full: hits === nameTokens.length, hits, size: nameTokens.length });
    }
    if (scored.length === 0) return empty;

    // Tam eşleşenler varsa yalnız onlar yarışır; en ÇOK sözcüklü olan kazanır
    // ("Diş temizliği" > "Diş"), çünkü daha belirgin bir istektir.
    const fulls = scored.filter((s) => s.full);
    const pool = fulls.length > 0 ? fulls : scored;
    const best = Math.max(...pool.map((s) => (fulls.length > 0 ? s.size : s.hits)));
    const top = pool.filter((s) => (fulls.length > 0 ? s.size : s.hits) === best);

    if (top.length === 1) return { match: top[0].svc, candidates: [] };
    return { match: null, candidates: top.map((s) => s.svc) };
}

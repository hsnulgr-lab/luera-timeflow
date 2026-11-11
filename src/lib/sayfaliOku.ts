/*
 * Sayfalı okuma — PostgREST bir istekte en çok ~1000 satır verir; sabit
 * `.limit(n)` ise yoğun salonda sessizce satır düşürür. Kısa sayfa gelene
 * kadar `.range()` ile okunur (telefondaki `managerSource.readAll` deseni).
 * Sıralama kararlı olmalı (son anahtar `id`), yoksa sayfa sınırında satır
 * kayar ya da ikilenir.
 */
export const SAYFA = 1000;
/** Emniyet tavanı: 50 sayfa = 50.000 satır. Aşılırsa eldekiyle dönülür. */
export const AZAMI_SAYFA = 50;

export async function readAllPages<T>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
    size = SAYFA,
    maxPages = AZAMI_SAYFA,
): Promise<{ rows: T[]; error: unknown | null }> {
    const rows: T[] = [];
    for (let i = 0; i < maxPages; i++) {
        const from = i * size;
        const { data, error } = await page(from, from + size - 1);
        if (error) return { rows, error };
        const chunk = data ?? [];
        rows.push(...chunk);
        if (chunk.length < size) return { rows, error: null };
    }
    console.warn(`readAllPages: ${maxPages} sayfa tavanına ulaşıldı (${rows.length} satır)`);
    return { rows, error: null };
}

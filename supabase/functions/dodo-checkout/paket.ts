// Paket kuralları — SAF (Deno yok): dodo-checkout ve testler import eder.
// Ekrandaki karşılığı src/lib/plans.ts (maxStaff, isUpgrade); ikisi
// tests/plan-degisimi.test.mjs'te her kombinasyonda eşlenir.

/** Planın en çok aktif çalışanı; listede olmayan plan sınırsız. */
export const MAX_STAFF: Record<string, number> = { baslangic: 1 };

const RANK: Record<string, number> = { baslangic: 1, pro: 2, isletme: 3 };

/**
 * Yükseltme mi: daha büyük paket, ya da aynı pakette aylıktan yıllığa.
 * Yükseltme hemen, düşürme bir sonraki fatura gününde (2026-10-22).
 */
export function isUpgrade(fromPlan: string | null | undefined, fromCycle: string | null | undefined, toPlan: string, toCycle: string): boolean {
    const a = RANK[fromPlan ?? ''] ?? 0;
    const b = RANK[toPlan] ?? 0;
    if (a !== b) return b > a;
    return fromCycle !== 'yearly' && toCycle === 'yearly';
}

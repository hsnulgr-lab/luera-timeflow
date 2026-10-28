// Paket hakları — tek formül. Deno aynası: supabase/functions/_shared/booking/packages.ts
// (tests/wa-booking.test.mjs ikisini aynı girdilerle karşılaştırır).

/**
 * Paket hakları: toplam, kullanılan, randevuya bağlanmış (rezerve), boşta.
 * Paketler ekranı (BeautyPackages) ve WhatsApp botu AYNI sayıyı söylesin diye
 * tek formül. Rezerve = pakete bağlı (`custom_fields.paket_plan_id`), bugün ya
 * da ileri tarihli, iptal edilmemiş ve henüz sayılmamış (`paket_sayildi`)
 * randevu; kullanılmamış haktan fazlası sayılmaz.
 */
export interface PackagePlanInput { id: string; sessionCount: number; sessionsDone: number }
export interface PackageResInput {
    date: string; status?: string | null;
    customFields?: { paket_plan_id?: unknown; paket_sayildi?: unknown } | null;
}
export interface PackageRights { total: number; used: number; reserved: number; available: number }

export function packageRights(plan: PackagePlanInput, reservations: readonly PackageResInput[], today: string): PackageRights {
    const total = Math.max(0, Number(plan.sessionCount) || 0);
    const used = Math.min(total, Math.max(0, Number(plan.sessionsDone) || 0));
    const linked = reservations.filter((r) =>
        String(r.customFields?.paket_plan_id ?? '') === plan.id
        && r.status !== 'cancelled' && !r.customFields?.paket_sayildi && r.date >= today).length;
    const reserved = Math.min(total - used, linked);
    return { total, used, reserved, available: total - used - reserved };
}

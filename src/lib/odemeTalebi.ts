// Ödeme önce akışının (göç 127) tarayıcı tarafı: /satin-al Dodo'ya
// gitmeden önce gizli talep jetonunu SEKMENİN oturum deposuna yazar,
// /hosgeldin dönüşte okur. Jeton adrese konmaz: erişim günlüğüne, geçmişe
// ve paylaşılan ekrana düşmesin. Aynı sekmede Dodo'ya gidip dönüldüğü için
// sessionStorage yeter; başka sekmede dönen kişi hesabına e-postadan girer.

const KEY = 'luera.odemeTalebi';
/** Dodo'da geçen süre üst sınırı: sunucudaki talep ömrüyle (2 gün) aynı. */
const MAX_AGE_MS = 2 * 24 * 60 * 60_000;

export function saveClaimToken(token: string): void {
    try { sessionStorage.setItem(KEY, JSON.stringify({ token, at: Date.now() })); } catch { /* gizli kip vb. */ }
}

export function readClaimToken(): string | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as { token?: unknown; at?: unknown };
        if (typeof v.token !== 'string' || typeof v.at !== 'number' || Date.now() - v.at > MAX_AGE_MS) return null;
        return v.token;
    } catch {
        return null;
    }
}

export function clearClaimToken(): void {
    try { sessionStorage.removeItem(KEY); } catch { /* yok say */ }
}

/** Fonksiyon cevabının gövdesi — 2xx değilse supabase-js onu `error.context`e koyar. */
export async function functionBody(data: unknown, error: unknown): Promise<Record<string, unknown> | null> {
    if (!error) return (data ?? null) as Record<string, unknown> | null;
    const ctx = (error as { context?: Response } | null)?.context;
    if (!ctx || typeof ctx.json !== 'function') return null;
    return await ctx.clone().json().catch(() => null) as Record<string, unknown> | null;
}

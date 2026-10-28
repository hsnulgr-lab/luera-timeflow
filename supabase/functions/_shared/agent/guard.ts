// Ajanın kod tarafındaki kuralları — modele bırakılmayan kararlar.
//
// Model ne derse desin: randevu, müşteri onay vermeden yazılmaz; konuşma
// geçmişi koşul değişince sıfırlanır; ajanı kimin kullanacağı ve aylık tavan
// koddan belirlenir. Hepsi saf fonksiyon, hepsi testli.
//
// Saf modül: veritabanı yok, Deno yok. tests/wa-agent.test.mjs doğrudan import eder.

import { detectConfirm } from '../booking/intent.ts';
import { normalizePhone } from '../phone.ts';

// ── Yönlendirme ─────────────────────────────────────────────────────────────

export interface AgentConfig {
    /** Doluysa yalnız bu numaralar ajana gider (test kipi). */
    test_numbers?: string[];
    /** Test kipinde listede olmayanlara: eski bot ya da hiç cevap. */
    others?: 'old' | 'silent';
    monthly_budget_usd?: number;
    model?: string;
    effort?: 'low' | 'medium' | 'high';
    /** true ise ilk temasta yapay zekâ onayı (Evet) sorulur; varsayılan kapalı. */
    consent?: boolean;
}

export const DEFAULT_MONTHLY_BUDGET_USD = 25;

export type AgentRoute = 'agent' | 'old' | 'silent';

/**
 * Gelen mesaj ajana mı, eski bota mı gider? Bayrak kapalıysa her zaman eski
 * bot — diğer işletmeler hiçbir şey fark etmez. Tavan dolunca da eski bota
 * düşülür: müşteri cevapsız kalmaz, yalnız sohbet daha kalıplı olur.
 */
export function agentRoute(o: {
    enabled: boolean;
    config: AgentConfig | null | undefined;
    phone: string;
    spentUsd: number;
}): AgentRoute {
    if (!o.enabled) return 'old';
    const cfg = o.config ?? {};
    const list = (cfg.test_numbers ?? [])
        .map((n) => normalizePhone(String(n)))
        .filter((n): n is string => Boolean(n));
    if (list.length > 0 && !list.includes(normalizePhone(o.phone) ?? o.phone)) {
        return cfg.others === 'silent' ? 'silent' : 'old';
    }
    const budget = Number(cfg.monthly_budget_usd ?? DEFAULT_MONTHLY_BUDGET_USD);
    if (Number.isFinite(budget) && o.spentUsd >= budget) return 'old';
    return 'agent';
}

// ── Konuşma bölümü ──────────────────────────────────────────────────────────

/** 6 saat sessizlik yeni konuşmadır: dünkü yarım iş bugüne taşınmaz. */
export const EPISODE_IDLE_MS = 6 * 3600_000;
/** Geçmiş bu kadar mesajı aşınca baştan başlanır; her tur bunu yeniden gönderiyor. */
export const EPISODE_MAX_MESSAGES = 80;

/**
 * Geçmiş sıfırlansın mı? Model ya da işletme profili değiştiyse ZORUNLU:
 * düşünce blokları üreten modele ve önceki istemin bayt bayt aynısına bağlı,
 * profil değişince de eski h3 kodu başka bir hizmeti gösterebilir.
 */
export function needsNewEpisode(c: {
    lastMessageAt: string | null;
    model: string | null;
    prefixHash: string | null;
    messageCount: number;
}, now: number, model: string, prefixHash: string): boolean {
    if (c.messageCount === 0) return false;
    if (c.model !== model || c.prefixHash !== prefixHash) return true;
    if (c.messageCount >= EPISODE_MAX_MESSAGES) return true;
    const last = c.lastMessageAt ? Date.parse(c.lastMessageAt) : NaN;
    return Number.isNaN(last) || now - last > EPISODE_IDLE_MS;
}

// ── Öneri → onay ────────────────────────────────────────────────────────────

/** Öneri bu süre içinde onaylanmazsa geçersiz olur; saat o arada dolabilir. */
export const PROPOSAL_TTL_MS = 15 * 60_000;

export type CommitBlock = 'not_found' | 'not_open' | 'expired' | 'same_turn' | 'customer_declined';

/**
 * Öneri uygulanabilir mi? Null = evet. Model "müşteri onayladı" dese bile:
 *  - öneri AYNI turda yazıldıysa müşteri onu henüz görmedi;
 *  - müşterinin son mesajı açık bir "hayır" ise onay değildir.
 */
export function commitBlock(
    p: { status: string; runId: string; expiresAt: string } | null,
    runId: string,
    lastCustomerText: string,
    now: number,
): CommitBlock | null {
    if (!p) return 'not_found';
    if (p.status !== 'open') return 'not_open';
    if (Date.parse(p.expiresAt) <= now) return 'expired';
    if (p.runId === runId) return 'same_turn';
    if (detectConfirm(lastCustomerText) === 'no') return 'customer_declined';
    return null;
}

// ── Saat süzgeci ────────────────────────────────────────────────────────────

export type PartOfDay = 'sabah' | 'ogle' | 'aksam';

const PART_RANGES: Record<PartOfDay, [number, number]> = {
    sabah: [0, 12 * 60],
    ogle: [12 * 60, 17 * 60],
    aksam: [17 * 60, 24 * 60],
};

/** "öğleden sonra gibi" diyen müşteriye sabah saatleri sunulmaz. */
export function filterTimes(times: string[], part: PartOfDay | null): string[] {
    if (!part) return times;
    const [from, to] = PART_RANGES[part];
    return times.filter((t) => {
        const [h, m] = t.split(':').map(Number);
        const min = h * 60 + m;
        return min >= from && min < to;
    });
}

/**
 * Müşteriye önerilecek üç saat — model seçmez, kod seçer. Liste boyunca eşit
 * aralıklı üç nokta alınır (günün başı, ortası, sonu ya da istenen bölümün);
 * her noktanın yakınında tam ya da buçuk saat varsa o tercih edilir: insanlar
 * 12:45 yerine 13:00 der. Canlıda model saat önermek yerine "sabah mı akşam
 * mı" diye sordu; artık önerecek saatler hazır gelir.
 */
export function suggestTimes(times: string[], n = 3): string[] {
    if (times.length <= n) return [...times];
    const round = (t: string) => t.endsWith(':00') || t.endsWith(':30');
    const picked: string[] = [];
    for (let i = 0; i < n; i++) {
        const target = Math.round((i * (times.length - 1)) / (n - 1));
        let best = target;
        for (let d = 1; d <= 3 && !round(times[best]); d++) {
            for (const j of [target - d, target + d]) {
                if (j >= 0 && j < times.length && round(times[j]) && !picked.includes(times[j])) { best = j; break; }
            }
        }
        if (!picked.includes(times[best])) picked.push(times[best]);
    }
    return picked.sort();
}

// ── Çıktı ───────────────────────────────────────────────────────────────────

/**
 * WhatsApp biçimine çevirir. Model markdown'a meyilli; WhatsApp `**` yerine
 * `*`, başlık ve tablo bilmez, `[metin](adres)` ham görünür.
 */
export function sanitizeForWhatsApp(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/__(.+?)__/g, '_$1_')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 1500);
}

// ── Model ───────────────────────────────────────────────────────────────────

/**
 * Konuşma ortası `role: "system"` mesajını destekleyen modeller. Desteklemeyende
 * bağlam, kullanıcı mesajına ayrı bir metin bloğu olarak eklenir.
 */
export function supportsMidSystem(model: string): boolean {
    return /^claude-(opus-5|opus-4-8|fable-5|mythos-5|sonnet-5-5)/.test(model);
}

interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }

// ABD doları / milyon token. Önbellek yazımı 5 dk TTL için giriş fiyatının 1,25 katı.
// Haiku 5.5'in önbellek okuma fiyatı belgede yok; 0,1× varsayıldı (yaklaşık).
const PRICES: Record<string, Price> = {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export interface UsageTotals {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
}

/** Tanınmayan model Opus fiyatından hesaplanır — tavan yanlışlıkla gevşemesin. */
export function costUsd(model: string, u: UsageTotals): number {
    const p = PRICES[model] ?? PRICES['claude-opus-5-5'];
    const usd = (u.input * p.input + u.output * p.output
        + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
    return Math.round(usd * 100_000) / 100_000;
}

/** Kısa kimlik: modele UUID'nin ilk 8 hanesi gösterilir ("o-520ddeb2"). */
export function shortRef(prefix: string, uuid: string): string {
    return `${prefix}-${String(uuid).replace(/-/g, '').slice(0, 8)}`;
}

/** shortRef'in tersi: "o-520ddeb2" → "520ddeb2" (UUID'nin başı). */
export function refPrefix(ref: string, prefix: string): string | null {
    const m = new RegExp(`^${prefix}-([0-9a-f]{8})$`).exec(String(ref).trim().toLowerCase());
    return m ? m[1] : null;
}

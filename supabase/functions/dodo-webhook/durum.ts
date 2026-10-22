// Dodo olayı → ayna kararı. SAF: ağ yok, Deno yok; tests/abonelik-yerel.test.mjs
// doğrudan import eder.
//
// ── Neden olay türüne göre değil, ANLIK GÖRÜNTÜYE göre ──────────────────────
// Eski webhook her olay türü için ayrı bir yazım yapıyordu ve sıraya
// güveniyordu (önce `active`, sonra `renewed`…). Dodo olayları sırasız ve
// tekrarlı teslim edebiliyor; Eylül'deki gibi uç kapanıp açılınca araya giren
// olaylar hiç gelmeyebiliyor. Oysa her `subscription.*` olayının `data`'sı
// aboneliğin TAMAMI (Dodo: "teslim anındaki en son durum"). Ayna buradan
// türetilirse kaçan bir olay sonrakiyle kendiliğinden düzelir.
//
// ── Üç koruma ───────────────────────────────────────────────────────────────
// 1. ESKİ OLAY GERİ SARMAZ: yükteki `timestamp` aynadaki son uygulanandan
//    eskiyse ayna değişmez (olay deftere yine yazılır).
// 2. BAŞKA ABONELİK KARIŞMAZ, EN YENİSİ KAZANIR: işletmenin aboneliği B
//    iken eski A'nın "süresi doldu" olayı kapıyı kapatmaz. Başka bir
//    abonelik `active` gelirse aynadakinin Dodo'daki hâliyle karşılaştırılır
//    (`created_at`): daha YENİYSE yerine geçer ve eskisi kapatılır; daha
//    ESKİYSE ayna değişmez, gelen kopya kapatılır. Eskiden "son gelen
//    active kazanır"dı: aynı işletmede iki abonelik varken eskisinin
//    yenilemesi yenisini iptal ediyordu (devir 10 §10, 2026-10-20).
// 3. DENEME KALICI ALANDAN OKUNMAZ: `trial_period_days` aboneliğin ömür boyu
//    alanı; askıdan dönen ödeyen bir salon "deneme"ye düşüyordu. Şimdiki
//    dönemin deneme dönemi olup olmadığına tarihten bakılır.

import { graceUntil, PERIOD_TOLERANCE_MS, type EntState } from '../_shared/entitlement.ts';

export { PERIOD_TOLERANCE_MS };

const DAY = 86_400_000;

/** Aynanın kararın baktığı alanları. */
export interface MirrorNow {
    state: EntState;
    grace_until: string | null;
    dodo_subscription_id: string | null;
    dodo_event_at: string | null;
}

export interface MirrorPatch {
    state?: EntState;
    plan?: string;
    cycle?: string;
    trial_ends_at?: string | null;
    expires_at?: string | null;
    grace_until?: string | null;
    dodo_subscription_id?: string;
    dodo_customer_id?: string;
    cancel_at_period_end?: boolean;
    cancelled_at?: string | null;
    dodo_event_at?: string;
    last_event: string;
}

/**
 * Aynadaki aboneliğin Dodo'daki şimdiki hâli. Yalnız başka bir abonelik
 * `active` geldiğinde okunur (`needsMineNow`); `found: false` = Dodo'da yok
 * (ör. test kipinden canlıya geçişte aynada kalan test kimliği).
 */
/** Dodo ürün kimliği → paket (DODO_PRODUCT_MAP'in tersi). */
export type ProductPlans = Record<string, { plan: string; cycle: string }>;

/**
 * `{ "pro_monthly": "pdt_…" }` haritalarından ters tablo. İlk gelen kazanır:
 * bugünkü harita önce verilir, eskiler (önceki, test) sonra.
 */
export function productPlans(...maps: (string | null | undefined)[]): ProductPlans {
    const out: ProductPlans = {};
    for (const raw of maps) {
        let m: unknown;
        try { m = JSON.parse(raw || '{}'); } catch { continue; }
        if (!m || typeof m !== 'object') continue;
        for (const [key, id] of Object.entries(m as Record<string, unknown>)) {
            const cut = key.lastIndexOf('_');
            if (typeof id !== 'string' || cut <= 0 || out[id]) continue;
            out[id] = { plan: key.slice(0, cut), cycle: key.slice(cut + 1) };
        }
    }
    return out;
}

export type MineNow =
    | { found: false }
    | { found: true; status: string; created_at: string | null };

export type Decision =
    | {
        kind: 'apply';
        patch: MirrorPatch;
        /** Ek süreye YENİ girildi → sahibine "ödeme alınamadı" bildirimi. */
        enteredGrace: boolean;
        /** Bu abonelik başka birinin yerine geçti → eskisi Dodo'da kapatılmalı. */
        replaced: string | null;
    }
    | {
        kind: 'skip';
        outcome: 'stale' | 'other_subscription' | 'older_subscription';
        /** Aynı işletmenin ESKİ kopya aboneliği → Dodo'da kapatılmalı (çift tahsilat). */
        cancel?: string;
    };

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sub = any; // Dodo Subscription nesnesi (yalnız okunan alanlar aşağıda)

const ms = (iso: unknown): number | null => {
    if (typeof iso !== 'string' || !iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
};

/**
 * Şimdiki dönem deneme dönemi mi?
 *
 * Denemeli abonelikte ilk `next_billing_date` = oluşturma + deneme günü. İlk
 * tahsilattan sonra bir dönem ileri kayar. Tarih yoksa eski davranışa düşülür.
 */
export function isTrialPeriod(sub: Sub): boolean {
    const days = Number(sub?.trial_period_days) || 0;
    if (days <= 0) return false;
    const created = ms(sub?.created_at);
    const next = ms(sub?.next_billing_date);
    if (created === null || next === null) return true;
    return next <= created + (days + 2) * DAY;
}

/** Dönemin bittiği an + tolerans; tarih yoksa null (alana dokunulmaz). */
export function periodEnd(sub: Sub): string | null {
    const next = ms(sub?.next_billing_date);
    return next === null ? null : new Date(next + PERIOD_TOLERANCE_MS).toISOString();
}

/** Bu durumlardaki abonelik bir daha tahsilat yapmaz (`_shared/dodo.ts` ile aynı). */
const TERMINAL = new Set(['cancelled', 'expired', 'failed']);

/**
 * Aynadakinden FARKLI bir abonelik `active` mi geldi? Öyleyse karar için
 * aynadakinin Dodo'daki hâli (`MineNow`) okunmalı — webhook okur, karar saf.
 */
export function needsMineNow(sub: Sub, current: MirrorNow | null): boolean {
    const subId = typeof sub?.subscription_id === 'string' ? sub.subscription_id : null;
    const mine = current?.dodo_subscription_id ?? null;
    return !!mine && !!subId && subId !== mine && String(sub?.status ?? '') === 'active';
}

/**
 * Gelen abonelik aynadakine göre ne?
 *   newer   → yerine geçer, aynadaki kapatılır
 *   gone    → yerine geçer; aynadaki zaten tahsilat yapmıyor ya da Dodo'da yok
 *   older   → ayna değişmez, gelen kopya kapatılır
 *   unknown → hiçbir şey yapılmaz (karşılaştırılamadı; tahmine göre iptal YOK)
 */
function rival(sub: Sub, mineNow: MineNow | undefined, subId: string, mine: string): 'newer' | 'gone' | 'older' | 'unknown' {
    if (!mineNow) return 'unknown';
    if (!mineNow.found || TERMINAL.has(mineNow.status)) return 'gone';
    const theirs = ms(sub?.created_at);
    const ours = ms(mineNow.created_at);
    if (theirs === null || ours === null) return 'unknown';
    // Aynı milisaniye: kimlik sırasıyla kesin bir kazanan seçilir.
    return theirs > ours || (theirs === ours && subId > mine) ? 'newer' : 'older';
}

/**
 * @param type     olay türü (`subscription.renewed`…); son olay olarak yazılır
 * @param sub      aboneliğin anlık görüntüsü
 * @param eventAt  olayın Dodo'daki anı (yükün `timestamp`'i)
 * @param current  aynanın şimdiki hâli; satır yoksa null
 * @param mineNow  aynadaki aboneliğin Dodo'daki hâli; yalnız `needsMineNow`
 *                 doğruyken gerekir, yoksa başka abonelik devralamaz
 * @param plans    ürün kimliği → paket; paket metadata'dan ÖNCE buradan
 */
export function decide(
    type: string,
    sub: Sub,
    eventAt: string | null,
    current: MirrorNow | null,
    now: number = Date.now(),
    mineNow?: MineNow,
    plans?: ProductPlans,
): Decision {
    const at = ms(eventAt);
    const last = ms(current?.dodo_event_at);

    const subId: string | null = typeof sub?.subscription_id === 'string' ? sub.subscription_id : null;
    const status: string = String(sub?.status ?? '');
    const mine = current?.dodo_subscription_id ?? null;
    let replaced: string | null = null;
    if (mine && subId && subId !== mine) {
        // Başka abonelik: iki aboneliğin olay zamanları birbiriyle
        // karşılaştırılamaz, "eski olay" denetimi burada anlamsız.
        if (status !== 'active') return { kind: 'skip', outcome: 'other_subscription' };
        const verdict = rival(sub, mineNow, subId, mine);
        if (verdict === 'unknown') return { kind: 'skip', outcome: 'other_subscription' };
        if (verdict === 'older') return { kind: 'skip', outcome: 'older_subscription', cancel: subId };
        replaced = verdict === 'newer' ? mine : null;
    } else if (at !== null && last !== null && at < last) {
        return { kind: 'skip', outcome: 'stale' };
    }

    const md = (sub?.metadata ?? {}) as Record<string, unknown>;
    const patch: MirrorPatch = { last_event: type };
    if (subId) patch.dodo_subscription_id = subId;
    if (typeof sub?.customer?.customer_id === 'string') patch.dodo_customer_id = sub.customer.customer_id;
    if (typeof md.plan === 'string' && md.plan) patch.plan = md.plan;
    if (typeof md.cycle === 'string' && md.cycle) patch.cycle = md.cycle;
    // Paket önce ÜRÜNDEN: plan değiştirmede (2026-10-22) Dodo ürünü değiştirir.
    // Dönem sonuna zamanlanmış düşürmede metadata yeni paketi erken söyler,
    // ürün ise o güne kadar eskisi kalır — salon ödediği paketi görür.
    const fromProduct = typeof sub?.product_id === 'string' ? plans?.[sub.product_id] : undefined;
    if (fromProduct) {
        patch.plan = fromProduct.plan;
        patch.cycle = fromProduct.cycle;
    }
    if (typeof sub?.cancel_at_next_billing_date === 'boolean') {
        patch.cancel_at_period_end = sub.cancel_at_next_billing_date;
    }
    if (at !== null) patch.dodo_event_at = new Date(at).toISOString();

    const end = periodEnd(sub);
    const inGrace = current?.state === 'grace';
    let enteredGrace = false;

    switch (status) {
        case 'active': {
            const trial = isTrialPeriod(sub);
            patch.state = trial ? 'trial' : 'active';
            if (end) patch.expires_at = end;
            patch.trial_ends_at = trial ? end : null;
            patch.grace_until = null;
            // Yeniden etkinleşen abonelik iptal bayrağını da taşır; iptal
            // zamanı yalnız iptal sürerken anlamlı.
            if (patch.cancel_at_period_end === false) patch.cancelled_at = null;
            break;
        }
        case 'past_due':
        case 'on_hold': {
            // Ödeme alınamadı → ek süre. Zaten ek süredeyse süre UZAMAZ:
            // `past_due` ardından `on_hold` gelince ya da aynı askı olayı
            // tekrar teslim edilince sayaç baştan başlamamalı.
            patch.state = 'grace';
            const dodoDeadline = typeof sub?.past_due_ends_at === 'string' ? sub.past_due_ends_at : null;
            patch.grace_until = inGrace && current?.grace_until
                ? current.grace_until
                : (dodoDeadline ?? graceUntil(now));
            enteredGrace = !inGrace;
            break;
        }
        case 'cancelled':
            // DURUM DEĞİŞMEZ: iptal dönem sonunda demek; parasını ödediği
            // günleri geri almak olmaz, `expires_at` zamanında keser.
            patch.cancel_at_period_end = true;
            patch.cancelled_at = typeof sub?.cancelled_at === 'string' ? sub.cancelled_at : new Date(now).toISOString();
            break;
        case 'expired':
        case 'failed':
        case 'paused':
            patch.state = 'locked';
            patch.grace_until = null;
            break;
        default:
            // pending ve bilinmeyenler: yalnız kimlikler ve son olay.
            break;
    }

    return { kind: 'apply', patch, enteredGrace, replaced };
}

/** Ayna → Core `subscriptions.status` (CHECK: trial|active|past_due|cancelled|expired). */
export function coreStatus(state: EntState, lastEvent: string | null): string | null {
    switch (state) {
        case 'trial': return 'trial';
        case 'active': return 'active';
        case 'grace': return 'past_due';
        case 'locked': return lastEvent === 'subscription.failed' ? 'cancelled' : 'expired';
        default: return null;
    }
}

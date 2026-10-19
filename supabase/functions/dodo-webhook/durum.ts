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
// 2. BAŞKA ABONELİK KARIŞMAZ: işletmenin aboneliği B iken eski A'nın
//    "süresi doldu" olayı kapıyı kapatmaz. Yeni abonelik ancak `active`
//    olarak gelirse eskisinin yerine geçer.
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

export type Decision =
    | {
        kind: 'apply';
        patch: MirrorPatch;
        /** Ek süreye YENİ girildi → sahibine "ödeme alınamadı" bildirimi. */
        enteredGrace: boolean;
        /** Bu abonelik başka birinin yerine geçti → eskisi Dodo'da kapatılmalı. */
        replaced: string | null;
    }
    | { kind: 'skip'; outcome: 'stale' | 'other_subscription' };

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

/**
 * @param type     olay türü (`subscription.renewed`…); son olay olarak yazılır
 * @param sub      aboneliğin anlık görüntüsü
 * @param eventAt  olayın Dodo'daki anı (yükün `timestamp`'i)
 * @param current  aynanın şimdiki hâli; satır yoksa null
 */
export function decide(
    type: string,
    sub: Sub,
    eventAt: string | null,
    current: MirrorNow | null,
    now: number = Date.now(),
): Decision {
    const at = ms(eventAt);
    const last = ms(current?.dodo_event_at);
    if (at !== null && last !== null && at < last) return { kind: 'skip', outcome: 'stale' };

    const subId: string | null = typeof sub?.subscription_id === 'string' ? sub.subscription_id : null;
    const status: string = String(sub?.status ?? '');
    const mine = current?.dodo_subscription_id ?? null;
    let replaced: string | null = null;
    if (mine && subId && subId !== mine) {
        if (status !== 'active') return { kind: 'skip', outcome: 'other_subscription' };
        replaced = mine;
    }

    const md = (sub?.metadata ?? {}) as Record<string, unknown>;
    const patch: MirrorPatch = { last_event: type };
    if (subId) patch.dodo_subscription_id = subId;
    if (typeof sub?.customer?.customer_id === 'string') patch.dodo_customer_id = sub.customer.customer_id;
    if (typeof md.plan === 'string' && md.plan) patch.plan = md.plan;
    if (typeof md.cycle === 'string' && md.cycle) patch.cycle = md.cycle;
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

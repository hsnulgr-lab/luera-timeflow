/**
 * Müdür 35 · Paket sat — karar katmanı. Saf, React'siz.
 *
 * Kaynak: `Downloads/finalssooo/A-paket-sat.html` ve masaüstündeki çekmece
 * (`src/pages/BeautyPackages.tsx · SaleDrawer`). Telefon AYNI kaydı yazıyor
 * (`treatment_plans`, tür paket) ama iki adımı yok:
 *   • Müşteri — kart zaten bir müşteri.
 *   • Ödeme — telefon para yazmıyor; peşinat ve taksit masaüstünde.
 * Kalan iki adım: Paket · Onay.
 *
 * Satış müşteriye HAK (N seans) ve ALACAK (bedel) yazar. "Satış para almaz"
 * değil — masaüstünde peşinat alınabiliyor; telefonda alınmıyor.
 */

import type { PackageRow } from './apptInfo.ts';
import { closedBy, closedReason, type EligibilityRule } from './eligibility.ts';

/**
 * Paket satışının açık olduğu sektörler — masaüstünün `PackagesPage`i yalnız
 * bu ikisinde satış çekmecesini açıyor. Klinikte "paket" tedavi planıdır ve
 * başka bir ekrandan kurulur; orada "Paket sat" ölü kapı olurdu.
 */
export const PACKAGE_SALE_SECTORS: readonly string[] = ['guzellik', 'kuafor'];

export function sellsPackages(sector: string | null | undefined): boolean {
    return PACKAGE_SALE_SECTORS.includes(sector ?? '');
}

/** Masaüstünün DB kısıtı: 1–50 seans (055/064). */
export const MIN_SESSIONS = 1;
export const MAX_SESSIONS = 50;

export const clampSessions = (value: number): number =>
    Math.min(MAX_SESSIONS, Math.max(MIN_SESSIONS, Math.round(Number(value) || MIN_SESSIONS)));

export interface SaleTemplate {
    id: string;
    name: string;
    sessionCount: number;
    price: number;
    color: string | null;
}

export interface SaleService {
    id: string;
    name: string;
    duration: number;
    price: number;
    color: string | null;
    tags?: readonly string[] | null;
}

/** Listenin bir satırı — şablon ya da hizmet. */
export interface SaleOption {
    kind: 'template' | 'service';
    id: string;
    name: string;
    color: string | null;
    /** Şablonda sabit seans sayısı; hizmette `null` (elle girilir). */
    lockedSessions: number | null;
    /** Şablon fiyatı ya da hizmetin tek seans fiyatı. */
    price: number;
    duration: number | null;
    /** Kapalıysa sebep: "Hamilelik · gebelikte uygulanmaz". */
    closed: string | null;
}

/**
 * Seçenekler. Şablon VARSA liste şablonlardan — masaüstü de öyle yapıyor,
 * şablonu olan salonda hizmetten paket satılmıyor. Yoksa hizmetlerden.
 *
 * Kapalı kararı kartın ve randevu ekranının AYNI kuralı (`closedBy`). Şablonun
 * etiketi yok: masaüstü de şablonu etiketsiz bir hizmet gibi değerlendiriyor,
 * yani karar ada düşüyor.
 */
export function saleOptions(input: {
    templates: readonly SaleTemplate[];
    services: readonly SaleService[];
    rules: readonly EligibilityRule[];
    fields: Record<string, unknown> | null | undefined;
}): { mode: 'template' | 'service'; options: SaleOption[] } {
    const reason = (name: string, tags?: readonly string[] | null) => {
        const hit = closedBy(input.rules, input.fields, { name, tags });
        return hit ? closedReason(hit) : null;
    };
    if (input.templates.length > 0) {
        return {
            mode: 'template',
            options: input.templates.map((t) => ({
                kind: 'template',
                id: t.id,
                name: t.name,
                color: t.color,
                lockedSessions: clampSessions(t.sessionCount),
                price: Math.max(0, t.price),
                duration: null,
                closed: reason(t.name),
            })),
        };
    }
    return {
        mode: 'service',
        options: input.services.map((svc) => ({
            kind: 'service',
            id: svc.id,
            name: svc.name,
            color: svc.color,
            lockedSessions: null,
            price: Math.max(0, svc.price),
            duration: svc.duration > 0 ? svc.duration : null,
            closed: reason(svc.name, svc.tags),
        })),
    };
}

/** Önerilen bedel: şablon fiyatı ya da hizmet fiyatı × seans. */
export function suggestedPrice(option: SaleOption, sessions: number): number {
    return option.lockedSessions != null ? option.price : option.price * clampSessions(sessions);
}

/** "seans başı ₺900" — aşağı yuvarlanmaz, en yakın liraya. */
export function perSession(price: number, sessions: number): number {
    const count = clampSessions(sessions);
    return Math.round(Math.max(0, price) / count);
}

/** Masaüstünün başlığı: çok seansta "Lazer · 10 seans", tekte yalnız ad. */
export function planTitle(name: string, sessions: number): string {
    const count = clampSessions(sessions);
    const clean = name.trim();
    return count > 1 ? `${clean} · ${count} seans` : clean;
}

/**
 * Çift paket — masaüstünün `duplicate` kuralı: müşterinin HAKKI KALAN paketi
 * seçilen adı içeriyor ya da ad onu içeriyor. UYARI, engel değil: müşteri
 * gerçekten ikinci paketi alabilir.
 */
export function duplicateOf(name: string, packages: readonly PackageRow[]): PackageRow | null {
    const wanted = name.trim().toLocaleLowerCase('tr-TR');
    if (!wanted) return null;
    return packages.find((pack) => {
        if (pack.used_sessions >= pack.total_sessions) return false;
        const title = pack.name.toLocaleLowerCase('tr-TR');
        return title.includes(wanted) || wanted.includes(title);
    }) ?? null;
}

/** "Cilt bakımı · 4/10 · 6 hak duruyor" */
export function duplicateLine(pack: PackageRow): string {
    const left = Math.max(0, pack.total_sessions - pack.used_sessions);
    return `${pack.name} · ${pack.used_sessions}/${pack.total_sessions} · ${left} hak duruyor`;
}

/** Bedel alanı: yalnız rakam; boş alan 0 değil, "girilmedi". */
export function parsePrice(text: string): number | null {
    const digits = text.replace(/[^\d]/g, '');
    if (!digits) return null;
    return Math.min(9_999_999, Number(digits));
}

// ── Yazma ────────────────────────────────────────────────────────────────────

export interface PackageSaleInput {
    /**
     * İstemcinin ürettiği plan kimliği — ÇİFT OLUŞTURMA KORUMASI.
     * Cevap kaybolup "Yeniden dene"ye basılırsa aynı kimlik ikinci kez
     * yazılamaz (birincil anahtar); ikinci paket doğmaz.
     */
    id: string;
    customerId: string;
    title: string;
    sessionCount: number;
    totalAmount: number;
}

export type PackageSaleOutcome =
    | { ok: true }
    | { ok: false; kind: 'paused' | 'stale' | 'failed' };

/** Kartın başarısızlık satırının ikinci satırı. */
export function saleFailureText(kind: 'paused' | 'stale' | 'failed'): string {
    if (kind === 'paused') return 'yazma şu an kapalı · paket yazılmadı';
    if (kind === 'stale') return 'müşteri kaydı bulunamadı · paket yazılmadı';
    // Cevap gelmedi: yazıldı mı bilinmiyor. "Yazılmadı" demek iddia olurdu;
    // yeniden denemek güvenli, çünkü kimlik aynı.
    return 'sunucu cevap vermedi · yeniden denemek ikinci paket açmaz';
}

// ── Kart ile satış arasındaki kısa hafıza ────────────────────────────────────
//
// Satış sayfası kapanınca kart yeniden okunuyor. Kart iki şeyi bilmek zorunda:
// yeni satırın HANGİSİ olduğu (bir kez belirsin diye) ve satış YAZILAMADIYSA
// neyin yeniden deneneceği. Bellekte, uygulama kapanınca gider — yarım satış
// diske yazılmıyor, çünkü bayat bir "yeniden dene" yanlış müşteriye yazabilirdi.

type Memo =
    | { kind: 'created'; planId: string }
    | { kind: 'failed'; input: PackageSaleInput; reason: 'paused' | 'stale' | 'failed' };

const memo = new Map<string, Memo>();

export const saleMemo = {
    created(customerId: string, planId: string): void {
        memo.set(customerId, { kind: 'created', planId });
    },
    failed(customerId: string, input: PackageSaleInput, reason: 'paused' | 'stale' | 'failed'): void {
        memo.set(customerId, { kind: 'failed', input, reason });
    },
    peek(customerId: string): Memo | null {
        return memo.get(customerId) ?? null;
    },
    clear(customerId: string): void {
        memo.delete(customerId);
    },
};

/** RFC 4122 v4 — `crypto.randomUUID` Hermes'te her sürümde yok. */
export function newPlanId(random: () => number = Math.random): string {
    const hex = [...Array(32)].map(() => Math.floor(random() * 16).toString(16));
    hex[12] = '4';
    hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * Paketten randevu — telefonun eksik bağı (1.0.1, 2026-10-16). Saf, React'siz.
 *
 * ── Kusur ───────────────────────────────────────────────────────────────────
 * Paket satılıyor (`treatment_plans`, tür `paket`), sonra telefondan randevu
 * veriliyordu — ama randevu pakete HİÇ bağlanmıyordu. Bitirince hak düşmedi
 * (`visit.finish` yalnız `custom_fields.paket_plan_id` taşıyan randevuda
 * düşürüyor) ve Kasa hizmeti tam fiyattan istedi. Telefon turunda: Pınar
 * Aksoy, 4 seanslık Aromaterapi Masajı 0/4 kaldı, seans ₺2.200 tahsil edildi.
 * Masaüstü bağı 078'den beri kuruyor (`BeautySessionModal`).
 *
 * ── Karar (kullanıcı, 2026-10-16) ───────────────────────────────────────────
 * Paket GÖRÜNÜR ama KENDİLİĞİNDEN SEÇİLMEZ: müşteri o gün başka bir işlem
 * için gelmiş olabilir, aldığı paketi kullanmak zorunda değil. Masaüstü ilk
 * paketi otomatik seçiyor; telefon bilerek seçmiyor.
 *
 * ── Satır masaüstüyle aynı ──────────────────────────────────────────────────
 * Hizmet = paketin adı, bağ `paket_plan_id` + `paket_seans` ("2/4"). Süre ve
 * renk paketin hizmetinden (ad eşleşmesi, masaüstünün `planService`i); yoksa
 * masaüstünün varsayılanı 60 dk.
 */

import { trLower, type ServiceOption } from './createFlow.ts';
import { DEFAULT_SERVICE_COLOR } from './createLive.ts';

/** Hakkı kalan, randevuya bağlanabilir paket. */
export interface OpenPlan {
    id: string;
    customerId: string;
    title: string;
    /** Toplam seans (en az 1). */
    total: number;
    /** Düşülmüş seans. */
    done: number;
}

/** Eşleşen hizmeti olmayan paketin süresi — masaüstünün varsayılanı. */
export const PLAN_MINUTES = 60;

/**
 * `treatment_plans` satırları → bağlanabilir paketler.
 *
 * Yalnız `active` (masaüstüyle aynı: teklif ve kapanmış plan randevuya
 * bağlanmaz) ve HAKKI KALAN. Adsız satır seçenek olamaz: randevunun hizmeti
 * paketin adı.
 */
export function openPlansOf(rows: readonly Record<string, unknown>[]): OpenPlan[] {
    const plans: OpenPlan[] = [];
    for (const row of rows) {
        if (row.status !== 'active') continue;
        const id = typeof row.id === 'string' ? row.id : '';
        const customerId = typeof row.customer_id === 'string' ? row.customer_id : '';
        const title = String(row.title ?? '').trim();
        if (!id || !customerId || !title) continue;
        const total = Math.max(1, Math.trunc(Number(row.session_count ?? 1)) || 1);
        const done = Math.max(0, Math.trunc(Number(row.sessions_done ?? 0)) || 0);
        if (done >= total) continue;
        plans.push({ id, customerId, title, total, done });
    }
    return plans;
}

/** Bu müşterinin paketleri. Yeni müşterinin (kimliksiz) paketi olamaz. */
export function plansFor(plans: readonly OpenPlan[], customerId: string | null | undefined): OpenPlan[] {
    return customerId ? plans.filter((plan) => plan.customerId === customerId) : [];
}

/**
 * Paketin hizmeti — önce birebir ad, sonra masaüstünün "biri ötekini
 * içeriyor" kuralı. Birebir önce: "Masaj" ve "Aromaterapi Masajı" ikisi
 * katalogdaysa "Aromaterapi Masajı" paketi kendi hizmetini bulmalı.
 */
export function planServiceOf(title: string, services: readonly ServiceOption[]): ServiceOption | null {
    const key = trLower(title.trim());
    if (!key) return null;
    const own = services.filter((service) => !service.plan);
    return own.find((service) => trLower(service.name.trim()) === key)
        ?? own.find((service) => {
            const name = trLower(service.name.trim());
            return Boolean(name) && (key.includes(name) || name.includes(key));
        })
        ?? null;
}

/**
 * Paket → hizmet seçeneği. Fiyat ₺0: seansın bedeli paketin satışında
 * alındı. Bağ `plan` alanında taşınıyor; randevu satırı onu `custom_fields`e
 * yazıyor (`createLive.insertRowOf`).
 */
export function planOption(plan: OpenPlan, services: readonly ServiceOption[]): ServiceOption {
    const own = planServiceOf(plan.title, services);
    return {
        id: `paket:${plan.id}`,
        name: plan.title,
        minutes: own?.minutes ?? PLAN_MINUTES,
        price: 0,
        color: own?.color || DEFAULT_SERVICE_COLOR,
        // Kapalı hizmet kararı paketin hizmetinin etiketleriyle verilir.
        tags: own?.tags ?? [],
        plan: {
            id: plan.id,
            customerId: plan.customerId,
            seans: `${plan.done + 1}/${plan.total}`,
            left: plan.total - plan.done,
        },
    };
}

/** "kalan 4 seans · ₺0" — masaüstünün paket satırıyla aynı söz. */
export function planMeta(service: ServiceOption): string {
    return service.plan ? `kalan ${service.plan.left} seans · ₺0` : '';
}

/**
 * Müşteri satırının ipucu: paketi olduğu SEÇMEDEN önce belli olsun.
 * "son 2 Ağu" → "son 2 Ağu · paketi var".
 */
export function packageHint(hint: string, count: number): string {
    if (count <= 0) return hint;
    const mark = count === 1 ? 'paketi var' : `${count} paketi var`;
    return hint ? `${hint} · ${mark}` : mark.charAt(0).toLocaleUpperCase('tr-TR') + mark.slice(1);
}

/**
 * Müşteri değişince seçili PAKET düşer: başkasının paketinden seans
 * yazılamaz. Normal hizmet kalır.
 */
export function keepServiceFor(service: ServiceOption | null, customerId: string | null): ServiceOption | null {
    if (!service?.plan) return service;
    return service.plan.customerId === customerId ? service : null;
}

/** Özet çubuğunun tutarı: paketten seans "₺0 · paket", fiyatsız hizmet çizgi. */
export function priceLabel(service: ServiceOption | null, format: (amount: number) => string): string {
    if (!service) return '—';
    if (service.plan) return `${format(0)} · paket`;
    return service.price === null ? '—' : format(service.price);
}

// Not: runtime import'u bilinçli olarak göreli ve .ts uzantılı — tests/*.test.mjs
// node'un tip sıyırma loader'ıyla çalışıyor ve '@/...' alias'ını çözemiyor.
import { reservationPrice } from '../utils/reservationServices.ts';
import type { Payment, Reservation, Service, Staff } from '@/types';

/**
 * Personel primi — tek kaynak.
 *
 * Prim TUTARI hiçbir yerde saklanmaz; personelin oranı (staff.commission_rate)
 * ile o personele düşen tahsilattan türetilir. Böylece bir tahsilat düzeltilince
 * ya da silinince prim kendiliğinden düzelir; ayrı bir "prim kaydı" tablosu iki
 * gerçeğin zamanla ayrışmasına yol açardı.
 *
 * Baz alınan tutar tahsil EDİLEN paradır (payments.amount), randevunun liste
 * fiyatı değil: indirim yapıldıysa prim de indirimli ciro üzerinden hesaplanır.
 *
 * ── Çoklu hizmetli ziyaret ────────────────────────────────────────────────────
 * Kesim A'da, boya B'de olan bir ziyaret kasada TEK hesaptır ve tek tahsilat
 * yazılır; bu tahsilatta staff_id boş kalır (hangi kuaförün olduğu belirsizdir).
 * Prim bu yüzden ödemeyi ziyaretin satırlarına, her satırın kendi ücreti
 * oranında dağıtır. İndirim varsa dağıtım tahsil edilen tutar üzerinden
 * yapıldığı için indirim de kuaförler arasında orantılı paylaşılır.
 */
export interface CommissionSummary {
    /** Personele düşen tahsilat toplamı (dönem içinde). */
    revenue: number;
    /** revenue × oran. Oran 0 ise 0. */
    commission: number;
    /** Yüzde (0–100). */
    rate: number;
    /** Personele pay düşen tahsilat adedi. */
    count: number;
}

export interface CommissionContext {
    payments: Payment[];
    /** Çoklu hizmetli ziyaretin satırlara dağıtımı için. Yoksa dağıtım yapılmaz. */
    reservations?: Reservation[];
    /** Satır ücretleri katalogdan çözülürken kullanılır. */
    services?: Service[];
    range?: { from?: string; to?: string };
}

const EMPTY: CommissionSummary = { revenue: 0, commission: 0, rate: 0, count: 0 };

/** paidAt ISO damgasından YYYY-MM-DD. */
const dayOf = (payment: Payment) => String(payment.paidAt || payment.createdAt || '').slice(0, 10);

const clampRate = (rate?: number) => Math.max(0, Math.min(100, rate ?? 0));

/**
 * Bir tahsilatın personellere dağılımı: [staffId, tutar] çiftleri.
 *
 * Öncelik sırası:
 *  1. Tahsilat zaten bir personele bağlıysa (payments.staff_id) tamamı onundur.
 *  2. Randevuya bağlıysa, o ziyaretin satırları ücretleri oranında paylaşır.
 *  3. Hiçbiri yoksa dağıtılamaz — genel kasa hareketi sayılır, prime girmez.
 */
function shareOf(
    payment: Payment,
    reservations: Reservation[],
    services: Service[],
): [string, number][] {
    if (payment.staffId) return [[payment.staffId, payment.amount]];
    if (!payment.reservationId || reservations.length === 0) return [];

    const anchor = reservations.find((item) => item.id === payment.reservationId);
    if (!anchor) return [];
    const members = anchor.groupId
        ? reservations.filter((item) => item.groupId === anchor.groupId && item.status !== 'cancelled')
        : [anchor];

    const weighted = members
        .filter((member) => Boolean(member.staffId))
        .map((member) => ({ staffId: member.staffId as string, weight: reservationPrice(member, services) }));
    if (weighted.length === 0) return [];

    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    // Ücretler tanımsızsa (0) eşit böl — kaybolan pay bırakmamak için.
    if (total <= 0) {
        const equal = payment.amount / weighted.length;
        return weighted.map((item) => [item.staffId, equal]);
    }
    return weighted.map((item) => [item.staffId, (payment.amount * item.weight) / total]);
}

export function commissionFor(
    member: Pick<Staff, 'id' | 'commissionRate'>,
    context: CommissionContext,
): CommissionSummary {
    const rate = clampRate(member.commissionRate);
    const { payments, reservations = [], services = [], range } = context;

    let revenue = 0;
    let count = 0;
    for (const payment of payments) {
        const day = dayOf(payment);
        if (range?.from && day < range.from) continue;
        if (range?.to && day > range.to) continue;
        for (const [staffId, amount] of shareOf(payment, reservations, services)) {
            if (staffId !== member.id || amount <= 0) continue;
            revenue += amount;
            count += 1;
        }
    }
    if (count === 0) return { ...EMPTY, rate };
    const rounded = Math.round(revenue);
    return { revenue: rounded, commission: Math.round((rounded * rate) / 100), rate, count };
}

/** İçinde bulunulan ayın [ilk, son] günü — prim dönemi takvim ayıdır. */
export function monthRange(reference = new Date()): { from: string; to: string; label: string } {
    const year = reference.getFullYear();
    const month = reference.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const last = new Date(year, month + 1, 0).getDate();
    return {
        from: `${year}-${pad(month + 1)}-01`,
        to: `${year}-${pad(month + 1)}-${pad(last)}`,
        label: reference.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
    };
}

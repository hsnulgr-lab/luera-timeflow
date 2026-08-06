// Kârlılık — hizmet bazlı brüt kâr ve uzman verimliliği (TEK KAYNAK).
//
// Neden bu ikisi: salon sahibinin demo'da ilk sorduğu soru "hangi uzman ne
// kazandırıyor" ve "hangi işlem bana ne bırakıyor". İkisi de GİDER DEFTERİ
// İSTEMEZ — tahsilat (payments) ve reçete (serviceRecipe + products.cost)
// bugün zaten var. Kira/maaş dahil gerçek net kâr ayrı bir iş ve gider verisi
// her gün elle girilmedikçe yanlış rakam gösterir; o yüzden burada yalnız
// BRÜT kâr hesaplanıyor ve arayüzde de öyle adlandırılıyor.
//
// Göreli + uzantılı import: bu modül node ile doğrudan test edilir.
import { reservationServiceLines } from '../utils/reservationServices.ts';
import { recipeFor, usageFor } from './serviceRecipe.ts';
import type { Payment, Product, Reservation, Service, Staff } from '@/types';

export interface ProfitRange {
    /** YYYY-MM-DD, dahil. */
    from: string;
    /** YYYY-MM-DD, dahil. */
    to: string;
}

export interface ProfitContext {
    payments: Payment[];
    reservations: Reservation[];
    services: Service[];
    products: Product[];
    staff: Pick<Staff, 'id' | 'name'>[];
    range: ProfitRange;
}

export interface ServiceProfit {
    name: string;
    /** Dönem içinde bu hizmetin geçtiği seans adedi. */
    count: number;
    /** Tahsil EDİLEN tutardan bu hizmete düşen pay. */
    revenue: number;
    /** Reçeteden gelen sarf maliyeti. */
    cost: number;
    gross: number;
    /** Brüt kâr marjı (%). Ciro 0 ise 0. */
    margin: number;
}

export interface StaffProductivity {
    staffId: string;
    name: string;
    revenue: number;
    /** Dönemde dolu geçen dakika (randevu blokları). */
    minutes: number;
    /** Dolu saat başına ciro. Dakika 0 ise 0. */
    perHour: number;
    visits: number;
}

const dayOf = (p: Payment) => String(p.paidAt || p.createdAt || '').slice(0, 10);
const inRange = (day: string, r: ProfitRange) => Boolean(day) && day >= r.from && day <= r.to;

/** Randevu bloğunun dakikası; saatler okunamazsa hizmet sürelerine düşer. */
function minutesOf(r: Reservation, services: Service[]): number {
    const toMin = (t?: string) => {
        const [h, m] = String(t || '').split(':').map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
    };
    const start = toMin(r.startTime);
    const end = toMin(r.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
    const fromLines = reservationServiceLines(r, services).reduce((s, l) => s + (l.duration || 0), 0);
    return fromLines > 0 ? fromLines : 0;
}

interface LineShare {
    reservation: Reservation;
    name: string;
    /** Bu satıra düşen tahsilat. */
    amount: number;
    /** Satırın katalog ücreti — maliyet dağıtımında ağırlık olarak da kullanılır. */
    weight: number;
}

/**
 * Tahsilatları HİZMET SATIRLARINA dağıtır.
 *
 * Baz alınan tutar tahsil edilen paradır, liste fiyatı değil — indirim varsa
 * kâr da indirimli ciro üzerinden çıkar (staffCommission ile aynı ilke).
 *
 * Çoklu hizmetli ziyaret kasada TEK hesaptır: "Kesim + Boya" tek tahsilat
 * yazar. Satır ücretleri oranında bölünür; ücretler tanımsızsa (hepsi 0) eşit
 * bölünür — kaybolan pay bırakmamak için.
 *
 * Randevuya bağlı OLMAYAN tahsilat (ürün satışı, elden kapora, serbest
 * tahsilat) hiçbir hizmete yazılamaz ve bilinçli olarak dışarıda kalır:
 * uydurma bir hizmete yazmak raporu kirletirdi.
 */
function allocate(ctx: ProfitContext): LineShare[] {
    const { payments, reservations, services, range } = ctx;
    const byId = new Map(reservations.map((r) => [r.id, r]));
    const out: LineShare[] = [];

    for (const payment of payments) {
        if (!inRange(dayOf(payment), range)) continue;
        if (!payment.reservationId) continue;
        const anchor = byId.get(payment.reservationId);
        if (!anchor) continue;

        const members = anchor.groupId
            ? reservations.filter((r) => r.groupId === anchor.groupId && r.status !== 'cancelled')
            : [anchor];

        const lines: { reservation: Reservation; name: string; weight: number }[] = [];
        for (const member of members) {
            for (const line of reservationServiceLines(member, services)) {
                lines.push({ reservation: member, name: line.name, weight: line.price || 0 });
            }
        }
        if (lines.length === 0) continue;

        const total = lines.reduce((s, l) => s + l.weight, 0);
        for (const line of lines) {
            const amount = total > 0
                ? (payment.amount * line.weight) / total
                : payment.amount / lines.length;
            out.push({ ...line, amount });
        }
    }
    return out;
}

/**
 * Bir randevunun sarf maliyeti, hizmet satırlarına dağıtılmış hâli.
 *
 * Tek hizmetli seansta `usageFor` kullanılır: randevuya yazılmış miktar
 * düzeltmelerini de sayar (uzun saç gerçekten fazla boya yazar). Çoklu
 * hizmetli seansta düzeltmeler hangi hizmete ait olduğunu söylemediği için
 * katalog reçetesine düşülür — düzeltmeyi rastgele bir satıra yazmak yanlış
 * hizmeti zararlı gösterirdi.
 */
function costOf(r: Reservation, lineName: string, single: boolean, ctx: ProfitContext): number {
    const { services, products } = ctx;
    const lines = single
        ? usageFor(r, services, products)
        : recipeFor(lineName, services, products);
    let sum = 0;
    for (const line of lines) {
        const product = products.find((p) => p.id === line.productId);
        sum += (product?.cost ?? 0) * line.quantity;
    }
    return sum;
}

/** Hizmet bazlı brüt kâr — ciroya göre azalan. */
export function serviceProfitability(ctx: ProfitContext): ServiceProfit[] {
    const shares = allocate(ctx);
    const acc = new Map<string, { count: number; revenue: number; cost: number; seen: Set<string> }>();

    for (const share of shares) {
        const row = acc.get(share.name)
            || { count: 0, revenue: 0, cost: 0, seen: new Set<string>() };
        row.revenue += share.amount;

        // Bir randevu aynı hizmet için birden fazla tahsilat almış olabilir
        // (parçalı ödeme). Adet ve maliyet randevu başına BİR kez sayılmalı.
        const key = `${share.reservation.id}|${share.name}`;
        if (!row.seen.has(key)) {
            row.seen.add(key);
            row.count += 1;
            const single = reservationServiceLines(share.reservation, ctx.services).length === 1;
            row.cost += costOf(share.reservation, share.name, single, ctx);
        }
        acc.set(share.name, row);
    }

    return Array.from(acc.entries())
        .map(([name, r]) => {
            const revenue = Math.round(r.revenue);
            const cost = Math.round(r.cost);
            const gross = revenue - cost;
            return {
                name,
                count: r.count,
                revenue,
                cost,
                gross,
                margin: revenue > 0 ? Math.round((gross / revenue) * 100) : 0,
            };
        })
        .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Uzman verimliliği — dolu saat başına ciro.
 *
 * "Kim çok ciro yaptı" yanıltıcıdır: tam gün çalışan doğal olarak öndedir.
 * Asıl soru saatinin ne kazandırdığı. Dakika, İPTAL EDİLMEMİŞ randevu
 * bloklarından gelir; boş saat sayılmaz — salonun doluluğu ayrı bir ölçüdür,
 * uzmanın verimliliği değil.
 *
 * Doğrudan personele bağlı tahsilatlar (payments.staff_id) da ciroya girer:
 * randevusuz satış yapan uzman görünmez kalmamalı.
 */
export function staffProductivity(ctx: ProfitContext): StaffProductivity[] {
    const { payments, reservations, services, staff, range } = ctx;
    const revenue = new Map<string, number>();
    const add = (id: string | undefined, amount: number) => {
        if (!id || amount <= 0) return;
        revenue.set(id, (revenue.get(id) || 0) + amount);
    };

    // Randevuya bağlı tahsilatlar satır ağırlığıyla, satırın uzmanına.
    for (const share of allocate(ctx)) add(share.reservation.staffId, share.amount);
    // Doğrudan personele yazılmış tahsilatlar (randevusuz satış) olduğu gibi.
    for (const payment of payments) {
        if (!inRange(dayOf(payment), range)) continue;
        if (payment.reservationId || !payment.staffId) continue;
        add(payment.staffId, payment.amount);
    }

    const minutes = new Map<string, number>();
    const visits = new Map<string, number>();
    for (const r of reservations) {
        if (!r.staffId || r.status === 'cancelled') continue;
        if (!inRange(r.date, range)) continue;
        minutes.set(r.staffId, (minutes.get(r.staffId) || 0) + minutesOf(r, services));
        visits.set(r.staffId, (visits.get(r.staffId) || 0) + 1);
    }

    return staff
        .map((member) => {
            const rev = Math.round(revenue.get(member.id) || 0);
            const min = minutes.get(member.id) || 0;
            return {
                staffId: member.id,
                name: member.name,
                revenue: rev,
                minutes: min,
                perHour: min > 0 ? Math.round(rev / (min / 60)) : 0,
                visits: visits.get(member.id) || 0,
            };
        })
        .filter((row) => row.revenue > 0 || row.minutes > 0)
        .sort((a, b) => b.perHour - a.perHour);
}

/** Son N günün aralığı (bugün dahil). */
export function lastDaysRange(days: number, reference = new Date()): ProfitRange {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start = new Date(reference);
    start.setDate(start.getDate() - (days - 1));
    return { from: iso(start), to: iso(reference) };
}

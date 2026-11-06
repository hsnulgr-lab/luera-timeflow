// Müşteri kartı — asistanın yazan müşteriyi "tanıması".
//
// Kullanıcı isteği (2026-11-06): asistan müşteriyi numarasından tanısın;
// geçmiş ziyaretlerini, en sık aldığı hizmeti, tercih ettiği uzmanı ve
// paketini sorulmadan bilsin ("her zamanki gibi Zeynep Hanım'la mı?").
// Kart her turun BAĞLAM'ına yazılır; müşteri görmez. Telefon ve kişisel not
// YOK: modelin işi için gerekmiyor (KVKK).
//
// Saf modül: veritabanı yok, Deno yok. tests/wa-agent.test.mjs doğrudan import eder.

import { formatDateTr } from '../booking/slots.ts';

export interface PastVisit {
    date: string;
    start_time: string;
    service: string;
    staff_id: string | null;
}

export interface CustomerCard {
    visits: number;
    first: string | null;
    last: { date: string; service: string; staff: string | null } | null;
    topService: { name: string; count: number } | null;
    topStaff: { name: string; count: number } | null;
    /** En sık gelinen gün; tek bir gün öne çıkmıyorsa null. */
    usualDay: string | null;
    /** En sık başlangıç saati (yarım saate yuvarlı); öne çıkmıyorsa null. */
    usualTime: string | null;
}

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** En sık değer; eşitlikte en yeni (listede önce gelen). Azınlıksa null. */
function mode<T>(items: T[], minShare = 0): { value: T; count: number } | null {
    const counts = new Map<T, number>();
    for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
    let best: { value: T; count: number } | null = null;
    for (const x of items) {
        const c = counts.get(x)!;
        if (!best || c > best.count) best = { value: x, count: c };
    }
    if (!best || best.count < 2 || best.count / items.length < minShare) return null;
    return best;
}

/**
 * Geçmiş ziyaretlerden kart. `visits` yeniden eskiye sıralı gelir. Tercih
 * (gün, saat) ancak tekrar ediyorsa yazılır: iki ziyaretten "genelde Cuma"
 * demek modelin uydurmasına kapı açar.
 */
export function buildCustomerCard(
    visits: PastVisit[],
    staffName: Map<string, string>,
): CustomerCard {
    const staffOf = (v: PastVisit) => (v.staff_id ? staffName.get(v.staff_id) ?? null : null);
    const last = visits[0];
    const svc = mode(visits.map((v) => v.service.trim()).filter(Boolean));
    const st = mode(visits.map(staffOf).filter((n): n is string => Boolean(n)));
    const day = mode(visits.map((v) => DAYS[new Date(`${v.date}T12:00:00Z`).getUTCDay()]), 0.4);
    const time = mode(visits.map((v) => {
        const [h, m] = String(v.start_time).slice(0, 5).split(':').map(Number);
        const half = m < 15 ? '00' : m < 45 ? '30' : '00';
        return `${String(m >= 45 ? h + 1 : h).padStart(2, '0')}:${half}`;
    }), 0.4);
    return {
        visits: visits.length,
        first: visits.length ? visits[visits.length - 1].date : null,
        last: last ? { date: last.date, service: last.service, staff: staffOf(last) } : null,
        topService: svc ? { name: svc.value, count: svc.count } : null,
        topStaff: st ? { name: st.value, count: st.count } : null,
        usualDay: day?.value ?? null,
        usualTime: time?.value ?? null,
    };
}

export interface CardExtras {
    packages: { title: string; available: number; total: number }[];
    balanceText: string | null;
    overpaidText: string | null;
}

/** BAĞLAM satırları. Ziyaret yoksa yalnız "ilk ziyareti olacak". */
export function cardLines(c: CustomerCard, x: CardExtras | null): string[] {
    const lines: string[] = [];
    if (c.visits === 0) {
        lines.push('Geçmiş ziyaret: yok (ilk kez gelecek).');
    } else {
        lines.push(`Geçmiş ziyaret: ${c.visits}${c.first ? ` · ilk ${formatDateTr(c.first)}` : ''}`);
        if (c.last) {
            const who = c.last.staff ? ` · ${c.last.staff}` : '';
            lines.push(`Son ziyaret: ${formatDateTr(c.last.date)} · ${c.last.service}${who}`);
        }
        const pref = [
            c.topService ? `en sık hizmet: ${c.topService.name} (${c.topService.count})` : null,
            c.topStaff ? `en sık uzman: ${c.topStaff.name} (${c.topStaff.count})` : null,
            c.usualDay || c.usualTime ? `genelde ${[c.usualDay, c.usualTime].filter(Boolean).join(' ')}` : null,
        ].filter(Boolean);
        if (pref.length) lines.push(`Tercih: ${pref.join(' · ')}`);
    }
    if (x) {
        const pk = x.packages.filter((p) => p.total > 1);
        lines.push(pk.length
            ? `Paket: ${pk.map((p) => `${p.title} · ${p.available}/${p.total} seans kullanılabilir`).join('; ')}`
            : 'Paket: yok');
        lines.push(x.balanceText
            ? `Bakiye: ${x.balanceText} borç`
            : x.overpaidText ? `Bakiye: ${x.overpaidText} alacak` : 'Bakiye: borç yok');
    }
    return lines;
}

import type { Reservation } from '@/types';

/**
 * Salon kasasının tahsilat birimi.
 *
 * Tek hizmetli bir randevu bir ticket'tır. Aynı `groupId` ile oluşturulan
 * çoklu hizmetler ise kasada tek hesap olarak görünür; böylece aynı ziyaret
 * iki kez tahsil edilmez.
 */
export interface SalonCashTicket {
    key: string;
    representative: Reservation;
    members: Reservation[];
    reservationIds: string[];
    serviceSummary: string;
    staffNames: string[];
    isPaid: boolean;
    endedAt: string;
}

const chronological = (a: Reservation, b: Reservation) =>
    `${a.date}|${a.startTime}|${a.id}`.localeCompare(`${b.date}|${b.startTime}|${b.id}`);

/**
 * İptal edilmemiş grup üyelerini birleştirir. Bir grup ancak bütün hizmetleri
 * tamamlandığında kasaya açılır; ilk hizmet biter bitmez eksik hesap alınmaz.
 */
export function buildSalonCashTickets(reservations: Reservation[]): SalonCashTicket[] {
    const groups = new Map<string, Reservation[]>();

    for (const reservation of reservations) {
        if (reservation.status === 'cancelled') continue;
        const key = reservation.groupId
            ? `group:${reservation.groupId}`
            : `reservation:${reservation.id}`;
        const members = groups.get(key) || [];
        members.push(reservation);
        groups.set(key, members);
    }

    const tickets: SalonCashTicket[] = [];
    for (const [key, rawMembers] of groups) {
        const members = [...rawMembers].sort(chronological);
        if (members.length === 0 || members.some((member) => member.status !== 'completed')) continue;

        const representative = members[0];
        tickets.push({
            key,
            representative,
            members,
            reservationIds: members.map((member) => member.id),
            serviceSummary: members.map((member) => member.service).filter(Boolean).join(' + '),
            staffNames: [...new Set(members.map((member) => member.staffName).filter(Boolean) as string[])],
            isPaid: members.every((member) => Boolean(member.isPaid)),
            endedAt: members.reduce(
                (latest, member) => (member.serviceEndedAt || '') > latest ? (member.serviceEndedAt || '') : latest,
                '',
            ),
        });
    }

    return tickets.sort((a, b) => chronological(a.representative, b.representative));
}

export function ticketContaining(
    tickets: SalonCashTicket[],
    reservationId?: string | null,
): SalonCashTicket | undefined {
    if (!reservationId) return undefined;
    return tickets.find((ticket) => ticket.reservationIds.includes(reservationId));
}

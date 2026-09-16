/**
 * Kadronun O ANKİ hâli — şeridin ve personel günü ekranının kaynağı. Saf.
 *
 * `mockDay.presence` altı uydurma isim taşıyordu ve durumları elle yazılmıştı.
 * Burada aynı şekil veriden türüyor.
 *
 * ── "now" neden PARAMETRE ───────────────────────────────────────────────────
 * `Date.now()` burada çağrılsaydı iki şey bozulurdu: çizim sırasında saat
 * okumak saflık kuralını deler (`react-hooks/purity`), ve daha önemlisi
 * TELEFONUN saati kullanılırdı. Yanlış ayarlı bir telefon, işlemi kırk dakika
 * sürüyormuş gibi gösterir. Saat sunucudan geliyor (`fetchServerNow`) ve
 * buraya dışarıdan iniyor.
 */

import type { CrewMember } from './managerMap.ts';
import type { StaffPresence, StaffState } from './managerFlow.ts';
import { initialsOf } from './text.ts';
import { ownDayStamp } from './dayStamp.ts';

/**
 * Personel ŞU AN bir işlemin içinde mi, ve ne zamandır?
 *
 * Ölçüt `arrived_at` — hizmetin BAŞLADIĞI an, personelin bastığı damga.
 * `customer_arrived_at` ile karıştırılmamalı: o, müşterinin salona girdiği an
 * ve müdür basar (`043_customer_arrived.sql`).
 */
/** Presence'ın randevudan okuduğu alanlar — akış satırı da takvim satırı da bunları taşıyor. */
export interface PresenceRow {
    staff_id?: string | null;
    /** Metin: veritabanı satırı da takvim randevusu da buraya düşüyor. */
    status: string;
    arrived_at: string | null;
    service_ended_at: string | null;
}

function busySince(rows: readonly PresenceRow[], staffId: string, dateISO: string): number | null {
    let earliest: number | null = null;
    for (const row of rows) {
        if (row.staff_id !== staffId) continue;
        if (row.status === 'cancelled') continue;
        // Başka bir güne ait "başladı" damgası bugün personeli meşgul
        // göstermiyor — akışla AYNI kural (`ownDayStamp`). Yoksa şerit
        // "1143 saattir işlemde" derdi.
        const started = ownDayStamp(row.arrived_at, dateISO);
        if (!started || row.service_ended_at) continue;
        const at = Date.parse(started);
        if (!Number.isFinite(at)) continue;
        // Aynı anda iki işlem açık kalmışsa EN ESKİSİ sayılıyor: personel
        // gerçekten o kadardır ayakta.
        if (earliest === null || at < earliest) earliest = at;
    }
    return earliest;
}

/**
 * Hâl kararı.
 *
 * ── "çalışmıyor" NEDEN YOK ──────────────────────────────────────────────────
 * O hâl personelin kendi çalışma saatlerinden (`staff.working_hours`) türüyor
 * ve o okuma henüz açılmadı (ayarlar adımı). Bilinmeyeni "çalışmıyor" saymak,
 * o gün çalışan birini ekranda kapalı göstermek olurdu — izinli olmayan birini
 * yanlışlıkla seçilemez yapmak, tersinden daha pahalı.
 *
 * `off` tipte DURUYOR, çünkü ekranlar onu zaten çiziyor; yalnız bu türetme
 * henüz üretmiyor.
 */
function stateOf(onLeave: boolean, busy: boolean): StaffState {
    if (onLeave) return 'leave';
    return busy ? 'busy' : 'free';
}

export function presenceOf(
    crew: readonly CrewMember[],
    rows: readonly PresenceRow[],
    leave: ReadonlyMap<string, readonly string[]>,
    dateISO: string,
    nowMs: number,
): StaffPresence[] {
    return crew.map((person) => {
        const days = leave.get(person.id) ?? [];
        const onLeave = days.includes(dateISO);
        const since = onLeave ? null : busySince(rows, person.id, dateISO);
        const busy = since !== null;
        return {
            id: person.id,
            initials: initialsOf(person.name),
            name: person.name,
            state: stateOf(onLeave, busy),
            // Dakika YALNIZ meşgulken anlamlı. Geçmiş bir damga negatif
            // çıkarsa sıfıra çekiliyor: "-3 dakikadır işlemde" diye bir şey yok.
            ...(since !== null ? { minutes: Math.max(0, Math.floor((nowMs - since) / 60_000)) } : {}),
            phone: person.phone,
            // İzin günleri HAM veriyle taşınıyor; dönüş tarihini `returnDateISO`
            // ardışıklıktan türetiyor. Boşsa alan hiç konmuyor — boş dizi
            // "izni yok" ile "bilmiyoruz"u aynı şeye indirirdi.
            ...(days.length > 0 ? { leaveDates: days } : {}),
        };
    });
}


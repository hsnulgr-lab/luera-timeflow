// "Takvime ekle" — telefonun takvimine eklenen .ics dosyası (2026-10-30).
// Müşteri sayfaları (online randevu onayı, randevu yönetimi) kullanır; sunucu
// gerekmez, randevunun gün/saat bilgisi sayfada zaten var.
//
// Saatler UTC'ye çevrilerek yazılır: Türkiye 2016'dan beri yıl boyu UTC+3
// (yaz saati yok). TZID + VTIMEZONE yazmaktan daha sağlam; her takvim okur.

export interface IcsEvent {
    title: string;
    /** YYYY-MM-DD (Türkiye günü) */
    date: string;
    /** HH:MM (Türkiye saati) */
    start: string;
    end: string;
    location?: string | null;
    description?: string | null;
}

const TR_OFFSET_H = 3;

/** "2026-10-31" + "12:00" → "20261031T090000Z" */
export function icsUtc(date: string, hhmm: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = hhmm.split(':').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d, h - TR_OFFSET_H, mi || 0));
    return t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Bir ya da daha çok randevunun takvim dosyası (metin). */
export function icsText(events: IcsEvent[], now = new Date()): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Luera//TimeFlow//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    events.forEach((e, i) => {
        lines.push(
            'BEGIN:VEVENT',
            `UID:${e.date}-${e.start.replace(':', '')}-${i}@timeflow.lueratech.com`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${icsUtc(e.date, e.start)}`,
            `DTEND:${icsUtc(e.date, e.end)}`,
            `SUMMARY:${esc(e.title)}`,
            ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
            ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
            // Bir saat önce telefonda hatırlatma (salonun WhatsApp hatırlatmasından bağımsız)
            'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM',
            'END:VEVENT',
        );
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

/** <a href download> için veri adresi — iPhone'da "Takvime ekle" önerisi açılır. */
export function icsHref(events: IcsEvent[]): string {
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText(events))}`;
}

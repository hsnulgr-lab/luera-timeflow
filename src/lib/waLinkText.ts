// WhatsApp hattının durum cümleleri — masaüstü (Ayarlar → WhatsApp v2).
//
// Telefonun `mobile/src/lib/waLink.ts` dosyasındaki cümlelerin AYNISI: iki
// taraf aynı hatayı aynı kelimelerle söylesin. Mobil, `src/`ten import
// edemediği için iki kopya duruyor; tests/wa-ayarlar-v2.test.mjs çıktıların
// birebir aynı olduğunu kilitler. Birini değiştirirken ötekini de değiştir.

export type FailureKind = 'invalid_phone' | 'not_connected' | 'session' | 'busy' | 'network' | 'other';

export interface LastFailure { kind: FailureKind; at: string; message: string | null }

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
const MONTH_ABL = ['tan', 'tan', 'tan', 'dan', 'tan', 'dan', 'dan', 'tan', 'den', 'den', 'dan', 'tan'] as const;
const ONES_ABL = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'] as const;
const TENS_ABL = ['', 'dan', 'den', 'dan', 'dan', 'den', 'dan', 'den', 'den', 'dan'] as const;

function yearAbl(y: number): string {
    return y % 10 ? ONES_ABL[y % 10] : TENS_ABL[Math.floor(y / 10) % 10] || 'den';
}

/** "29 Ekim'den beri" · "Bugünden beri" · başka yılsa yıl da yazılır. Numara yazılmaz. */
export function sinceLabel(connectedAtISO: string, now: Date = new Date()): string {
    const d = new Date(connectedAtISO);
    if (Number.isNaN(d.getTime())) return 'Hat çalışıyor';
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
        return 'Bugünden beri';
    }
    const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    if (d.getFullYear() !== now.getFullYear()) {
        return `${day} ${d.getFullYear()}'${yearAbl(d.getFullYear())} beri`;
    }
    return `${day}'${MONTH_ABL[d.getMonth()]} beri`;
}

function messageNoun(kind: string | null): string {
    if (!kind) return 'bir mesaj';
    if (kind.startsWith('reminder')) return 'bir hatırlatma';
    if (kind === 'confirmation') return 'bir randevu onayı';
    if (kind === 'cancellation') return 'bir iptal haberi';
    if (kind === 'agent' || kind === 'ai_reply' || kind === 'bot') return 'asistanın bir cevabı';
    return 'bir mesaj';
}

function hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Son hata · bugün 10:12." + "Numarası geçersiz olduğu için bir hatırlatma gitmedi." */
export function failureLine(f: LastFailure, now: Date = new Date()): { title: string; body: string } {
    const at = new Date(f.at);
    const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
    const title = Number.isNaN(at.getTime()) ? 'Son hata.' : `Son hata · ${sameDay ? 'bugün' : 'dün'} ${hhmm(at)}.`;
    const what = messageNoun(f.message);
    const body = (() => {
        switch (f.kind) {
            case 'invalid_phone': return `Numarası geçersiz olduğu için ${what} gitmedi.`;
            case 'not_connected':
            case 'session': return `Bağlantı olmadığı için ${what} gitmedi.`;
            case 'busy': return `WhatsApp o an cevap vermediği için ${what} gitmedi.`;
            case 'network': return `Sunucuya ulaşılamadığı için ${what} gitmedi.`;
            case 'other': return `${what[0].toLocaleUpperCase('tr-TR')}${what.slice(1)} gönderilemedi.`;
        }
    })();
    return { title, body };
}

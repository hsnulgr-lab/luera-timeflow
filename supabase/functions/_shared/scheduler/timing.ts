// Zamanlayıcının gönderim anı kararları — saf, testli.
//
// Plan veritabanında yapılır (131 · wa_plan_reservation): iş "ne zaman"
// gönderilmeli. Burada gönderim ANINDA son karar verilir: hâlâ anlamlı mı,
// saat uygun mu? Gece 03:00'te zamanı gelen 24 saat hatırlatması o an
// gitmez, sabah 09:00'a kayar; randevuya 3 saatten az kaldıysa hiç gitmez.
//
// Saf modül: tests/wa-scheduler.test.mjs doğrudan import eder.

export type JobKind = 'reminder_24h' | 'reminder_2h' | 'nudge' | 'satisfaction' | 'slot_offer' | 'rebook';

export type SendDecision =
    | { action: 'send' }
    | { action: 'postpone'; dueMs: number }
    | { action: 'skip'; reason: 'too_late' | 'quiet_until_deadline' };

/** Türkiye 2016'dan beri yaz saati uygulamıyor: UTC+3 sabit. */
const TR_OFFSET_MS = 3 * 3600_000;

/** İstanbul'da günün dakikası. */
export function istanbulMinute(ms: number): number {
    const d = new Date(ms + TR_OFFSET_MS);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** İstanbul saatiyle bir sonraki hh:00 anı (bugün geçtiyse yarın). */
export function nextIstanbulHour(ms: number, hour: number): number {
    const local = new Date(ms + TR_OFFSET_MS);
    const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - TR_OFFSET_MS;
    return target > ms ? target : target + 86_400_000;
}

/** İstanbul'da bugünün tarihi (YYYY-MM-DD). */
export function todayIstanbul(nowMs = Date.now()): string {
    return new Date(nowMs + TR_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-10-31" + "12:00" → İstanbul saatiyle o an (ms). */
export function istanbulMs(date: string, time: string): number {
    return Date.parse(`${date}T${String(time).slice(0, 5)}:00+03:00`);
}

interface Window {
    /** Gönderilebilir saat aralığı (İstanbul, dakika). */
    from: number;
    to: number;
    /** Bu andan sonra gitmenin anlamı yok. */
    deadline: (startMs: number, endMs: number) => number;
}

const H = 3600_000;

// İşletme adına mesaj 09–21 arası. 2 saat hatırlatması randevuya bağlı:
// sabah 07'den önce gitmez (08:00 randevusuna 06:00'da mesaj atılmaz).
// Sıradaki randevu daveti acil değil: akşam kapanan hesabın daveti ertesi
// sabah 10:00'a kayar, iki günden eski ziyarete hiç gitmez.
const WINDOWS: Record<JobKind, Window> = {
    reminder_24h: { from: 9 * 60, to: 21 * 60, deadline: (s) => s - 3 * H },
    nudge: { from: 9 * 60, to: 21 * 60, deadline: (s) => s - 3 * H },
    reminder_2h: { from: 7 * 60, to: 22 * 60, deadline: (s) => s - 30 * 60_000 },
    satisfaction: { from: 9 * 60, to: 21 * 60, deadline: (_s, e) => e + 26 * H },
    slot_offer: { from: 9 * 60, to: 21 * 60, deadline: (s) => s - 1 * H },
    rebook: { from: 10 * 60, to: 21 * 60, deadline: (_s, e) => e + 48 * H },
};

export function sendDecision(kind: JobKind, nowMs: number, startMs: number, endMs: number): SendDecision {
    const w = WINDOWS[kind];
    const deadline = w.deadline(startMs, endMs);
    if (nowMs > deadline) return { action: 'skip', reason: 'too_late' };
    const minute = istanbulMinute(nowMs);
    if (minute >= w.from && minute < w.to) return { action: 'send' };
    const next = nextIstanbulHour(nowMs, Math.floor(w.from / 60));
    return next <= deadline ? { action: 'postpone', dueMs: next } : { action: 'skip', reason: 'quiet_until_deadline' };
}

/**
 * 24 saat hatırlatması gittikten sonra dürtmenin zamanı: 4 saat sonra. Saat
 * 21'i geçiyorsa ya da randevuya 3 saatten az kalıyorsa dürtme yok — gece
 * dürtmek ya da randevudan hemen önce "gelecek misiniz" diye sormak anlamsız.
 */
export function nudgeDueMs(sentMs: number, startMs: number): number | null {
    const due = sentMs + 4 * H;
    if (due > startMs - 3 * H) return null;
    const minute = istanbulMinute(due);
    if (minute < 9 * 60 || minute >= 21 * 60) return null;
    return due;
}

/** Bekleme listesi teklifinin geçerlilik süresi. */
export const OFFER_TTL_MIN = 30;

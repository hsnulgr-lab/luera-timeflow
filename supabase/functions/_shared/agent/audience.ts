// Kimlere cevap verilir? (139 · kişisel numara riski)
//
// Hat çoğu küçük işletmede sahibinin KİŞİSEL WhatsApp'ı. Asistan açıkken bot
// arkadaşa, aileye, tedarikçiye de cevap veriyordu (06.11'de bizim hatta
// yaşandı). İşletme Ayarlar → WhatsApp'tan seçer (agent_config.answer_mode):
//
//   customers_and_new (varsayılan, kullanıcı kararı 2026-11-08)
//       Kayıtlı müşteriye ve bu hatta İLK KEZ yazan numaraya cevap verir.
//       Daha önce yazışılmış ama müşteri olmayan numaraya susar.
//   customers_only
//       Yalnız müşteri listesindeki numaralara.
//   everyone
//       Herkese — hat yalnız işletmeye aitse.
//
// Bu yalnız "cevap verilsin mi" kararıdır: cevabın içeriğine, asistanın
// konuşmasına dokunmaz (tests/wa-asistan-kilidi). Saf modül: veritabanı yok,
// ağ yok; tests/wa-coklu-isletme.test.mjs doğrudan import eder.

import { normalizePhone } from '../phone.ts';

export const ANSWER_MODES = ['customers_and_new', 'customers_only', 'everyone'] as const;
export type AnswerMode = typeof ANSWER_MODES[number];
export const DEFAULT_ANSWER_MODE: AnswerMode = 'customers_and_new';

/** Ayardaki değer bilinmiyorsa varsayılan. */
export function answerMode(raw: unknown): AnswerMode {
    return (ANSWER_MODES as readonly string[]).includes(String(raw)) ? raw as AnswerMode : DEFAULT_ANSWER_MODE;
}

/** Numara işletmenin test listesinde mi (agent_config.test_numbers)? */
export function isTestNumber(testNumbers: unknown, phone: string): boolean {
    if (!Array.isArray(testNumbers) || testNumbers.length === 0) return false;
    const me = normalizePhone(phone) ?? phone;
    return testNumbers.some((n) => normalizePhone(String(n)) === me);
}

/**
 * answer → cevap verilir · silent → bot susar (mesaj yalnız kaydedilir) ·
 * check → bu numara için henüz karar yok; çağıran geçmişe bakıp karar verir.
 *
 * known: wa_contacts'taki karar — true daha önce yazışılmış (kişisel),
 * false yeni numara, null henüz bakılmamış.
 */
export type Audience = 'answer' | 'silent' | 'check';

export function answerDecision(o: {
    mode: AnswerMode;
    isCustomer: boolean;
    isTestNumber: boolean;
    known: boolean | null;
}): Audience {
    // Test numarası her zaman konuşur: sahibin kendi öteki telefonu çoğu zaman
    // bu hatta daha önce yazışmış olur.
    if (o.isTestNumber) return 'answer';
    if (o.mode === 'everyone') return 'answer';
    if (o.isCustomer) return 'answer';
    if (o.mode === 'customers_only') return 'silent';
    if (o.known === true) return 'silent';
    if (o.known === false) return 'answer';
    return 'check';
}

// ── Önceki yazışma: Evolution'ın mesaj geçmişi ──────────────────────────────

/**
 * Bu numaranın ilk görüldüğü andan bu kadar önceki mesaj "önceki yazışma"
 * sayılır. Pay: Evolution'ın zaman damgası ile bizim kayıt saatimiz arasındaki
 * fark ve art arda gelen ilk mesajlar.
 */
export const PRIOR_MARGIN_MS = 10 * 60_000;

export interface EvoMessage { ts: number; fromMe: boolean }

/** Zaman damgası saniye: sayı, metin ya da Long ({ low, high }) gelebiliyor. */
function seconds(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
    if (v && typeof v === 'object' && 'low' in v) {
        const low = Number((v as { low: unknown }).low);
        const high = Number((v as { high?: unknown }).high ?? 0);
        if (Number.isFinite(low)) return high * 2 ** 32 + (low >>> 0);
    }
    return null;
}

/**
 * Evolution `chat/findMessages` cevabı → mesajlar. v2 `{ messages: { records } }`,
 * v1 düz dizi ya da `{ messages: [...] }`. Tanınmayan biçim → boş dizi
 * (karar verilemez; çağıran cevap verir, bugünkü davranış).
 */
export function messageRecords(json: unknown): EvoMessage[] {
    const j = json as Record<string, unknown> | unknown[] | null;
    let list: unknown[] = [];
    if (Array.isArray(j)) list = j;
    else if (j && typeof j === 'object') {
        const m = (j as Record<string, unknown>).messages;
        if (Array.isArray(m)) list = m;
        else if (m && typeof m === 'object' && Array.isArray((m as Record<string, unknown>).records)) {
            list = (m as Record<string, unknown>).records as unknown[];
        } else if (Array.isArray((j as Record<string, unknown>).records)) {
            list = (j as Record<string, unknown>).records as unknown[];
        }
    }
    const out: EvoMessage[] = [];
    for (const r of list) {
        if (!r || typeof r !== 'object') continue;
        const rec = r as Record<string, unknown>;
        const ts = seconds(rec.messageTimestamp);
        if (ts === null || ts <= 0) continue;
        const key = (rec.key ?? {}) as Record<string, unknown>;
        out.push({ ts, fromMe: key.fromMe === true });
    }
    return out;
}

/**
 * Numara bu hatta bottan ÖNCE yazışmış mı? firstSeenMs: numaranın bizim
 * kayıtlarımızda (wa_message_log) ilk görüldüğü an. Ondan PRIOR_MARGIN_MS önce
 * tek bir mesaj bile varsa (iki yönden biri) önceki yazışmadır.
 */
export function hadPriorChat(records: EvoMessage[], firstSeenMs: number): boolean {
    const cutoff = firstSeenMs - PRIOR_MARGIN_MS;
    return records.some((m) => m.ts * 1000 < cutoff);
}

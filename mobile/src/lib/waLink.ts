// WhatsApp bağlama · Müdür 37 — SAF KATMAN.
//
// İşletmenin WhatsApp hattı artık telefondan bağlanıyor. Sayfanın hâli, satırın
// kelimesi, kodun biçimi, sayaç ve hata cümleleri burada; sunucu çağrıları
// `waLinkSource.ts`te, ekran `app/(manager-flow)/profil/whatsapp.tsx` ve
// `src/components/waLink/`.
//
// Sunucu: `whatsapp-proxy` · health (live) / connect (number) / state (withCode)
// / disconnect / send. Biçimlendirme sunucuda `_shared/waLink.ts`.
//
// React, react-native ve Expo import edilmez (tests/mobil-wa-baglama).

import { normalizePhone } from './phone.ts';

// ── Sunucu cevabı ───────────────────────────────────────────────────────────

export type FailureKind = 'invalid_phone' | 'not_connected' | 'session' | 'busy' | 'network' | 'other';

export interface WaHealth {
    link: 'connected' | 'dropped' | 'off';
    inboundBroken: boolean;
    connectedAt: string | null;
    last24h: { sent: number; failed: number; skipped: number; inbound: number };
    lastFailure: { kind: FailureKind; at: string; message: string | null } | null;
    /** Personel (member) bağlayamaz, kesemez, test gönderemez: sayfayı salt okur (H2). */
    canManage: boolean;
}

const FAILURE_KINDS: ReadonlySet<string> = new Set(['invalid_phone', 'not_connected', 'session', 'busy', 'network', 'other']);

function count(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/**
 * `health` cevabı → sayfanın verisi. Bozuksa `null`: sayfa "okunamadı" der,
 * "bağlı değil" DEMEZ (hat belki bağlı; yeniden bağlamak gereksiz kod ister).
 * `link` yoksa (eski sunucu) `status`tan türetilir.
 */
export function healthOf(raw: unknown): WaHealth | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.error === 'string') return null;
    let link = r.link;
    if (link !== 'connected' && link !== 'dropped' && link !== 'off') {
        if (r.status === 'connected') link = 'connected';
        else if (r.status === 'disconnected' || r.status === 'connecting') link = 'off';
        else return null;
    }
    const l24 = (r.last24h ?? {}) as Record<string, unknown>;
    const lf = r.lastFailure as { kind?: unknown; at?: unknown; message?: unknown } | null | undefined;
    return {
        link: link as WaHealth['link'],
        inboundBroken: r.inboundBroken === true,
        canManage: r.canManage !== false,
        connectedAt: typeof r.connectedAt === 'string' ? r.connectedAt : null,
        last24h: { sent: count(l24.sent), failed: count(l24.failed), skipped: count(l24.skipped), inbound: count(l24.inbound) },
        lastFailure: lf && typeof lf.at === 'string'
            ? {
                kind: (typeof lf.kind === 'string' && FAILURE_KINDS.has(lf.kind) ? lf.kind : 'other') as FailureKind,
                at: lf.at,
                message: typeof lf.message === 'string' ? lf.message : null,
            }
            : null,
    };
}

// ── Sayfa ve İşletme satırı ─────────────────────────────────────────────────

/**
 * Sayfanın hâli. Tasarımın harfleriyle:
 *   loading → H1 · unreadable → H1 okunamadı · off → B · dropped → G ·
 *   connected → F2 · inbound → F3 (bağlı ama gelen işlenmiyor).
 * Personel (H2) aynı hâli görür; düğmelerin yerine tek cümle çizilir.
 */
export type WaPage = 'loading' | 'unreadable' | 'off' | 'dropped' | 'connected' | 'inbound';

export function pageOf(health: WaHealth | null | undefined, failed: boolean): WaPage {
    if (failed) return 'unreadable';
    if (health === undefined) return 'loading';
    if (health === null) return 'unreadable';
    if (health.link === 'connected') return health.inboundBroken ? 'inbound' : 'connected';
    return health.link;
}

/** İşletme sekmesindeki satırın beş hâli (A1). */
export type RowTone = 'ok' | 'no' | 'rd' | 'ld' | 'un';

export interface WaRow { tone: RowTone; word: string; sub: string; warm: boolean }

export function profileRow(page: WaPage, connectedAt: string | null, now: Date = new Date()): WaRow {
    switch (page) {
        case 'connected':
        case 'inbound':
            return { tone: 'ok', word: 'Bağlı', sub: connectedAt ? sinceLabel(connectedAt, now) : 'Hat çalışıyor', warm: false };
        case 'off':
            return { tone: 'no', word: 'Bağlı değil', sub: 'Hatırlatmalar gitmiyor', warm: false };
        case 'dropped':
            // Düştüğünde satırın zemini turuncuya %7 ısınır: göz önce oraya gider.
            return { tone: 'rd', word: 'Bağlantı düştü', sub: 'Mesajlar gitmiyor', warm: true };
        case 'loading':
            return { tone: 'ld', word: 'Kontrol ediliyor', sub: 'Durum soruluyor', warm: false };
        case 'unreadable':
            // Gri: hat belki bağlı. "Bağlı değil" yanlış alarm olur.
            return { tone: 'un', word: 'Okunamadı', sub: 'Açınca yeniden sorulur', warm: false };
    }
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
// Ayrılma eki ay adının son hecesine uyar: "29 Ekim'den", "3 Mart'tan".
const MONTH_ABL = ['tan', 'tan', 'tan', 'dan', 'tan', 'dan', 'dan', 'tan', 'den', 'den', 'dan', 'tan'] as const;
// Yıl: son rakamın okunuşuna göre (bir→den, üç→ten, altı→dan…); sıfırda onlar
// basamağı (yirmi→den, otuz→dan).
const ONES_ABL = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'] as const;
const TENS_ABL = ['', 'dan', 'den', 'dan', 'dan', 'den', 'dan', 'den', 'den', 'dan'] as const;

function yearAbl(y: number): string {
    return y % 10 ? ONES_ABL[y % 10] : TENS_ABL[Math.floor(y / 10) % 10] || 'den';
}

/**
 * "29 Ekim'den beri" — bağlantı tarihi; numara DEĞİL (numara sistemde kayıtlı
 * değil). Bugünse "Bugünden beri"; başka yıldaysa yıl da yazılır.
 */
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

// ── Son 24 saat ve son hata (F2) ────────────────────────────────────────────

/** Dört sayının hepsi sıfırsa sayılar yerine tek cümle: "Son 24 saatte mesaj yok." */
export function isQuietDay(h: WaHealth['last24h']): boolean {
    return h.sent + h.failed + h.skipped + h.inbound === 0;
}

export const STAT_LABELS = ['Gönderildi', 'Başarısız', 'Atlandı', 'Gelen'] as const;

export function statValues(h: WaHealth['last24h']): [number, number, number, number] {
    return [h.sent, h.failed, h.skipped, h.inbound];
}

/** Gitmeyen mesajın adı — sunucunun `wa_message_log.kind`ı. */
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

/**
 * Son hata satırı (F2 · son hata). İnsan diliyle, tek satır; ham hata kodu,
 * sunucu adı yok. Sebep kelimeleri eylem hapının kayıt satırlarıyla aynı.
 * Son 24 saat olduğu için gün yalnız "bugün" ya da "dün".
 */
export function failureLine(
    f: NonNullable<WaHealth['lastFailure']>, now: Date = new Date(),
): { title: string; body: string } {
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

// ── Test mesajı ─────────────────────────────────────────────────────────────

export type TestResult = 'ok' | 'not_connected' | 'opt_out' | 'invalid_phone' | 'queued' | 'failed';

/** "Gönderildi. Telefonu kontrol edin." / "Gönderilemedi. Numara geçersiz." */
export function testResultText(r: TestResult): { ok: boolean; title: string; sub: string } {
    switch (r) {
        case 'ok': return { ok: true, title: 'Gönderildi.', sub: 'Telefonu kontrol edin.' };
        case 'queued': return { ok: true, title: 'Sıraya alındı.', sub: 'Birkaç dakika içinde gider.' };
        case 'invalid_phone': return { ok: false, title: 'Gönderilemedi.', sub: 'Numara geçersiz.' };
        case 'not_connected': return { ok: false, title: 'Gönderilemedi.', sub: 'Bağlantı yok.' };
        case 'opt_out': return { ok: false, title: 'Gönderilemedi.', sub: 'Bu numara mesaj istemiyor.' };
        case 'failed': return { ok: false, title: 'Gönderilemedi.', sub: 'Tekrar deneyin.' };
    }
}

/** Test mesajının metni — müşteriye değil, müdürün kendi numarasına gider. */
export const TEST_TEXT = 'Luera test mesajı ✓ WhatsApp hattınız bağlı; hatırlatmalar ve onaylar bu numaradan gider.';

// ── Numara alanı (D1) ───────────────────────────────────────────────────────

/**
 * Yazılırken biçim: "0532 418 27 90". Yalnız rakam tutulur; baştaki 0 yoksa
 * eklenmez (kullanıcı 532… yazıyorsa öyle görünür, gönderirken çevrilir).
 * +90 / 90 ile başlayan yapıştırma 0'lı biçime iner.
 */
export function formatNumberInput(raw: string): string {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('0090')) d = `0${d.slice(4)}`;
    else if (d.startsWith('90') && d.length > 10) d = `0${d.slice(2)}`;
    d = d.slice(0, d.startsWith('0') ? 11 : 10);
    const lead = d.startsWith('0') ? 4 : 3;
    const parts = [d.slice(0, lead), d.slice(lead, lead + 3), d.slice(lead + 3, lead + 5), d.slice(lead + 5, lead + 7)];
    return parts.filter(Boolean).join(' ');
}

/** İşletmenin kayıtlı telefonu → alanın ilk değeri. Cep değilse boş. */
export function prefillNumber(publicPhone: string | null | undefined): string {
    const n = normalizePhone(publicPhone);
    if (!n || !n.startsWith('90')) return '';
    return formatNumberInput(`0${n.slice(2)}`);
}

/** "Kodu al" ancak geçerli bir numarada açılır. */
export function pairNumberOf(text: string): string | null {
    return normalizePhone(text);
}

// ── Bağlama kodu ve sayaçlar (D2, D3, E) ────────────────────────────────────

/** Yoklama aralığı: durum her 3 sn'de sorulur; sorgu ekranda görünmez. */
export const POLL_MS = 3000;
/** QR her 60 sn'de yenilenir (masaüstüyle aynı). */
export const QR_REFRESH_S = 60;
/**
 * Kodun ekranda geçerli sayıldığı süre. Evolution süreyi DÖNDÜRMÜYOR; kod her
 * QR turunda yenileniyor ve yoklama yeni kodu getiriyor (sayaç o an yeniden
 * dolar). Canlı ölçümle ayarlanacak.
 */
export const CODE_TTL_S = 60;

/** "K7RM2P4X" → ["K7RM", "2P4X"]; sekiz değilse null (yarım kod çizilmez). */
export function codeHalves(code: string | null | undefined): [string, string] | null {
    const c = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length === 8 ? [c.slice(0, 4), c.slice(4)] : null;
}

/** Sayaç: "2:41". Negatif olmaz. */
export function clock(sec: number): string {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Yoklamanın getirdiği kod öncekinden farklı mı (sayaç ve hücreler yenilenir). */
export function codeChanged(prev: string | null, next: string | null | undefined): boolean {
    return !!next && next !== prev;
}

// ── Eylem hapı (A2) ─────────────────────────────────────────────────────────

/** Hat bağlı değilken WhatsApp gözünün kelime bloğu — artık buradan bağlanır. */
export function waOffSpec(dropped: boolean): { label: string; hint: string } {
    return dropped
        ? { label: 'WhatsApp bağlantısı düştü', hint: 'buradan yeniden bağlanır' }
        : { label: 'WhatsApp bağlı değil', hint: 'buradan bağlanır' };
}

// ── Renkler ─────────────────────────────────────────────────────────────────

/** Ekranların renkleri — tasarımın --grb/--grd/--rdb/--rdd/--amb/--amd jetonları (iki tema). */
export function tints(dark: boolean) {
    return dark
        ? {
            grb: 'rgba(95,191,100,0.13)', grd: 'rgba(95,191,100,0.34)',
            rdb: 'rgba(224,114,114,0.10)', rdd: 'rgba(224,114,114,0.45)',
            amb: 'rgba(217,164,59,0.10)', amd: 'rgba(217,164,59,0.34)',
            warm: 'rgba(255,90,31,0.07)',
        }
        : {
            grb: 'rgba(45,143,50,0.10)', grd: 'rgba(45,143,50,0.30)',
            rdb: 'rgba(201,64,64,0.07)', rdd: 'rgba(201,64,64,0.36)',
            amb: 'rgba(184,122,0,0.08)', amd: 'rgba(184,122,0,0.34)',
            warm: 'rgba(255,90,31,0.07)',
        };
}

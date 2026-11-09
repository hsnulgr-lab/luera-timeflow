// WhatsApp hattını bağlama ve hattın sağlığı — saf yardımcılar (Müdür 37).
//
// whatsapp-proxy'nin `connect` (bağlama kodu), `state` (kodu tazeleme) ve
// `health` (sayfanın durumu) cevaplarını bunlar biçimlendirir. Ağ yok, veritabanı
// yok: tests/wa-baglama.test.mjs doğrudan sınar.

/**
 * Evolution'ın döndürdüğü bağlama kodu. `instance/create` kodu `qrcode` içinde,
 * `instance/connect` düz döndürür. Baileys 8 karakter verir; WhatsApp ekranda
 * "XXXX-XXXX" diye gösterir. Telefona her zaman düz 8 büyük harf gider; sekiz
 * değilse kod yok sayılır (yarım kodu göstermek, hiç göstermemekten kötü).
 */
export function pairingCodeOf(data: unknown): string | null {
    const d = data as { pairingCode?: unknown; qrcode?: { pairingCode?: unknown } } | null;
    const raw = d?.pairingCode ?? d?.qrcode?.pairingCode;
    if (typeof raw !== 'string') return null;
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length === 8 ? code : null;
}

/**
 * QR görseli: data URL (v2) ya da öneksiz base64 (v1; masaüstü öneki kendi
 * ekler). `code` alanı QR'ın ham metnidir, görsel değil; eski kod onu da
 * döndürüyordu ve <img> kırık resim gösteriyordu. Yalnız görsel döner.
 */
export function qrImageOf(data: unknown): string | null {
    const d = data as { base64?: unknown; qrcode?: { base64?: unknown } } | null;
    const raw = d?.base64 ?? d?.qrcode?.base64;
    if (typeof raw !== 'string' || !raw) return null;
    return raw.startsWith('data:image') || /^[A-Za-z0-9+/=]{100,}$/.test(raw) ? raw : null;
}

/** Evolution'ın sayacı: her yeni QR/kodda bir artar (QRCODE_LIMIT, varsayılan 30). */
export function qrCountOf(data: unknown): number | null {
    const d = data as { count?: unknown; qrcode?: { count?: unknown } } | null;
    const raw = d?.count ?? d?.qrcode?.count;
    return typeof raw === 'number' ? raw : null;
}

/**
 * Sayfanın ana durumu.
 *   connected — hat açık.
 *   dropped   — hat vardı, kendiliğinden koptu (markDisconnected bir sebep yazar).
 *   off       — hiç bağlanmadı ya da sahip bilerek kesti (disconnect sebebi siler).
 * Yarım kalmış bağlama ('connecting') "bağlı değil" sayılır: müdür kodu alıp
 * vazgeçmiş olabilir, ona "bağlantı düştü" demek yanlış alarm olur.
 */
export type LinkState = 'connected' | 'dropped' | 'off';

export function linkState(org: { status?: string | null; last_error?: string | null }): LinkState {
    if (org.status === 'connected') return 'connected';
    if (org.status === 'disconnected' && org.last_error) return 'dropped';
    return 'off';
}

/**
 * Hat bağlı ama gelen mesaj işlenmiyor: webhook kaydı başarısız (state
 * eyleminin yazdığı "webhook: …"). Giden mesajlar etkilenmez — sayfa amber
 * uyarıyı yalnız bağlıyken gösterir.
 */
export function inboundBroken(org: { status?: string | null; last_error?: string | null }): boolean {
    return org.status === 'connected' && typeof org.last_error === 'string' && org.last_error.startsWith('webhook:');
}

/**
 * Başarısız mesajın sebebi, insan diline çevrilebilecek türe indirgenir. Ham
 * hata metni (sunucu adı, HTTP kodu) telefona gitmez.
 */
export type FailureKind = 'invalid_phone' | 'not_connected' | 'session' | 'busy' | 'network' | 'other';

export function failureKind(error: string | null | undefined): FailureKind {
    const e = (error ?? '').trim();
    if (e === 'invalid_phone' || e === 'http_400') return 'invalid_phone';
    if (e === 'not_connected') return 'not_connected';
    if (/^http_(401|403|404)$/.test(e)) return 'session';
    if (/^http_(429|5\d\d)$/.test(e) || e === 'retry_exhausted') return 'busy';
    if (/timeout|abort|network|dns|fetch|connect/i.test(e) && !e.startsWith('http_')) return 'network';
    return 'other';
}

interface LogRow { status: string; direction: string; kind?: string | null; error?: string | null; created_at: string }

/**
 * Son 24 saatin en yeni BAŞARISIZ gidişi. Atlananlar (DUR, kota, numara yok)
 * hata değil, kuralın işi; onlar sayıda görünür, "son hata" satırına çıkmaz.
 * Satırlar yeniden eskiye sıralı gelir.
 */
export function lastFailure(rows: LogRow[]): { kind: FailureKind; at: string; message: string | null } | null {
    const r = rows.find((x) => x.direction === 'out' && x.status === 'failed');
    // message: gitmeyen mesajın türü (reminder_24h, confirmation…) — telefon
    // "bir hatırlatma gitmedi" diye yazar.
    return r ? { kind: failureKind(r.error), at: r.created_at, message: r.kind ?? null } : null;
}

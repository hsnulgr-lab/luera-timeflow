import { supabase } from '@/lib/supabase';

// WhatsApp'a erişimin TEK istemci yolu — hepsi whatsapp-proxy edge function'ına
// gider. Evolution adresi ve anahtarı sunucuda kalır, tarayıcı bundle'ına girmez.
//
// Öncesinde src/services/evolutionApi.ts doğrudan Evolution'a fetch atıyordu ama
// okuduğu VITE_EVOLUTION_API_URL .env'de yoktu; istekler "undefined/message/..."
// adresine gidip sessizce false dönüyordu. Artık her hata bir sebep taşıyor.

export type WaKind =
    | 'confirmation' | 'queue_join' | 'queue_ready' | 'rebook' | 'ai_draft' | 'manual';

export type WaFailReason =
    | 'not_connected' | 'opt_out' | 'quota' | 'invalid_phone' | 'failed';

export interface WaSendResult {
    ok: boolean;
    reason?: WaFailReason;
}

/** Kullanıcıya gösterilecek Türkçe karşılık — çağıranlar toast'ta kullanır. */
export const WA_FAIL_TEXT: Record<WaFailReason, string> = {
    not_connected: 'WhatsApp bağlı değil — Ayarlar → WhatsApp\'tan bağlayın',
    opt_out:       'Müşteri mesaj almak istemediğini bildirmiş',
    quota:         'Bu müşteriye bugün yeterince mesaj gönderildi',
    invalid_phone: 'Telefon numarası WhatsApp için geçerli değil',
    failed:        'WhatsApp mesajı gönderilemedi',
};

/** Proxy'nin döndürdüğü son hata — çağıranlar toast'ta gösterebilsin diye. */
export let lastProxyError: string | null = null;

const PROXY_ERROR_TR: Record<string, string> = {
    evolution_not_configured: 'Sunucuda Evolution API ayarları eksik (EVOLUTION_API_URL / EVOLUTION_API_KEY).',
    no_org: 'Hesabınız bir işletmeye bağlı değil.',
    unauthorized: 'Oturumunuz doğrulanamadı, çıkıp tekrar girin.',
};

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
    lastProxyError = null;
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', { body });
    if (error) {
        // Edge function 4xx/5xx döndüğünde gövdedeki `error` alanı burada kayboluyor;
        // okuyup çevirebilmek için context.json()'a bakıyoruz.
        const ctx = (error as { context?: Response }).context;
        let code = '';
        try { code = (await ctx?.clone().json())?.error ?? ''; } catch { /* gövde yok */ }
        lastProxyError = PROXY_ERROR_TR[code]
            ?? (code ? `Sunucu hatası: ${code}` : 'whatsapp-proxy fonksiyonuna ulaşılamadı (deploy edildi mi?).');
        return null;
    }
    const err = (data as { error?: string } | null)?.error;
    if (err) {
        lastProxyError = PROXY_ERROR_TR[err] ?? `Sunucu hatası: ${err}`;
        return null;
    }
    return data as T;
}

/** Mesaj gönder. Başarısızlıkta `reason` ile döner (sessiz false değil). */
export async function sendWhatsApp(
    phone: string,
    text: string,
    kind: WaKind = 'manual',
    customerId?: string,
): Promise<WaSendResult> {
    const res = await call<WaSendResult>({ action: 'send', phone, text, kind, customerId });
    return res ?? { ok: false, reason: 'failed' };
}

/** Evolution'a webhook kaydı sonucu — başarısızsa gelen mesaj botu çalışmaz. */
export interface WaWebhookResult { ok: boolean; reason?: string }
export interface WaConnectResult { qr: string | null; connected: boolean; instance: string; webhook?: WaWebhookResult }
export interface WaStateResult { state: string; connected: boolean; instance: string; webhook?: WaWebhookResult }

/** Instance oluştur + Evolution webhook'unu kaydet + QR döndür. */
export function waConnect() { return call<WaConnectResult>({ action: 'connect' }); }

/** Bağlantı durumunu sorgula (QR ekranında 3 sn'de bir çağrılır). */
export function waState() { return call<WaStateResult>({ action: 'state' }); }

export function waDisconnect() { return call<{ ok: boolean }>({ action: 'disconnect' }); }

export interface WaHealth {
    status: 'disconnected' | 'connecting' | 'connected';
    instance: string | null;
    features: Record<string, boolean>;
    last24h: { sent: number; failed: number; skipped: number; inbound: number };
    lastError: string | null;
}

/** Son 24 saatin gönderim özeti — Ayarlar'daki sağlık kartı bunu gösterir. */
export function waHealth() { return call<WaHealth>({ action: 'health' }); }

/**
 * Otomatik mesaj türlerini aç/kapat. org_whatsapp'ta yazma RLS'i olmadığı için
 * (yalnız service_role) doğrudan tablo update'i yapılamaz, proxy'den geçer.
 */
export function waSetFeatures(features: Partial<Record<'confirmation' | 'review' | 'winback' | 'renewal' | 'recall' | 'assistant', boolean>>) {
    return call<{ ok: boolean; features: Record<string, boolean> }>({ action: 'features', features });
}

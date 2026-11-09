import { supabase } from '@/lib/supabase';

// WhatsApp'a erişimin TEK istemci yolu — hepsi whatsapp-proxy edge function'ına
// gider. Evolution adresi ve anahtarı sunucuda kalır, tarayıcı bundle'ına girmez.
//
// Öncesinde src/services/evolutionApi.ts doğrudan Evolution'a fetch atıyordu ama
// okuduğu VITE_EVOLUTION_API_URL .env'de yoktu; istekler "undefined/message/..."
// adresine gidip sessizce false dönüyordu. Artık her hata bir sebep taşıyor.

export type WaKind =
    | 'confirmation' | 'queue_join' | 'queue_ready' | 'rebook' | 'ai_draft' | 'manual' | 'cancellation';

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
    // Bağlantıyı kurmak/koparmak ve otomatik mesaj anahtarları işletme sahibinin
    // kararı — personel hesabı bu action'ları çağıramaz (whatsapp-proxy).
    owner_required: 'Bu işlem için işletme sahibi yetkisi gerekiyor.',
    // Kullanıcı birden çok işletmeye üye: hangi işletme olduğu belirsiz kalmasın
    // diye sunucu rastgele seçmek yerine açıkça soruyor.
    org_id_required: 'Birden fazla işletmeye bağlısınız; lütfen işletme seçin.',
    forbidden_org: 'Bu işletme için yetkiniz yok.',
    org_lookup_failed: 'İşletme bilginiz okunamadı, tekrar deneyin.',
    server_error: 'Sunucuda beklenmeyen bir hata oluştu, tekrar deneyin.',
    // 139: gönderim ve asistan ayarı sınırları (whatsapp-proxy)
    invalid_kind: 'Bu mesaj türü panelden gönderilemez.',
    text_too_long: 'Mesaj çok uzun (en çok 4000 karakter).',
    invalid_test_number: 'Deneme numaralarından biri geçerli bir telefon numarası değil.',
    too_many_test_numbers: 'En çok 10 deneme numarası eklenebilir.',
    invalid_answer_mode: 'Geçersiz seçim.',
    save_failed: 'Kaydedilemedi, tekrar deneyin.',
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
export interface WaConnectResult { qr: string | null; code?: string | null; connected: boolean; instance: string; webhook?: WaWebhookResult }
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
    /** Müdür 37 (telefonun WhatsApp sayfası): bağlı · düştü · bağlı değil. */
    link?: 'connected' | 'dropped' | 'off';
    inboundBroken?: boolean;
    connectedAt?: string | null;
    lastFailure?: { kind: string; at: string; message: string | null } | null;
    canManage?: boolean;
}

/** Son 24 saatin gönderim özeti — Ayarlar'daki sağlık kartı bunu gösterir. */
export function waHealth() { return call<WaHealth>({ action: 'health' }); }

/**
 * Otomatik mesaj türlerini aç/kapat. org_whatsapp'ta yazma RLS'i olmadığı için
 * (yalnız service_role) doğrudan tablo update'i yapılamaz, proxy'den geçer.
 */
/** Asistanın bilgi bankası (137). Sınırlar sunucuda; kaydedilen temiz hâl döner. */
export function waSetKnowledge(knowledge: import('@/lib/waKnowledge').WaKnowledge) {
    return call<{ ok: boolean; knowledge: import('@/lib/waKnowledge').WaKnowledge }>({ action: 'knowledge', knowledge });
}

/** Kimlere cevap verilir (139): agent_config.answer_mode. */
export type WaAnswerMode = 'customers_and_new' | 'customers_only' | 'everyone';

export interface WaAgentState {
    ok: boolean;
    /** features.agent_v2 — akıllı asistan (Claude). */
    enabled: boolean;
    /** features.scheduler_v2 — randevu başına zamanlanan mesajlar (131). */
    scheduler: boolean;
    answer_mode: WaAnswerMode;
    /** Deneme listesi doluyken listede olmayanlara: kalıplı bot ya da cevap yok. */
    others: 'old' | 'silent';
    test_numbers: string[];
    spent_usd: number;
    budget_usd: number;
    /** Zamanlayıcı yeni açıldıysa planlanan randevu sayısı. */
    backfilled: number | null;
}

export interface WaAgentPatch {
    enabled?: boolean;
    scheduler?: boolean;
    answer_mode?: WaAnswerMode;
    others?: 'old' | 'silent';
    test_numbers?: string[];
}

/**
 * Asistan ve zamanlayıcı ayarları — yalnız işletme sahibi (proxy `agent`).
 * Yamasız çağrı okur. Bütçe, model ve efor buradan değişmez.
 */
export function waAgent(patch?: WaAgentPatch) {
    return call<WaAgentState>(patch ? { action: 'agent', agent: patch } : { action: 'agent' });
}

export function waSetFeatures(features: Partial<Record<'confirmation' | 'review' | 'winback' | 'renewal' | 'recall' | 'assistant', boolean>>) {
    return call<{ ok: boolean; features: Record<string, boolean> }>({ action: 'features', features });
}

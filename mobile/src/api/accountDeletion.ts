import { supabase, supabaseConfigured } from '../lib/supabase';
import { appleReauthCode } from '../lib/socialAuth';

/**
 * Hesabı GERÇEKTEN siler — `account-delete` edge function'ı.
 *
 * Sunucu tarafı iki ayrı yıkım yapıyor ve ayrımı KENDİSİ karar veriyor:
 * işletmenin başka sahibi varsa yalnız bu kişinin üyeliği ve giriş kaydı
 * silinir, salon çalışmaya devam eder; tek sahipse `organizations` satırı
 * silinir ve şemadaki 33 yabancı anahtar cascade ile her şeyi alır.
 *
 * İstemci bu kararı VERMEZ, yalnız sonucu okur. Kimin sahip olduğu ve kaç
 * sahip olduğu sunucuda doğrulanır; istemciden gelen hiçbir şeye güvenilmez.
 *
 * `ok: false` dönen her yolda ekran yerinde kalır ve hesabın durduğunu yazar.
 * "Silindi" cümlesi yalnız sunucu gerçekten sildiğinde ekrana girer — Apple
 * 5.1.1(v) gerçek silme istiyor; yerel bir oturum temizliği silme saymıyor.
 */
export type DeleteFailure =
    /** Supabase yapılandırılmamış — istek hiç gitmedi. */
    | 'not-configured'
    /** Oturum düşmüş; silme kimliği doğrulanmadan yapılamaz. */
    | 'no-session'
    /** Sahibi değil. `admin` bile silemez: işletmeyi yok etmek sahibin işi. */
    | 'forbidden'
    /** Abonelik iptal edilemedi — SİLME YAPILMADI, hesap olduğu gibi duruyor. */
    | 'subscription'
    /** Apple yeniden doğrulaması tutmadı (kod geçersiz / başka Apple Kimliği) — SİLME YAPILMADI. */
    | 'apple'
    /** Kişi Apple penceresini kapattı — vazgeçti; ekran sessizce yerinde kalır. */
    | 'cancelled'
    | 'server';

export async function deleteAccount(
    /**
     * Silinecek hesabın BU cihazda seçili salonu. Birden çok salona üye bir
     * müdürde sunucu salonu tahmin etmiyor (`org_id_required`) — gönderilmezse
     * silme her seferinde "sunucu" hatasına düşüyordu.
     */
    orgId?: string | null,
    options: {
        /**
         * Apple ile girmiş hesap (Giriş v4 · P1, TN3194 · B yolu). Silmeden
         * ÖNCE Apple'a bir kez daha sorulur; tek kullanımlık kod sunucuya
         * gider, sunucu Apple'daki bağı iptal eder — kişi bunu Ayarlar ›
         * Apple Kimliği'nde görür. Kod alınamazsa (Apple'a ulaşılamadı)
         * silme yine yapılır: silme hakkı bir Apple kesintisine takılmamalı.
         * Kişi pencereyi kapattıysa vazgeçmiştir — hiçbir şey silinmez.
         */
        apple?: boolean;
    } = {},
): Promise<{ ok: boolean; reason: DeleteFailure | null }> {
    if (!supabaseConfigured) return { ok: false, reason: 'not-configured' };

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return { ok: false, reason: 'no-session' };

    let appleCode: string | null = null;
    if (options.apple) {
        const reauth = await appleReauthCode();
        if (!reauth.ok && reauth.reason === 'cancelled') return { ok: false, reason: 'cancelled' };
        appleCode = reauth.ok ? reauth.code : null;
    }

    const { data, error } = await supabase.functions.invoke('account-delete', {
        body: {
            ...(orgId ? { orgId } : {}),
            ...(appleCode ? { appleCode, appleClient: 'ios' } : {}),
        },
    });
    /*
     * 4xx/5xx GÖVDESİ `error.context`te. Sunucu "sahibi değil" (403) ve
     * "abonelik iptal edilemedi" (502) derken durum kodu hata olduğu için
     * `data` boş geliyor; gövde okunmadan ikisi de "sunucu hatası"na
     * düşüyordu ve ekran müdüre yanlış sebep yazıyordu.
     */
    let body = data as { deleted?: boolean; error?: string } | null;
    if (error) {
        const context = (error as { context?: Response }).context;
        try { body = (await context?.clone().json()) ?? null; } catch { body = null; }
        if (!body) {
            console.warn('account-delete failed', error);
            return { ok: false, reason: 'server' };
        }
    }

    const result = body;
    if (!result?.deleted) {
        if (result?.error === 'forbidden_role') return { ok: false, reason: 'forbidden' };
        if (result?.error === 'subscription_cancel_failed') return { ok: false, reason: 'subscription' };
        if (result?.error === 'apple_code_invalid' || result?.error === 'apple_mismatch') {
            return { ok: false, reason: 'apple' };
        }
        return { ok: false, reason: 'server' };
    }

    /*
     * Sunucu sildi; cihazdaki oturum da gitmeli. `signOut` başarısız olsa bile
     * silme gerçekleşti — bu yüzden sonucu değiştirmez.
     */
    await supabase.auth.signOut().catch(() => undefined);
    return { ok: true, reason: null };
}

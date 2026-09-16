import { supabase, supabaseConfigured } from '../lib/supabase';

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
    | 'server';

export async function deleteAccount(
    /**
     * Silinecek hesabın BU cihazda seçili salonu. Birden çok salona üye bir
     * müdürde sunucu salonu tahmin etmiyor (`org_id_required`) — gönderilmezse
     * silme her seferinde "sunucu" hatasına düşüyordu.
     */
    orgId?: string | null,
): Promise<{ ok: boolean; reason: DeleteFailure | null }> {
    if (!supabaseConfigured) return { ok: false, reason: 'not-configured' };

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return { ok: false, reason: 'no-session' };

    const { data, error } = await supabase.functions.invoke('account-delete', {
        body: orgId ? { orgId } : {},
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
        return { ok: false, reason: 'server' };
    }

    /*
     * Sunucu sildi; cihazdaki oturum da gitmeli. `signOut` başarısız olsa bile
     * silme gerçekleşti — bu yüzden sonucu değiştirmez.
     */
    await supabase.auth.signOut().catch(() => undefined);
    return { ok: true, reason: null };
}

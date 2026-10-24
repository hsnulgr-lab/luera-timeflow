import { supabase } from '@/lib/supabase';
import { nextCoreStep } from '@/lib/setupProgress';

/**
 * Ödemeden sonra nereye: kurulumun zorunlu adımları bittiyse ana sayfa,
 * bitmediyse kurulum — kaldığı adımdan (kullanıcı kararı 2026-10-22).
 * Ödeme duvarı (PaywallPage) ve sihirli bağlantı (hoş geldiniz e-postası,
 * EpostaBaglantiPage) uygulamanın veri sağlayıcılarının DIŞINDA; olgular
 * doğrudan okunur. Okunamazsa ana sayfa: oradaki şerit kurulumu zaten
 * hatırlatır, gereksiz yere sihirbaza atmak Test 1'deki şikâyetti.
 */
export async function afterPaymentPath(orgId: string): Promise<string> {
    const [st, sv] = await Promise.all([
        supabase.from('settings').select('sector, business_name, working_hours')
            .eq('organization_id', orgId).limit(1).maybeSingle(),
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);
    if (st.error || sv.error) return '/';
    const hours = Array.isArray(st.data?.working_hours) ? (st.data.working_hours as { isOff?: boolean }[]) : null;
    // Adres ve telefon karara girmez: sihirbaz onları sormadan geçer (Test B).
    const next = nextCoreStep({
        sector: st.data?.sector || 'genel',
        businessName: st.data?.business_name ?? '',
        // Satırda saat yoksa uygulama varsayılan (açık) saatleri kullanır.
        openDays: hours ? hours.filter((h) => !h.isOff).length : 1,
        serviceCount: sv.count ?? 0,
        // Atlanabilir adımlar karara girmez.
        resourceCount: 0, resourcesApply: false, staffCount: 0, soloDeclared: false, whatsappConnected: false,
    });
    if (!next) return '/';
    // Hiçbir şey girilmemişse karşılamadan; yarıdaysa kaldığı adımdan.
    return next !== 'sector' ? `/kurulum?adim=${next}` : '/kurulum';
}

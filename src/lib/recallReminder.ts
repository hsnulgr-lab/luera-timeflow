import { supabase } from '@/lib/supabase';

// Diş kontrol (recall) hatırlatmasını tek hasta için hemen gönderir.
// `remind` edge function'ının manuel modunu tetikler: AI mesajı (gizlilik
// korumalı) + Evolution API üzerinden WhatsApp. Otomatik gönderim ise cron'da
// kontrol tarihinden 2 gün önce çalışır — bu yalnız "Hatırlat" butonu içindir.
export async function sendRecallReminder(customerId: string): Promise<
    { ok: true } | { ok: false; reason: 'no_whatsapp' | 'not_found' | 'failed' }
> {
    try {
        const { data, error } = await supabase.functions.invoke('remind', {
            body: { recallCustomerId: customerId },
        });
        if (error) {
            // Edge function 409 (WhatsApp bağlı değil) / 404 (hasta yok) durumlarını
            // FunctionsHttpError olarak döndürür; context.status ile ayırt et.
            const status = (error as { context?: { status?: number } }).context?.status;
            if (status === 409) return { ok: false, reason: 'no_whatsapp' };
            if (status === 404) return { ok: false, reason: 'not_found' };
            return { ok: false, reason: 'failed' };
        }
        return data?.success ? { ok: true } : { ok: false, reason: 'failed' };
    } catch {
        return { ok: false, reason: 'failed' };
    }
}

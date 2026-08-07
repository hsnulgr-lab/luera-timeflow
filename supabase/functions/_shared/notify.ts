// İşletmeciye bildirim — Dalga 3.
//
// WhatsApp botu bugüne kadar sessizce çalışıyordu: müşteri gece 23:40'ta
// randevu alıyor ya da sabaha karşı iptal ediyor, işletmeci bunu ertesi gün
// takvimi açınca öğreniyordu. İptal en kritiği — haberi olmayan salon o slotu
// bir başkasına satamıyor.
//
// send-push zaten var (push_subscriptions + VAPID) ama yalnız uygulama içinden
// çağrılıyordu. Burası, edge fonksiyonlarının ortak kapısı.
//
// FIRE-AND-FORGET: bildirim gönderilemezse randevu akışı ETKİLENMEZ. Müşteriye
// verilen sözle (randevu oluştu) işletmecinin telefonuna düşen rozet aynı
// öneme sahip değil; ikincisi için birincisi bekletilemez.

import { getSecret, type Admin } from './wa.ts';

export interface OwnerNotice {
    title: string;
    body: string;
    /** Tıklanınca açılacak uygulama yolu, ör. "/takvim?date=2026-08-12". */
    url?: string;
    /**
     * Aynı etiketli bildirim öncekinin yerine geçer. Randevu id'si verilirse
     * aynı randevunun iki güncellemesi telefonda üst üste yığılmaz.
     */
    tag?: string;
}

/**
 * Yönetici rolündeki tüm abonelere bildirim yollar. Hata yutulur — çağıran
 * `await` etmek zorunda değil ve etmese de akış bozulmaz.
 */
export async function notifyOwner(admin: Admin, orgId: string, notice: OwnerNotice): Promise<void> {
    try {
        const secret = await getSecret(admin, 'PUSH_TRIGGER_SECRET');
        const url = Deno.env.get('SUPABASE_URL');
        if (!secret || !url) return; // push kurulmamış — sessizce geç

        await fetch(`${url}/functions/v1/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-push-secret': secret },
            body: JSON.stringify({
                organization_id: orgId,
                target: { role: 'manager' },
                payload: notice,
            }),
        });
    } catch {
        // Bildirim gidememesi randevuyu geçersiz kılmaz.
    }
}

/**
 * İptal edilen bir slotu bekleme listesine duyurur. booking-manage bunu zaten
 * yapıyordu ama kendi içinde; bot da iptal edebildiğine göre ortak yere taşındı.
 */
export async function announceFreedSlot(admin: Admin, orgId: string, date: string): Promise<void> {
    try {
        const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const url = Deno.env.get('SUPABASE_URL');
        if (!srk || !url) return;
        await fetch(`${url}/functions/v1/notify-waitlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${srk}`, apikey: srk },
            body: JSON.stringify({ organization_id: orgId, date }),
        });
    } catch {
        // Bekleme listesi duyurusu en iyi çabadır.
    }
}

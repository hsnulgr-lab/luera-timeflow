// Randevu yazımının veritabanından dönen iki "beklenen" reddi.
//
// whatsapp-booking'in içindeydi; Claude ajanı da aynı ayrımı yapmak zorunda:
// çakışmada müşteriye başka saat sunulur, uygunluk engelinde tekrar denemek
// işe yaramaz ve konuşma salona devredilir.
//
// Saf modül.

/** 060 çakışma koruması: aynı personel ya da kabin o saatte dolu. */
export function isReservationConflict(error: { code?: string; message?: string } | null | undefined): boolean {
    const message = (error?.message || '').toLowerCase();
    return error?.code === '23P01'
        || message.includes('reservation_staff_conflict')
        || message.includes('reservation_resource_conflict');
}

/**
 * Uygunluk engeli (076): hamilelik gibi bir risk bayrağı hizmetin etiketiyle
 * çakışıyor. Guard 23514 ile 'reservation_eligibility_blocked' fırlatıyor;
 * bunu tanımazsak müşteri "biraz sonra tekrar deneyin" görüp sonsuza kadar
 * dener — engel kalkmayacağı için hiç başarmaz.
 */
export function eligibilityBlock(
    error: { code?: string; message?: string; details?: string } | null | undefined,
): { reason: string | null } | null {
    if (!error) return null;
    const message = (error.message || '') + ' ' + (error.details || '');
    if (!message.includes('reservation_eligibility_blocked')) return null;
    let reason: string | null = null;
    try {
        const parsed = JSON.parse(error.details || '{}');
        if (typeof parsed?.reason === 'string') reason = parsed.reason;
    } catch { /* detail JSON değilse gerekçesiz devam */ }
    return { reason };
}

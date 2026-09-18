/**
 * Onay akışı — RAFTA (kullanıcı kararı, 2026-09-19). Silinmedi, kapalı.
 *
 * Telefon `status = 'pending'` randevuyu "onay bekliyor" kartıyla ve
 * Onayla / Reddet düğmeleriyle gösteriyordu. Ama masaüstü takvimden ELLE
 * açılan her randevuyu da `pending` yazıyor (`src/pages/CalendarPage.tsx`);
 * salonun otomatik onayı (`booking_auto_confirm`) yalnız online ve WhatsApp
 * randevusuna uygulanıyor. Sonuç: müdürün kendi açtığı randevu telefonda
 * "Onayla" istiyordu ve bu düğme tasarım dilinde yok.
 *
 * Kapalıyken beklemedeki randevu telefonda ONAYLI gibi yaşar: sıradaki,
 * gecikti, 30 dk'da gelmedi — müdürde de personelde de. Açmak için bu
 * bayrak `true` yapılır; kod (`bookedCard`, Onayla/Reddet yazması) yerinde.
 */
export const APPROVAL_FLOW_ENABLED = false;

/** Bu randevu telefonda "onay bekliyor" diye mi gösterilsin? */
export const awaitsApproval = (status: string | null | undefined): boolean =>
    APPROVAL_FLOW_ENABLED && status === 'pending';

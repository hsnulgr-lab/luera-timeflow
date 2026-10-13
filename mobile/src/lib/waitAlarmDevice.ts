import * as Notifications from 'expo-notifications';

import { waitAlarmData, waitAlarmDue, waitAlarmId, waitAlarmText } from './waitAlarm';

/**
 * Bekleme bitti bildiriminin CİHAZ tarafı — kur ve sil.
 *
 * Kararlar `waitAlarm.ts`te. Hiçbir hata kullanıcıya düşmüyor: bildirim bir
 * hatırlatıcı; kurulamazsa kumandanın halkası yine dönüyor. İzin yoksa iOS
 * bildirimi göstermiyor — izin burada SORULMUYOR (bildirim kararı 5: ön-soru
 * Gün ekranında).
 *
 * Bildirime dokununca O İŞİN KUMANDASI açılıyor (kullanıcı kararı
 * 2026-10-14): `data` sunucu bildirimleriyle aynı biçimde — etiket
 * `wait-<randevu>`, adres günü taşıyor (`pushRoute.pushTargetOf`).
 */
export async function armWaitAlarm(input: {
    reservationId: string;
    /** Randevunun günü — kumanda o günün okumasıyla açılıyor. */
    dateISO: string;
    endsAt: number;
    customerName: string;
    service: string;
    minutes: number;
}): Promise<void> {
    const identifier = waitAlarmId(input.reservationId);
    try {
        if (!waitAlarmDue(input.endsAt, Date.now())) {
            await Notifications.cancelScheduledNotificationAsync(identifier);
            return;
        }
        const text = waitAlarmText(input);
        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                title: text.title,
                body: text.body,
                sound: 'default',
                data: waitAlarmData(input.reservationId, input.dateISO),
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(input.endsAt),
                // Android: sunucunun bildirimleriyle aynı kanal (`pushSetup`).
                channelId: 'randevu',
            },
        });
    } catch (cause) {
        console.warn('bekleme bildirimi kurulamadı', String(cause));
    }
}

export async function disarmWaitAlarm(reservationId: string): Promise<void> {
    try {
        await Notifications.cancelScheduledNotificationAsync(waitAlarmId(reservationId));
    } catch (cause) {
        console.warn('bekleme bildirimi silinemedi', String(cause));
    }
}

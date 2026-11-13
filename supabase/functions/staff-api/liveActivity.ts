/**
 * "MÜŞTERİ BEKLİYOR" Live Activity jetonları — `la.register` / `la.unregister`
 * (göç 144 · 1.0.3).
 *
 * Telefon iki tür Apple jetonu üretiyor:
 *   • start  — cihaz başına bir (push-to-start, iOS 17.2+). Sunucu "Geldi"
 *              anında etkinliği bununla BAŞLATIYOR, uygulama kapalıyken de.
 *   • update — çalışan etkinlik başına bir. Sunucu etkinliği bununla BİTİRİYOR
 *              (iş başladı, iptal, gelmedi…). Telefon hangi etkinliğin hangi
 *              randevuya ait olduğunu bildiriyor (`reservationId`).
 *
 * ── Kimlik gövdeden OKUNMUYOR ───────────────────────────────────────────────
 * `push.register` ile aynı kural: kişi ve işletme sunucunun doğruladığı
 * personel satırından (`me`). Etkinlik jetonunun randevusu da o kişinin o
 * işletmedeki randevusu olmak zorunda — başkasının randevusuna jeton
 * bağlanamıyor.
 *
 * Node testleri bu dosyayı ÇALIŞTIRIYOR (tests/musteri-bekliyor.test.mjs):
 * Deno'ya ve ağa bağlı değil, `admin` dışarıdan veriliyor.
 */

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any; // service_role SupabaseClient

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** expo-widgets jetonu `%02x` ile yazıyor: küçük harf onaltılı. Göç 144'ün kısıtıyla aynı. */
const TOKEN = /^[0-9a-f]{32,512}$/;

/** Eski etkinlik jetonları — bir iş günü geçtiyse etkinlik çoktan bitmiştir. */
export const UPDATE_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export type LaKind = 'start' | 'update';
export type LaEnvironment = 'sandbox' | 'production';

export interface LaRegisterInput {
    kind: LaKind;
    token: string;
    deviceId: string;
    environment: LaEnvironment;
    reservationId: string | null;
    activityId: string | null;
}

/** Gövdeyi doğrular; bozuksa sebebi (400 cevabının `error` alanı). */
export function parseLaRegister(body: Record<string, unknown>): LaRegisterInput | { error: string } {
    const kind = body.kind === 'start' || body.kind === 'update' ? body.kind : null;
    if (!kind) return { error: 'invalid_kind' };
    const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
    if (!TOKEN.test(token)) return { error: 'invalid_la_token' };
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (deviceId.length < 8 || deviceId.length > 100) return { error: 'invalid_device_id' };
    const environment = body.environment === 'sandbox' || body.environment === 'production' ? body.environment : null;
    if (!environment) return { error: 'invalid_environment' };
    if (kind === 'start') {
        return { kind, token, deviceId, environment, reservationId: null, activityId: null };
    }
    const reservationId = typeof body.reservationId === 'string' ? body.reservationId.trim() : '';
    if (!UUID.test(reservationId)) return { error: 'invalid_reservation' };
    const activityId = typeof body.activityId === 'string' ? body.activityId.trim() : '';
    if (!activityId || activityId.length > 100) return { error: 'invalid_activity' };
    return { kind, token, deviceId, environment, reservationId, activityId };
}

export interface LaMe {
    id: string;
    organization_id: string;
}

/**
 * Jetonu yaz. Tek `upsert`e sıkıştırılmıyor: tabloda iki kısmi tekillik var
 * (`start` cihaz başına, `update` etkinlik başına) ve `on conflict` kısmi
 * dizini hedefleyemiyor. Önce aynı yerin eskisi siliniyor, sonra ekleniyor.
 */
export async function registerLiveActivity(
    admin: Admin,
    me: LaMe,
    input: LaRegisterInput,
    now = Date.now(),
): Promise<{ ok: true } | { error: string; status: number }> {
    const org = me.organization_id;
    const stamp = new Date(now).toISOString();

    if (input.kind === 'update') {
        // Randevu bu kişinin bu işletmedeki randevusu mu?
        const { data: res, error: resErr } = await admin.from('reservations')
            .select('id')
            .eq('id', input.reservationId)
            .eq('organization_id', org)
            .eq('staff_id', me.id)
            .maybeSingle();
        if (resErr) {
            console.error('la.register randevu', resErr);
            return { error: 'lookup_failed', status: 500 };
        }
        if (!res) return { error: 'invalid_reservation', status: 400 };

        // Bu cihazın bir iş gününden eski etkinlik jetonları — bitmiş etkinlikler.
        await admin.from('live_activity_tokens').delete()
            .eq('organization_id', org)
            .eq('device_id', input.deviceId)
            .eq('kind', 'update')
            .lt('updated_at', new Date(now - UPDATE_TOKEN_TTL_MS).toISOString());
        await admin.from('live_activity_tokens').delete()
            .eq('organization_id', org)
            .eq('device_id', input.deviceId)
            .eq('kind', 'update')
            .eq('activity_id', input.activityId);
    } else {
        // Aynı fiziksel telefonun (jeton aynı) başka işletmede / başka kurulumda
        // kalmış başlatma satırı: ikisi birden olursa telefon iki salonun
        // müşterisini görür. Yalnız bu cihazınki kalıyor.
        await admin.from('live_activity_tokens').delete()
            .eq('kind', 'start')
            .eq('token', input.token);
        await admin.from('live_activity_tokens').delete()
            .eq('organization_id', org)
            .eq('device_id', input.deviceId)
            .eq('kind', 'start');
    }

    const { error } = await admin.from('live_activity_tokens').insert({
        organization_id: org,
        staff_id: me.id,
        device_id: input.deviceId,
        kind: input.kind,
        reservation_id: input.reservationId,
        activity_id: input.activityId,
        token: input.token,
        environment: input.environment,
        created_at: stamp,
        updated_at: stamp,
    });
    if (error) {
        console.error('la.register', error);
        return { error: 'save_failed', status: 500 };
    }
    return { ok: true };
}

/**
 * Bu cihazın jetonlarını sil — çıkış, işletme değişimi, telefon koparma.
 * `activityId` verilirse yalnız o etkinliğinki (etkinlik telefonda bitti).
 *
 * `push.unregister` gibi CİHAZ token'ını da kabul ediyor (çıkışta personel
 * token'ı silinmiş olabilir); kapsam org ve cihazın kendi sırrı `deviceId`.
 */
export async function unregisterLiveActivity(
    admin: Admin,
    org: string,
    body: Record<string, unknown>,
): Promise<{ ok: true } | { error: string; status: number }> {
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (deviceId.length < 8 || deviceId.length > 100) return { error: 'invalid_device_id', status: 400 };
    let q = admin.from('live_activity_tokens').delete()
        .eq('organization_id', org)
        .eq('device_id', deviceId);
    const activityId = typeof body.activityId === 'string' ? body.activityId.trim() : '';
    if (activityId) q = q.eq('kind', 'update').eq('activity_id', activityId);
    const { error } = await q;
    if (error) {
        console.error('la.unregister', error);
        return { error: 'delete_failed', status: 500 };
    }
    return { ok: true };
}

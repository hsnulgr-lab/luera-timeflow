/**
 * send-live-activity'nin AKIŞI — Deno'suz, ağı dışarıdan verilen (göç 144).
 *
 * Çağıran yalnız veritabanı tetikleyicisi (`notify_push_on_reservation`,
 * `live_activity_end_on_delete`); kimlik `x-push-secret` ile `index.ts`te.
 *
 * ── İLK KURAL: "Müşterin geldi" HİÇBİR KOŞULDA KAYBOLMAZ ──────────────────
 * Başlatma isteği bugünkü bildirimin birebirini (`fallback`) taşıyor. Etkinlik
 * açılamayan her cihaz o bildirimi `send-push`ten alıyor:
 *   • APNs anahtarı yok (henüz verilmedi)          → herkese bildirim
 *   • personelin başlatma jetonu yok                → herkese bildirim
 *   • Apple reddetti / ağ hatası / beklenmeyen hata  → o cihaza bildirim
 *   • etkinlik açıldı                               → o cihaza bildirim YOK
 * Sonuncusu Apple'ın kuralından: başlatma itmesinde uyarı zorunlu, ikisi
 * birden telefonu iki kez çaldırırdı. Eşleşme `device_id` ile — aynı telefon
 * push_subscriptions'a ve live_activity_tokens'a aynı kimlikle yazıyor.
 *
 * Node testleri bu dosyayı ÇALIŞTIRIYOR (tests/musteri-bekliyor.test.mjs).
 */

import {
    apnsHeaders, apnsHost, apnsOutcome, endPayload, providerToken, startPayload,
    type ApnsEnvironment, type ArrivalProps,
} from './apns.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any; // service_role SupabaseClient

export interface Deps {
    admin: Admin;
    /** `app_secrets` (ya da ortam) okuyucu. */
    secret: (key: string) => Promise<string | null>;
    /** APNs'e HTTP/2 POST. Deno'nun `fetch`i ALPN ile h2 konuşuyor. */
    fetch: typeof fetch;
    /** Bugünkü bildirimi `send-push`e iletir; `excludeDeviceIds` o cihazları atlatır. */
    forwardPush: (body: Record<string, unknown>) => Promise<void>;
    now: () => number;
}

interface TokenRow {
    id: string;
    device_id: string;
    token: string;
    environment: ApnsEnvironment;
}

interface ApnsKey {
    keyPem: string;
    keyId: string;
    teamId: string;
}

async function apnsKey(deps: Deps): Promise<ApnsKey | null> {
    const [keyPem, keyId, teamId] = await Promise.all([
        deps.secret('APNS_KEY'), deps.secret('APNS_KEY_ID'), deps.secret('APNS_TEAM_ID'),
    ]);
    if (!keyPem || !keyId || !teamId) return null;
    return { keyPem, keyId, teamId };
}

/** Tek itme, tek ortam. Hata fırlatmıyor: sonucu ve Apple'ın sebebini döndürüyor. */
async function pushOnce(
    deps: Deps,
    key: ApnsKey,
    row: TokenRow,
    environment: ApnsEnvironment,
    event: 'start' | 'end',
    payload: Record<string, unknown>,
): Promise<{ outcome: 'ok' | 'dead' | 'error'; reason: string }> {
    try {
        const token = await providerToken({ ...key, nowMs: deps.now() });
        const res = await deps.fetch(`${apnsHost(environment)}/3/device/${row.token}`, {
            method: 'POST',
            headers: apnsHeaders(token, event),
            body: JSON.stringify(payload),
        });
        let reason = '';
        if (res.status !== 200) {
            try {
                reason = String(((await res.json()) as { reason?: unknown })?.reason ?? '');
            } catch { /* gövde yok */ }
            // Jeton yazılmıyor — yalnız cihaz ve sebep.
            console.error(`apns ${event} ${res.status} ${reason} device=${row.device_id} env=${environment}`);
        }
        return { outcome: apnsOutcome(res.status, reason), reason };
    } catch (cause) {
        console.error(`apns ${event} gönderilemedi`, String(cause));
        return { outcome: 'error', reason: '' };
    }
}

const otherEnv = (env: ApnsEnvironment): ApnsEnvironment => (env === 'sandbox' ? 'production' : 'sandbox');

/**
 * Tek itme. Jetonun ortamı telefonun tahmini (`__DEV__` → sandbox); tahmin
 * tutmazsa Apple `BadDeviceToken` diyor. O zaman ÖTEKİ ortam bir kez
 * deneniyor; tutarsa satırın ortamı düzeltiliyor — jeton ölü sayılmıyor.
 */
async function push(
    deps: Deps,
    key: ApnsKey,
    row: TokenRow,
    event: 'start' | 'end',
    payload: Record<string, unknown>,
): Promise<'ok' | 'dead' | 'error'> {
    const first = await pushOnce(deps, key, row, row.environment, event, payload);
    if (first.outcome !== 'dead' || first.reason !== 'BadDeviceToken') return first.outcome;
    const env = otherEnv(row.environment);
    const second = await pushOnce(deps, key, row, env, event, payload);
    if (second.outcome === 'ok') {
        const { error } = await deps.admin.from('live_activity_tokens')
            .update({ environment: env }).eq('id', row.id);
        if (error) console.error('jeton ortamı düzeltilemedi', error);
    }
    return second.outcome;
}

async function dropRows(deps: Deps, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await deps.admin.from('live_activity_tokens').delete().in('id', ids);
    if (error) console.error('live_activity_tokens silinemedi', error);
}

export interface StartBody {
    organization_id: string;
    staff_id: string;
    reservation_id: string;
    date?: string;
    customer?: string;
    service?: string;
    time?: string;
    arrived_at?: string;
    fallback: Record<string, unknown>;
}

/** "Geldi" → etkinliği başlat; açılamayan cihazlara bugünkü bildirim. */
export async function handleStart(deps: Deps, body: StartBody): Promise<Record<string, unknown>> {
    const started: string[] = [];
    let note = 'started';
    try {
        const key = await apnsKey(deps);
        if (!key) {
            note = 'no_apns_key';
        } else {
            const { data, error } = await deps.admin.from('live_activity_tokens')
                .select('id, device_id, token, environment')
                .eq('organization_id', body.organization_id)
                .eq('staff_id', body.staff_id)
                .eq('kind', 'start');
            if (error) {
                console.error('başlatma jetonları okunamadı', error);
                note = 'lookup_failed';
            } else if (!data || data.length === 0) {
                note = 'no_tokens';
            } else {
                const now = deps.now();
                const arrived = Date.parse(body.arrived_at ?? '');
                const props: ArrivalProps = {
                    name: (body.customer ?? '').trim() || 'Müşteri',
                    service: (body.service ?? '').trim(),
                    time: (body.time ?? '').trim(),
                    arrivedAt: Number.isFinite(arrived) ? arrived : now,
                };
                const payload = startPayload({
                    props, reservationId: body.reservation_id, dateISO: body.date ?? '', nowMs: now,
                });
                const rows = data as TokenRow[];
                const outcomes = await Promise.all(rows.map((row) => push(deps, key, row, 'start', payload)));
                const dead: string[] = [];
                rows.forEach((row, i) => {
                    if (outcomes[i] === 'ok') started.push(row.device_id);
                    else if (outcomes[i] === 'dead') dead.push(row.id);
                });
                await dropRows(deps, dead);
            }
        }
    } catch (cause) {
        // Beklenmeyen hata: etkinlik açıldığı BİLİNEN cihaz yine atlanıyor,
        // geri kalan herkes bildirimi alıyor.
        console.error('send-live-activity start', String(cause));
        note = 'error';
    }

    await deps.forwardPush(started.length > 0
        ? { ...body.fallback, excludeDeviceIds: started }
        : body.fallback);
    console.log(`live-activity start org=${body.organization_id} started=${started.length} note=${note}`);
    return { started: started.length, note };
}

export interface EndBody {
    organization_id: string;
    reservation_id: string;
}

/** Randevunun etkinliklerini bitir; gönderilen (ya da ölü) jetonun satırı silinir. */
export async function handleEnd(deps: Deps, body: EndBody): Promise<Record<string, unknown>> {
    const key = await apnsKey(deps);
    const { data, error } = await deps.admin.from('live_activity_tokens')
        .select('id, device_id, token, environment')
        .eq('organization_id', body.organization_id)
        .eq('reservation_id', body.reservation_id)
        .eq('kind', 'update');
    if (error) {
        console.error('etkinlik jetonları okunamadı', error);
        return { ended: 0, note: 'lookup_failed' };
    }
    const rows = (data ?? []) as TokenRow[];
    if (rows.length === 0) return { ended: 0, note: 'no_tokens' };
    // Anahtar yoksa jeton işe yaramaz — telefon öne gelince kendisi kapatıyor.
    if (!key) {
        await dropRows(deps, rows.map((row) => row.id));
        return { ended: 0, note: 'no_apns_key' };
    }
    const payload = endPayload(deps.now());
    const outcomes = await Promise.all(rows.map((row) => push(deps, key, row, 'end', payload)));
    // Gönderildiyse etkinlik bitti; ölüyse zaten işe yaramaz. Geçici hatada
    // satır kalıyor (12 saatlik süre ve telefonun mutabakatı temizliyor).
    await dropRows(deps, rows.filter((_, i) => outcomes[i] !== 'error').map((row) => row.id));
    const ended = outcomes.filter((outcome) => outcome === 'ok').length;
    console.log(`live-activity end org=${body.organization_id} ended=${ended}/${rows.length}`);
    return { ended };
}

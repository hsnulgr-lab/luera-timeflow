/**
 * APNs — "Müşteri bekliyor" Live Activity itmesinin SAF parçaları (göç 144).
 *
 * Ağ yok, Deno yok: imza WebCrypto'yla (Deno'da ve Node'da aynı), gövdeler
 * düz nesne. Node testleri bu dosyayı ÇALIŞTIRIYOR
 * (tests/musteri-bekliyor.test.mjs).
 *
 * ── Gövdenin biçimi expo-widgets'ten (tahmin değil) ─────────────────────────
 * `node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift`:
 *
 *   struct LiveActivityAttributes: ActivityAttributes {
 *     var url: String?
 *     struct ContentState: Codable, Hashable { var name: String; var props: String? }
 *   }
 *
 * Yani `content-state` bizim alanlarımız DEĞİL, sarmalayıcı:
 * `{ name: 'MusteriBekliyor', props: '<JSON METNİ>' }`. `name`, uygulamadaki
 * `createLiveActivity('MusteriBekliyor', …)` adıyla aynı olmak zorunda —
 * uzantı görünümü o adla buluyor, fabrika `getInstances()` o adla süzüyor.
 * Yanlışsa Apple 200 döner ve etkinlik sessizce boş kalır.
 *
 * Başlatmada `attributes-type: "LiveActivityAttributes"`, `attributes`
 * (`{ url }` — dokununca açılan derin bağlantı) ve `alert` ZORUNLU; `alert`
 * yoksa itme kabul edilir ama etkinlik başlamaz.
 */

/** Uygulamadaki `createLiveActivity` adı (mobile/src/lib/arrivalActivity.ts · ARRIVAL_ACTIVITY_NAME). */
export const ACTIVITY_NAME = 'MusteriBekliyor';
/** expo-widgets'in Swift tipinin adı. */
export const ATTRIBUTES_TYPE = 'LiveActivityAttributes';
/** Ana uygulamanın paket kimliği + Live Activity eki. */
export const APNS_TOPIC = 'ai.luera.timeflow.push-type.liveactivity';
/** Sağlayıcı jetonu Apple'da 60 dk geçerli; 20 dk'dan sık yenilenirse 429 `TooManyProviderTokenUpdates`. */
export const PROVIDER_TOKEN_TTL_MS = 50 * 60 * 1000;
/** Bayatlama: uygulama hiç açılmazsa sayaç bu kadar sonra soluklaşıyor (plan: geliş + 45 dk). */
export const STALE_AFTER_MS = 45 * 60 * 1000;

export type ApnsEnvironment = 'sandbox' | 'production';

export function apnsHost(environment: ApnsEnvironment): string {
    return environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
}

/** Etkinliğin props'u — uzantıya JSON metni olarak gidiyor. Uygulamadaki `ArrivalActivityProps` ile AYNI. */
export interface ArrivalProps {
    /** Müşterinin İLK adı (kilit ekranı herkese açık). */
    name: string;
    service: string;
    /** Randevu saati "HH:MM" (boş olabilir). */
    time: string;
    /** Geliş anı, ms — sayaç buradan yukarı sayıyor. */
    arrivedAt: number;
}

export function contentState(props: ArrivalProps): { name: string; props: string } {
    return { name: ACTIVITY_NAME, props: JSON.stringify(props) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dokununca açılan adres. Uygulamadaki `arrivalActivityUrl` ile birebir
 * (`+native-intent.tsx` bunu çözüyor). Personel kabuğu: tek kişilikte bu
 * etkinlik hiç açılmıyor.
 */
export function arrivalUrl(reservationId: string, dateISO: string): string {
    const parts = [`id=${encodeURIComponent(reservationId)}`];
    if (ISO_DATE.test(dateISO)) parts.push(`date=${dateISO}`);
    return `luera://bekliyor?${parts.join('&')}`;
}

/** "Ayşe · Kesim · 14:30" — bildirimin gövdesiyle aynı dizilim, emojisiz. */
export function alertBody(props: Pick<ArrivalProps, 'name' | 'service' | 'time'>): string {
    return [props.name, props.service, props.time].map((part) => part.trim()).filter(Boolean).join(' · ');
}

export function startPayload(input: {
    props: ArrivalProps;
    reservationId: string;
    dateISO: string;
    nowMs: number;
}): Record<string, unknown> {
    const seconds = Math.floor(input.nowMs / 1000);
    return {
        aps: {
            timestamp: seconds,
            event: 'start',
            'content-state': contentState(input.props),
            'attributes-type': ATTRIBUTES_TYPE,
            attributes: { url: arrivalUrl(input.reservationId, input.dateISO) },
            alert: { title: 'Müşterin geldi', body: alertBody(input.props) },
            sound: 'default',
            'stale-date': Math.floor((input.props.arrivedAt + STALE_AFTER_MS) / 1000),
            // iOS 18: sistem yeni etkinliğin güncelleme jetonunu uygulamaya
            // iletsin (uygulama arka planda uyandırılıyor). Eski iOS yok sayar.
            'input-push-token': 1,
        },
    };
}

/** Bitir: kilit ekranından HEMEN kalksın (`dismissal-date` = şimdi). */
export function endPayload(nowMs: number): Record<string, unknown> {
    const seconds = Math.floor(nowMs / 1000);
    return {
        aps: {
            timestamp: seconds,
            event: 'end',
            // Apple bitirmede de içerik istiyor; ekranda görünmüyor (hemen kalkıyor).
            'content-state': contentState({ name: '', service: '', time: '', arrivedAt: nowMs }),
            'dismissal-date': seconds,
        },
    };
}

export function apnsHeaders(providerToken: string, event: 'start' | 'end'): Record<string, string> {
    return {
        authorization: `bearer ${providerToken}`,
        'apns-push-type': 'liveactivity',
        'apns-topic': APNS_TOPIC,
        // Başlatma uyarı çalıyor → 10. Bitirme sessiz → 5 yeter, Apple'ın
        // bütçesini (sık 10 önceliği kısılıyor) başlatmaya saklıyor.
        'apns-priority': event === 'start' ? '10' : '5',
        'content-type': 'application/json',
    };
}

/**
 * APNs cevabı → ne yapılacak.
 *   ok    — teslim edildi
 *   dead  — jeton ölü ya da bu ortama ait değil: SATIR SİLİNİR
 *   error — sunucu/anahtar/geçici sorun: satır KALIR (jetonun suçu değil;
 *           tek bir yanlış anahtar bütün jetonları sildirmesin)
 */
export function apnsOutcome(status: number, reason: string): 'ok' | 'dead' | 'error' {
    if (status === 200) return 'ok';
    if (status === 410) return 'dead';
    if (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')) return 'dead';
    return 'error';
}

// ── Sağlayıcı jetonu (ES256) ────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlText(text: string): string {
    return b64url(new TextEncoder().encode(text));
}

/** `.p8` PEM metni → PKCS8 baytları. Satır sonları `\n` olarak kaçmış da gelebilir (env). */
export function pemToPkcs8(pem: string): Uint8Array {
    const body = pem.replace(/\\n/g, '\n')
        .replace(/-----BEGIN [^-]+-----/, '')
        .replace(/-----END [^-]+-----/, '')
        .replace(/\s+/g, '');
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Apple'ın sağlayıcı jetonu: `{alg: ES256, kid}` · `{iss: teamId, iat}`.
 * WebCrypto ECDSA imzası zaten JWS'in istediği r‖s (64 bayt) biçiminde.
 */
export async function signProviderToken(input: {
    keyPem: string;
    keyId: string;
    teamId: string;
    nowMs: number;
}): Promise<string> {
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemToPkcs8(input.keyPem),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
    );
    const head = b64urlText(JSON.stringify({ alg: 'ES256', kid: input.keyId }));
    const claims = b64urlText(JSON.stringify({ iss: input.teamId, iat: Math.floor(input.nowMs / 1000) }));
    const signing = `${head}.${claims}`;
    const signature = new Uint8Array(await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        new TextEncoder().encode(signing),
    ));
    return `${signing}.${b64url(signature)}`;
}

/** Bellekteki sağlayıcı jetonu — en çok `PROVIDER_TOKEN_TTL_MS`; anahtar değişince yenisi. */
let cached: { token: string; at: number; fingerprint: string } | null = null;

export async function providerToken(input: {
    keyPem: string;
    keyId: string;
    teamId: string;
    nowMs: number;
}): Promise<string> {
    const fingerprint = `${input.keyId}:${input.teamId}:${input.keyPem.length}`;
    if (cached && cached.fingerprint === fingerprint && input.nowMs - cached.at < PROVIDER_TOKEN_TTL_MS) {
        return cached.token;
    }
    const token = await signProviderToken(input);
    cached = { token, at: input.nowMs, fingerprint };
    return token;
}

/** Yalnız testler için. */
export function forgetProviderToken(): void {
    cached = null;
}

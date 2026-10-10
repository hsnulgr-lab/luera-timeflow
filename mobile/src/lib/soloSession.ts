/**
 * Tek kişilik kumandanın anahtarı (108 · Faz 2b).
 *
 * ── Çözdüğü duvar ───────────────────────────────────────────────────────────
 * Kumanda (`app/(staff-flow)/kumanda.tsx`) baştan sona dar personel API'si
 * üzerinde çalışıyor ve o API'nin kimliği `x-staff-token`: cihaz eşleme +
 * PIN ile alınıyor. Tek kişilik işletmenin sahibinin elinde Supabase MÜDÜR
 * oturumu var, personel jetonu yok — `call()` ilk istekte `no_session`
 * atıyordu ve işi başlatma / bitirme / adisyon yolu bu kabukta hiç
 * açılamıyordu.
 *
 * Buradaki iş tek cümle: sahibin Supabase oturumunu sunucuya gösterip
 * KENDİ personel satırı için bir personel jetonu almak. Üç kapı sunucuda
 * (`solo.session`): oturum sahibin olmalı, org gerçekten `solo` olmalı, ve
 * tek aktif personel bulunmalı.
 *
 * ── Neden sessiz ────────────────────────────────────────────────────────────
 * Öteki yol sahibin kendi telefonunu kendi personel satırına eşlemesiydi:
 * kod üret, kodu yaz, PIN belirle. Çalışırdı — ama tek kişilik modun bütün
 * amacı adımı azaltmak ve kendi telefonuna kendine kod yazdırmak o amacın
 * tam tersi. Sahip zaten giriş yapmış durumda; ikinci bir kimlik ritüeli
 * kullanıcıya hiçbir şey anlatmaz.
 *
 * ── Yetki genişlemiyor ──────────────────────────────────────────────────────
 * Org sahibi bu salonun her satırını Supabase oturumuyla zaten okuyup
 * yazabiliyor (RLS org bazlı). Alınan jeton onun yapabileceklerinin ALT
 * KÜMESİ: tek org, tek personel satırı, 12 saat, dar uç listesi.
 */

import { setStaffTokenRefresher, tokens } from '../api/staff';
import { supabase } from './supabase';

export type SoloSessionFailure =
    /** Sunucu "bu org tek kişilik değil" dedi — ya mod kapandı ya ekip eklendi. */
    | 'not_solo'
    /** Kadroda aktif personel yok; `set_business_mode` satırı açmamış olabilir. */
    | 'no_staff'
    /** Abonelik kapalı. */
    | 'subscription_inactive'
    /** Oturum sahibin değil ya da düşmüş. */
    | 'owner_required'
    /** Sunucuya ulaşılamadı. */
    | 'offline'
    | 'failed';

export class SoloSessionError extends Error {
    constructor(public reason: SoloSessionFailure) {
        super(reason);
    }
}

const KNOWN: readonly string[] = [
    'not_solo', 'no_staff', 'subscription_inactive', 'owner_required',
];

/**
 * Sunucudan personel jetonu alır ve saklar.
 *
 * `supabase.functions.invoke` Supabase oturumunu `Authorization` başlığında
 * kendisi gönderiyor — jetonu elle taşımıyoruz.
 */
export async function openSoloSession(): Promise<void> {
    const { data, error } = await supabase.functions.invoke('staff-api', {
        body: { action: 'solo.session' },
    });

    if (error) {
        // 4xx/5xx gövdesi `context`te; sebebi okumadan "başarısız" demiyoruz.
        const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
        const body = context?.json ? await context.json().catch(() => null) : null;
        const code = (body as { error?: string } | null)?.error ?? '';
        if (KNOWN.includes(code)) throw new SoloSessionError(code as SoloSessionFailure);
        // `context` yoksa istek hiç gitmedi: ağ yok.
        throw new SoloSessionError(context ? 'failed' : 'offline');
    }

    const token = (data as { token?: unknown } | null)?.token;
    if (typeof token !== 'string' || token.length === 0) {
        // Sunucu 200 dedi ama jeton yok. Sessizce geçmek, bir sonraki
        // isteğin anlaşılmaz bir 401'le düşmesi demekti.
        console.error('[tek] solo.session jetonsuz cevap döndü');
        throw new SoloSessionError('failed');
    }

    await tokens.setStaff(token);
}

/**
 * `src/api/staff.ts`e takılan tazeleyici.
 *
 * Yutuyor ve `false` dönüyor — ÇÜNKÜ ÇAĞIRANIN HATASI BU DEĞİL. Burası bir
 * isteğin ortasında, jeton eskidiği için çalışıyor; başarısız olursa asıl
 * isteğin kendi hatası yukarı çıkmalı, tazelemenin hatası onun üstüne
 * yazılmamalı. Sebep yine de günlüğe düşüyor, yoksa 401'in nereden geldiği
 * hiçbir yerde görünmezdi.
 */
async function refresh(): Promise<boolean> {
    try {
        await openSoloSession();
        return true;
    } catch (cause) {
        const reason = cause instanceof SoloSessionError ? cause.reason : 'failed';
        console.error('[tek] personel jetonu tazelenemedi:', reason);
        return false;
    }
}

/**
 * Tek kişilik kabuk açılınca takılır, kapanınca sökülür.
 *
 * Sökmek şart: aynı uygulama oturumunda kabuk değiştirilebiliyor (mod
 * değişimi, çıkış, başka hesapla giriş) ve takılı kalan bir tazeleyici,
 * personel kabuğundaki bir 401'de org oturumuna uzanmaya çalışırdı.
 */
export function attachSoloTokenRefresher(): () => void {
    setStaffTokenRefresher(refresh);
    return () => setStaffTokenRefresher(null);
}

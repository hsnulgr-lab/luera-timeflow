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

import { authApi } from '../api/session';
import { expectStaffOrg, setStaffTokenRefresher, tokens } from '../api/staff';
import { identityOf } from './staffIdentity.ts';
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

    /*
     * JETON SEÇİLİ SALONUN MU (2026-11-12). Sunucu jetonu oturumun salonu
     * için basıyor; cihazda seçili salon başkaysa (çok salonlu sahip, bayat
     * profil) bu jetonu saklamak kumandayı öteki salona yazdırmak olurdu.
     */
    const stored = await authApi.resume.get();
    const wanted = stored.ok && stored.data.actor === 'manager' ? stored.data.profile.business.id : null;
    const minted = identityOf(token);
    if (wanted && minted && minted.orgId !== wanted) {
        console.error('[tek] sunucu başka salonun jetonunu verdi; saklanmadı');
        throw new SoloSessionError('failed');
    }

    await tokens.setStaff(token);

    /*
     * KİMLİK DE SAKLANIYOR.
     *
     * Sahip müdür oturumuyla bağlı ve onun `profile.id`si bir Supabase
     * KULLANICI kimliği — `staff.id` değil. Kumandadaki "sık kullandıkların"
     * ızgarası kişinin kendi geçmişini bu kimlikle arıyor; yanlış kimlikle
     * hiçbir satır tutmuyor ve ızgara sessizce salon moduna düşüyor.
     * Sunucu doğru kimliği zaten söylüyor, atmanın anlamı yok.
     */
    const staffId = (data as { staff?: { id?: unknown } } | null)?.staff?.id;
    if (typeof staffId === 'string' && staffId.length > 0) await tokens.setSoloStaffId(staffId);
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
        // `not_solo` bir arıza değil, BAYAT MOD: saklı profil "tek kişilik"
        // diyor, sunucu artık demiyor. Kabuk haber alır ve modu yeniden okur
        // (`confirmSoloMode`); günlüğe hata diye düşmesi yanlış iz bırakırdı.
        if (reason === 'not_solo') {
            console.warn('[tek] sunucu bu işletmeyi tek kişilik saymıyor; mod yeniden okunuyor');
            notSoloListener?.();
        } else {
            console.error('[tek] personel jetonu tazelenemedi:', reason);
        }
        return false;
    }
}

/**
 * `not_solo` gelince haber verilecek tek dinleyici — tek kişilik kabuk.
 *
 * Tek yuva, liste değil: aynı anda yalnız bir kabuk açık. Sökerken yalnız
 * kendi takılanını söküyor; arada başka bir kabuk takmışsa onunkine dokunmaz.
 */
let notSoloListener: (() => void) | null = null;

export function onNotSolo(listener: () => void): () => void {
    notSoloListener = listener;
    return () => {
        if (notSoloListener === listener) notSoloListener = null;
    };
}

/**
 * Saklı profildeki mod hâlâ doğru mu — sunucudan YENİDEN okuyarak.
 *
 * ── Neden gerekli ───────────────────────────────────────────────────────────
 * Kabuk kapısı (`useActorGate`) bilerek SAKLI profili okuyor; profil yalnız
 * işletme seçilirken yazılıyor. Mod o arada başka yerden değişirse —
 * masaüstünden personel eklenir, kurulum sihirbazında "Yalnız ben" seçilir —
 * telefon eski kabukta kalıyor. Test Salon 2 (2026-11-10) tam buydu: tek
 * kişilik kabuk açıldı, `solo.session` `not_solo` dedi, Gün'den açılan
 * randevu kartı "Randevuyu okuyamadık" gösterdi.
 *
 * İşletme yeniden SEÇİLİYOR (`selectBusiness`): o yol org satırını ve aktif
 * kadroyu okuyup profili yeniden yazıyor; mod `soloInPractice` kuralıyla
 * çıkıyor. Böylece bir sonraki açılış da doğru kabuğa gider.
 *
 * Dönüş: `true`/`false` okunan mod; `undefined` okunamadı (ağ yok, oturum
 * düşmüş, abonelik kapalı) — "bilmiyoruz", kabuk YERİNDE KALIR.
 */
export async function confirmSoloMode(): Promise<boolean | undefined> {
    const stored = await authApi.resume.get();
    if (!stored.ok || stored.data.actor !== 'manager') return undefined;
    const fresh = await authApi.manager.selectBusiness(stored.data.profile.business.id);
    if (!fresh.ok) return undefined;
    const solo = Boolean(fresh.data.profile.business.solo);
    // Ekip düzenine geçiliyorsa tek kişilik jetonu düşüyor — `startTeam`in
    // yaptığının aynısı: sunucu onu artık yenilemez.
    if (!solo) await tokens.clearStaff();
    return solo;
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
    /*
     * Jetonun SALONU denetleniyor (2026-11-12): jetonun kendi `org` iddiası
     * seçili salonla tutmuyorsa `call()` onu kullanmıyor, siliyor ve
     * tazeleyiciden yenisini istiyor. Org kimliği jetonun içinde saklı —
     * ayrı bir anahtarda tutulsaydı jetonla ayrışabilirdi.
     */
    let alive = true;
    void authApi.resume.get().then((stored) => {
        if (!alive) return;
        expectStaffOrg(stored.ok && stored.data.actor === 'manager' ? stored.data.profile.business.id : null);
    }).catch(() => undefined);
    return () => {
        alive = false;
        setStaffTokenRefresher(null);
        expectStaffOrg(null);
    };
}

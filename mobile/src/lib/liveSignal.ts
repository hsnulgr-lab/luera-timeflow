/**
 * CANLI SİNYAL — "salonda bir şey değişti" haberi.
 *
 * Ekranlar bugüne kadar YOKLAYARAK öğreniyordu: açıkken 25 saniyede bir
 * sunucuya "ne var ne yok" diye soruyorlardı. Masaüstünden bir randevu
 * oluşturulduğunda telefona düşmesi en kötü 25 saniye sürüyordu.
 *
 * ── Sinyal VERİ TAŞIMIYOR ───────────────────────────────────────────────────
 * Kanaldan geçen tek şey "değişti" kelimesi. Ekran bunu duyunca veriyi HER
 * ZAMANKİ yoldan çekiyor — müdür doğrudan Supabase'den (RLS), personel
 * `staff-api`'den (personel token'ı). Yani izin kontrolü hiç yer değiştirmiyor
 * ve kanaldan hiçbir salon verisi geçmiyor.
 *
 * Kapı zili benzetmesi: zil çalınca kimin geldiğini bilmiyorsun, kapıya gidip
 * bakman gerekiyor. Ama artık her on saniyede bir kapıyı açıp sokağa
 * bakmıyorsun.
 *
 * ── Neden tek bir yer ───────────────────────────────────────────────────────
 * Her ekranın kendi aboneliğini kurması, aynı org için beş ayrı websocket
 * demekti. Burada org başına TEK kanal var; ekranlar ona dinleyici takıyor.
 * Son dinleyici gidince kanal kapanıyor.
 *
 * ── Yoklama KALKMIYOR ───────────────────────────────────────────────────────
 * Sinyal bir hızlandırıcı, bir garanti değil: websocket kopabilir, telefon
 * uyuyabilir, sunucu yeniden başlayabilir. Yoklama emniyet ağı olarak duruyor
 * (`freshness.POLL_MS`) ve öne dönüşte zaten bir okuma yapılıyor. Sinyale
 * güvenip yoklamayı kapatmak, sessizce bayatlayan bir ekran üretirdi.
 */

import { useEffect } from 'react';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabase, supabaseConfigured } from './supabase';
import { onForgetOrg, resolveOrg } from './managerSource';
import { api, tokens } from '../api/staff';

type Listener = () => void;

/**
 * Dinleyiciler KANALDAN BAĞIMSIZ.
 *
 * İkisini birbirine bağlamak ince bir arıza üretiyordu: salon değişince kanal
 * kapanıyor, o kanala takılı dinleyiciler de onunla birlikte gidiyordu. Ekran
 * açık kalmaya devam ediyor ama artık hiçbir sinyal duymuyordu — ve bunu
 * kimse fark etmezdi, çünkü yoklama ekranı yine de tazeliyor. Sessizce ölen
 * bir hızlandırıcı, hiç olmayanından kötü.
 */
const listeners = new Set<Listener>();

interface Channel {
    orgId: string;
    close: () => void;
}

let channel: Channel | null = null;
/** Aynı anda iki kurulum başlamasın — iki websocket, iki kat olay demekti. */
let opening = false;

/**
 * Art arda gelen olaylar TEK tazelemeye iniyor.
 *
 * Bir randevunun taşınması iki satır güncelleyebiliyor; masaüstünde bir
 * adisyon beş kalem birden yazıyor. Her olayda bir okuma açmak, tek bir işlem
 * için beş kez sunucuya gitmek olurdu.
 */
const COALESCE_MS = 300;

/** Art arda gelen olayları tek tazelemeye indiren tetikleyici. */
function ringer(): { ring: () => void; stop: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
        ring: () => {
            if (timer) return;
            timer = setTimeout(() => {
                timer = null;
                for (const listener of [...listeners]) listener();
            }, COALESCE_MS);
        },
        stop: () => { if (timer) clearTimeout(timer); },
    };
}

/**
 * PERSONELİN ZİLİ (100).
 *
 * Personelin telefonunda Supabase oturumu YOK ve olmayacak — olsaydı RLS org
 * seviyesinde çalıştığı için salonun bütün verisi o telefona açılırdı. Bunun
 * yerine `staff-api` dar kapsamlı bir jeton üretiyor: rolü `staff_rt`, o rolün
 * hiçbir tabloda yetkisi yok, tek yaptığı kendi org'unun zilini duymak.
 *
 * AYRI İSTEMCİ: jeton paylaşılan istemciye takılsaydı müdürün oturumunu ezerdi
 * ve aynı istemci üzerinden yapılan her REST çağrısı bu yetkisiz jetonla
 * gitmeye başlardı. Bu istemci yalnız websocket için var, oturum saklamıyor.
 *
 * Jeton bir saat yaşıyor; kanal açık kaldıkça süresi dolmadan yenileniyor.
 */
async function openStaffRing(ring: () => void): Promise<Channel | null> {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) return null;

    const first = await api.realtimeToken().catch(() => null) as
        { token?: string; topic?: string; expiresIn?: number } | null;
    if (!first?.token || !first.topic) return null;

    const client: SupabaseClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    /*
     * BEKLENMESİ ŞART. `setAuth` bir söz döndürüyor; beklemeden `subscribe`
     * çağrılırsa kanal jeton uygulanmadan katılıyor, sunucu kimliksiz görüp
     * özel kanala almıyor ve zil hiç çalmıyor. Telefonda tam olarak bu oldu:
     * ekran doğru çalışmaya devam etti (yoklama emniyet ağı), yalnız "anında"
     * olmadı.
     */
    await client.realtime.setAuth(first.token);

    const live = client
        .channel(first.topic, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, ring)
        .subscribe((status, error) => {
            /*
             * Katılım sonucu SESSİZ KALMIYOR. Zil bir hızlandırıcı olduğu için
             * arızası ekranda görünmüyor — kanal ölse de liste yoklamayla
             * tazelenmeye devam ediyor. Sessizce ölen bir hızlandırıcı, hiç
             * olmayanından kötü: hiç değilse günlükte izi olsun.
             */
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.warn('canlı zil kapandı', status, error?.message ?? '');
            }
        });

    /*
     * Jeton yenileme. Süre dolmadan ÖNCE (beşte dördünde) tazeleniyor:
     * Realtime süresi geçmiş jetonu olan bağlantıyı düşürüyor ve kanal
     * sessizce ölüyordu — telefonda hiçbir iz bırakmadan.
     */
    const period = Math.max(60, Math.floor((first.expiresIn ?? 3600) * 0.8)) * 1000;
    const renew = setInterval(() => {
        void api.realtimeToken()
            .then(async (next) => {
                const token = (next as { token?: string })?.token;
                if (token) await client.realtime.setAuth(token);
            })
            .catch(() => undefined);
    }, period);

    return {
        orgId: first.topic.replace(/^org:/, ''),
        close: () => {
            clearInterval(renew);
            void client.removeChannel(live);
        },
    };
}

/**
 * MÜDÜRÜN KANALI — kendi Supabase oturumuyla, masaüstündekinin aynısı
 * (`src/hooks/useReservations.ts`).
 *
 * Süzgeç org: RLS üye olunan bütün org'ları açıyor, süzgeçsiz bir abonelik
 * başka salonun hareketini de duyardı.
 */
async function openManagerChannel(ring: () => void): Promise<Channel | null> {
    const choice = await resolveOrg().catch(() => null);
    if (!choice?.ok) return null;
    const orgId = choice.id;

    const live = supabase
        .channel(`live:${orgId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'reservations', filter: `organization_id=eq.${orgId}` },
            ring,
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'payments', filter: `organization_id=eq.${orgId}` },
            ring,
        )
        .subscribe();

    return { orgId, close: () => { void supabase.removeChannel(live); } };
}

async function ensure(): Promise<void> {
    if (channel || opening || listeners.size === 0 || !supabaseConfigured) return;
    opening = true;
    const beat = ringer();
    try {
        /*
         * HANGİ TAŞIYICI: personel token'ı varsa zil, yoksa müdürün kanalı.
         * Sıra önemli — aynı telefonda ikisi birden bulunabiliyor (müdür kendi
         * telefonunu personel olarak da bağlamış olabilir) ve o telefonda
         * açık olan ekran personel kabuğudur.
         */
        const staff = await tokens.staff().catch(() => null);
        const opened = staff
            ? await openStaffRing(beat.ring).catch(() => null)
            : await openManagerChannel(beat.ring).catch(() => null);

        // Dinleyici bu arada gitmiş olabilir: boşa kanal açık kalmasın.
        if (!opened) return;
        if (channel || listeners.size === 0) { opened.close(); return; }
        channel = { orgId: opened.orgId, close: () => { beat.stop(); opened.close(); } };
    } finally {
        opening = false;
    }
}

function closeChannel(): void {
    const open = channel;
    channel = null;
    open?.close();
}

/**
 * Ekran açıkken canlı sinyali dinler; kapanınca bırakır.
 *
 * `onChange` ÇAĞIRAN TARAFTA sabitlenmeli (`useCallback`), yoksa her çizimde
 * abonelik kurulup yıkılır.
 */
export function useLiveSignal(onChange: () => void, enabled = true): void {
    useEffect(() => {
        if (!enabled) return undefined;
        listeners.add(onChange);
        void ensure();
        return () => {
            listeners.delete(onChange);
            // Son dinleyici gitti: websocket boşuna açık durmasın.
            if (listeners.size === 0) closeChannel();
        };
    }, [onChange, enabled]);
}

/**
 * Oturum ya da salon değişti: kanal artık YANLIŞ org'u dinliyor olabilir.
 *
 * `forgetOrg` çağrıldığı an kendiliğinden kapanıyor — her çağıran ekranın
 * ayrıca hatırlaması gereken bir şey olmasın diye kaynağa kaydoluyoruz.
 * Açık ekran varsa kanal DOĞRU org'la yeniden kuruluyor.
 */
export function forgetLive(): void {
    closeChannel();
    void ensure();
}

onForgetOrg(forgetLive);

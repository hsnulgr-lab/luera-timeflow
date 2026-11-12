/**
 * Müdür ekranlarının ORTAK okuma davranışı.
 *
 * ── Neden genel bir kanca ───────────────────────────────────────────────────
 * Personel tarafında aynı davranış iki kez yazıldı (`useAgenda`, `useSalonDay`)
 * ve ikisi arasındaki küçük farklar iki kez ayrı ayrı öğrenildi. Müdürün yedi
 * ekranı var; yedi kez yazmak, aynı arızayı yedi kez keşfetmek olurdu.
 *
 * Davranış o iki kancayla BİREBİR aynı tutuldu — müdür ikinci bir davranış
 * öğrenmesin:
 *
 *   • üç hâl: yükleniyor · tamam · okunamadı
 *   • ekran AÇIKKEN 25 sn'de bir sessiz yoklama, arka planda hiç
 *   • öne dönüşte ve sekmeye dönüşte sessiz tazeleme
 *   • yoklama, öne dönüş ve canlı zil YALNIZ ODAKTAKİ ekranı okutur (Hız 1).
 *     Sekmeler kurulu kaldığı için her zil beş ekranı birden okutuyordu;
 *     odakta olmayan ekran yalnız "kirli" işaretleniyor ve odağa dönünce
 *     TEK okuma yapıyor.
 *   • sessiz okumanın hatası YUTULUR — çalışan bir ekranı bozmak, bayat
 *     göstermekten kötü
 *   • aşağı çekip yenileme görünür: söz döner, kaydırıcı okuma bitene kadar
 *     tutulabilir
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';

import { isStale, POLL_MS } from './freshness.ts';
import { useLiveSignal, type LiveTable } from './liveSignal';
import type { OrgRefusal } from './managerMap.ts';
import { OrgError } from './managerSource';

export type ManagerReadState = 'loading' | 'ok' | 'error';

export interface ManagerSnapshot<T> {
    state: ManagerReadState;
    data: T;
    /**
     * Org reddi — ağ hatasından AYRI taşınıyor.
     *
     * `error` hâli "okuyamadık" demek ve beklemek bir seçenek. Red öyle
     * değil: erişim kaldırılmışsa beklemek hiçbir şeyi değiştirmez. İkisini
     * tek hâle sıkıştırmak, müdürü boşuna bekletirdi.
     */
    refusal: OrgRefusal | null;
    /** Son BAŞARILI okumanın anı. */
    at: number | null;
    stale: boolean;
    reload: () => Promise<void>;
}

/** Bayatlık saatinin adımı — eşikten (120 sn) küçük olması yeter. */
const STALE_TICK_MS = 30_000;

/**
 * `read` ÇAĞIRAN TARAFTA sabitlenmeli (`useCallback`), yoksa her çizimde yeni
 * bir işlev gelir ve yoklama sonsuz kurulup yıkılır.
 *
 * `initial` yalnız ilk çizimde okunuyor; sonraki değerleri göz ardı edilir.
 */
export function useManagerRead<T>(
    read: () => Promise<T>,
    initial: T,
    /**
     * `poll: false` — 25 sn'lik yoklama KURULMUYOR; öne ve sekmeye dönüşte
     * tazeleme sürüyor. Müşteri defteri gibi binlerce satırlık bir okumayı
     * ekran açıkken yarım dakikada bir çekmek, değişmeyen bir listeye bant
     * genişliği harcamaktı.
     */
    options: {
        poll?: boolean;
        /**
         * Yalnız bu tablolar değişince tazele (101). VERİLMEZSE her zil
         * uyandırır — bu kanca yedi ekranın ortak yolu ve neyin okunduğunu
         * bilmiyor, o yüzden varsayılan bilerek "fazla tazele".
         */
        tables?: readonly LiveTable[];
        /**
         * `active: false` — ekran odakta olsa da okumayı ODAK DIŞI say
         * (Hız 1). Kök sağlayıcı için: kabuk odakta ama açık sekme onun
         * verisini kullanmıyor (Takvim, Profil). Yoklama ve zil durur, zil
         * yalnız kirli işaretler; yeniden etkinleşince TEK okuma.
         */
        active?: boolean;
    } = {},
): ManagerSnapshot<T> {
    const poll = options.poll !== false;
    const active = options.active !== false;
    const [state, setState] = useState<ManagerReadState>('loading');
    const [data, setData] = useState<T>(initial);
    const [refusal, setRefusal] = useState<OrgRefusal | null>(null);
    const [at, setAt] = useState<number | null>(null);
    const [stale, setStale] = useState(false);
    /** Sayaç `at`i okuyor ama ona BAĞLANMIYOR: her okumada yeniden kurulmasın. */
    const atRef = useRef<number | null>(null);
    /**
     * Geç dönen cevap, sonrakini EZMESİN.
     *
     * Personel tarafında bu, istenen günü karşılaştırarak yapılıyordu. Burada
     * okunan şeyin ne olduğu bilinmiyor, o yüzden her okumaya bir sıra numarası
     * veriliyor: yalnız EN SON açılan okuma yazabiliyor.
     */
    const turn = useRef(0);
    /*
     * ODAK (Hız 1). Sekmeler kurulu kalıyor: odak kontrolü olmadan Akış
     * açıkken Takvim, Kasa ve Oluştur da her zilde ve her 25 sn'de okuyordu.
     *
     *   • `focused` — ekran şu an odakta mı. Çizimi tetiklemesin diye ref.
     *   • `dirty`   — odakta değilken zil/öne dönüş geldi; odağa dönüşte oku.
     *   • `readSinceBlur` — odak kaybından sonra bir okuma ZATEN açıldı mı.
     *     İlk açılışta kuruluş okuması ile odak okuması aynı anda geliyordu
     *     (çift okuma); bu bayrak ikincisini düşürüyor.
     */
    const navigation = useNavigation();
    /*
     * Gezinme nesnesi BAĞIMLILIK DEĞİL: React Navigation yığın değişince onu
     * yeniden üretiyor (bkz. `shellRoot.useShellIsRoot`) ve kuruluş okuması
     * her yığın değişiminde tekrarlanırdı.
     */
    const navRef = useRef(navigation);
    useEffect(() => { navRef.current = navigation; }, [navigation]);
    const focused = useRef(false);
    const dirty = useRef(false);
    const readSinceBlur = useRef(false);

    const run = useCallback((visible: boolean) => {
        turn.current += 1;
        const mine = turn.current;
        readSinceBlur.current = true;
        dirty.current = false;
        return read()
            .then((next) => {
                if (turn.current !== mine) return;
                setData(next);
                setRefusal(null);
                const now = Date.now();
                atRef.current = now;
                setAt(now);
                setStale(false);
                setState('ok');
            })
            .catch((cause: unknown) => {
                if (turn.current !== mine) return;
                /*
                 * RED, SESSİZ TURDA DA GÖRÜNÜR.
                 *
                 * Sessiz yoklamanın hatasını yutma kuralının tek istisnası.
                 * Gerekçe: red geçici DEĞİL — org listesi BAŞARIYLA okunduğu
                 * hâlde saklı salon içinde yok demek. Bunu yutmak, müdüre
                 * erişimi olmayan bir salonun bayat verisini göstermeye devam
                 * etmek olurdu.
                 */
                if (cause instanceof OrgError) {
                    setRefusal(cause.reason);
                    setState('error');
                    return;
                }
                // ELDEKİ veri DURUYOR.
                if (visible) setState('error');
            });
    }, [read]);

    useEffect(() => {
        void run(true);
        // Odakta DEĞİLKEN kurulduysa (önceden yüklenen sekme) bu okuma ilk
        // odakta tekrarlansın: arada ne değiştiği bilinmiyor.
        if (!navRef.current.isFocused()) dirty.current = true;
    }, [run]);

    /** Zil ve öne dönüş: odaktaysa oku, değilse yalnız kirli işaretle. */
    const nudge = useCallback(() => {
        if (focused.current) void run(false);
        else dirty.current = true;
    }, [run]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') nudge();
        });
        return () => sub.remove();
    }, [nudge]);

    /*
     * SEKMEYE DÖNÜŞ + YOKLAMA — ikisi de odağın ömrüne bağlı.
     *
     * Odağa dönüşte HER ZAMAN bir okuma (alt ekranda yapılan değişiklik
     * zil gelmese de yansısın); tek istisna aynı anda açılmış kuruluş
     * okuması. Yoklama sayacı yalnız odakta kurulu: odak kaybında söküldüğü
     * için arkadaki sekmeler 25 sn'de bir okumuyor.
     */
    useFocusEffect(useCallback(() => {
        // Etkin değil: odak dışı gibi davran — dönüşte okunması için işaretle.
        if (!active) {
            readSinceBlur.current = false;
            return undefined;
        }
        focused.current = true;
        if (dirty.current || !readSinceBlur.current) void run(false);
        const id = poll ? setInterval(() => {
            if (AppState.currentState !== 'active') return;
            void run(false);
        }, POLL_MS) : null;
        return () => {
            focused.current = false;
            readSinceBlur.current = false;
            if (id !== null) clearInterval(id);
        };
    }, [run, poll, active]));

    /*
     * CANLI SİNYAL — yoklamanın yerine değil, ÜSTÜNE.
     *
     * Masaüstünden bir randevu oluşturulduğunda 25 saniye beklemek yerine
     * saniyesinde tazeleniyor — ODAKTAKİ ekranda. Abonelik odak dışında da
     * açık kalıyor (kanal kapanıp açılmasın, kirli işareti kaçmasın).
     * Sessiz tur: çalışan bir ekranı "yükleniyor"a düşürmek, sinyali
     * gürültüye çevirirdi.
     */
    useLiveSignal(nudge, true, options.tables);

    useEffect(() => {
        const id = setInterval(() => {
            setStale(isStale(atRef.current, Date.now()));
        }, STALE_TICK_MS);
        return () => clearInterval(id);
    }, []);

    // Olay işleyicisi — efekt değil; buradaki senkron `setState` bedelsiz.
    const reload = useCallback(() => {
        setState('loading');
        return run(true);
    }, [run]);

    return { state, data, refusal, at, stale, reload };
}

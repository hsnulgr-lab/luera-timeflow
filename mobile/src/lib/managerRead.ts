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
 *   • sessiz okumanın hatası YUTULUR — çalışan bir ekranı bozmak, bayat
 *     göstermekten kötü
 *   • aşağı çekip yenileme görünür: söz döner, kaydırıcı okuma bitene kadar
 *     tutulabilir
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

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
    } = {},
): ManagerSnapshot<T> {
    const poll = options.poll !== false;
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

    const run = useCallback((visible: boolean) => {
        turn.current += 1;
        const mine = turn.current;
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

    useEffect(() => { void run(true); }, [run]);

    useEffect(() => {
        if (!poll) return undefined;
        const id = setInterval(() => {
            if (AppState.currentState !== 'active') return;
            void run(false);
        }, POLL_MS);
        return () => clearInterval(id);
    }, [run, poll]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void run(false);
        });
        return () => sub.remove();
    }, [run]);

    useFocusEffect(useCallback(() => { void run(false); }, [run]));

    /*
     * CANLI SİNYAL — yoklamanın yerine değil, ÜSTÜNE.
     *
     * Masaüstünden bir randevu oluşturulduğunda 25 saniye beklemek yerine
     * saniyesinde tazeleniyor. Sessiz tur (`run(false)`): çalışan bir ekranı
     * "yükleniyor"a düşürmek, sinyali gürültüye çevirirdi.
     */
    useLiveSignal(useCallback(() => { void run(false); }, [run]), true, options.tables);

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

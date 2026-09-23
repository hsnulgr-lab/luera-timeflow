/**
 * Personel 05 — kumandanın açtığı ZİYARETİN kaynağı.
 *
 * Kumanda bir randevuyu kimliğinden açıyor. Bugüne kadar o kimliği sahte
 * ajandada arıyordu ve BULAMAZSA listenin İKİNCİ randevusunu açıyordu
 * (`?? list[1]`). Canlıda bu, yanlış müşterinin kartını açmak demek: adisyon
 * o kişiye yazılır, formül o kişinin dosyasına düşerdi.
 *
 * Bulunamayan randevu artık `missing`. Yanlış bir kart açmaktansa hiçbir şey
 * açmamak — müşteri sayfasındaki kuralın aynısı.
 *
 * ── Sahte kipte SAAT DONUYOR ────────────────────────────────────────────────
 * `demoAgenda` saatleri "şimdi"ye göre üretiyor. Her okumada yeniden
 * üretilirse randevu saatleri kayıyor ve sayaç yerinde saymaya başlıyor; o
 * yüzden çapa kancanın içinde bir kez donduruluyor. Canlıda böyle bir sorun
 * yok: saatler sunucudan geliyor ve değişmiyor.
 *
 * ── OKUMAK ile BENİMSEMEK ayrı ──────────────────────────────────────────────
 * Bu ayrım olmadan iyimser kilit SESSİZCE ÇÖZÜLÜYORDU.
 *
 * Kilit şunu söylüyor: "bu adisyonu S damgasındaki hâline bakarak yazıyorum."
 * Yani damga, ekrandaki kalemlerin TÜRETİLDİĞİ okumaya ait olmak zorunda.
 * Oysa odağa her dönüşte tam bir okuma yapılıyor ve `updatedAt` ilerliyordu —
 * kumandadaki kalemler ise yerelde, eski hâlinden türemiş hâlde duruyordu
 * (sıfırlama `base?.id`ye bağlı, bilerek). Sonuç:
 *
 *   1. personel kalem ekler
 *   2. kasiyer masaüstünden adisyona dokunur → sunucunun damgası ilerler
 *   3. personel Müşteriler'e geçip geri döner → damga YENİLENİR
 *   4. personel gönderir → kilit uyar ve KASİYERİN EKLEDİĞİ SİLİNİR
 *
 * Kilidin engellemek için var olduğu şeyin ta kendisi. Artık okuma iki
 * çeşit: BENİMSEME (ilk açılış ve personelin kendi tazelemesi) damgayı da
 * kalemleri de tazeliyor; GÖZLEM (yoklama, odak, öne dönüş) yalnız sunucunun
 * damgasına bakıyor ve değiştiyse söylüyor. Gözlem hiçbir şeyi ezmiyor.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api, type Appointment } from '../api/staff';
import { clockText, todayISO } from './calendar.ts';
import { POLL_MS } from './freshness.ts';
import { useLiveSignal } from './liveSignal';
import { demoAgenda, type DemoAppointment } from './staffDemo.ts';
import { isNewer, type StampObservation } from './visitStamp.ts';

export type VisitState = 'loading' | 'ok' | 'missing' | 'error';

export interface VisitSnapshot {
    state: VisitState;
    visit: DemoAppointment | null;
    /**
     * Satırın son GÖRÜLEN damgası — iyimser kilidin girdisi.
     *
     * Ekranın çizdiği hiçbir şeyde kullanılmıyor; yalnız yazarken geri
     * gönderiliyor ki sunucu "sen bunu okuduktan sonra başkası yazdı mı"
     * sorusunu cevaplayabilsin. `DemoAppointment`a eklenmedi: ekranın
     * modeline ait değil, yazma yolunun taşıdığı bir dip not.
     */
    updatedAt: string | null;
    /**
     * Sunucudaki kopya, BENİMSEDİĞİMİZDEN beri değişti mi.
     *
     * Değiştiyse yazma `409 items_stale` alacak — ama asıl mesele o değil:
     * personel 40 dakikalık boya beklemesi boyunca ekranda kalıyor ve
     * masaüstündeki değişiklikten haberi olmuyor. Kaybı sonradan bildirmek
     * yerine önce haber vermek, kaybı hiç doğurmuyor.
     */
    changed: boolean;
    /** Sunucuda en son görülen damga — benimsenmiş olmak zorunda değil. */
    serverAt: string | null;
    /** O damgayla birlikte görülen kalemler. */
    seenItems: unknown;
    /** Kumandanın son BAŞARIYLA yazdığı kalemler; benimsemede sıfırlanır. */
    ownItems: unknown;
    /**
     * Kumandanın KENDİ yazmasının cevabını gözlem olarak işler.
     *
     * Yazma cevabı sunucunun yeni damgasını taşıyor. İşlenmezse yirmi beş
     * saniye sonraki yoklama o damgayı "başka biri değiştirdi" diye okuyordu
     * (bkz. `visitStamp.ts`). `own` yalnız kalem yazmasında doğru: yazılan
     * liste kumandanın kendi listesi.
     */
    observe: (observation: StampObservation | null | undefined, own?: boolean) => void;
    /**
     * Kaçıncı BENİMSEME. Ekran kendi türettiği kalemleri buna bakarak
     * yeniliyor: sayı artmadan hiçbir arka plan okuması yerel listeye
     * dokunamaz.
     */
    version: number;
    reload: () => Promise<void>;
}

/** `agendaSource.toRow` ile AYNI indirgeme — saat biçimi sınırda çözülüyor. */
function toVisit(row: Appointment): DemoAppointment {
    return {
        id: row.id,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        service: row.service,
        notes: row.notes,
        date: row.date,
        start_time: clockText(row.start_time),
        end_time: clockText(row.end_time),
        status: row.status,
        customer_arrived_at: row.customer_arrived_at ?? null,
        arrived_at: row.arrived_at,
        service_ended_at: row.service_ended_at,
        adisyon_items: row.adisyon_items,
        is_paid: row.is_paid,
        // Formül SUNUCUDAN taşınıyor. `RES_COLS` onu her okumada gönderiyordu
        // ama buradan geçmiyordu: kumanda formülü yerel bir depoda tutuyor ve
        // uygulama kapanınca kaybediyordu.
        formula: row.formula,
    };
}

/** Kumandanın ziyareti de `agenda` ucundan besleniyor: tek tablo. */
const LIVE_TABLES = ['reservations'] as const;

export function useVisit(id: string | undefined): VisitSnapshot {
    const [state, setState] = useState<VisitState>('loading');
    const [visit, setVisit] = useState<DemoAppointment | null>(null);
    /** BENİMSENEN damga — yazarken sunucuya geri gidecek olan. */
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    /**
     * Sunucuda EN SON görülen damga ve o anki kalemler — TEK durum.
     *
     * İkisi ayrı tutulsaydı biri güncellenip öteki eski kalabilirdi: yeni
     * damga eski kalemlerle karşılaştırılır ve yabancı değişiklik kararı
     * yanlış verilirdi.
     */
    const [seen, setSeen] = useState<StampObservation | null>(null);
    const [ownItems, setOwnItems] = useState<unknown>(null);
    const [version, setVersion] = useState(0);
    /**
     * Sahte günün çapası — bkz. dosya başı. `useRef(Date.now())` DEĞİL:
     * o çağrı çizim sırasında oluyor ve derleyici saf olmayan çağrıyı
     * reddediyor (react-hooks/purity). Durum başlatıcısı bir KEZ çalışıyor.
     */
    const [anchor] = useState(() => Date.now());

    /**
     * `adopt` false ise bu bir GÖZLEM: ekranda hiçbir şey değişmiyor, yalnız
     * sunucunun damgası not ediliyor. Yerel kalemlerin altından liste
     * çekilmiyor ve kilit sessizce yeni damgaya kaymıyor.
     */
    const read = useCallback((visible: boolean, adopt: boolean) => {
        const today = todayISO();
        const load: Promise<{ row: DemoAppointment | null; stamp: string | null }> = LIVE_AUTH
            ? api.agenda(today).then((data) => {
                const list = (data as { appointments?: Appointment[] }).appointments ?? [];
                const row = list.find((item) => item.id === id);
                return { row: row ? toVisit(row) : null, stamp: row?.updated_at ?? null };
            })
            : Promise.resolve({
                row: demoAgenda(anchor, today).find((item) => item.id === id) ?? null,
                stamp: null,
            });
        return load
            .then((next) => {
                const observed = next.stamp ? { stamp: next.stamp, items: next.row?.adisyon_items ?? [] } : null;
                // Geç dönen yoklama, arada benimsenmiş YENİ damgayı ezmiyor.
                if (observed) setSeen((current) => (isNewer(observed.stamp, current?.stamp) ? observed : current));
                if (!adopt) {
                    // Randevu BULUNAMADIYSA bu bir gözlem değil bir olgu:
                    // silinmiş ya da başka personele geçmiş. Elde tutmak,
                    // olmayan bir ziyarete yazdırmak olurdu.
                    if (!next.row) setState('missing');
                    return;
                }
                setVisit(next.row);
                setUpdatedAt(next.stamp);
                // Benimseme her şeyi SIFIRLIYOR: artık temel liste sunucununki.
                setSeen(observed);
                setOwnItems(null);
                setVersion((n) => n + 1);
                setState(next.row ? 'ok' : 'missing');
            })
            .catch(() => {
                // ELDEKİ kart DURUYOR: okunamayan bir randevu, olmayan bir
                // randevu değildir.
                if (visible) setState('error');
            });
    }, [anchor, id]);

    useEffect(() => { void read(true, true); }, [read]);

    /*
     * YOKLAMA — yalnız damgaya bakıyor ve yalnız uygulama öndeyken.
     *
     * Kalemleri düzenlerken listeyi altından çekmek, düzeltmeye çalıştığımız
     * kayıptan daha kötü olurdu; o yüzden yoklama BENİMSEMİYOR. Kumandada
     * geçirilen süre uzun (boya beklemesi 30–40 dk) ve bu süre boyunca
     * ekranın hiçbir şey bilmemesi kabul edilebilir değil.
     */
    useEffect(() => {
        const id2 = setInterval(() => {
            if (AppState.currentState !== 'active') return;
            void read(false, false);
        }, POLL_MS);
        return () => clearInterval(id2);
    }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false, false);
        });
        return () => sub.remove();
    }, [read]);

    useFocusEffect(useCallback(() => { void read(false, false); }, [read]));

    /*
     * CANLI ZİL (100) — yoklamanın yerine değil, ÜSTÜNE.
     *
     * Masaüstünden ya da müdürün telefonundan bir randevu değiştiğinde 25
     * saniye beklemek yerine saniyesinde tazeleniyor. Sessiz tur: çalışan bir
     * ekranı "yükleniyor"a düşürmek zili gürültüye çevirirdi.
     */
    useLiveSignal(useCallback(() => { void read(false, false); }, [read]), true, LIVE_TABLES);

    const observe = useCallback((observation: StampObservation | null | undefined, own = false) => {
        if (!observation) return;
        setSeen((current) => (isNewer(observation.stamp, current?.stamp) ? observation : current));
        if (own) setOwnItems(observation.items);
    }, []);

    /** Personelin kendi tazelemesi — TEK benimseme yolu (açılış dışında). */
    const reload = useCallback(() => {
        setState('loading');
        return read(true, true);
    }, [read]);

    return {
        state,
        visit,
        updatedAt,
        // İkisi de doluyken karşılaştırılıyor: damga henüz okunmamışken
        // "değişti" demek, bilinmezliği değişiklik gibi göstermek olurdu.
        changed: updatedAt !== null && seen !== null && seen.stamp !== updatedAt,
        serverAt: seen?.stamp ?? null,
        seenItems: seen?.items ?? null,
        ownItems,
        observe,
        version,
        reload,
    };
}

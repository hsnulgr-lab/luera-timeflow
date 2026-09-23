/**
 * Personel 05/06 — İşlem kumandası.
 *
 * Bir randevunun TAMAMI burada yaşıyor: müşteri gelir, işlem başlar, kalemler
 * eklenir, işlem biter, adisyon kasaya gider. Personel modunun bayrak gemisi.
 *
 * TEK SAYFA, ÜÇ EVRE. Ekran değişmiyor — biçim değiştiriyor. Evre VERİDEN
 * okunuyor, çağıran seçmiyor. Bu ekran eski dört ekranın (appointment ·
 * visit · finish · sent) yerine geçiyor.
 *
 * Sayfa KAYDIRILMIYOR: personel bir randevu boyunca ekrana 30-40 kez bakıyor,
 * 5-10 kez dokunuyor. Her bakışta "neredeydim" sorusu olmamalı.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated, Easing, Keyboard, Linking, PanResponder, Pressable, ScrollView, Text,
    TextInput, View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    HoldToFinish, SlideToStart, WaitRing, WarmGlow,
} from '../../src/components/VisitControls';
import { clockOf, type DemoAppointment } from '../../src/lib/staffDemo';
import { useVisit } from '../../src/lib/visitSource';
import { useCatalog } from '../../src/lib/catalogSource';
import { useMyStaffId } from '../../src/lib/me';
import { useCustomerFile } from '../../src/lib/fileSource';
import { todayISO } from '../../src/lib/calendar';
import {
    dialA, glowTone, mmss, phaseOf, planBar, waitLevel,
} from '../../src/lib/visitControl';
import { cardState } from '../../src/lib/staffCard';
import { formatCounter } from '../../src/lib/staffCard';
import {
    debtLine, formulaDoor, formulaErrorLine, mixDebtLine, mixSaveLabel,
    saveLabel, sendWarning,
    type FormulaDoor, type HistoryState, type VisitFormula,
} from '../../src/lib/formula';
import { SendToCash } from '../../src/components/SendToCash';
import {
    SEAL_MS, UNDO_NOTE_MS, WINDOW_MS, errorLine, isSealed, plateWord,
    queuedBandLabel, sendOutcome,
    type SendState,
} from '../../src/lib/sendToCash';
import { sendVisitToCash, startVisit, writeVisitFormula, writeVisitNote } from '../../src/lib/visitWrite';
import { isForeignChange, lockStampOf } from '../../src/lib/visitStamp';
import { useConnectivity } from '../../src/lib/connectivity';
import { feedback } from '../../src/lib/feedback';
import { useKeyboardInset } from '../../src/lib/keyboardInset';
import { Glyph } from '../../src/components/Glyph';
import { Auto, Field } from '../../src/components/FormulaFields';
import { AdisyonRow, DeleteWindow } from '../../src/components/AdisyonRow';
import { CatalogSearch } from '../../src/components/CatalogSearch';
import { FormulaDoorRow } from '../../src/components/FormulaDoorRow';
import {
    DELETE_MS, FREQUENT_COUNT, KIND_LABEL, addLine, addResult, bookedServiceNames, freeItem,
    groupsOf, isBooked,
    frequentFor, searchCatalog, usageAsOf, commitDelete, deleteNotice, liveLines,
    linesDiffer, linesFromItems, markDelete, money, setQty, stripOf, totalOf, undoDelete,
    type AdisyonLine, type CatalogItem,
} from '../../src/lib/adisyon';
import {
    FormulaBody, HistoryLine, NoteStep, emptyDraft,
    type FormulaDraft, type FormulaPrevious,
} from '../../src/components/FormulaBody';
import { comparisonFor } from '../../src/lib/customerFileMap';
import { DurumAction, DurumBlock } from '../../src/components/Durum';
import { font, numeric, useTheme } from '../../src/theme';
import { upperTR } from '../../src/lib/text';

/**
 * Alt sayfanın kapanma yolu, gerçek boy ölçülene kadar. Ölçülen boy her zaman
 * bundan küçük; büyük tahmin sayfayı ekran dışında tutar, küçük tahmin
 * açılırken bir an sırıtmasına yol açardı.
 */
const SHEET_FALLBACK_H = 720;

/** Bekleme sayacının hazır süreleri. */
const MINUTES = [20, 25, 30, 35, 45, 60];


export default function Kumanda() {
    const { c, dark, small, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string }>();

    const dateISO = todayISO();
    /*
     * Randevu KİMLİKTEN okunuyor ve bulunamazsa BOŞ dönüyor.
     *
     * Eskiden sahte ajandada aranıyor, bulunamazsa listenin İKİNCİ randevusu
     * açılıyordu (`?? list[1]`). Canlıda bu yanlış müşterinin kartını açmak
     * demek: adisyon o kişiye yazılır, formül o kişinin dosyasına düşerdi.
     */
    const {
        state: visitState, visit: base, updatedAt, changed, version, reload: reloadVisit,
        serverAt, seenItems, ownItems, observe,
    } = useVisit(params.id);

    const [now, setNow] = useState(() => Date.now());

    /** Jestlerin yerel sonuçları — sunucuya bağlanınca bunlar oradan gelecek. */
    const [startedAt, setStartedAt] = useState<string | null>(null);
    const [endedAt, setEndedAt] = useState<string | null>(null);
    /**
     * Gönderme, tek bir bayrak DEĞİL, yedi hâlli bir makine. Sebebi Personel
     * 11'in kararı: bastıktan sonraki 6 saniye boyunca istek gönderilmiyor,
     * o aralıkta geri alınabiliyor. "Gönderildi" ile "sıraya alındı" da ayrı
     * hâller — ikincisi birincinin kısık hâli değil.
     */
    const [send, setSend] = useState<SendState>('idle');
    /** Süren bir gönderim var mı — ikinci isteğin kapısı. */
    const sendingRef = useRef(false);
    /** Sunucunun hayırının KODU — ekranın cümlesi bundan türüyor. */
    const [sendCode, setSendCode] = useState<string | null>(null);
    /** Başlatma sunucuda KALICI olarak reddedildi — damga geri alındı. */
    const [startCode, setStartCode] = useState<string | null>(null);
    /** Gerçek bağlantı ve gerçek kuyruk uzunluğu — uydurulmuyor. */
    const { offline, queued: queueLength } = useConnectivity();
    /**
     * Bağlantı REFERANSTAN okunuyor: gönderim etkisinin bağımlılığı olsaydı,
     * istek sürerken değişen ağ durumu etkiyi yeniden çalıştırıp adisyonu
     * ikinci kez gönderirdi.
     */
    const offlineRef = useRef(offline);
    useEffect(() => { offlineRef.current = offline; }, [offline]);
    const [sentAt, setSentAt] = useState<string | null>(null);
    /** Geri alındıktan sonra 2.6 sn duran şerit. */
    const [undone, setUndone] = useState(false);
    const sent = isSealed(send);

    /**
     * Adisyon SUNUCUDAN açılıyor.
     *
     * Buraya sabit dört kalem yazılıydı: hangi randevu açılırsa açılsın aynı
     * kaş alma, aynı saç bakım yağı. Canlıda o, müşterinin adisyonuna hiç
     * girmediği kalemleri göstermek — ve üstüne "kasaya gönder" demek.
     */
    const [lines, setLines] = useState<AdisyonLine[]>([]);
    /** Son eklenen kalemin adı — şeritte vurgulanıyor. Açılışta HİÇBİRİ. */
    const [lastAdded, setLastAdded] = useState('');

    /** Bekleme sayacı SUNUCUYA YAZILMIYOR — cihazda yaşıyor. */
    const [wait, setWait] = useState<{ endsAt: number; total: number; source: string } | null>(null);
    const [sheet, setSheet] = useState<'catalog' | 'search' | 'minutes' | 'note' | 'formula' | null>(null);
    const [revealed, setRevealed] = useState(false);
    /** Açık olan satır — aynı anda YALNIZ BİRİ. */
    const [openRow, setOpenRow] = useState<string | null>(null);
    /** Katalog aramasının sorgusu — alt sayfanın ikinci yüzü. */
    const [query, setQuery] = useState('');
    /**
     * Silme penceresi. Satır listede duruyor ve yeri korunuyor; pencere
     * kapanana kadar `visit.items` çağrılmıyor, yani geri alma bir sunucu ucu
     * istemiyor — Personel 11'in kasaya göndermesiyle aynı dil.
     */
    const [pending, setPending] = useState<{ id: string; at: number } | null>(null);
    /** Her açılışta artıyor: fitil baştan yanmalı, kaldığı yerden değil. */
    const [revealKey, setRevealKey] = useState(0);
    /**
     * Ziyaretin formülü — SUNUCUDAN.
     *
     * Buradaki yerel depo kalktı: uygulama kapanınca boşalıyordu ve kaydedilen
     * formül ikinci açılışta yoktu. Randevu onu zaten taşıyor (`RES_COLS` ·
     * `formula`), yani okuma ve yazma aynı gerçeğe bakıyor.
     *
     * `saved` yalnız SUNUCUNUN YANKISI: yazma dönerken gelen kayıt. Ekranın
     * taslağı buraya hiç girmiyor — o taslak malzemeyi boş, imzayı null
     * bırakıyor ve onu saklamak formülü eksik göstermek olurdu. Bir sonraki
     * okumada `base.formula` aynı şeyi getiriyor, o yüzden ikisi ayrışmıyor.
     */
    const [saved, setSaved] = useState<VisitFormula | null>(null);
    const formula = saved ?? base?.formula ?? null;
    /** Formül yazmanın hâli ve sunucunun hayırının kodu. */
    const [formulaWrite, setFormulaWrite] = useState<'idle' | 'busy' | 'queued' | 'error'>('idle');
    const [formulaCode, setFormulaCode] = useState<string | null>(null);
    /**
     * Randevunun serbest notu — SUNUCUDAN, `arrived_at`/`adisyon_items` ile
     * aynı desen (aşağıdaki `appointment` birleşimi). `undefined` "henüz
     * yazılmadı" demek; o zaman `base.notes` geçerli. `null` ya da metin ise
     * az önce kaydedilenin yankısı — bir sonraki okumada `base.notes` zaten
     * aynı şeyi getirecek, ikisi ayrışmaz.
     */
    const [noteSaved, setNoteSaved] = useState<string | null | undefined>(undefined);
    const [noteWrite, setNoteWrite] = useState<'idle' | 'busy' | 'queued' | 'error'>('idle');
    /** Gerçek grup başlığı ekranda mı? Değilse alta bir kopya pinleniyor. */
    const [headSeen, setHeadSeen] = useState(true);
    const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const appointment = useMemo(() => (base ? {
        ...base,
        arrived_at: startedAt ?? base.arrived_at,
        service_ended_at: endedAt ?? base.service_ended_at,
        adisyon_items: sent ? lines : base.adisyon_items,
        notes: noteSaved !== undefined ? noteSaved : base.notes,
    } : null), [base, startedAt, endedAt, sent, lines, noteSaved]);

    /*
     * Risk satırları MÜŞTERİDEN okunuyor.
     *
     * Eskiden müşterinin ADINA bakarak uyduruluyordu: "Ayşe Yılmaz" ise alerji,
     * "Elif Demir" ise alerji + hassasiyet. Gerçek bir salonda adaşı olan
     * birine olmayan bir alerji yazardı — ve tersi daha kötü: alerjisi OLAN
     * ama adı tutmayan müşteri hiç uyarı almazdı.
     *
     * Kaynak müşteri sayfasıyla AYNI (`fileSource` · riskList): iki ekran aynı
     * kuralı iki ayrı yerden türetseydi bir gün biri alerji der öteki demezdi.
     */
    const { file, risks, usedItems } = useCustomerFile(appointment?.customer_id ?? undefined, undefined);

    /**
     * Geçen seferin formülü — müşterinin KENDİ geçmişinden.
     *
     * Buraya sabit bir formül yazılıydı: `12 Mart · MK · 1:1,5 · 35 dk · açık
     * kaldı`, hangi müşteri açılırsa açılsın aynı. Uydurma bir geçmiş, hiç
     * geçmiş olmamasından kötü — kolorist bir sonraki karışımı ona bakarak
     * ayarlıyor.
     *
     * Dosya HENÜZ OKUNMADIYSA `null`: kapı ve satır o hâlde hiçbir iddiada
     * bulunmuyor. "Bu müşterinin ilk formülü" demek de bir iddia.
     */
    const comparison = useMemo(
        () => (file ? comparisonFor(file.history, appointment?.id ?? null) : null),
        [appointment?.id, file],
    );

    /**
     * Salonun kataloğu ve kullanım geçmişi — tek turda.
     *
     * `usedHere` işareti KATALOGDAN değil MÜŞTERİDEN geliyor: "bu kalem bu
     * müşteride daha önce kullanıldı" sorusunun cevabı salonun listesinde
     * değil, o kişinin geçmişinde. Sunucu bunu `customer` ucunda `itemsUsed`
     * olarak zaten gönderiyor.
     */
    const { items: catalogItems, usage } = useCatalog();
    /** Randevunun KENDİ hizmetleri — Kasa bunları adisyondan ayrı sayıyor. */
    const booked = useMemo(() => bookedServiceNames(appointment?.service), [appointment?.service]);
    const catalog = useMemo(
        () => catalogItems.map((item) => {
            const usedHere = usedItems.has(item.name);
            const inBooking = isBooked(item, booked);
            return usedHere || inBooking ? { ...item, usedHere, inBooking } : item;
        }),
        [catalogItems, usedItems, booked],
    );
    /**
     * Randevuda zaten olan hizmet eklenirken BİR KEZ soruluyor. Engel değil:
     * aynı işlem gerçekten iki kez yapılmış olabilir. Ama sessizce eklenince
     * Kasa aynı hizmeti iki kez sayıyordu.
     */
    const [dup, setDup] = useState<{ item: CatalogItem; commit: () => void } | null>(null);
    const guardAdd = (item: CatalogItem, commit: () => void) => {
        if (isBooked(item, booked)) {
            feedback.warning();
            setDup({ item, commit });
            return;
        }
        commit();
    };

    /**
     * Kutudaki altı kalem. Ölçek YERLEŞİME değil buraya biniyor: 40 kalemli
     * salonda da 400 kalemlide de ekran birebir aynı, değişen kutuların içi.
     *
     * Sıklık ÖNCE kişinin kendi geçmişinden kuruluyor. Kimlik sabit bir
     * `'merve'`ydi ve canlıda hiçbir kullanım satırıyla eşleşmediği için
     * ızgara sessizce salon moduna düşüyordu — kişinin kendi alışkanlığı hiç
     * görünmüyordu.
     */
    const myStaffId = useMyStaffId();
    const frequent = useMemo(
        () => frequentFor(catalog, usageAsOf(usage, dateISO), {
            service: (appointment?.service ?? '').split(' + ')[0] || 'Saç boyama',
            staffId: myStaffId ?? '',
            limit: FREQUENT_COUNT,
        }),
        [appointment?.service, catalog, dateISO, myStaffId, usage],
    );

    const phase = appointment ? phaseOf(appointment, now) : 'before';
    /**
     * Sunucunun söylediği KAPANIŞ türü — Bugün kartının kendi kararı.
     *
     * Plaka bunu okuyor ki kasaya gönderilmiş bir ziyaret yeniden açılınca
     * "Adisyon açık" demesin ve tahsil edilmişse Bugün kartıyla aynı
     * "Tahsil edildi" kelimesini söylesin. Aynı fonksiyon (`cardState`) iki
     * ekranı da çizdiği için ikisi tanım gereği ayrışamıyor.
     */
    const cardKind = appointment ? cardState(appointment, now).kind : null;
    const closedCard = cardKind === 'paid' || cardKind === 'atcash' ? cardKind : null;
    const running = phase === 'running';
    /** Adisyon zaten kasada: bu oturumda gönderildi ya da veri öyle diyor. */
    const delivered = sent || phase === 'closed';

    /*
     * KİLİT DAMGASI ve YABANCI DEĞİŞİKLİK — ikisi de TÜRETİLİYOR.
     *
     * Damganın değişmesi tek başına "başkası yazdı" demek değil: işlemi
     * başlatmak ya da formül yazmak da damgayı ilerletiyor. Uyarı yalnız
     * ADİSYONA başkası dokunduysa çıkıyor; yoksa yeni damga sessizce kilide
     * geçiyor ve gönderim kendi yazmamıza takılmıyor. Kural `visitStamp.ts`.
     */
    const lockInput = {
        adopted: updatedAt,
        seen: serverAt,
        baseItems: base?.adisyon_items,
        seenItems,
        ownItems,
        lines,
    };
    const foreignChange = changed && isForeignChange(lockInput);
    const lockStamp = lockStampOf(lockInput);

    /**
     * Ekranda GÖNDERİLMEMİŞ düzenleme var mı.
     *
     * Tazelemenin bedelini söyleyen şey bu: "bir şey kaybetmeyeceksin" ile
     * "yazdıklarını yeniden gir" aynı cümle olamaz.
     */
    const dirty = useMemo(
        () => linesDiffer(lines, linesFromItems(base?.adisyon_items)),
        [lines, base?.adisyon_items],
    );

    /**
     * Formülün kapısı — MALZEMEYE asılı, evreye değil.
     *
     * `washed` yıkamanın geçtiğini söylüyor: sonuç ancak o zaman biliniyor.
     * Karıştırma evresinde gövde bekleme ve sonuç alanlarını ızgara değil
     * SATIR çiziyor — değerleri henüz yok.
     */
    const door = formulaDoor(lines, formula, {
        washed: phase !== 'running' && phase !== 'before',
        locked: delivered,
        waitRunning: Boolean(wait),
        measured: wait ? Math.round(wait.total / 60) : null,
        previous: comparison && { state: comparison.state, result: comparison.previous?.result ?? null },
    });
    /** Karıştırma anı: işlem sürüyor ve yıkama daha geçilmedi. */
    const mixing = phase === 'running';

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), running || wait ? 1000 : 20_000);
        return () => clearInterval(id);
    }, [running, wait]);

    useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

    /**
     * Gönderme zinciri.
     *
     * `window` → 6 sn sonra `going`: pencere boyunca İSTEK YOK, o yüzden
     * geri alma bir sunucu ucu gerektirmiyor.
     * `going` → sonuç: bugün demo, sunucuya bağlanınca `staff.visit.finish`
     * cevabı buraya düşecek (`{ queued: true }` → `queued`, `ApiError` →
     * `error`).
     * `sent` → 2.6 sn sonra `sealed`: yeşil dolgu sönük mühre dönüyor.
     */
    useEffect(() => {
        if (send === 'window') {
            const id = setTimeout(() => setSend('going'), WINDOW_MS);
            return () => clearTimeout(id);
        }
        if (send === 'going') {
            if (!base?.id) return undefined;
            /*
             * TEK UÇUŞ.
             *
             * Etki eskiden `offline`a da bağlıydı. Zayıf sinyalde iOS ağ
             * durumunu istek SÜRERKEN değiştiriyor; etki yeniden çalışıyor ve
             * adisyon İKİNCİ KEZ gönderiliyordu. İlki kasaya düşüyor, ikincisi
             * "zaten kapandı" alıyor ve ekranda o görünüyordu — adisyon kasada
             * dururken "gönderilemedi". Bağlantı artık bir referanstan
             * okunuyor ve süren bir istek varken ikincisi başlamıyor.
             */
            if (sendingRef.current) return undefined;
            sendingRef.current = true;
            let alive = true;
            void sendVisitToCash(base.id, lines, lockStamp).then((out) => {
                sendingRef.current = false;
                // Damga ekran kapanmış olsa bile işleniyor: iş sunucuda oldu.
                observe(out.observation, out.ownItems === true);
                if (!alive) return;
                // Sonuç ARTIK koşulsuz değil ve UYDURMA da değil. Eskiden
                // burada doğrudan `sent` yazılıyordu: uçak modunda bile ekran
                // "Kasaya gönderildi" diyordu. Adisyonun gitmediğini söylemek
                // kötü haberdir; gitmediği hâlde gitti demek YALANdır.
                const result = sendOutcome({
                    // Kuyruk KARARI yazma katmanından geliyor, bağlantı
                    // bayrağından değil: sinyal "var" görünürken de istek
                    // düşebiliyor ve o iş yine kuyruğa giriyor.
                    offline: offlineRef.current || out.queued,
                    serverCode: out.code,
                });
                setSendCode(result.code);
                // Damga yalnız GERÇEKTEN gidince atılıyor.
                if (result.state === 'sent') setSentAt(clockOf(Date.now()));
                setSend(result.state);
                // Sunucu yazdıysa ELDEKİ kopya bayat: bir sonraki okuma
                // güncel damgayı getirsin, yoksa iyimser kilit eski damgayla
                // çalışır ve kendi yazdığımıza takılırdık.
                if (result.state === 'sent') void reloadVisit();
            });
            return () => { alive = false; };
        }
        if (send === 'sent') {
            const id = setTimeout(() => setSend('sealed'), SEAL_MS);
            return () => clearTimeout(id);
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [send, base?.id]);

    useEffect(() => {
        if (!pending) return undefined;
        const id = setTimeout(() => {
            setLines((current) => commitDelete(current, pending.id));
            setPending(null);
        }, Math.max(0, DELETE_MS - (Date.now() - pending.at)));
        return () => clearTimeout(id);
    }, [pending]);

    useEffect(() => {
        if (!undone) return undefined;
        const id = setTimeout(() => setUndone(false), UNDO_NOTE_MS);
        return () => clearTimeout(id);
    }, [undone]);

    /**
     * BENİMSEME olunca kalemler yeniden türetiliyor — ve YALNIZ kalemler.
     *
     * Aşağıdaki büyük sıfırlama burada çalıştırılamaz: sayacı, bekleme
     * halkasını ve gönderme penceresini de silerdi. Personel listeyi
     * tazelediğinde işlemin kendisi durmuyor, yalnız adisyon sunucudaki
     * hâline dönüyor.
     *
     * `version` DIŞINDA hiçbir arka plan okuması buraya giremiyor: yoklama ve
     * odak benimsemiyor, yani personel kalem eklerken listesi altından
     * çekilmiyor.
     */
    const adopted = useRef(0);
    useEffect(() => {
        if (version === adopted.current) return;
        adopted.current = version;
        setLines(linesFromItems(base?.adisyon_items));
        setLastAdded('');
    }, [version, base?.adisyon_items]);

    /**
     * Randevu değişince yerel durum SIFIRLANIR.
     *
     * expo-router aynı rotayı yeniden kullanabiliyor: bileşen yeniden
     * kurulmadan yalnız parametre değişiyor. Bu sıfırlama olmadan bir önceki
     * randevunun "bitti" damgası ve kalemleri sonrakine sızıyordu — gelecek
     * bir randevu "adisyon açık" görünüyordu.
     */
    useEffect(() => {
        setStartedAt(null);
        setEndedAt(null);
        setSend('idle');
        setSendCode(null);
        setStartCode(null);
        setSentAt(null);
        setUndone(false);
        setWait(null);
        setLines(linesFromItems(base?.adisyon_items));
        setLastAdded('');
        setRevealed(false);
        setSheet(null);
        setOpenRow(null);
        setPending(null);
        setQuery('');
        // Bağımlılık `params.id` DEĞİL `base?.id`: randevu artık asenkron
        // geliyor ve ilk çizimde `base` boş. Parametreye bağlı kalsaydı
        // adisyon sunucudan geldiğinde hiç yüklenmezdi.
        //
        // Sonraki okumalarda kimlik değişmiyor, yani tazeleme yerel
        // düzenlemeleri EZMİYOR: personel kalem eklerken arka planda dönen
        // bir okuma yazdığını silseydi, ekran kendi kendine geri alırdı.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base?.id]);

    /**
     * Risk kuralları — işletmenin `settings.risk_rules` listesinden eşleşenler.
     * Sunucuya bağlanınca `customer` ucundan gelecek; şimdilik demo.
     *
     * Kancalar erken dönüşün ÜSTÜNDE: `if (!appointment) return null` altına
     * konursa çağrı sırası randevu bulunup bulunmamasına göre değişir.
     */
    /** Grup başlığının liste içindeki dikey konumu — kopya kararı bundan. */
    const headY = useRef(0);

    /*
     * BOŞ EKRAN YOK.
     *
     * Burada eskiden `return null` vardı: randevu bulunamazsa kumanda
     * bomboş bir zemin çiziyordu ve kullanıcı uygulamanın donduğunu
     * sanıyordu. Üç hâl ayrı ayrı söyleniyor — okunuyor · okunamadı ·
     * gerçekten yok.
     */
    if (!appointment) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Kapat"
                    onPress={() => router.back()}
                    style={({ pressed }) => ({
                        height: 44, alignSelf: 'flex-start',
                        flexDirection: 'row', alignItems: 'center', gap: 2,
                        paddingHorizontal: 14, opacity: pressed ? 0.55 : 1,
                    })}
                >
                    <Glyph name="back" size={22} color={c.tx2} />
                    <Text style={{ color: c.tx2, fontSize: 15, fontWeight: '600' }}>Geri</Text>
                </Pressable>
                {visitState === 'loading' ? null : (
                    <View style={{ paddingHorizontal: 20, paddingTop: 30, gap: 8 }}>
                        <Text style={{
                            fontSize: 19, lineHeight: 22.8, letterSpacing: -0.38,
                            fontFamily: font.extraLight, color: c.tx,
                        }}>
                            {visitState === 'error'
                                ? <>Randevuyu <Text style={{ fontFamily: font.bold }}>okuyamadık</Text>.</>
                                : <>Bu <Text style={{ fontFamily: font.bold }}>randevu bulunamadı</Text>.</>}
                        </Text>
                        <Text style={{ fontSize: 13.5, fontWeight: '500', lineHeight: 20.25, color: c.tx2, maxWidth: 310 }}>
                            {visitState === 'error'
                                ? 'Randevu silinmiş anlamına gelmez. Bağlantınızı kontrol edip tekrar deneyin.'
                                : 'Randevu iptal edilmiş ya da başka bir güne taşınmış olabilir.'}
                        </Text>
                        {/* Düğme ölçüsü TURDAN (`Durumlar.html`): 52–60 pt,
                            başparmak bölgesinde. Eskiden 40 pt'ti ve ıslak elle
                            zordu. Bulunamayan randevuda düğme YOK — tekrar
                            denemek onu geri getirmez. */}
                        {visitState === 'error' ? (
                            <DurumAction label="Tekrar dene" onPress={() => { void reloadVisit(); }} />
                        ) : null}
                    </View>
                )}
            </View>
        );
    }

    // İş bittiyse sayaç durur: geçen süre bitiş damgasına kadar. Aksi hâlde
    // sabah biten bir randevu akşam "156 dk sürdü" derdi.
    const endMs = appointment.service_ended_at
        ? Date.parse(appointment.service_ended_at)
        : now;
    const elapsedSec = appointment.arrived_at
        ? Math.max(0, (endMs - Date.parse(appointment.arrived_at)) / 1000)
        : 0;
    const bar = planBar(appointment, elapsedSec);
    const remaining = wait ? Math.ceil((wait.endsAt - now) / 1000) : 0;
    const level = wait ? waitLevel(remaining) : null;
    const dial = dialA(appointment, now);

    // Toplam artık MİKTARI da çarpıyor. Eskiden `qty` her zaman 1 olduğu için
    // fark etmiyordu; ikinci dokunuş ×2 yapmaya başlayınca fark etmeye başladı.
    const total = totalOf(lines);
    const startClock = appointment.start_time.slice(0, 5);

    const reveal = () => {
        setRevealed(true);
        setRevealKey((n) => n + 1);
        if (revealTimer.current) clearTimeout(revealTimer.current);
        // 6 saniye sonra kendiliğinden kapanıyor: ekranı müşteri görüyor ve
        // personel kapatmayı unutabilir.
        revealTimer.current = setTimeout(() => setRevealed(false), 6000);
    };

    /**
     * Malzeme grubunun hâli. Adisyonda `material` kalem yoksa `none`:
     * başlık ÇİZİLMİYOR. Kesimde formül alanı görmek personele "bir şey
     * eksik bıraktım" dedirtir — kısık değil, boş değil, yok.
     */

    const glowColor = glowTone(phase === 'running' ? 'running' : 'before', level);


    /**
     * Kalem satırı. Silinmek üzere olan satır YERİNDE kalıyor ve yerine
     * pencere çiziliyor: liste zıplamıyor, geri alınan satır aynı yere
     * dönüyor, kalan satırlar hiç yer değiştirmiyor.
     */
    const renderLine = (line: AdisyonLine) => (line.pendingDelete ? (
        <DeleteWindow
            key={line.id}
            line={line}
            notice={deleteNotice(line, formula != null)}
            startedAt={pending?.at ?? Date.now()}
            reduceMotion={reduceMotion}
            onUndo={() => {
                setLines((current) => undoDelete(current, line.id));
                setPending(null);
            }}
        />
    ) : (
        <AdisyonRow
            key={line.id}
            line={line}
            revealed={revealed}
            open={openRow === line.id}
            locked={delivered}
            onToggle={() => setOpenRow((current) => (current === line.id ? null : line.id))}
            onQty={(next) => setLines((current) => setQty(current, line.id, next))}
            onRemove={() => {
                setOpenRow(null);
                setLines((current) => markDelete(current, line.id));
                setPending({ id: line.id, at: Date.now() });
            }}
            onReveal={reveal}
        />
    ));

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <WarmGlow tone={glowColor} top={insets.top + 300} />

            <View style={{ flex: 1, paddingTop: insets.top }}>
                {/* Geri TEK kontrol: bu ekranda gezinilecek yer yok. */}
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Bugün listesine dön"
                    onPress={() => router.back()}
                    style={({ pressed }) => ({
                        height: 44,
                        paddingHorizontal: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 2,
                        opacity: pressed ? 0.55 : 1,
                    })}
                >
                    <Glyph name="back" size={22} color={c.tx2} />
                    <Text style={{ color: c.tx2, fontSize: 15, fontWeight: '600' }}>Bugün</Text>
                </Pressable>

                <Plate
                    appointment={appointment}
                    phase={phase}
                    delivered={delivered}
                    send={send}
                    closedCard={closedCard}
                    dialKind={dial.kind}
                    tail={phase === 'closing' || phase === 'closed'
                        ? `${startClock} – ${clockOf(Date.parse(appointment.service_ended_at ?? ''))} · ${Math.round(elapsedSec / 60)} dk sürdü`
                        : `${startClock} başlangıç · ${bar.label.split(' · ')[0]}`}
                    risks={risks}
                    onNote={() => setSheet('note')}
                    onCall={() => {
                        if (!appointment.customer_phone) return;
                        Linking.openURL(`tel:${appointment.customer_phone.replace(/\s/g, '')}`);
                    }}
                    // Kimlik de gidiyor: sayfa artık kimlikten okuyor ve ad
                    // yalnız köprü. Yalnız ad göndermek, aynı adlı iki
                    // müşteride yanlış defteri açma riski taşırdı.
                    onCard={() => router.push({
                        pathname: '/(staff-flow)/musteri',
                        params: {
                            ...(appointment.customer_id ? { customerId: appointment.customer_id } : {}),
                            name: appointment.customer_name,
                        },
                    })}
                />

                {/* Komşu iş: başka bir müşterinin boyası işliyor. Kahraman
                    olmuyor ama fısıldamıyor da. */}
                {phase !== 'closing' && phase !== 'closed' ? <Neighbour /> : null}

                <View style={{ height: 1, marginHorizontal: 20, backgroundColor: c.bd }} />

                {/* ── KADRAN ── üç evrenin aynı yuvası ── */}
                {phase === 'before' ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 }}>
                        <Text style={[{
                            fontSize: small ? 76 : 96,
                            lineHeight: small ? 78 : 96,
                            fontWeight: '800',
                            letterSpacing: -5.3,
                            color: dial.tone === 'am' ? c.am : c.tx2,
                        }, numeric]}>
                            {dial.value}
                            <Text style={{ fontSize: 33, fontWeight: '700', letterSpacing: -0.66, color: dial.tone === 'am' ? 'rgba(217,164,59,0.62)' : c.tx3 }}>
                                {' '}dk
                            </Text>
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 2.4, color: c.tx3 }}>
                            {dial.unit}
                        </Text>
                        {dial.chip ? <Chip tone={dial.chipTone} label={dial.chip} /> : null}
                    </View>
                ) : null}

                {phase === 'running' && !wait ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 }}>
                        <Text style={[{
                            fontSize: small ? 76 : 96,
                            lineHeight: small ? 78 : 96,
                            fontWeight: '800',
                            letterSpacing: -5.3,
                            color: c.or,
                        }, numeric]}>
                            {formatCounter(elapsedSec)}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 2.4, color: c.tx3 }}>
                            GEÇEN SÜRE
                        </Text>
                        <PlanTrack bar={bar} />
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => setSheet('minutes')}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <Chip tone="am" label="Bekleme kur" timer />
                        </Pressable>
                    </View>
                ) : null}

                {phase === 'running' && wait ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 }}>
                        {/* Geçen süre 96 puntodan 26'ya iniyor: aciliyet
                            beklemededir, geçen sürede değil. */}
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
                            <Text style={[{ fontSize: 26, fontWeight: '800', letterSpacing: -0.78, color: c.tx2 }, numeric]}>
                                {formatCounter(elapsedSec)}
                            </Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.76, color: c.tx3 }}>
                                {upperTR(`geçen · ${bar.label.split(' · ')[0]}`)}
                            </Text>
                        </View>
                        <WaitRing
                            remaining={remaining}
                            total={wait.total}
                            source={wait.source}
                            level={level ?? 'calm'}
                            onPress={() => setWait(null)}
                        />
                    </View>
                ) : null}

                {phase === 'closing' || phase === 'closed' ? (
                    <ClosingDial
                        total={total}
                        count={liveLines(lines).length}
                        revealed={revealed}
                        onReveal={reveal}
                        runKey={revealKey}
                        span={`${startClock} – ${clockOf(Date.parse(appointment.service_ended_at ?? ''))}`}
                        minutes={Math.round(elapsedSec / 60)}
                    />
                ) : null}

                {/* Kuyruk şeridi ve "geri alındı" notu: ikisi de aynı yuvada,
                    ikisi de amber, ikisi de geçici bir gerçeği söylüyor. */}
                {/* ADİSYON BAŞKA BİR CİHAZDA DEĞİŞTİ.
                    Kasada duran adisyonda anlamı yok: orada yazılacak bir şey
                    kalmadı ve şerit yalnız gürültü olurdu. */}
                {foreignChange && !delivered ? (
                    <ChangedBand dirty={dirty} onRefresh={() => { void reloadVisit(); }} />
                ) : null}

                {startCode ? (
                    <Band label={errorLine(startCode)} note="başlatılmadı" />
                ) : send === 'queued' ? (
                    <Band label={queuedBandLabel(queueLength)} note="sinyal yok" />
                ) : undone ? (
                    <Band label="Gönderilmedi · adisyon açık" note={clockOf(now)} />
                ) : null}

                {/* ── ADİSYON ── */}
                {phase === 'running' ? (
                    <Strip
                        door={door}
                        onDoor={() => { feedback.selection(); setSheet('formula'); }}
                        strip={stripOf(lines, lastAdded)}
                        total={total}
                        revealed={revealed}
                        onReveal={reveal}
                        runKey={revealKey}
                        onAdd={() => setSheet('catalog')}
                    />
                ) : null}

                {phase === 'closing' || phase === 'closed' ? (
                    <Strip
                        strip={stripOf(lines, lastAdded)}
                        total={total}
                        revealed={revealed}
                        onReveal={reveal}
                        runKey={revealKey}
                        onAdd={() => setSheet('catalog')}
                        // Tutar bir üstteki kadranda; iki maske iki ayrı sır
                        // gibi görünüyordu.
                        money={false}
                        // Mühürlüyken şerit bir YÜZEY değil, bir etiket:
                        // dolu bir yüzey "buraya dokunulur" der.
                        sealed={delivered}
                    />
                ) : null}

                {phase === 'closing' || phase === 'closed' ? (
                    <View style={{ flex: 1, minHeight: 0 }}>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: door ? 48 : 0 }}
                            scrollEventThrottle={32}
                            onScroll={(e) => {
                                // Kopya YALNIZ gerçek başlık görünmezken var.
                                // Yapışkan başlık kaydırma boyunca kalem
                                // satırlarını örterdi; C evresinde okunması
                                // gereken şey liste.
                                const { contentOffset, layoutMeasurement } = e.nativeEvent;
                                const seen = headY.current > 0
                                    && headY.current < contentOffset.y + layoutMeasurement.height - 8;
                                if (seen !== headSeen) setHeadSeen(seen);
                            }}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Hizmet ve ürünler önce; malzeme kendi grubunda. */}
                            {/* SIFIR: boş satır iskeleti değil, iki satır
                                cümle. Yapılacak iş tam olarak yukarıdaki
                                kutularda — liste onu tekrarlamıyor. */}
                            {/* RANDEVU — Kasa bunları ayrıca sayıyor; personel
                                neyin zaten yazılı olduğunu görmeli. */}
                            <BookedGroup names={booked} />
                            {lines.length === 0 && booked.length === 0 ? (
                                <View style={{ paddingTop: 18, gap: 6 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.tx }}>
                                        Bu ziyarette henüz kalem yok
                                    </Text>
                                    <Text style={{ fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: c.tx3, maxWidth: 320 }}>
                                        Şeritteki artıya dokunup sık kullanılanlardan birini seçin ya da
                                        katalogda arayın.
                                    </Text>
                                </View>
                            ) : null}
                            {/* ÜÇ TÜR KARIŞMIYOR ve sıra sabit:
                                EK HİZMET · ÜRÜN · MALZEME. Malzemenin başlığı
                                aşağıda ayrı çiziliyor çünkü o aynı zamanda
                                formülün kapısı — sağında özet duruyor. */}
                            {groupsOf(lines)
                                .filter((group) => group.kind !== 'material')
                                .map((group) => (
                                    <View key={group.kind}>
                                        <Text style={{
                                            fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68,
                                            color: c.tx3, paddingTop: 14, paddingBottom: 2,
                                        }}>
                                            {group.label}
                                        </Text>
                                        {group.items.map(renderLine)}
                                    </View>
                                ))}

                            {/* MALZEME başlığının YERİNDE aynı kapı — tek
                                kapı, üç yüzey. Personel 13 bu şeridi bilerek
                                boş bırakmıştı. */}
                            {door ? (
                                <View onLayout={(e) => { headY.current = e.nativeEvent.layout.y; }}>
                                    <FormulaDoorRow
                                        door={door}
                                        head={`MALZEME · ${groupsOf(lines).find((g) => g.kind === 'material')?.count ?? 0}`}
                                        onPress={() => { feedback.selection(); setSheet('formula'); }}
                                    />
                                </View>
                            ) : null}
                            {groupsOf(lines).find((g) => g.kind === 'material')?.items.map(renderLine) ?? null}
                        </ScrollView>

                        {/* Kopya da AYNI kapı: iki farklı bileşen çizmek, aynı
                            şeyin iki dili olması demekti. Zemin saydam DEĞİL —
                            altındaki satır okunuyordu. */}
                        {door && !headSeen ? (
                            <View
                                pointerEvents="box-none"
                                style={{
                                    position: 'absolute', left: 20, right: 20, bottom: 0,
                                    paddingHorizontal: 12,
                                    borderRadius: 16,
                                    backgroundColor: dark ? '#241B0E' : '#F0E9DF',
                                    borderWidth: 1, borderColor: c.bd,
                                }}
                            >
                                <FormulaDoorRow
                                    door={door}
                                    head={`MALZEME · ${groupsOf(lines).find((g) => g.kind === 'material')?.count ?? 0}`}
                                    onPress={() => { feedback.selection(); setSheet('formula'); }}
                                />
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {/* ── EYLEM ── kabuk YOK: her evrenin eylemi kendi gövdesi ── */}
                <View style={{
                    alignItems: 'center',
                    gap: 11,
                    marginHorizontal: 12,
                    marginBottom: (small ? 16 : 30) + insets.bottom,
                }}>
                    {phase === 'before' ? (
                        <View style={{ alignSelf: 'stretch' }}>
                            <SlideToStart onStart={() => {
                                /*
                                 * Damga ÖNCE ekrana, sonra sunucuya.
                                 *
                                 * İş gerçekten başladı ve sayacın ağ cevabını
                                 * beklemesi için bir sebep yok. Geçici hatalar
                                 * kuyruğa giriyor, damga duruyor. Ama sunucu
                                 * KALICI olarak reddederse (403,
                                 * `already_finished`) damga bir yalana
                                 * dönüşüyor ve geri alınıyor.
                                 */
                                setStartedAt(new Date().toISOString());
                                setNow(Date.now());
                                setStartCode(null);
                                void startVisit(appointment.id).then((out) => {
                                    // Başlatma damgayı ilerletti; işlenmezse
                                    // yoklama bunu yabancı değişiklik sanıyordu.
                                    observe(out.observation);
                                    if (!out.code) return;
                                    setStartedAt(null);
                                    setStartCode(out.code);
                                    feedback.warning();
                                });
                            }} />
                        </View>
                    ) : null}

                    {phase === 'running' ? (
                        <HoldToFinish onFinish={() => {
                            setEndedAt(new Date().toISOString());
                            setWait(null);
                            setNow(Date.now());
                        }} />
                    ) : null}

                    {/* UYARI GÜVERTENİN İÇİNDE, düğmenin ÜSTÜNDE.
                        Yazarken söylenen cümle bir İMKÂN ("kasaya gitmeden
                        düzeltilebilir"); buradaki bir SONUÇ ("kalıcı olur").
                        İkisini tek yere koymak ya yazarken gereksiz korkutmak
                        ya da gönderirken sessiz kalmak olurdu — kapı burada.

                        Engelleme ve ikinci onay YOK: boşluk bazı ziyaretlerde
                        meşru, kapalı olan kapı ise haber verilmeli. Modal da
                        yok; ekran müşterinin gözü önünde ve modal bir onay
                        müşteriye "bir şey ters gitti" der.

                        Hangi hâllerde durduğu `sendWarning`da: `idle` ve
                        `window`. O altı saniyede hiçbir şey gönderilmedi ve
                        "Geri al" ekranda, yani cümle hâlâ eyleme çevrilebilir.
                        `going`de düşüyor — karar verildi. */}
                    {phase === 'closing' || phase === 'closed' ? (() => {
                        const warning = sendWarning(send, formula, lines);
                        return warning ? (
                            <View style={{
                                alignSelf: 'stretch', flexDirection: 'row', gap: 9,
                                paddingHorizontal: 4,
                            }}>
                                <Glyph name="warn" size={16} color={c.am} />
                                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: c.am }}>
                                    <Text style={{ fontWeight: '700' }}>Formül eksik.</Text>
                                    {' '}Oran ve sonuç yazılmadı; kasaya gidince bu boşluk kalıcı olur.
                                </Text>
                            </View>
                        ) : null;
                    })() : null}

                    {phase === 'closing' || phase === 'closed' ? (
                        <SendToCash
                            state={send}
                            at={sentAt ?? undefined}
                            errorWord={errorLine(sendCode)}
                            small={small}
                            reduceMotion={reduceMotion}
                            onSend={() => setSend('window')}
                            // Geri alma bir sunucu ucu İSTEMİYOR: pencere
                            // boyunca istek hiç gönderilmedi.
                            onUndo={() => { setSend('idle'); setUndone(true); }}
                        />
                    ) : null}
                </View>
            </View>

            {sheet ? (
                <Sheet onClose={() => setSheet(null)}>
                    {sheet === 'catalog' ? (
                        <CatalogSheet
                            count={liveLines(lines).length}
                            onAdd={(item) => guardAdd(item, () => {
                                feedback.light();
                                // İkinci dokunuş ×2 yapıyor, ikinci satır
                                // AÇMIYOR: aynı kalemin iki ayrı satırı altı ay
                                // sonra okuyan kişiye hata gibi görünür.
                                setLines((current) => addLine(current, { ...item, catalogId: item.id }, `n${Date.now()}`));
                                setLastAdded(item.name);
                            })}
                            frequent={frequent}
                            booked={booked}
                            rows={groupsOf(lines).map((group) => (
                                <View key={group.kind}>
                                    {/* MALZEME başlığının yerinde KAPI — aynı
                                        satır, aynı kelimeler, üçüncü yüzey. */}
                                    {group.kind === 'material' && door ? (
                                        <FormulaDoorRow
                                            door={door}
                                            head={`${group.label} · ${group.count}`}
                                            onPress={() => { feedback.selection(); setSheet('formula'); }}
                                        />
                                    ) : (
                                        <Text style={{
                                            fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68,
                                            color: c.tx3, paddingTop: 10, paddingBottom: 2,
                                        }}>
                                            {group.label}
                                        </Text>
                                    )}
                                    {group.items.map(renderLine)}
                                </View>
                            ))}
                            resultOf={(item) => addResult(lines, item)}
                            onSearch={() => setSheet('search')}
                            onDone={() => setSheet(null)}
                        />
                    ) : null}
                    {sheet === 'search' ? (
                        <CatalogSearch
                            query={query}
                            results={searchCatalog(catalog, query)}
                            frequent={frequent.items}
                            onQuery={setQuery}
                            onPick={(item) => guardAdd(item, () => {
                                feedback.light();
                                setLines((current) => addLine(current, { ...item, catalogId: item.id }, `n${Date.now()}`));
                                setLastAdded(item.name);
                                setQuery('');
                                setSheet('catalog');
                            })}
                            onFree={(name, kind) => {
                                const item = freeItem(name, kind);
                                setLines((current) => addLine(current, { ...item, catalogId: item.id }, `n${Date.now()}`));
                                setLastAdded(item.name);
                                setQuery('');
                                setSheet('catalog');
                            }}
                            onBack={() => { setQuery(''); setSheet('catalog'); }}
                        />
                    ) : null}
                    {sheet === 'minutes' ? (
                        <MinutesSheet
                            onPick={(m) => {
                                feedback.light();
                                setWait({
                                    endsAt: Date.now() + m * 60_000,
                                    total: m * 60,
                                    source: `Boya · ${m} dk`,
                                });
                                setSheet(null);
                            }}
                            onCancel={() => setSheet(null)}
                        />
                    ) : null}
                    {sheet === 'formula' ? (
                        <FormulaSheet
                            materials={lines.filter((line) => line.kind === 'material')
                                .map((line) => [line.name, `×${line.qty}`] as [string, string])}
                            wait={wait ? Math.round(wait.total / 60) : null}
                            current={formula}
                            /* Adisyon kasaya gittiyse formül OKUNUR. Kilit
                               veriden geliyor, saklanan bir bayraktan değil —
                               `formul.tsx` ile aynı kural. Kasadaki ziyarette
                               düzenlenebilir ızgara göstermek sahte bir yetki
                               vaadiydi: kaydet düğmesi gidecek yer bulamazdı. */
                            locked={delivered}
                            /* Karıştırma evresi: bekleme ve sonuç ızgara
                               değil satır, kaydet düğmesi "Karıştırmayı
                               kaydet", sayaç satırı sayı değil ad. */
                            mixing={mixing}
                            waitRunning={Boolean(wait)}
                            /* Geçen seferin formülü — müşterinin kendi
                               geçmişinden. Hangi ziyaretle karşılaştırıldığı
                               `comparisonFor`un kararı: formülsüz kesimler
                               atlanıyor, çünkü karşılaştırılacak değer
                               taşımıyorlar. */
                            previous={comparison?.previous ?? null}
                            /* Dosya okunmadıysa hâl de BİLİNMİYOR: satır
                               "ilk formül" diye bir iddiada bulunamaz. */
                            historyState={comparison?.state ?? null}
                            /* Malzeme yanlışsa düzeltme ADİSYONDA: alt sayfa
                               kapanıyor, personel unuttuğu ürünü ekliyor. Yol
                               varsa yol gösteriliyor, yoksa sebep. */
                            onMaterial={() => setSheet('catalog')}
                            write={formulaWrite}
                            errorWord={formulaCode ? formulaErrorLine(formulaCode) : null}
                            onSave={(next) => {
                                // Ekran durumu TEK BAŞINA yetmiyordu, yerel
                                // depo da yetmiyordu: ikisi de uygulama
                                // kapanınca kayboluyordu. Artık kayıt
                                // SUNUCUYA gidiyor ve müşteri sayfası onu
                                // oradan okuyor.
                                setFormulaWrite('busy');
                                setFormulaCode(null);
                                feedback.medium();
                                void writeVisitFormula(appointment.id, next).then((out) => {
                                    observe(out.observation);
                                    if (out.code) {
                                        setFormulaCode(out.code);
                                        setFormulaWrite('error');
                                        feedback.warning();
                                        return;
                                    }
                                    // Alt sayfa YALNIZ kayıt gerçekten
                                    // gidince kapanıyor. Kuyruktayken kapatıp
                                    // kapıyı "formül yazıldı" yapmak, henüz
                                    // sunucuda olmayan bir şeyi olmuş gibi
                                    // göstermek olurdu.
                                    if (out.queued) { setFormulaWrite('queued'); return; }
                                    setSaved(out.saved);
                                    setFormulaWrite('idle');
                                    setSheet(null);
                                });
                            }}
                        />
                    ) : null}
                    {sheet === 'note' ? (
                        <NoteSheet
                            note={appointment.notes}
                            write={noteWrite}
                            onClose={() => setSheet(null)}
                            onSave={(text) => {
                                setNoteWrite('busy');
                                feedback.medium();
                                void writeVisitNote(appointment.id, text).then((out) => {
                                    if (out.code) {
                                        setNoteWrite('error');
                                        feedback.warning();
                                        return;
                                    }
                                    // Formülle aynı kural: alt sayfa yalnız
                                    // kayıt GERÇEKTEN gidince kapanıyor.
                                    if (out.queued) { setNoteWrite('queued'); return; }
                                    setNoteSaved(out.saved);
                                    setNoteWrite('idle');
                                    setSheet(null);
                                });
                            }}
                        />
                    ) : null}
                    {dup ? (
                        <DupConfirm
                            name={dup.item.name}
                            onCancel={() => { feedback.selection(); setDup(null); }}
                            onConfirm={() => { const go = dup.commit; setDup(null); go(); }}
                        />
                    ) : null}
                </Sheet>
            ) : null}
        </View>
    );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

function Chip({ tone, label, timer }: { tone: 'am' | 'cool'; label: string; timer?: boolean }) {
    const { c } = useTheme();
    const amber = tone === 'am';
    return (
        <View style={{
            height: 34,
            paddingHorizontal: 13,
            borderRadius: 11,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            backgroundColor: amber ? 'rgba(217,164,59,0.12)' : c.fld,
            borderWidth: 1,
            borderColor: amber ? 'rgba(217,164,59,0.30)' : c.bd,
        }}>
            {timer ? <Glyph name="timer" size={15} color={amber ? c.am : c.tx2} /> : null}
            <Text style={{
                fontSize: 12.5,
                fontWeight: '700',
                color: amber ? c.am : c.tx2,
            }}>
                {label}
            </Text>
        </View>
    );
}

/**
 * Kimlik plakası — İKİNCİL ağırlıkta, çünkü müşteri koltukta oturuyor.
 * Kim olduğu ekrandan okunmuyor; ad 20 punto, kadran ondan beş kat büyük.
 */
function Plate({
    appointment, phase, delivered, send, closedCard, dialKind, tail, risks, onNote, onCall, onCard,
}: {
    appointment: DemoAppointment;
    /** Sunucuya göre kasada mı, tahsil edildi mi — Bugün kartının kararı. */
    closedCard: 'atcash' | 'paid' | null;
    phase: string;
    delivered: boolean;
    /** Kilitli hâlin hangi türü: kasada mı, kuyrukta mı. */
    send: SendState;
    dialKind: string;
    tail: string;
    /** İşletmenin kural listesinden eşleşenler. Boşsa işaret çizilmiyor. */
    risks: readonly { kind: string; text: string }[];
    onNote: () => void;
    onCall: () => void;
    onCard: () => void;
}) {
    const { c } = useTheme();
    const [openRisk, setOpenRisk] = useState(false);
    const status = phase === 'running' ? { word: 'Sürüyor', tone: c.or }
        // Kapanmış iş "adisyon açık" demez: yeşil, çünkü personelden çıktı.
        : delivered ? { word: plateWord(send, closedCard).word, tone: plateWord(send, closedCard).tone === 'gr' ? c.gr : c.am }
            : phase === 'closing' ? { word: 'Adisyon açık', tone: c.am }
                : dialKind === 'waiting' ? { word: 'Kapıda', tone: c.am }
                    : { word: 'Bekleniyor', tone: c.tx3 };

    return (
        <>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status.tone }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.54, color: status.tone }}>
                        {upperTR(status.word)}
                    </Text>
                </View>
                {/* Alerji ADIN YANINDA, düğme sırasında değil: düğme sırası
                    EYLEM sırası, alerji bir DURUM. Ve üç evrede de görünüyor —
                    boyayı sürdükten sonra öğrenilen alerji öğrenilmemiş
                    sayılır. Tür maskesiz, detay maskeli: müşteri kendi
                    alerjisini zaten biliyor; gizlenmesi gereken salonun notu. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: c.tx }}>
                        {appointment.customer_name}
                    </Text>
                    {risks.length > 0 ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={risks.length > 1
                                ? `${risks.length} risk kuralı var`
                                : `Risk: ${risks[0].kind}`}
                            hitSlop={10}
                            onPress={() => { feedback.selection(); setOpenRisk((open) => !open); }}
                            style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Glyph name="warn" size={21} color={c.rd} />
                        </Pressable>
                    ) : null}
                </View>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: c.tx2 }}>
                    {appointment.service}
                </Text>
                {/* Planlanan saat KADRANDAN buraya indi: personel randevunun
                    saatini zaten biliyor, o haber değil. */}
                <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '600', letterSpacing: 0.33, color: c.tx3 }}>
                    {tail}
                </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
                <Tool label="Müşteriyi ara" glyph="phone" onPress={onCall} />
                <Tool label="Not" glyph="note" dot={Boolean(appointment.notes)} onPress={onNote} />
                <Tool label="Müşteri kartı" glyph="user" onPress={onCard} />
            </View>
        </View>
        {openRisk && risks.length > 0 ? (
            <RiskRow risks={risks} onDone={() => setOpenRisk(false)} />
        ) : null}
        </>
    );
}

/**
 * Risk satırı — plakanın altında açılan kutu.
 *
 * İşaret bölünmüyor: tür ve sayı işarette değil, AÇILAN satırda. Nabız yok,
 * çünkü nabız zamana ait bir dil (bekleme sıfırı); alerji durağan bir olgu.
 */
function RiskRow({ risks, onDone }: {
    risks: readonly { kind: string; text: string }[];
    onDone: () => void;
}) {
    const { c, reduceMotion } = useTheme();
    const p = useRef(new Animated.Value(1)).current;
    const shown = risks.slice(0, 3);

    useEffect(() => {
        if (!reduceMotion) {
            p.setValue(1);
            Animated.timing(p, {
                toValue: 0, duration: REVEAL_MS, easing: Easing.linear, useNativeDriver: true,
            }).start();
        }
        const id = setTimeout(onDone, REVEAL_MS);
        return () => clearTimeout(id);
    }, [p, reduceMotion, onDone]);

    return (
        <View style={{
            marginHorizontal: 20, marginBottom: 12,
            paddingHorizontal: 13, paddingTop: 10, paddingBottom: 11,
            borderRadius: 12, gap: 6, overflow: 'hidden',
            backgroundColor: 'rgba(224,114,114,0.12)',
            borderWidth: 1, borderColor: 'rgba(224,114,114,0.32)',
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.6, color: c.rd }}>
                    {upperTR(risks.length > 1 ? `Risk · ${risks.length} kural` : `Risk · ${risks[0].kind}`)}
                </Text>
                <Text style={{ marginLeft: 'auto', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: c.am }}>
                    {reduceMotion ? 'açık' : '6 sn'}
                </Text>
            </View>
            {shown.map((risk) => (
                <Text key={risk.kind} style={{ fontSize: 13, fontWeight: '600', lineHeight: 17.55, color: c.rd }}>
                    {risks.length > 1 ? (
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: 'rgba(224,114,114,0.72)' }}>
                            {upperTR(risk.kind)}{'  '}
                        </Text>
                    ) : null}
                    {risk.text}
                </Text>
            ))}
            {risks.length > 3 ? (
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: 'rgba(224,114,114,0.72)' }}>
                    +{risks.length - 3} kural daha · müşteri kartında
                </Text>
            ) : null}
            {reduceMotion ? null : (
                <Animated.View style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
                    backgroundColor: c.am,
                    transform: [
                        { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-180, 0] }) },
                        { scaleX: p },
                    ],
                }} />
            )}
        </View>
    );
}

function Tool({ label, glyph, dot, onPress }: {
    label: string; glyph: 'phone' | 'note' | 'user'; dot?: boolean; onPress?: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => ({
                width: 48, height: 48,
                borderRadius: 16,
                backgroundColor: c.fld,
                borderWidth: 1,
                borderColor: c.bd,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Glyph name={glyph} size={21} color={c.tx2} />
            {dot ? (
                <View style={{
                    position: 'absolute', top: 9, right: 9,
                    width: 6, height: 6, borderRadius: 3, backgroundColor: c.am,
                }} />
            ) : null}
        </Pressable>
    );
}

/**
 * Komşu iş. Uygulamada bildirim ve ses YOK — ekran tek güvence, o yüzden bu
 * şerit kalan süreyi taşıyor ve süre azaldıkça sesini yükseltiyor.
 */
function Neighbour() {
    const { c } = useTheme();
    const [left, setLeft] = useState(24 * 60);
    useEffect(() => {
        const id = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
        return () => clearInterval(id);
    }, []);

    const hot = left <= 300;
    const warn = !hot && left <= 900;
    const zero = left <= 0;
    const tone = hot ? c.rd : warn ? c.am : c.tx3;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ayrıca sürüyor: Zeynep Kaya, boya, ${Math.ceil(left / 60)} dakika kaldı`}
            style={({ pressed }) => ({
                marginHorizontal: 20,
                marginBottom: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                minHeight: hot ? 42 : 34,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                backgroundColor: hot ? 'rgba(224,114,114,0.13)' : warn ? 'rgba(217,164,59,0.10)' : c.fld,
                borderWidth: 1,
                borderColor: hot ? 'rgba(224,114,114,0.36)' : warn ? 'rgba(217,164,59,0.28)' : 'transparent',
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: hot ? c.rd : warn ? c.am : c.tx2 }}>
                Zeynep Kaya · boya
            </Text>
            <Text style={[{
                fontSize: zero ? 17 : hot ? 21 : warn ? 17 : 15,
                fontWeight: '800',
                letterSpacing: zero ? 1.36 : -0.17,
                color: hot ? c.rd : warn ? c.am : c.tx2,
            }, numeric]}>
                {zero ? 'YIKA' : hot ? mmss(left) : `${Math.ceil(left / 60)} dk`}
            </Text>
        </Pressable>
    );
}

function PlanTrack({ bar }: { bar: ReturnType<typeof planBar> }) {
    const { c } = useTheme();
    return (
        <View style={{ alignItems: 'center', gap: 7 }}>
            <View style={{ width: 216, height: 4, borderRadius: 2, backgroundColor: c.bd }}>
                <View style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${Math.min(1, bar.progress) * 100}%`,
                    borderRadius: 2,
                    backgroundColor: bar.overMinutes > 0 ? c.rd : c.or,
                }} />
                <View style={{
                    position: 'absolute',
                    top: -4,
                    left: `${bar.marker * 100}%`,
                    width: 1.5, height: 12,
                    backgroundColor: c.tx3,
                }} />
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: '600', letterSpacing: 0.23, color: c.tx3 }}>
                {bar.label}
                {bar.overMinutes > 0 ? (
                    <Text style={{ color: c.rd, fontWeight: '700' }}> · +{bar.overMinutes} dk</Text>
                ) : null}
            </Text>
        </View>
    );
}

export const REVEAL_MS = 6000;

/**
 * Fitil — maskenin ne kadar açık kalacağını söyleyen çizgi.
 *
 * Sayaç zaten vardı ama görünmüyordu: tutar 6 saniye sonra sebepsizce
 * kayboluyordu. Fitil o sebebi ekrana koyuyor.
 *
 * Sol kenar sabit kalsın diye ölçekle birlikte yarım fark kadar sola
 * kaydırma var; ikisi de aynı değerden türüyor, yani hep aynı karede.
 */
function Fuse({ runKey }: { runKey: number }) {
    const { c, reduceMotion } = useTheme();
    const p = useRef(new Animated.Value(1)).current;
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (reduceMotion) return;
        p.setValue(1);
        Animated.timing(p, {
            toValue: 0, duration: REVEAL_MS, easing: Easing.linear, useNativeDriver: true,
        }).start();
    }, [p, runKey, reduceMotion]);

    // Hareket azaltılmışsa çizgi yok — ama BİLGİ durmuyor: kalan saniye yazıyor.
    const [left, setLeft] = useState(Math.round(REVEAL_MS / 1000));
    useEffect(() => {
        if (!reduceMotion) return;
        setLeft(Math.round(REVEAL_MS / 1000));
        const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
        return () => clearInterval(id);
    }, [runKey, reduceMotion]);

    if (reduceMotion) {
        return (
            <Text style={[{
                position: 'absolute', right: 0, bottom: -14,
                fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: c.am,
            }, numeric]}>
                {left} sn
            </Text>
        );
    }

    return (
        <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ position: 'absolute', left: 2, right: 2, bottom: -2, height: 2, overflow: 'hidden' }}
        >
            <Animated.View style={{
                width: '100%', height: 2, borderRadius: 1, backgroundColor: c.am,
                transform: [
                    { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-width / 2, 0] }) },
                    { scaleX: p },
                ],
            }} />
        </View>
    );
}

/** Para maskesi — ekranı müşteri görüyor. Dokununca 6 saniye açılıyor. */
function Money({ value, revealed, onReveal, runKey, big }: {
    value: number; revealed: boolean; onReveal: () => void; runKey: number; big?: boolean;
}) {
    const { c } = useTheme();
    const dot = big ? 20 : 6;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Tutar ${value} lira` : 'Tutarı göster'}
            onPress={onReveal}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: big ? 14 : 8,
                paddingVertical: 4,
                paddingHorizontal: 2,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            {revealed ? <Fuse runKey={runKey} /> : null}
            {revealed ? (
                <Text style={[{
                    fontSize: big ? 60 : 17,
                    lineHeight: big ? 62 : 20,
                    fontWeight: '800',
                    letterSpacing: big ? -3 : -0.17,
                    color: c.tx,
                }, numeric]}>
                    {money(value)}
                </Text>
            ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: big ? 14 : 5, height: big ? 48 : 17 }}>
                    {[0, 1, 2].map((index) => (
                        <View key={index} style={{
                            width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c.tx3,
                        }} />
                    ))}
                </View>
            )}
            <Glyph name={revealed ? 'eye' : 'eyeoff'} size={big ? 22 : 16} color={c.tx3} />
        </Pressable>
    );
}

function Strip({ strip, total, revealed, onReveal, runKey, onAdd, door, onDoor, money: showMoney = true, sealed = false }: {
    /**
     * Formülün kapısı — şeridin ALTINDA, ayrı bir kart değil. Ekran yeni bir
     * bölge kazanmıyor: şerit iki satırdan üçe çıkıyor, kadranın yuvası o
     * kadar daralıyor. Zaman hâlâ ekrandaki en büyük sayı.
     */
    door?: FormulaDoor | null;
    onDoor?: () => void;
    /** İki satırın metni `stripOf`tan geliyor — sıfırın kendi cümlesi var. */
    strip: { count: number; head: string; tail: string; money: boolean };
    total: number;
    revealed: boolean; onReveal: () => void; runKey: number; onAdd: () => void;
    /**
     * Tutar şeritte GÖSTERİLİYOR mu?
     *
     * B evresinde şerit tutarı taşıyan tek yer. C evresinde tutarı kadran
     * söylüyor ve maskeyi iki kez çizmek onu iki ayrı sır gibi gösteriyordu —
     * biri açılıp öteki kapalı kalabiliyordu.
     */
    money?: boolean;
    /**
     * Mühürlü adisyon: şerit çerçevesini ve dolgusunu BIRAKIYOR. Dolu bir
     * yüzey bu üründe "buraya dokunulur" demek; mühürlü adisyonun başlığı bir
     * yüzey değil, bir etiket. Kalan tek işaret sönük kilit ikonu.
     */
    sealed?: boolean;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            marginHorizontal: 20,
            marginBottom: sealed ? 6 : 12,
            borderRadius: 20,
            backgroundColor: sealed ? 'transparent' : c.surf,
            borderWidth: 1,
            borderColor: sealed ? 'transparent' : c.bd,
        }}>
        <View style={{
            paddingLeft: 16,
            paddingRight: sealed ? 12 : 8,
            paddingVertical: sealed ? 4 : 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.76, color: c.tx3 }}>
                    {upperTR(strip.head)}
                </Text>
                {/* Son eklenen kalem: "boyayı ekledim mi?" sorusu bir sayfa
                    açtırmamalı. Mühürlüyken yerini kilidin cümlesi alıyor. */}
                <Text numberOfLines={1} style={{
                    fontSize: sealed ? 13 : 14.5, fontWeight: '600',
                    letterSpacing: -0.15, color: sealed ? c.tx3 : c.tx,
                }}>
                    {sealed ? 'mühürlü · değiştirilemez' : strip.count === 0 ? strip.tail : (
                        <>
                            <Text style={{ color: c.tx3, fontWeight: '700' }}>son </Text>
                            {strip.tail}
                        </>
                    )}
                </Text>
            </View>
            {sealed ? (
                <Glyph name="lock" size={17} color={c.tx3} />
            ) : showMoney && strip.money ? (
                <Money value={total} revealed={revealed} onReveal={onReveal} runKey={runKey} />
            ) : null}
            {/* "Kalem ekle" mühürlüyken KISIK DEĞİL, YOK: yapılamayan
                kontrol ekranda durmuyor. */}
            {sealed ? null : (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kalem ekle"
                onPress={onAdd}
                style={({ pressed }) => ({
                    width: 52, height: 52,
                    borderRadius: 17,
                    backgroundColor: 'rgba(255,90,31,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,90,31,0.34)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <Glyph name="plus" size={26} color={c.or2} />
            </Pressable>
            )}
        </View>
        {door && onDoor && !sealed ? (
            <View style={{ paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.bd }}>
                <FormulaDoorRow door={door} onPress={onDoor} />
            </View>
        ) : null}
        </View>
    );
}

function ClosingDial({ total, count, revealed, onReveal, runKey, span, minutes }: {
    total: number; count: number; revealed: boolean; onReveal: () => void;
    runKey: number; span: string; minutes: number;
}) {
    const { c } = useTheme();
    return (
        <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 }}>
            <Money value={total} revealed={revealed} onReveal={onReveal} runKey={runKey} big />
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 2.4, color: c.tx3 }}>
                {upperTR(`toplam · ${count} kalem`)}
            </Text>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.tx2 }}>
                {minutes} dk sürdü · <Text style={{ color: c.tx, fontWeight: '700' }}>{span}</Text>
            </Text>
        </View>
    );
}

/**
 * Malzeme grubunun başlığı — formülün TEK girişi.
 *
 * Formül ayrı bir şey değil, listede zaten duran malzeme satırlarının
 * TARİFİ: oran, bekleme ve sonuç üçü de o kalemler hakkında. Girişi de
 * onların üstünde duruyor; gönder düğmesinin üstüne ikinci bir amber kart
 * koymak dikkati bölüyordu.
 *
 * Yazıldığında içerik satırı SONUCUN KENDİSİNİ söylüyor —
 * `1:1,5 · 35 dk · tuttu`. Sayfa açmadan "yazdım mı?" sorusunun cevabı.
 */
/**
 * Üç hâl, üç ağırlık:
 *
 *   pending — amber, chevron: yazılabilir ve yazılmalı. Bir DAVET.
 *   done    — yeşil, tik: yazıldı, içeriği başlıkta.
 *   missed  — sönük, chevron: adisyon kasaya gitti, formül yazılmadı.
 *             Amber DEĞİL, çünkü amber "hâlâ yapılabilir" diyor ve kilit
 *             düştüğü an o kapı kapandı. Kayıttaki boşluk bir davet değil,
 *             bir olgu; satır yine dokunulabilir çünkü SEBEBİ okunabilir.
 */
/**
 * Şerit — kuyruk ve geri alma notu.
 *
 * İkisi de aynı yuvada yaşıyor çünkü ikisi de aynı şeyi söylüyor: ekranda
 * gördüğün hâl HENÜZ kalıcı değil. Kuyruk kendiliğinden çözülüyor, geri
 * alma notu 2.6 saniyede kayboluyor.
 */
/**
 * Adisyon başka bir cihazda değişti.
 *
 * ── Neden şerit değil BLOK ──────────────────────────────────────────────────
 * Ötekiler OLMUŞ bir şeyi bildiriyor; bu, OLACAK bir şeyi engelliyor ve
 * personelin KARAR vermesi gerekiyor — tazelemek yazdığı kalemleri siler.
 * Turun kuralı: blok ne olduğunu ve ne yapılacağını söyler, en fazla iki
 * eylem verir.
 *
 * TON AMBER: iş durmuyor, kayıp da yok — yalnız iki kopya ayrıştı.
 *
 * Bedel açıkça yazılıyor. Yerel düzenleme yoksa o cümle hiç kurulmuyor:
 * olmayan bir kayıptan söz etmek, dokunmayı gereksiz yere korkutucu yapardı.
 */
function ChangedBand({ dirty, onRefresh }: { dirty: boolean; onRefresh: () => void }) {
    return (
        <DurumBlock
            title="Adisyon başka bir cihazda değişti"
            lines={[dirty
                ? 'Tazelerseniz göndermediğiniz kalemleri yeniden girmeniz gerekir.'
                : 'Listeniz salonun güncel hâline dönecek.']}
            actions={[{ label: 'Listeyi tazele', onPress: onRefresh }]}
            style={{ marginHorizontal: 20, marginBottom: 10 }}
        />
    );
}

function Band({ label, note }: { label: string; note: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            marginHorizontal: 20,
            marginBottom: 10,
            paddingVertical: 9,
            paddingHorizontal: 13,
            borderRadius: 12,
            backgroundColor: 'rgba(217,164,59,0.11)',
            borderWidth: 1,
            borderColor: 'rgba(217,164,59,0.32)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
        }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.am }} />
            <Text style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.69, color: c.am }}>
                {upperTR(label)}
            </Text>
            <Text style={[{ fontSize: 12, fontWeight: '600', color: c.tx3 }, numeric]}>{note}</Text>
        </View>
    );
}

// ── Alt sayfalar ────────────────────────────────────────────────────────────

/**
 * Alt sayfa — tutamaçtan aşağı çekilerek kapanır.
 *
 * Tutamaç bir SÜS DEĞİL: iOS'ta o çubuk "beni aşağı çek" demektir ve çekilince
 * kapanmayan bir sayfa yalan söyler. Jest yalnız tutamaç şeridinde yaşıyor —
 * gövdede yaşasaydı içerideki listeyi kaydırmakla yarışırdı.
 */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const drag = useRef(new Animated.Value(0)).current;
    const enter = useRef(new Animated.Value(0)).current;
    const height = useRef(0);
    const closing = useRef(false);
    const [h, setH] = useState(0);
    /**
     * Klavye açıkken sayfa onun ÜSTÜNE çıkıyor. Eskiden `bottom: 0`da
     * duruyordu ve klavye üstüne biniyordu: katalog aramasında sonuçların
     * yarısı görünmüyordu. Telefonda görüldü.
     */
    const kb = useKeyboardInset();
    const { height: winH } = useWindowDimensions();
    /**
     * Klavye açıkken tavan YÜZDE OLAMAZ.
     *
     * Sayfa artık klavyenin üstünden başlıyor; `%92` ise ekranın tamamının
     * yüzdesi. İkisi üst üste gelince sayfa ekranın ÜSTÜNDEN taşıyordu —
     * arama alanı ve sonuç sayısı adacığın altında kalıyordu. Telefonda
     * görüldü.
     *
     * Kalan yer piksel olarak hesaplanıyor: ekran − klavye − çentik.
     */
    const roof = kb > 0
        ? Math.max(260, winH - kb - insets.top - 8)
        // Klavye kapalıyken de PİKSEL: yüzde, arkada ne kaldığını söylemiyor.
        // Üstte bırakılan 108 pt tam olarak plakanın dört satırı — "‹ Bugün",
        // durum, müşterinin adı ve hizmet. Personel işlemin ortasında ve
        // kimliği kaybetmemeli; onun altındaki her şey sayfaya veriliyor.
        : Math.max(320, winH - insets.top - 108);

    /** Ölçülmeden önce sayfa kendi boyu kadar aşağıda: ekranda hiç görünmüyor. */
    const fall = enter.interpolate({ inputRange: [0, 1], outputRange: [h || SHEET_FALLBACK_H, 0] });

    const shut = () => {
        if (closing.current) return;
        closing.current = true;
        // Klavye sayfayla BİRLİKTE kapanıyor. Kapanmazsa ekranda tek başına
        // kalıyordu: arkadaki kumanda görünüyor, altında klavye duruyor.
        Keyboard.dismiss();
        if (reduceMotion) { onClose(); return; }
        Animated.timing(drag, {
            toValue: Math.max(height.current, SHEET_FALLBACK_H),
            duration: 200,
            easing: Easing.bezier(0.4, 0, 1, 1),
            useNativeDriver: true,
        }).start(onClose);
    };

    const pan = useRef(PanResponder.create({
        // Dokunuş değil ÇEKİŞ: 4 pt'lik oynama parmağın titremesidir.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
            const far = g.dy > Math.max(96, height.current * 0.28);
            // Hızlı bir fiske kısa da olsa kapatır — parmak niyetini söylemiştir.
            if (far || g.vy > 1.1) { shut(); return; }
            Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 18 }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 18 }).start();
        },
    })).current;

    // Açılış ÖLÇÜMDEN SONRA başlıyor: yolu bilmeden yola çıkarsak sayfa
    // kendi boyundan uzaktan gelir ve sonunda bir sıçrama görünür.
    const measure = (measured: number) => {
        if (height.current) return;
        height.current = measured;
        setH(measured);
        if (reduceMotion) { enter.setValue(1); return; }
        Animated.timing(enter, {
            toValue: 1,
            duration: 280,
            easing: Easing.bezier(0.2, 0.9, 0.15, 1),
            useNativeDriver: true,
        }).start();
    };

    // Perde parmağa bağlı: sayfa indikçe arkadaki iş yeniden görünür.
    const veil = Animated.multiply(
        enter,
        drag.interpolate({ inputRange: [0, h || SHEET_FALLBACK_H], outputRange: [1, 0], extrapolate: 'clamp' }),
    );

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: veil }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Kapat"
                    onPress={shut}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
                />
            </Animated.View>
            <Animated.View
                onLayout={(e) => measure(e.nativeEvent.layout.height)}
                style={{
                    position: 'absolute',
                    left: 0, right: 0,
                    bottom: kb,
                    maxHeight: roof,
                    backgroundColor: c.card,
                    borderTopWidth: 1,
                    borderTopColor: c.bd2,
                    borderTopLeftRadius: 30,
                    borderTopRightRadius: 30,
                    paddingBottom: kb > 0 ? 0 : insets.bottom,
                    transform: [{ translateY: Animated.add(fall, drag) }],
                }}
            >
                <View
                    {...pan.panHandlers}
                    accessibilityRole="button"
                    accessibilityLabel="Sayfayı kapat"
                    onAccessibilityTap={shut}
                    // 44 pt KALIYOR. Tasarımın maketi 32 diyor ama burada 32
                    // denendi ve ıslak/eldivenli parmakla tutulmadı; ayrıca
                    // şerit ekran okuyucuya DÜĞME olarak açık ve 44 bizim
                    // tabanımız. Maketteki piksel, bu ürünün ellerini bilmiyor.
                    style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                    <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c.tx, opacity: 0.22 }} />
                </View>
                {children}
            </Animated.View>
        </View>
    );
}

function SheetHead({ title, note }: { title: string; note: string }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.66, color: c.tx }}>{title}</Text>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.tx3 }}>{note}</Text>
        </View>
    );
}

/**
 * Alt dolgu 34'tü ve alt sayfa AYRICA `insets.bottom` ekliyor: aynı boşluk
 * iki kez sayılıyordu ve "Bitti"nin altında 68 pt ölü alan kalıyordu. Ev
 * göstergesinin payını kabuk veriyor; ayak yalnız kendi nefesini alıyor.
 */
function SheetFoot({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            <Pressable
                accessibilityRole="button"
                onPress={onPress}
                style={({ pressed }) => ({ height: 50, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.tx2 }}>{label}</Text>
            </Pressable>
        </View>
    );
}

function CatalogSheet({ count, frequent, rows, booked, onAdd, resultOf, onSearch, onDone }: {
    count: number;
    /** Randevunun kendi hizmetleri — adisyon satırlarının üstünde. */
    booked: readonly string[];
    /**
     * Adisyonun KENDİ satırları. Sayfanın adı bu yüzden "Kalem ekle" değil
     * "Adisyon": işlem sürerken yanlış eklenen bir kalemi görmek ve
     * düzeltmek için Bitir'e basmak gerekmiyor.
     */
    rows: React.ReactNode;
    /** Altı kutu ve nereden geldikleri — bkz. `frequentFor`. */
    frequent: { items: CatalogItem[]; source: 'staff' | 'salon' | 'none'; label: string };
    onSearch: () => void;
    onAdd: (item: CatalogItem) => void;
    /** Dokunuşun sonucu: yeni satır mı, miktar artışı mı? */
    resultOf: (item: CatalogItem) => { merged: boolean; qty: number };
    onDone: () => void;
}) {
    const { c } = useTheme();
    /**
     * Onay İKİ KANALLI. Kutudaki "Eklendi" 900 ms sonra sönüyor ve tek başına
     * kanıt değil — asıl kanıt listede beliren KALICI satır. Ama ikinci
     * dokunuş bir satır açmıyor, miktarı artırıyor: kutu bunu söylemek
     * zorunda, yoksa personel dokunuşun işlediğini bilemez.
     */
    const [added, setAdded] = useState<{ name: string; word: string } | null>(null);
    return (
        <>
            <SheetHead title="Adisyon" note={count > 0 ? `${count} kalem` : 'boş'} />
            <ScrollView style={{ paddingHorizontal: 16 }}>
                {/* ARTIK ÖLÜ DEĞİL. Burası `Text` içeren bir `View`di: giriş
                    alanı gibi çizilmiş, dokunulunca hiçbir şey yapmayan bir
                    yüzey — ölü düğmeden kötü, çünkü klavye bekleniyordu.
                    Şimdi alt sayfanın ikinci yüzünü açıyor. */}
                <Pressable
                    accessibilityRole="search"
                    accessibilityLabel="Katalogda ara"
                    onPress={() => { feedback.selection(); onSearch(); }}
                    style={({ pressed }) => ({
                        height: 50, borderRadius: 16, backgroundColor: c.surf2,
                        borderWidth: 1, borderColor: c.bd, paddingHorizontal: 14,
                        flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Glyph name="search" size={19} color={c.tx3} />
                    <Text style={{ fontSize: 15.5, fontWeight: '600', color: c.tx3 }}>Katalogda ara</Text>
                </Pressable>
                {/* Başlık kaynağı SÖYLÜYOR. Yeni başlayan personelin geçmişi
                    yok, salonun var: kutu sayısı, ölçüsü ve yeri değişmiyor —
                    yalnız hangi veriden geldiği okunuyor. Personelin kendi
                    verisi biriktikçe etiket sessizce kısalıyor. */}
                {frequent.source === 'none' ? null : (
                    <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, color: c.tx3, paddingVertical: 8 }}>
                        {upperTR(`Sık kullanılanlar · ${frequent.label}`)}
                    </Text>
                )}
                {/* SIFIR: salonun da geçmişi yok. Altı boş kutu ölü
                    kontroldür — çizilmiyor, yerini iki satır cümle alıyor ve
                    arama alanı ekranın tamamı oluyor. Kurulumun ilk günü
                    dışında bu hâl görünmüyor. */}
                {frequent.source === 'none' ? (
                    <View style={{ paddingTop: 6, gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: c.tx }}>
                            Sık kullanılanlar henüz yok
                        </Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: c.tx3, maxWidth: 320 }}>
                            Altı kutu ilk adisyonlar yazıldıkça kendiliğinden doluyor. Şimdilik
                            katalogda arayın.
                        </Text>
                    </View>
                ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {frequent.items.map((item) => {
                        const on = added?.name === item.name;
                        return (
                            <Pressable
                                key={item.name}
                                accessibilityRole="button"
                                accessibilityLabel={`${item.name}, ${item.inBooking ? 'randevuda zaten var' : KIND_LABEL[item.kind]}`}
                                onPress={() => {
                                    // Randevudaki hizmet önce soruluyor: "Eklendi"
                                    // yanıp sönmesin, henüz eklenmedi.
                                    if (item.inBooking) { onAdd(item); return; }
                                    const result = resultOf(item);
                                    onAdd(item);
                                    setAdded({
                                        name: item.name,
                                        word: result.merged ? `×${result.qty} oldu` : 'Eklendi',
                                    });
                                    setTimeout(() => setAdded(null), 900);
                                }}
                                style={{
                                    width: '48%',
                                    height: 68,
                                    borderRadius: 18,
                                    paddingHorizontal: 14,
                                    justifyContent: 'center',
                                    gap: 2,
                                    backgroundColor: on ? 'rgba(95,191,100,0.14)' : c.surf2,
                                    borderWidth: 1,
                                    borderColor: on ? 'rgba(95,191,100,0.36)' : c.bd,
                                }}
                            >
                                <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23, color: on ? c.gr : c.tx }}>
                                    {on ? added.word : item.name}
                                </Text>
                                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: item.inBooking ? c.am : c.tx3 }}>
                                    {item.inBooking ? 'RANDEVUDA' : KIND_LABEL[item.kind]}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
                )}
                {/* KALEMLER — eklenenler aynı sayfada, ızgaranın hemen
                    altında. Eklemenin kalıcı kanıtı bu liste: kutudaki 900
                    ms'lik onay sönüyor ve neyin eklendiğini söylemiyor. */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 12, paddingBottom: 8 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, color: c.tx3 }}>
                        {upperTR('Kalemler')}
                    </Text>
                    <Text style={{ marginLeft: 'auto', fontSize: 11, fontWeight: '600', color: c.tx3 }}>
                        {count > 0 ? `${count} satır` : 'boş'}
                    </Text>
                </View>
                <BookedGroup names={booked} />
                {count > 0 ? rows : booked.length > 0 ? null : (
                    <View style={{ paddingTop: 8, gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: c.tx }}>
                            Bu ziyarette henüz kalem yok
                        </Text>
                        <Text style={{ fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: c.tx3, maxWidth: 320 }}>
                            Yukarıdaki kutulardan birine dokunun ya da katalogda arayın.
                        </Text>
                    </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12 }}>
                    <Glyph name="box" size={15} color={c.tx3} />
                    <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '600', color: c.tx3, lineHeight: 16 }}>
                        Malzeme kalemleri işlem bitince depodan düşer.
                    </Text>
                </View>
            </ScrollView>
            <SheetFoot label="Bitti" onPress={onDone} />
        </>
    );
}

/**
 * Formül alt sayfası — C evresinin içinde, sayfa değiştirmeden.
 *
 * GÖVDE ARTIK BURADA DEĞİL: `FormulaBody` hem bu alt sayfayı hem müşteri
 * kartındaki tam sayfayı çiziyor. İki yüzey altı yerde ayrışmıştı ve aynı
 * formül iki farklı söz veriyordu; ayrışma kabuğun dışına taşındı.
 *
 * Bu kabuğa kalan üç şey var: tutamak, "Formül" başlığı ve BORÇ SAYACI.
 * Kimlik burada tekrarlanmıyor — arkadaki plaka ve süre satırı görünmeye
 * devam ediyor, alt sayfanın bir kısıt olmasının sebebi de bu.
 */
function FormulaSheet({
    materials, wait, waitSpan, current, locked, previous, historyState: state,
    mixing, waitRunning, write, errorWord, onSave, onMaterial,
}: {
    materials: [string, string][];
    wait: number | null;
    waitSpan?: string;
    current: VisitFormula | null;
    locked: boolean;
    previous: FormulaPrevious | null;
    /**
     * Karşılaştırmanın hâli — `null` HENÜZ BİLİNMİYOR demek.
     *
     * Eskiden burada `historyState(previous ? ... : null, true)` vardı ve o
     * `true` sabitti: "bu müşteri daha önce geldi" her zaman doğru sayılıyordu.
     * Geçmişi olmayan müşteride satır "son ziyarette formül yazılmadı" diyordu
     * — olmayan bir ziyaret hakkında.
     */
    historyState: HistoryState | null;
    /** Karıştırma anı — üçüncü hâlin dili buradan geliyor. */
    mixing: boolean;
    waitRunning: boolean;
    /** Yazmanın hâli — düğmenin sözünü sunucunun cevabına bağlayan şey. */
    write: 'idle' | 'busy' | 'queued' | 'error';
    /** Sunucunun hayırı, personelin diliyle. Yoksa null. */
    errorWord: string | null;
    onSave: (next: VisitFormula) => void;
    onMaterial: () => void;
}) {
    const { c } = useTheme();
    const [draft, setDraft] = useState<FormulaDraft>(() => emptyDraft(current));
    const [fixing, setFixing] = useState(false);
    const [noteStep, setNoteStep] = useState(false);
    /** Kilitli sayfanın iki yüzü var: yazılmış formül ve YAZILMAMIŞ boşluk. */
    const written = Boolean(current);
    const timerRan = wait != null && !fixing;
    // Hâl DIŞARIDAN: müşterinin geçmişini bu bileşen görmüyor.
    const history = state;
    /**
     * Karıştırma anında "Eksik hâliyle kaydet" YANLIŞ: eksik bir şey yok,
     * sonuç henüz OLMAMIŞ. Düğme yapılan işi adıyla kaydediyor ve oran
     * yoksa hiç çizilmiyor — kaydedilecek değer yokken kaydet düğmesi sahte
     * bir onay olurdu.
     */
    const mixSave = mixing ? mixSaveLabel(draft, waitRunning) : null;
    const save = mixing ? mixSave : saveLabel(written, draft, timerRan);

    // Not AYRI ADIM: klavye gövdenin üstüne değil yerine geliyor ve bu adımda
    // kaydet düğmesi hiç çizilmiyor — klavyenin altında kalan bir kontrol yok.
    if (noteStep) {
        return (
            <>
                <SheetHead title="Serbest not" note="liste dışı ayrıntı buraya" />
                <NoteStep
                    value={draft.note}
                    onChange={(note) => setDraft({ ...draft, note })}
                    onDone={() => setNoteStep(false)}
                />
            </>
        );
    }

    return (
        <>
            {/* Sayaç satırı personelin BORCUNU sayıyor. Eskiden "2 alan dolu
                geldi" yazıyordu ve sabitti: sayaç kurulmadığında bile 2 diyordu. */}
            <SheetHead
                title="Formül"
                note={locked
                    ? (written ? 'kasada · okunur' : 'kasada · yazılmadı')
                    : mixing ? mixDebtLine(draft) : debtLine(draft, timerRan)}
            />
            <ScrollView style={{ paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
                {locked && !written ? (
                    <>
                        <Field label="kullanılan malzeme" note="adisyondan · kilitli">
                            <Auto rows={materials} />
                        </Field>
                        {/* Kilitli-boş hâlin TEK kararlaştırılmış cümlesi —
                            `formul.tsx` birebir aynısını yazıyor. */}
                        <Text style={{
                            fontSize: 11.5, fontWeight: '500', lineHeight: 17.25,
                            color: c.tx2, maxWidth: 320, paddingTop: 10, paddingBottom: 6,
                        }}>
                            <Text style={{ fontWeight: '700' }}>Bu ziyarette formül yazılmadı.</Text>
                            {' '}Malzeme geçti, oran · bekleme · sonuç girilmedi; adisyon kasaya
                            gittiğinde boşluk kayda böyle düştü.
                        </Text>
                    </>
                ) : (
                    <>
                        {locked ? null : <HistoryLine state={history} previous={previous} />}
                        <FormulaBody
                            materials={materials}
                            draft={draft}
                            locked={locked}
                            written={written}
                            history={locked ? 'ilk' : history}
                            previous={previous}
                            measured={wait}
                            waitSpan={waitSpan}
                            fixing={fixing}
                            onFix={() => setFixing(true)}
                            onChange={setDraft}
                            onNote={() => setNoteStep(true)}
                            // Malzeme yanlışsa düzeltme ADİSYONDA: yol var, o
                            // yüzden satır dokunulabilir ve etiket yolu söylüyor.
                            materialNote={locked ? 'adisyondan · kilitli' : 'adisyondan · düzeltme adisyonda'}
                            stage={mixing ? 'mixing' : 'closing'}
                            waitRunning={waitRunning}
                            onMaterial={locked ? undefined : onMaterial}
                        />
                    </>
                )}
                <View style={{ height: 12 }} />
            </ScrollView>
            {/* Kilitliyken kısık bir düğme DEĞİL, hiç düğme yok. */}
            {locked || (mixing && !save) ? null : (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: write === 'busy' }}
                    disabled={write === 'busy'}
                    onPress={() => onSave({
                        materials: [],
                        ratio: draft.ratio,
                        waitMinutes: timerRan ? wait : draft.wait,
                        waitSource: timerRan ? 'timer' : 'manual',
                        // Küçük harfe çevirme TEK YERDE (`formulaPatch`):
                        // iki yüzey bunu ayrı ayrı yapıyordu ve biri unutulsa
                        // sunucu `bad_result` derdi.
                        result: draft.result,
                        tags: draft.tags,
                        note: draft.note.trim() || null,
                        staffId: null,
                        writtenAt: new Date().toISOString(),
                    })}
                    style={({ pressed }) => ({
                        height: 64, borderRadius: 22, backgroundColor: c.or,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: pressed || write === 'busy' ? 0.9 : 1,
                    })}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                        {write === 'busy' ? 'Kaydediliyor…' : save?.label}
                    </Text>
                </Pressable>
                {/* Sunucunun cevabı, alt satırın YERİNE geçiyor: aynı anda hem
                    imkânı hem hayırı yazmak ikisini de okutmaz. */}
                {write === 'error' || write === 'queued' ? (
                    <Text style={{
                        fontSize: 11.5, fontWeight: '700', lineHeight: 17.25,
                        color: write === 'error' ? c.am : c.tx2, textAlign: 'center',
                    }}>
                        {write === 'error' ? errorWord : 'Sırada · sinyal gelince gidecek'}
                    </Text>
                ) : save?.note ? (
                    <Text style={{ fontSize: 11.5, fontWeight: '500', lineHeight: 17.25, color: c.tx3, textAlign: 'center' }}>
                        {save.note}
                    </Text>
                ) : null}
            </View>
            )}
        </>
    );
}

function MinutesSheet({ onPick, onCancel }: { onPick: (m: number) => void; onCancel: () => void }) {
    const { c } = useTheme();
    return (
        <>
            <SheetHead title="Bekleme kur" note="telefonda çalışır" />
            <View style={{ paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {MINUTES.map((m) => (
                        <Pressable
                            key={m}
                            accessibilityRole="button"
                            accessibilityLabel={`${m} dakika`}
                            onPress={() => onPick(m)}
                            style={({ pressed }) => ({
                                width: '31.5%',
                                height: 68,
                                borderRadius: 18,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: c.surf2,
                                borderWidth: 1,
                                borderColor: c.bd,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text style={[{ fontSize: 24, fontWeight: '800', letterSpacing: -0.72, color: c.tx }, numeric]}>{m}</Text>
                            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.47, color: c.tx3 }}>DK</Text>
                        </Pressable>
                    ))}
                </View>
                {/* Sahte onay yok: bu sayacın sınırı açıkça yazılı. */}
                <View style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: c.bd2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <Glyph name="cloud" size={15} color={c.tx3} />
                    <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '600', color: c.tx3, lineHeight: 16 }}>
                        Bu sayaç sunucuya yazılmaz. Uygulama kapalıyken ses çalmaz;
                        ekrana bakıldığında kalan süre okunur.
                    </Text>
                </View>
            </View>
            <SheetFoot label="Vazgeç" onPress={onCancel} />
        </>
    );
}

/**
 * Not — artık düzenlenebilir (2026-09-22). Sunucu ucu `visit.note`; kaydeden
 * KAZANIR, masaüstü ve müdür telefonunun `reservations.notes`iyle aynı kural
 * (ekleme değil TAM DEĞİŞTİRME). Kaydet yalnız metin GERÇEKTEN değiştiyse
 * aktif — dokunulmamış bir notu yeniden göndermenin anlamı yok.
 */
function NoteSheet({ note, write, onClose, onSave }: {
    note: string | null;
    write: 'idle' | 'busy' | 'queued' | 'error';
    onClose: () => void;
    onSave: (text: string) => void;
}) {
    const { c } = useTheme();
    const [draft, setDraft] = useState(note ?? '');
    const busy = write === 'busy';
    const changed = draft.trim() !== (note ?? '').trim();

    const failure = write === 'error'
        ? 'Not kaydedilemedi. Metin burada duruyor — tekrar deneyin.'
        : write === 'queued'
            ? 'Sinyal yok — not kuyrukta, sinyal gelince gidecek.'
            : null;

    return (
        <>
            <SheetHead title="Not" note="müşteri görmez" />
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
                <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    editable={!busy}
                    placeholder="Bu randevu için not ekleyin"
                    placeholderTextColor={c.tx3}
                    accessibilityLabel="Randevu notu"
                    style={{
                        minHeight: 132,
                        maxHeight: 260,
                        padding: 15,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: write === 'error' ? c.rd : c.bd,
                        backgroundColor: c.surf2,
                        color: c.tx,
                        fontSize: 16,
                        fontWeight: '500',
                        lineHeight: 24,
                        textAlignVertical: 'top',
                    }}
                />
                {failure ? (
                    <Text accessibilityLiveRegion="polite" style={{
                        fontSize: 12.5, fontWeight: '600', lineHeight: 17,
                        color: write === 'error' ? c.rd : c.tx3,
                    }}>
                        {failure}
                    </Text>
                ) : null}
            </View>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Kaydet"
                    accessibilityState={{ disabled: busy || !changed }}
                    disabled={busy || !changed}
                    onPress={() => onSave(draft.trim())}
                    style={({ pressed }) => ({
                        height: 64, borderRadius: 22, backgroundColor: c.or,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: busy || !changed ? 0.45 : pressed ? 0.9 : 1,
                    })}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                        {busy ? 'Kaydediliyor…' : 'Kaydet'}
                    </Text>
                </Pressable>
            </View>
            <SheetFoot label="Vazgeç" onPress={onClose} />
        </>
    );
}

/**
 * RANDEVU — randevunun kendi hizmetleri. Silinemez ve düzenlenemez: masaüstünde
 * randevuyla birlikte yazıldılar ve Kasa onları adisyon kalemlerinden AYRI
 * sayıyor. Burada görünmezlerse personel aynı işi EK HİZMET olarak ekliyor ve
 * hizmet iki kez tahsil ediliyor. Tutar yazılmıyor: personelin ciro görme izni
 * adisyon satırlarının kendi kuralında.
 */
function BookedGroup({ names }: { names: readonly string[] }) {
    const { c } = useTheme();
    if (names.length === 0) return null;
    return (
        <View accessible accessibilityLabel={`Randevudaki hizmetler: ${names.join(', ')}. Kasada zaten sayılıyor.`}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68, color: c.tx3, paddingTop: 14, paddingBottom: 2 }}>
                RANDEVU
            </Text>
            {names.map((name, index) => (
                <View
                    key={`${name}-${index}`}
                    style={{
                        minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
                        borderBottomWidth: 1, borderColor: c.bd,
                    }}
                >
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15.5, fontWeight: '600', color: c.tx2 }}>
                        {name}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: c.tx3 }}>
                        RANDEVUDA
                    </Text>
                </View>
            ))}
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.tx3, paddingTop: 6, lineHeight: 16 }}>
                Bu hizmetler kasaya randevuyla birlikte gidiyor; yeniden eklemeyin.
            </Text>
        </View>
    );
}

/**
 * Randevudaki bir hizmet ek hizmet olarak eklenirken tek soru. Engel değil —
 * aynı işlem gerçekten iki kez yapılmış olabilir — ama iki kez tahsil
 * edileceği söyleniyor.
 */
function DupConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
    const { c } = useTheme();
    return (
        <View
            accessibilityViewIsModal
            accessibilityLiveRegion="assertive"
            // Sayfanın ALTINA çapalı ve opak: katalog uzunken kaydırmanın
            // dibinde kaybolmasın, altındaki satırlar içinden okunmasın.
            style={{
                position: 'absolute', left: 16, right: 16, bottom: 16, zIndex: 10,
                padding: 14, gap: 10,
                borderRadius: 16, borderWidth: 1, borderColor: c.am, backgroundColor: c.surf,
            }}
        >
            <Text style={{ fontSize: 15, fontWeight: '800', color: c.tx }}>
                {name} randevuda zaten var
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '500', lineHeight: 19, color: c.tx2 }}>
                Kasa randevunun hizmetini ayrıca sayıyor. Ek hizmet olarak eklerseniz iki kez tahsil edilir. İkinci kez mi yapıldı?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Vazgeç"
                    onPress={onCancel}
                    style={({ pressed }) => ({
                        flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: c.or, opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Vazgeç</Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Yine de ekle"
                    onPress={onConfirm}
                    style={({ pressed }) => ({
                        flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: c.bd2, opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.tx }}>Yine de ekle</Text>
                </Pressable>
            </View>
        </View>
    );
}

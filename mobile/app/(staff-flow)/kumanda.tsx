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
    AppState, Animated, Easing, Keyboard, Linking, PanResponder, Pressable, ScrollView, Text,
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
    dialA, glowTone, phaseOf, planBar, waitLevel,
} from '../../src/lib/visitControl';
import { cardState } from '../../src/lib/staffCard';
import { formatCounter } from '../../src/lib/staffCard';
import {
    debtLine, formulaDoor, formulaErrorLine, mixDebtLine, mixSaveLabel,
    saveLabel, sendWarning,
    type HistoryState, type VisitFormula,
} from '../../src/lib/formula';
import { ApiError, api } from '../../src/api/staff';
import { CollectBar } from '../../src/components/CollectBar';
import { SendToCash } from '../../src/components/SendToCash';
import {
    collectAfterSend, collectMethodFor, collectSendStep, type CollectMethod, type CollectStage,
} from '../../src/lib/collect';
import { fetchServiceCharge } from '../../src/lib/managerSource';
import { kasaReasonLabel, kasaReasonOf, type KasaReason, type ServiceBill } from '../../src/lib/cashBuild';
import {
    SadeClosingDial, SadeEditPanel, SadeFormulaRow, SadeList, SadeSheetBody, SadeSheetHead, SadeStrip,
} from '../../src/components/AdisyonSade';
import {
    addOutcome, kalemCount, sadeTotal, serviceBillOf, type Receipt, type ServiceRow,
} from '../../src/lib/adisyonSade';
import {
    SEAL_MS, UNDO_NOTE_MS, WINDOW_MS, errorLine, isSealed, plateWord,
    queuedBandLabel, sendOutcome,
    type SendState,
} from '../../src/lib/sendToCash';
import {
    prepareResend, saveVisitItems, sendVisitToCash, startVisit, writeVisitFormula, writeVisitNote, writeVisitWait,
    type WriteOutcome,
} from '../../src/lib/visitWrite';
import { ITEMS_SAVE_MS, chainedStamp, itemsKey, shouldFlushItems, shouldSaveItems } from '../../src/lib/itemsAutosave';
import { activeWait, rememberWait, waitIntentOf } from '../../src/lib/waitIntent';
import { armWaitAlarm, disarmWaitAlarm } from '../../src/lib/waitAlarmDevice';
import { isForeignChange, lockStampOf } from '../../src/lib/visitStamp';
import { useConnectivity } from '../../src/lib/connectivity';
import { feedback } from '../../src/lib/feedback';
import { useKeyboardInset } from '../../src/lib/keyboardInset';
import { Glyph } from '../../src/components/Glyph';
import { Auto, Field } from '../../src/components/FormulaFields';
import { CatalogSearch } from '../../src/components/CatalogSearch';
import {
    DELETE_MS, FREQUENT_COUNT, bookedServiceNames, freeItem, isBooked,
    frequentFor, searchCatalog, usageAsOf, commitDelete, liveLines,
    linesDiffer, linesFromItems, markDelete, setQty, stepQty, undoDelete,
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
    const { c, small, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string; from?: string; date?: string; back?: string }>();
    /*
     * GERİ OKUNUN YAZISI, DÖNÜLECEK SEKMENİN ADI (108 · v4 K1 notu).
     *
     * Personel kabuğunda o sekme "Bugün", tek kişilikte "Gün". Burada
     * `useInSoloShell()` İŞE YARAMAZ: bu ekran `(staff-flow)` segmentinde
     * yaşıyor, `tek` değil. Cevabı çağıran taraf biliyor ve söylüyor.
     *
     * Kasa'nın turuncu şeridinden açılınca (v4 · C1) dönülen yer Kasa ve
     * ok onu söylüyor (`back: 'kasa'`); "Gün" yazıp Kasa'ya dönmek, okun
     * gittiği yeri yanlış söylemek olurdu.
     *
     * Kapalı küme: parametreden gelen metin doğrudan ekrana yazılmıyor,
     * yalnız bilinen değerlerden biri seçiliyor.
     */
    const backLabel = params.back === 'kasa' ? 'Kasa' : params.from === 'tek' ? 'Gün' : 'Bugün';

    const dateISO = todayISO();
    /** Randevunun günü — okuma (`useVisit`) ile yeniden gönderimin okuması aynı gün. */
    const visitDate = params.date || dateISO;
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
    } = useVisit(params.id, params.date || undefined);

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
    /** Sıradaki `going` bir YENİDEN gönderim mi — önce kuyruk ve taze damga (D3). */
    const resendRef = useRef(false);
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

    /*
     * ── TAHSİLAT (108 · v4 K3/K4), YALNIZ TEK KİŞİLİK MODDA ─────────────────
     *
     * Gönderim makinesi OLDUĞU GİBİ kullanılıyor: "Kartla tahsil et" de
     * "Sonra tahsil et" de `send`i `going`e alıyor ve adisyon her iki
     * durumda da aynı yoldan kasaya gidiyor. Ayrışma yalnız sonrasında —
     * biri para kaydı yazıyor, öteki yazmıyor.
     *
     * İkinci bir gönderim yolu YAZILMADI: o yol iyimser kilidi, kuyruğu,
     * "zaten kapandı" dalını ve tek-uçuş korumasını yıllarca biriktirdi.
     * Kopyası sessizce ayrışırdı.
     */
    const [collectMethod, setCollectMethod] = useState<CollectMethod | null>(null);
    const [collectStage, setCollectStage] = useState<CollectStage>('idle');
    const [collectCode, setCollectCode] = useState<string | null>(null);
    /** Tahsilat isteği TEK kez gider — etki yeniden koşsa bile. */
    const collectingRef = useRef(false);
    /**
     * Dokunuşun kimliği — idempotens anahtarına giriyor (`api.visitCollect`).
     * Geri alınıp yeniden açılan adisyonda yeni dokunuş yeni anahtar demek;
     * randevuya bağlı sabit anahtar eski tahsilatın cevabını geri getiriyordu.
     */
    const collectAttemptRef = useRef('');
    /**
     * Dokunulan ANDAKİ yöntem. Paketli seansta yöntem toplamdan türüyor
     * (`collectMethodFor`): gönderim sürerken toplam değişse bile istek,
     * kullanıcının gördüğü düğmeyle gider.
     */
    const tapMethodRef = useRef<CollectMethod | null>(null);
    /**
     * Sunucu "bu adisyonu Kasa tahsil eder" dedi (`collect_in_kasa`, D6) —
     * ücret okuması bunu yakalayamadıysa (okunamadı ya da arada değişti)
     * kaynak sunucunun cevabı.
     */
    const [kasaFromCollect, setKasaFromCollect] = useState<KasaReason | null>(null);
    /**
     * Otomatik kalem kaydının KALICI hatası (D2). Eskiden yutuluyordu: kalem
     * kaydedilmiyor, geri çıkınca gidiyordu ve ekran hiçbir şey demiyordu.
     */
    const [itemsCode, setItemsCode] = useState<string | null>(null);
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
    /** Katalog aramasının sorgusu — alt sayfanın ikinci yüzü. */
    const [query, setQuery] = useState('');
    /**
     * Silme penceresi. Satır listede duruyor ve yeri korunuyor; pencere
     * kapanana kadar `visit.items` çağrılmıyor, yani geri alma bir sunucu ucu
     * istemiyor — Personel 11'in kasaya göndermesiyle aynı dil.
     */
    const [pending, setPending] = useState<{ id: string; at: number } | null>(null);
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

    /*
     * ── SADE ADİSYON (Personel 15 · Yol A) — İKİ KABUKTA ─────────────────────
     *
     * "Eklendi" ÜÇ yerde ve KALICI: kutu "✓ Adisyonda ×2", kutunun altındaki
     * makbuz, satırdaki "✓ Yeni" / "✓ ×2 oldu". Etiketler sayfa bir dahaki
     * açılışa kadar kalıyor; sunucuya YAZILMIYOR (kalemlerin parçası değiller).
     */
    const [tags, setTags] = useState<Record<string, 'new' | 'inc'>>({});
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    /** Son dokunuşun satırı — giriş ve sıçrama hareketi bunu izliyor. */
    const [flash, setFlash] = useState<{ id: string; at: number } | null>(null);
    /** Satır paneli açık olan satır (adet · kaldır). */
    const [editing, setEditing] = useState<string | null>(null);

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

    /*
     * KALEMLER ANINDA KAYDEDİLİYOR (2026-10-14 · kullanıcının notu 2).
     *
     * Eskiden kalemler yalnız "kasaya gönder"de yazılıyordu: geri çıkan
     * kişinin eklediği her şey gidiyordu. Artık son dokunuştan 0,7 sn sonra
     * listenin tamamı yazılıyor (`saveVisitItems`); ekipte müdür ve masaüstü
     * de anında görüyor. Kapanış YOK — adisyon "kasaya gönder"e kadar açık.
     *
     * Ne zaman YAZILMIYOR (`shouldSaveItems`): gönderim sürerken (kalemleri o
     * yazıyor), adisyon kasadayken, başka bir cihaz yazmışken (önce şerit),
     * silme penceresi açıkken (geri alınabilir). Aynı liste iki kez gitmiyor:
     * `savedKey` en son yazılan ya da sunucudan benimsenen liste.
     *
     * Hata kalıcıysa aynı liste yeniden DENENMİYOR — bir sonraki değişiklik
     * dener. Yoksa kalıcı bir hayır her 0,7 sn'de bir istek olurdu.
     */
    const savedKey = useRef('');
    /**
     * Taban HANGİ randevu için kuruldu. Kayıt etkisi sıfırlama etkisinden ÖNCE
     * çalışıyor: ilk okumada ekrandaki liste henüz boşken "boş listeyi yaz"
     * kararı verilmesin — sunucunun listesi benimsenmeden hiçbir şey gitmez.
     */
    const savedFor = useRef<string | null>(null);
    /**
     * YOLDAKİ otomatik yazma — gönderim onu BEKLİYOR (2026-10-15).
     *
     * Telefonda görüldü: kalem ekleyip hemen "Nakit tahsil et"e basınca
     * "Tahsilat kaydedilmedi. Kasaya bir şey yazılmadı." Otomatik yazma
     * sunucuda damgayı (`updated_at`) ilerletiyor; cevabı dönmeden başlayan
     * gönderim ESKİ damgayla gidiyor ve sunucu `items_stale` ile reddediyordu
     * — kendi yazmamıza takılıyorduk. Söz, yazmanın sunucudan dönen YENİ
     * damgasıyla çözülüyor; başka bir cihaz yazdıysa `null` döner ve kilit
     * eskisi gibi çalışır (kimsenin kalemi ezilmez).
     */
    const savingRef = useRef<Promise<string | null> | null>(null);
    /**
     * Kalem yazmasının TEK yolu — zamanlayıcı da çıkış da buradan (D4).
     *
     * YOLDAKİ yazma bitmeden yenisi başlamıyor: ikisi aynı damgayla gidince
     * ikincisi birincinin damgasına çarpıyordu (`chainedStamp`).
     */
    const startSave = (reservationId: string, list: readonly AdisyonLine[], key: string, stamp: string | null) => {
        savedKey.current = key;
        const prior = savingRef.current ?? Promise.resolve(null);
        const run = prior
            .then((fresh) => saveVisitItems(reservationId, list, chainedStamp(fresh, stamp)))
            .then((out) => {
                // Başka cihaz yazmış: güncel liste gözlem olarak işleniyor,
                // şerit çiziliyor; kişi tazeleyince benimsenir.
                if (out.stale) observe(out.stale);
                else observe(out.observation, out.ownItems === true);
                // Kalıcı hayır ekranda (D2); çakışmanın kendi şeridi var,
                // kuyruk "olmadı" değil. Başarılı yazma eski sebebi siliyor.
                if (out.code && !out.stale && out.code !== 'items_stale') setItemsCode(out.code);
                else if (!out.code && !out.queued) setItemsCode(null);
                // Yalnız KENDİ başarılı yazmamızın damgası kilide geçer.
                return out.stale ? null : out.observation?.stamp ?? null;
            });
        savingRef.current = run;
        void run.finally(() => { if (savingRef.current === run) savingRef.current = null; });
    };
    useEffect(() => {
        if (!base?.id) return undefined;
        const key = itemsKey(lines);
        if (!shouldSaveItems({
            loaded: savedFor.current === base.id,
            sendIdle: send === 'idle',
            delivered,
            foreignChange,
            deleting: pending !== null,
            key,
            savedKey: savedKey.current,
        })) return undefined;
        const reservationId = base.id;
        const id = setTimeout(() => startSave(reservationId, lines, key, lockStamp), ITEMS_SAVE_MS);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base?.id, lines, send, delivered, foreignChange, pending, lockStamp, observe]);

    /*
     * EKRAN AYRILIRKEN ve ARKA PLANA GEÇERKEN bekleyen yazma HEMEN gider (D4).
     *
     * Zamanlayıcı ekranla birlikte iptal ediliyordu: kalem ekleyip 0,7 sn
     * içinde "Geri"ye basanın kalemi, silme penceresi açıkken çıkanın da hem
     * eklediği hem sildiği kayboluyordu. Açık silme o anda uygulanıyor —
     * "Geri al" ekranla gidiyor (`shouldFlushItems`). `write` kuyruğa
     * alabildiği için çevrimdışında da kaybolmuyor.
     *
     * Kapanış EN SON çizimin hâliyle çalışmalı: başvuru her çizimden sonra
     * tazeleniyor, dinleyici ve çıkış onu çağırıyor.
     */
    const flushItemsRef = useRef<() => void>(() => undefined);
    useEffect(() => {
        flushItemsRef.current = () => {
            if (!base?.id) return;
            const key = itemsKey(lines);
            if (!shouldFlushItems({
                loaded: savedFor.current === base.id,
                sendIdle: send === 'idle',
                delivered,
                foreignChange,
                key,
                savedKey: savedKey.current,
            })) return;
            startSave(base.id, lines, key, lockStamp);
        };
    });
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next !== 'active') flushItemsRef.current();
        });
        const flushOnLeave = flushItemsRef;
        return () => {
            sub.remove();
            flushOnLeave.current();
        };
    }, []);

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
            // Yoldaki otomatik yazma varsa ÖNCE o bitsin; damgası kilide geçer.
            const inFlight = savingRef.current ?? Promise.resolve(null);
            const reservationId = base.id;
            // Düşmüş ya da kuyruktaki gönderimin yeniden denenmesi mi (D3).
            const resend = resendRef.current;
            resendRef.current = false;
            void inFlight.then(async (fresh): Promise<WriteOutcome> => {
                let stamp = fresh ?? lockStamp;
                if (resend) {
                    /*
                     * YENİDEN GÖNDERİM: önce kuyruk, sonra taze damga
                     * (`prepareResend`). Kuyruk hâlâ doluysa yeni istek yok —
                     * sonuç yine "sırada". Damga gözlemden geçiyor: kendi
                     * kuyruktaki yazmamızsa kilit yeni damgaya kayar, başka
                     * bir cihaz yazdıysa eskide kalır ve kimsenin kalemi ezilmez.
                     */
                    const prep = await prepareResend(reservationId, visitDate);
                    if (prep.queued) return { code: null, queued: true };
                    if (prep.observation) {
                        observe(prep.observation);
                        stamp = lockStampOf({ ...lockInput, seen: prep.observation.stamp, seenItems: prep.observation.items });
                    }
                }
                return sendVisitToCash(reservationId, lines, stamp);
            }).then((out) => {
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

    /*
     * ── TAHSİLAT, GÖNDERİM BİTTİKTEN SONRA (v4 · K3) ────────────────────────
     *
     * Sıra zorunlu: `visit.collect` sunucuda `status = 'completed'` istiyor ve
     * randevuyu kapatan şey gönderimin içindeki `visit.finish`. Tersi sırada
     * sunucu `not_finished` derdi.
     *
     * Üç dal, üçü de AYRI bir gerçek:
     *   gönderim sürüyor  → bekle
     *   gönderim düştü    → `send_failed`; kasaya hiçbir şey yazılmadı
     *   gönderim oldu     → tahsil et
     *
     * `queued` de DÜŞMÜŞ sayılıyor: iş telefonun kuyruğunda, sunucuda değil.
     * Üstüne para kaydı atmak, olmamış bir kapanışın parasını yazmaktı.
     */
    useEffect(() => {
        if (!base?.id) return undefined;
        const next = collectAfterSend(collectStage, send);
        if (next === 'failed') {
            setCollectStage('send_failed');
            setCollectCode(sendCode ?? (send === 'queued' ? 'offline' : null));
            return undefined;
        }
        const method = tapMethodRef.current;
        if (next !== 'collect' || !method) return undefined;

        if (collectingRef.current) return undefined;
        collectingRef.current = true;
        let alive = true;
        void api.visitCollect(base.id, method, collectAttemptRef.current)
            .then(() => {
                collectingRef.current = false;
                if (!alive) return;
                setCollectStage('done');
                setCollectCode(null);
                // Sunucu yazdı: eldeki kopya bayat. `is_paid` döndüğünde
                // plaka "Tahsil edildi" diyebilsin.
                void reloadVisit();
            })
            .catch((cause: unknown) => {
                collectingRef.current = false;
                if (!alive) return;
                /*
                 * GÖNDERİM OLDU, TAHSİLAT OLMADI. Ayrı bir hâl: adisyon
                 * kasada AÇIK duruyor ve cümlesi bunu söylüyor. Aynı hatayı
                 * `send_failed` saymak kullanıcıya "hiçbir şey yazılmadı"
                 * dedirtir ve parayı ikinci kez almaya kalkardı.
                 */
                setCollectStage('collect_failed');
                setCollectCode(cause instanceof ApiError ? cause.code : 'offline');
                // Paket / indirim / kısmi / grup: güverte kasaya gönderime döner (D6).
                if (cause instanceof ApiError && cause.code === 'collect_in_kasa') {
                    setKasaFromCollect(kasaReasonOf(cause.body.reason) ?? 'partial');
                }
                // Paketli adisyona araya ücretli kalem girdi (1.0.1): kopya
                // bayat, tazelenince toplam ve düğme doğru yöntemi sorar.
                if (cause instanceof ApiError && cause.code === 'collect_amount_changed') {
                    void reloadVisit();
                }
            });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectStage, send, sendCode, base?.id]);

    /**
     * Tahsil düğmelerinin gönderimi — ilk deneme de "Tekrar dene" de (D3).
     * Karar saf katmanda (`collectSendStep`): düşmüş ya da kuyruktaki gönderim
     * artık yeniden kuruluyor; yolda ya da olmuş olana dokunulmuyor.
     */
    const restartSend = () => {
        const step = collectSendStep(send);
        if (step === 'wait') return;
        resendRef.current = step === 'resend';
        setSendCode(null);
        setSend('going');
    };

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
        // Benimsenen liste sunucuda zaten var — yeniden yazılmıyor.
        savedKey.current = itemsKey(linesFromItems(base?.adisyon_items));
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
        setKasaFromCollect(null);
        setItemsCode(null);
        setSentAt(null);
        setUndone(false);
        /*
         * BEKLEME GERİ KURULUYOR (112 · v4 G3). Eskiden burada sıfırlanıyordu:
         * Gün'e dönüp kumandayı yeniden açan kişi beklemesini kaybolmuş
         * buluyordu. Önce bu telefonun niyeti, yoksa sunucunun damgası.
         */
        setWait(base ? restoredWait(base, Date.now()) : null);
        setLines(linesFromItems(base?.adisyon_items));
        savedKey.current = itemsKey(linesFromItems(base?.adisyon_items));
        savedFor.current = base?.id ?? null;
        setLastAdded('');
        setSheet(null);
        setPending(null);
        setQuery('');
        setTags({});
        setReceipt(null);
        setFlash(null);
        setEditing(null);
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

    /*
     * RANDEVUNUN HİZMET ÜCRETİ, SATIR SATIR — iki kabukta (Personel 15).
     *
     * Kapanış kadranı eskiden adisyonu gösteriyordu (₺900); sunucu tahsil
     * ederken hizmet ücretini de ekliyor ve kasaya ₺1.650 yazılıyordu
     * (2026-10-13). Sade adisyonun "Toplam"ı müşterinin ödeyeceği TAMAMI.
     *
     * Tek kişilikte Kasa'nın okuduğu yerden (`fetchServiceCharge`): sahip
     * aynı zamanda müdür. Ekipte personelin telefonunda müdür oturumu yok;
     * sunucu aynı kuralla hesaplıyor (`visit.charge`, 2026-10-15 — kullanıcı
     * kararı: ekipte de aynı Toplam). Okunamazsa adlar duruyor, tutar
     * yazılmıyor — uydurulmuyor.
     */
    const solo = params.from === 'tek';
    const [serviceCharge, setServiceCharge] = useState<ServiceBill | null>(null);
    useEffect(() => {
        if (!appointment?.id) return undefined;
        let alive = true;
        const read: Promise<ServiceBill | null> = solo
            ? fetchServiceCharge(appointment.id)
            : api.visitCharge(appointment.id).then(serviceBillOf);
        read
            .then((charge) => { if (alive) setServiceCharge(charge); })
            .catch(() => { if (alive) setServiceCharge(null); });
        return () => { alive = false; };
    }, [solo, appointment?.id, appointment?.service]);

    /*
     * KUYRUKTAKİ GÖNDERİM SİNYAL GELİNCE GERÇEKTEN GİDİYOR — ekipte (D3).
     *
     * `sendVisitToCash` kalemler kuyruğa girince kapanışı göndermiyor: boş
     * adisyon kapanmasın diye. Kuyruk boşalınca yalnız kalemler gidiyordu ve
     * çubuk "Sinyal gelince kendisi gidecek" derken adisyon kasaya hiç
     * düşmüyordu. Ekran açıkken kuyruk boşalınca gönderim yeniden kuruluyor.
     *
     * Yalnız kuyruğun DOLU görüldüğü bir "sırada" dönemi boşalınca: sayaç beş
     * saniyede bir okunuyor ve henüz yakalamamışken tetiklenmek, kuyruğu dolu
     * bir gönderimi döngüye sokardı.
     *
     * Tek kişilikte YOK: orada para var ve yeniden deneme kişinin dokunuşuyla
     * ("Tekrar dene").
     */
    const queueSeen = useRef(false);
    useEffect(() => {
        if (solo || send !== 'queued') { queueSeen.current = false; return; }
        if (queueLength > 0) { queueSeen.current = true; return; }
        if (!queueSeen.current || offline) return;
        queueSeen.current = false;
        resendRef.current = true;
        setSend('going');
    }, [solo, send, offline, queueLength]);

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

    const startClock = appointment.start_time.slice(0, 5);

    /*
     * Randevu hizmeti SATIR SATIR (Personel 15): Kasa'nın hesabıyla, Kasa'nın
     * okuduğu yerden (`fetchServiceCharge`). Okunamadıysa adlar duruyor ama
     * tutar yazılmıyor — uydurulmuyor.
     */
    const services: ServiceRow[] = serviceCharge
        ? serviceCharge.lines.map((row) => ({
            name: row.name, amount: row.amount, ...(serviceCharge.covered ? { covered: true } : {}),
        }))
        : booked.map((name) => ({ name, amount: null }));
    const kalem = kalemCount(services, lines);
    /*
     * PAKET / İNDİRİM / KISMİ / GRUP (D6, kullanıcı kararı 2026-10-16): tutarı
     * Kasa hesaplıyor; kumanda rakam YAZMIYOR (`null` → "—") ve tek kişilikte
     * tahsil etmiyor. Gün kartı Kasa'nın kalanını söylüyor; burada başka bir
     * rakam yazmak iki ekranı ayrıştırırdı.
     */
    const kasaOnly = serviceCharge?.kasaOnly ?? kasaFromCollect;
    const grand = kasaOnly ? null : sadeTotal(services, lines);
    /*
     * PAKETLİ SEANS (1.0.1, kullanıcı kararı): hizmet ₺0. Başka tutar yoksa
     * yöntem sorulmaz, düğme "Hesabı kapat · pakete dahil"; ürün varsa yalnız
     * o tahsil edilir. Tek kişilik işletmenin bilgisayarı yok — Kasa'ya
     * yollamak, adisyonu hiç kapanmayacak bir yere bırakmaktı.
     */
    const payMethod = collectMethodFor(Boolean(serviceCharge?.covered), grand, collectMethod);
    const lastName = lastAdded || liveLines(lines)[liveLines(lines).length - 1]?.name || null;
    const editLine = editing ? lines.find((line) => line.id === editing && !line.pendingDelete) ?? null : null;

    /** Adisyon sayfası her açılışta temiz: etiketler ve makbuz bir önceki açılışın. */
    const openAdisyon = () => {
        if (delivered) return;
        setTags({});
        setReceipt(null);
        setFlash(null);
        setSheet('catalog');
    };

    /**
     * Bir dokunuş: yeni satır mı, adet artışı mı, tavan mı. Üçü de makbuzda
     * yazılı ve kutuda durum olarak kalıyor (`addOutcome`).
     */
    const addItem = (item: CatalogItem) => {
        const out = addOutcome(lines, { ...item, catalogId: item.id }, `n${Date.now()}`);
        const material = item.kind === 'material';
        if (out.kind === 'max') {
            feedback.warning();
            setReceipt({ kind: 'max', name: item.name, qty: out.qty, material });
            return;
        }
        feedback.light();
        setLines(out.next);
        setLastAdded(item.name);
        setTags((current) => ({ ...current, [out.id]: out.kind }));
        setReceipt({ kind: out.kind, name: item.name, qty: out.qty, material });
        setFlash({ id: out.id, at: Date.now() });
    };

    /** Satır panelinden kaldırma: bir önceki pencere varsa önce o kapanır. */
    const removeItem = (id: string) => {
        setEditing(null);
        setReceipt(null);
        setLines((current) => markDelete(pending ? commitDelete(current, pending.id) : current, id));
        setPending({ id, at: Date.now() });
        setTags((current) => {
            const next = { ...current };
            delete next[id];
            return next;
        });
    };

    /**
     * Malzeme grubunun hâli. Adisyonda `material` kalem yoksa `none`:
     * başlık ÇİZİLMİYOR. Kesimde formül alanı görmek personele "bir şey
     * eksik bıraktım" dedirtir — kısık değil, boş değil, yok.
     */

    const glowColor = glowTone(phase === 'running' ? 'running' : 'before', level);



    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <WarmGlow tone={glowColor} top={insets.top + 300} />

            <View style={{ flex: 1, paddingTop: insets.top }}>
                {/* Geri TEK kontrol: bu ekranda gezinilecek yer yok. */}
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${backLabel} listesine dön`}
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
                    <Text style={{ color: c.tx2, fontSize: 15, fontWeight: '600' }}>{backLabel}</Text>
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
                    // Numara yoksa düğme SÖNÜK çiziliyor (müşteri dosyasıyla
                    // aynı kural): eskiden basınca sessizce hiçbir şey
                    // yapmıyordu — ölü kontrol.
                    onCall={appointment.customer_phone?.trim()
                        ? () => { void Linking.openURL(`tel:${appointment.customer_phone!.replace(/\s/g, '')}`); }
                        : undefined}
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

                {/*
                  * KOMŞU İŞ ŞERİDİ KALDIRILDI (2026-10-08).
                  *
                  * Fikir doğruydu: boya işlerken başka işe başlayan personele
                  * "arkada 24 dakikan var" demek, bildirim ve ses olmadığı
                  * için ekranın tek güvence olduğu bir üründe değerli.
                  *
                  * Ama ÇİZİLEN ŞEY SAHTEYDİ. Müşteri adı ("Zeynep Kaya"),
                  * hizmet ("boya") ve süre (24 dk) koda yazılıydı; sayaç her
                  * açılışta 24'ten geri sayıyordu ve `Pressable`ın `onPress`i
                  * hiç yoktu — ekran okuyucuya "düğme" diyip hiçbir şey
                  * yapmıyordu. Mağazadaki uygulamada personel, var olmayan bir
                  * müşteri için dönen bir sayaç görüyordu.
                  *
                  * Gerçeği türetilebilir: aynı personelin BUGÜN için
                  * `arrived_at` dolu, `service_ended_at` boş olan BAŞKA bir
                  * randevusu. Özellik olarak planlanınca geri gelir; o zaman
                  * `onPress` de bir yere gider. Kusur listesi §5.13 · B4.
                  */}

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
                            onPress={() => {
                                setWait(null);
                                rememberWait(appointment.id, null);
                                // Bekleme kalktı: "bitti" bildirimi de kalkıyor.
                                void disarmWaitAlarm(appointment.id);
                                void writeVisitWait(appointment.id, null).then((out) => observe(out.observation));
                            }}
                        />
                    </View>
                ) : null}

                {/* Personel 15 · K1: aynı maske, altında "Göster", sonra şeritle
                    AYNI sayı ("TOPLAM · n KALEM" — malzeme kalem değil). */}
                {phase === 'closing' || phase === 'closed' ? (
                    <SadeClosingDial
                        total={grand}
                        count={kalem}
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
                ) : itemsCode && !delivered ? (
                    <Band label={errorLine(itemsCode)} note="kaydedilmedi" />
                ) : send === 'queued' ? (
                    <Band label={queuedBandLabel(queueLength)} note="sinyal yok" />
                ) : undone ? (
                    <Band label="Gönderilmedi · adisyon açık" note={clockOf(now)} />
                ) : null}

                {/* ── ADİSYON ── */}
                {/*
                  * Personel 15 · A1: şerit İKİ SATIR — üstte ne var (n kalem ·
                  * son eklenen), altta ne kadar (Toplam ₺ ▬ · Göster 6 sn).
                  * Formül satırı şeridin altında, amber kenarlı bir kart.
                  */}
                {phase === 'running' ? (
                    <View style={{ marginBottom: 12 }}>
                        <SadeStrip
                            count={kalem}
                            lastName={lastName}
                            total={grand}
                            onOpen={openAdisyon}
                        />
                        {door ? (
                            <SadeFormulaRow
                                door={door}
                                card
                                materials={liveLines(lines).filter((line) => line.kind === 'material').length}
                                onPress={() => setSheet('formula')}
                            />
                        ) : null}
                    </View>
                ) : null}


                {phase === 'closing' || phase === 'closed' ? (
                    <View style={{ marginBottom: delivered ? 0 : 4 }}>
                        <SadeStrip
                            count={kalem}
                            lastName={lastName}
                            total={grand}
                            onOpen={openAdisyon}
                            variant={delivered ? 'sealed' : 'closing'}
                        />
                    </View>
                ) : null}

                {/* Personel 15 · K1: liste kendi içinde kayar; kadran, şerit ve
                    güverte yerinde. Satır yeni satır, paneli aynı panel. */}
                {phase === 'closing' || phase === 'closed' ? (
                    <ScrollView
                        style={{ flex: 1, minHeight: 0, marginTop: 10 }}
                        contentContainerStyle={{ paddingBottom: 12 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <SadeList
                            lines={lines}
                            services={services}
                            tags={tags}
                            editing={editing}
                            locked={delivered}
                            flash={flash}
                            pending={pending}
                            door={door}
                            formulaWritten={formula != null}
                            onEdit={setEditing}
                            onUndo={(id) => {
                                setLines((current) => undoDelete(current, id));
                                setPending(null);
                            }}
                            onDoor={() => { feedback.selection(); setSheet('formula'); }}
                        />
                    </ScrollView>
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
                            // Bitmiş iş beklemede olamaz; sunucu `visit.finish`te
                            // aynısını yapıyor. "Bekleme bitti" de artık söylenmez.
                            rememberWait(appointment.id, null);
                            void disarmWaitAlarm(appointment.id);
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

                    {/*
                      * SON ADIM MODA GÖRE (v4 · K3).
                      *
                      * Ekip modunda "Adisyonu kasaya gönder": personel işi
                      * kapatır, parayı başkası alır. Tek kişilikte o başkası
                      * yok — aynı kişi hem bitiriyor hem tahsil ediyor.
                      *
                      * Kabuk `from` parametresinden biliniyor: bu ekran
                      * `(staff-flow)` segmentinde yaşıyor ve `useInSoloShell()`
                      * burada çalışmıyor.
                      */}
                    {/*
                      * KASA'YA AİT ADİSYON (D6). Cümle güvertenin üstünde,
                      * formül uyarısıyla aynı dilde: düğmeye bakan kişi
                      * neden tahsil düğmesi olmadığını orada görüyor.
                      */}
                    {(phase === 'closing' || phase === 'closed') && kasaOnly && closedCard !== 'paid' ? (
                        <View style={{
                            alignSelf: 'stretch', flexDirection: 'row', gap: 9,
                            paddingHorizontal: 4,
                        }}>
                            <Glyph name="warn" size={16} color={c.am} />
                            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: c.am }}>
                                <Text style={{ fontWeight: '700' }}>{kasaReasonLabel(kasaOnly)}.</Text>
                                {params.from === 'tek'
                                    ? ' Tutarı Kasa hesaplıyor; tahsilatı masaüstündeki Kasa\'dan yapın.'
                                    : ' Tutarı Kasa hesaplıyor.'}
                            </Text>
                        </View>
                    ) : null}

                    {(phase === 'closing' || phase === 'closed') && params.from === 'tek' && !kasaOnly ? (
                        <CollectBar
                            method={payMethod}
                            stage={collectStage}
                            // Tahsil edilmiş ziyarette düğme yok, kayıt var.
                            paid={closedCard === 'paid'}
                            errorCode={collectCode}
                            onPick={setCollectMethod}
                            onCollect={() => {
                                tapMethodRef.current = payMethod;
                                collectAttemptRef.current = String(Date.now());
                                setCollectCode(null);
                                setCollectStage('sending');
                                // Gönderim yapılmadıysa önce o: `visit.collect`
                                // kapanmış randevu istiyor. Düştüyse ya da
                                // kuyruktaysa yeniden kuruluyor (D3); olduysa
                                // etki doğrudan tahsilata geçiyor.
                                restartSend();
                            }}
                            onLater={() => {
                                // v4: "adisyon açık kalır, Gün'de kart G4 olur".
                                setCollectStage('pending');
                                setCollectCode(null);
                                restartSend();
                            }}
                        />
                    ) : phase === 'closing' || phase === 'closed' ? (
                        <SendToCash
                            state={send}
                            // Sunucu gerçeği: tahsil edilmiş ya da kasadaki
                            // bir ziyarette çubuk gönderim TEKLİF ETMEMELİ.
                            closedCard={closedCard}
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
                <Sheet
                    onClose={() => setSheet(null)}
                    full={sheet === 'catalog'}
                    look={sheet === 'catalog' ? 'sade' : 'plain'}
                    head={sheet === 'catalog' ? (
                        <SadeSheetHead count={kalem} total={grand} />
                    ) : null}
                >
                    {/*
                      * Personel 15 · A2: sayfa dokuz katmandan DÖRDE — toplam
                      * başlığı · ekleme (arama kapısı + kutular + makbuz) ·
                      * kalemler · malzeme. "Adisyon" başlığı toplamla birleşti,
                      * "Bitti" kalktı: yazma 0,7 sn'de kendiliğinden.
                      */}
                    {sheet === 'catalog' ? (
                        <View style={{ flex: 1 }}>
                            <SadeSheetBody
                                frequent={frequent}
                                lines={lines}
                                receipt={receipt}
                                flash={flash}
                                onSearch={() => setSheet('search')}
                                onTile={(item) => guardAdd(item, () => addItem(item))}
                                list={(
                                    <SadeList
                                        lines={lines}
                                        services={services}
                                        tags={tags}
                                        editing={editing}
                                        locked={delivered}
                                        flash={flash}
                                        pending={pending}
                                        door={door}
                                        formulaWritten={formula != null}
                                        onEdit={setEditing}
                                        onUndo={(id) => {
                                            setLines((current) => undoDelete(current, id));
                                            setPending(null);
                                        }}
                                        onDoor={() => { feedback.selection(); setSheet('formula'); }}
                                    />
                                )}
                            />
                        </View>
                    ) : null}
                    {sheet === 'search' ? (
                        <CatalogSearch
                            query={query}
                            results={searchCatalog(catalog, query)}
                            frequent={frequent.items}
                            onQuery={setQuery}
                            onPick={(item) => guardAdd(item, () => {
                                // Kutunun yoluyla aynı: makbuz, etiket ve satırın
                                // girişi (Personel 15).
                                addItem(item);
                                setQuery('');
                                setSheet('catalog');
                            })}
                            onFree={(name) => {
                                addItem(freeItem(name));
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
                                /*
                                 * Halka HEMEN dönüyor, yazma arkadan gidiyor:
                                 * kumanda bodrum katında da açılıyor ve
                                 * bekleme bugüne kadar internetsiz
                                 * çalışıyordu. Yazmanın işi beklemeyi Gün'e
                                 * taşımak; sunucu kabul edince onun bitişi
                                 * benimseniyor (telefonun saati yanlış
                                 * olabilir). Bu telefondaki niyet de
                                 * yazılıyor ki sinyalsiz kurulan bekleme
                                 * Gün'de yine görünsün (`waitIntent`).
                                 */
                                const endsAt = Date.now() + m * 60_000;
                                setWait({ endsAt, total: m * 60, source: waitSource(m) });
                                rememberWait(appointment.id, { endsAt, minutes: m });
                                setSheet(null);
                                /*
                                 * BEKLEME BİTTİ bildirimi — telefonun kendisi
                                 * bitiş anına kuruyor (`waitAlarm.ts`):
                                 * internetsiz de çalışıyor, tam saatinde
                                 * düşüyor. Sunucunun saati gelince aynı
                                 * kimlikle ona çekiliyor.
                                 */
                                const alarm = {
                                    reservationId: appointment.id,
                                    // Dokununca bu işin kumandası, kendi gününde (2026-10-14).
                                    dateISO: appointment.date,
                                    customerName: appointment.customer_name,
                                    service: appointment.service,
                                    minutes: m,
                                };
                                void armWaitAlarm({ ...alarm, endsAt });
                                void writeVisitWait(appointment.id, m).then((out) => {
                                    observe(out.observation);
                                    const serverEnds = out.endsAt ? Date.parse(out.endsAt) : Number.NaN;
                                    if (!Number.isFinite(serverEnds)) return;
                                    // Bu arada kaldırıldıysa diriltilmiyor.
                                    if (waitIntentOf(appointment.id) === null) return;
                                    rememberWait(appointment.id, { endsAt: serverEnds, minutes: m });
                                    setWait((current) => (current ? { ...current, endsAt: serverEnds } : current));
                                    void armWaitAlarm({ ...alarm, endsAt: serverEnds });
                                });
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

            {/*
              * Personel 15 · A5 — SATIR PANELİ (tek kişilik). Satır yerinde
              * açılmıyor; alttan kısa bir panel, adisyon sayfasının ÜSTÜNDE.
              * Kaydırarak silme ve uzun basma yok: her satırda aynı tek yol.
              */}
            {editLine && !delivered ? (
                <Sheet onClose={() => setEditing(null)}>
                    <SadeEditPanel
                        line={editLine}
                        onStep={(dir) => setLines((current) => {
                            const line = current.find((item) => item.id === editLine.id);
                            const next = line ? stepQty(line.qty, dir) : null;
                            return next == null ? current : setQty(current, editLine.id, next);
                        })}
                        onRemove={() => removeItem(editLine.id)}
                        onClose={() => setEditing(null)}
                    />
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
    /** Yoksa numara yok ve "Müşteriyi ara" sönük. */
    onCall?: () => void;
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
    const off = !onPress;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={off ? `${label} — numara yok` : label}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={onPress}
            style={({ pressed }) => ({
                width: 48, height: 48,
                borderRadius: 16,
                backgroundColor: c.fld,
                borderWidth: 1,
                borderColor: c.bd,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: off ? 0.38 : pressed ? 0.6 : 1,
            })}
        >
            <Glyph name={glyph} size={21} color={off ? c.tx3 : c.tx2} />
            {dot ? (
                <View style={{
                    position: 'absolute', top: 9, right: 9,
                    width: 6, height: 6, borderRadius: 3, backgroundColor: c.am,
                }} />
            ) : null}
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
function Sheet({ children, onClose, full = false, head = null, look = 'plain' }: {
    children: React.ReactNode;
    onClose: () => void;
    /**
     * `sade` (2026-10-15, kullanıcı seçimi "C"): iOS ölçüsünde tutamaç
     * (36 × 5, belirgin, üstte ~20 pt) ve İKİ TON — başlık bir ton açık
     * (`surf2`), gövde koyu (`surf`). Adisyon sayfası, iki kabukta; öteki
     * alt sayfalar (formül, not, bekleme, satır paneli) eski görünümde.
     */
    look?: 'plain' | 'sade';
    /** Tutamağın ALTINDA, onunla birlikte çekilen başlık (Personel 15 · toplam). */
    head?: React.ReactNode;
    /**
     * Tavana kadar TAM BOY (Personel 15 · A2): sade adisyon sayfası içerik
     * boyunda değil, plakanın altından başlıyor. Kalem sayısı değiştikçe
     * sayfanın üst kenarı oynamasın.
     */
    full?: boolean;
}) {
    const { c, reduceMotion, small } = useTheme();
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

    /**
     * Tam boy sayfanın üstünde bırakılan yer (Personel 15 · `.sheet.adis{top:160px}`,
     * küçük ekranda 144): büyüyen plakanın dört satırı ve saat satırı.
     */
    const fullH = Math.max(320, winH - insets.top - (small ? 144 : 160));

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
                    ...(full ? { height: kb > 0 ? roof : fullH } : { maxHeight: roof }),
                    backgroundColor: look === 'sade' ? c.surf : c.card,
                    borderTopWidth: 1,
                    borderTopColor: c.bd2,
                    borderTopLeftRadius: 30,
                    borderTopRightRadius: 30,
                    paddingBottom: kb > 0 ? 0 : insets.bottom,
                    transform: [{ translateY: Animated.add(fall, drag) }],
                }}
            >
                {/*
                  * Tutamaç + BAŞLIK tek çekme yüzeyi (2026-10-15, kullanıcı:
                  * "Katalogda ara'nın üstündeki her yerde tutamaç çalışsın").
                  * Başlıkta dokunulacak bir şey yok; parmak nereden tutarsa
                  * tutsun sayfa iner.
                  */}
                <View
                    {...pan.panHandlers}
                    // Açık ton sayfanın YUVARLAK köşelerine uymalı: köşesiz
                    // zemin kenarın dışına taşıyordu (telefonda görüldü).
                    style={look === 'sade' ? {
                        backgroundColor: c.surf2, borderTopLeftRadius: 29, borderTopRightRadius: 29,
                    } : undefined}
                >
                    {look === 'sade' ? (
                        // Tutamacın dokunma alanı artık 20 pt'lik şerit DEĞİL,
                        // başlığın tamamı: 44 pt'nin gerekçesi (eldivenli parmak)
                        // burada başlıkla karşılanıyor. Çizgi iOS ölçüsünde.
                        <View
                            accessibilityRole="button"
                            accessibilityLabel="Sayfayı kapat"
                            onAccessibilityTap={shut}
                            style={{ height: 20, paddingTop: 6, alignItems: 'center' }}
                        >
                            <View style={{ width: 36, height: 5, borderRadius: 2.5, backgroundColor: c.tx, opacity: 0.38 }} />
                        </View>
                    ) : (
                        <View
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
                    )}
                    {head}
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

/** Halkanın altındaki ad — kumandanın bugünkü sözü, değişmedi. */
function waitSource(minutes: number): string {
    return `Boya · ${minutes} dk`;
}

/**
 * Kumanda yeniden açılınca halkanın geri kurulması (112 · v4 G3).
 *
 * Yalnız SÜREN işte: başlamamış ya da bitmiş işin beklemesi olmaz. Bitmiş
 * bekleme de geri kurulmuyor — sıfırın altına dönen bir halka bir şey
 * anlatmaz.
 */
function restoredWait(
    visit: { id: string; status: string; arrived_at: string | null; service_ended_at: string | null;
        wait_ends_at?: string | null; wait_minutes?: number | null },
    nowMs: number,
): { endsAt: number; total: number; source: string } | null {
    if (!visit.arrived_at || visit.service_ended_at || visit.status === 'completed') return null;
    const live = activeWait(visit, waitIntentOf(visit.id), nowMs);
    return live ? { endsAt: live.endsAt, total: live.minutes * 60, source: waitSource(live.minutes) } : null;
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

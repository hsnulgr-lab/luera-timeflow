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
    View, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    HoldToFinish, SlideToStart, WaitRing, WarmGlow,
} from '../../src/components/VisitControls';
import { clockOf, demoAgenda, type DemoAppointment } from '../../src/lib/staffDemo';
import { todayISO } from '../../src/lib/calendar';
import {
    dialA, glowTone, mmss, phaseOf, planBar, waitLevel,
} from '../../src/lib/visitControl';
import { formatCounter } from '../../src/lib/staffCard';
import {
    debtLine, formulaDoor, historyState, mixDebtLine, mixSaveLabel,
    saveLabel, sendWarning,
    type FormulaDoor, type VisitFormula,
} from '../../src/lib/formula';
import { SendToCash } from '../../src/components/SendToCash';
import {
    SEAL_MS, UNDO_NOTE_MS, WINDOW_MS, errorLine, isSealed, plateWord,
    type SendState,
} from '../../src/lib/sendToCash';
import { saveVisitFormula, visitFormulaOf } from '../../src/lib/formulaStore';
import { feedback } from '../../src/lib/feedback';
import { useKeyboardInset } from '../../src/lib/keyboardInset';
import { Glyph } from '../../src/components/Glyph';
import { Auto, Field } from '../../src/components/FormulaFields';
import { AdisyonRow, DeleteWindow } from '../../src/components/AdisyonRow';
import { CatalogSearch } from '../../src/components/CatalogSearch';
import { FormulaDoorRow } from '../../src/components/FormulaDoorRow';
import {
    DELETE_MS, FREQUENT_COUNT, KIND_LABEL, addLine, addResult, freeItem,
    groupsOf,
    frequentFor, searchCatalog, usageAsOf, commitDelete, deleteNotice, liveLines,
    markDelete, money, setQty, stripOf, totalOf, undoDelete,
    type AdisyonLine, type CatalogItem, type UsageRow,
} from '../../src/lib/adisyon';
import {
    FormulaBody, HistoryLine, NoteStep, emptyDraft,
    type FormulaDraft, type FormulaPrevious,
} from '../../src/components/FormulaBody';
import { numeric, useTheme } from '../../src/theme';
import { upperTR } from '../../src/lib/text';

/**
 * Alt sayfanın kapanma yolu, gerçek boy ölçülene kadar. Ölçülen boy her zaman
 * bundan küçük; büyük tahmin sayfayı ekran dışında tutar, küçük tahmin
 * açılırken bir an sırıtmasına yol açardı.
 */
const SHEET_FALLBACK_H = 720;

/** Kalem ekleme sayfasındaki sık kullanılanlar — sıklık sırasına göre. */
/**
 * Salonun kataloğu. `api.catalog()` bağlanana kadar sahte — ama YAKIN
 * KODLARLA, çünkü bu ekranın asıl sınavı `7.3` ile `7.31`i ayırt ettirmek.
 * Altısı kutuda duruyor, kalanı aramada.
 */
const CATALOG: CatalogItem[] = [
    { id: 'c1', name: 'Boya · 7.3 kumral', kind: 'material', usedHere: true },
    { id: 'c2', name: 'Boya · 7.31 küllü kumral', kind: 'material' },
    { id: 'c3', name: 'Boya · 7.34 bakır kumral', kind: 'material' },
    { id: 'c4', name: 'Boya · 8.3 açık kumral', kind: 'material' },
    { id: 'c5', name: 'Boya · 6.3 koyu kumral', kind: 'material' },
    { id: 'c6', name: 'Oksidan %6', kind: 'material', usedHere: true },
    { id: 'c7', name: 'Oksidan %9', kind: 'material' },
    { id: 'c8', name: 'Şampuan 300 ml', kind: 'product', price: 320 },
    { id: 'c9', name: 'Saç bakım yağı', kind: 'product', price: 640 },
    { id: 'c10', name: 'Keratin serum', kind: 'product', price: 880 },
    { id: 'c11', name: 'Kaş alma', kind: 'extra', price: 180 },
    { id: 'c12', name: 'Fön', kind: 'extra', price: 350 },
    { id: 'c13', name: 'Saç kesimi', kind: 'extra', price: 450 },
];

/**
 * Geçmiş adisyonlar — sıklığın girdisi. `api.catalog()` ve geçmiş uçları
 * bağlanınca sunucudan gelecek; uydurulan bir eşik yok, sayılar kayıttan
 * türüyor.
 */
const USAGE: UsageRow[] = [
    { name: 'Boya · 7.3 kumral', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-01', count: 14 },
    { name: 'Oksidan %6', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-01', count: 13 },
    { name: 'Fön', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-02', count: 9 },
    { name: 'Şampuan 300 ml', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-02', count: 6 },
    { name: 'Boya · 7.31 küllü kumral', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-03', count: 5 },
    { name: 'Saç bakım yağı', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-03', count: 3 },
    { name: 'Keratin serum', service: 'Saç boyama', staffId: 'merve', dateISO: '2026-09-04', count: 2 },
    // Kesim de kendi kutularını taşıyor: hizmet başına ayrı sıralama demek,
    // her hizmette veri olması demek.
    { name: 'Fön', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-02', count: 11 },
    { name: 'Şampuan 300 ml', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-02', count: 7 },
    { name: 'Saç bakım yağı', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-03', count: 4 },
    { name: 'Kaş alma', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-03', count: 3 },
    { name: 'Keratin serum', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-04', count: 2 },
    { name: 'Saç kesimi', service: 'Kesim', staffId: 'merve', dateISO: '2026-09-04', count: 2 },
    // Salonun kaydı: personelin kendi verisi yoksa buradan kuruluyor.
    { name: 'Oksidan %9', service: 'Röfle', staffId: null, dateISO: '2026-09-01', count: 7 },
    { name: 'Boya · 8.3 açık kumral', service: 'Röfle', staffId: null, dateISO: '2026-09-01', count: 5 },
];

/** Oturumdaki personel. Sunucuya bağlanınca `me.id` buraya gelecek. */
const ME = 'merve';

/** Bekleme sayacının hazır süreleri. */
const MINUTES = [20, 25, 30, 35, 45, 60];

/**
 * Geçen seferin formülü — karşılaştırmanın kaynağı.
 *
 * `customer` ucu bağlanana kadar sahte. Sunucu tarafı hazır:
 * `090_visit_formula.sql` müşterinin formül geçmişi için
 * `(organization_id, customer_id, date DESC) WHERE formula IS NOT NULL`
 * indeksini zaten açtı; eksik olan yalnız uç.
 */
const DEMO_PREVIOUS: FormulaPrevious = {
    dateLabel: '12 Mart',
    initials: 'MK',
    ratio: '1:1,5',
    waitMinutes: 35,
    result: 'açık kaldı',
};


export default function Kumanda() {
    const { c, dark, small, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string }>();

    // Sahte gün mount anında donuyor: her saniye yeniden üretilirse randevu
    // saatleri kayar ve sayaç yerinde saymaya başlar.
    const [anchor] = useState(() => Date.now());
    const dateISO = todayISO();
    const base = useMemo<DemoAppointment | undefined>(() => {
        const list = demoAgenda(anchor, dateISO);
        return list.find((item) => item.id === params.id) ?? list[1];
    }, [anchor, dateISO, params.id]);

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
    const [sentAt, setSentAt] = useState<string | null>(null);
    /** Geri alındıktan sonra 2.6 sn duran şerit. */
    const [undone, setUndone] = useState(false);
    const sent = isSealed(send);

    const DEFAULT_LINES: AdisyonLine[] = [
        { id: 'k1', name: 'Kaş alma', kind: 'extra', price: 180, qty: 1 },
        { id: 'k2', name: 'Saç bakım yağı', kind: 'product', price: 640, qty: 2 },
        { id: 'k3', name: 'Boya · 7.3 kumral', kind: 'material', qty: 2 },
        { id: 'k4', name: 'Oksidan %6', kind: 'material', qty: 1 },
    ];
    const [lines, setLines] = useState<AdisyonLine[]>(DEFAULT_LINES);
    const [lastAdded, setLastAdded] = useState('Boya · 7.3 kumral');

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
     * Ziyaretin formülü — sunucuya bağlanınca `visit.formula`dan gelecek.
     * O güne kadar yerel depodan: kumanda kapanıp yeniden açıldığında az önce
     * yazılan formül DURMALI, yoksa kaydetmenin bir anlamı kalmıyor.
     */
    const [formula, setFormula] = useState<VisitFormula | null>(
        // `params.id` DEĞİL `base.id`: adres eşleşmediğinde kaynak listenin
        // ikinci randevusuna düşüyor ve yazma o kimliğe yapılıyor. İkisi
        // ayrılırsa yazılan formül geri okunamazdı.
        () => visitFormulaOf(base?.id),
    );
    /** Gerçek grup başlığı ekranda mı? Değilse alta bir kopya pinleniyor. */
    const [headSeen, setHeadSeen] = useState(true);
    const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const appointment = useMemo(() => (base ? {
        ...base,
        arrived_at: startedAt ?? base.arrived_at,
        service_ended_at: endedAt ?? base.service_ended_at,
        adisyon_items: sent ? lines : base.adisyon_items,
    } : null), [base, startedAt, endedAt, sent, lines]);

    /**
     * Kutudaki altı kalem. Ölçek YERLEŞİME değil buraya biniyor: 40 kalemli
     * salonda da 400 kalemlide de ekran birebir aynı, değişen kutuların içi.
     */
    const frequent = useMemo(
        () => frequentFor(CATALOG, usageAsOf(USAGE, dateISO), {
            service: (appointment?.service ?? '').split(' + ')[0] || 'Saç boyama',
            staffId: ME,
            limit: FREQUENT_COUNT,
        }),
        [appointment?.service, dateISO],
    );

    const phase = appointment ? phaseOf(appointment, now) : 'before';
    const running = phase === 'running';
    /** Adisyon zaten kasada: bu oturumda gönderildi ya da veri öyle diyor. */
    const delivered = sent || phase === 'closed';

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
        previousResult: DEMO_PREVIOUS.result,
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
            const id = setTimeout(() => {
                setSentAt(clockOf(Date.now()));
                setSend('sent');
            }, 900);
            return () => clearTimeout(id);
        }
        if (send === 'sent') {
            const id = setTimeout(() => setSend('sealed'), SEAL_MS);
            return () => clearTimeout(id);
        }
        return undefined;
    }, [send]);

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
        setSentAt(null);
        setUndone(false);
        setWait(null);
        setLines(DEFAULT_LINES);
        setLastAdded('Boya · 7.3 kumral');
        setRevealed(false);
        setSheet(null);
        setOpenRow(null);
        setPending(null);
        setQuery('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    /**
     * Risk kuralları — işletmenin `settings.risk_rules` listesinden eşleşenler.
     * Sunucuya bağlanınca `customer` ucundan gelecek; şimdilik demo.
     *
     * Kancalar erken dönüşün ÜSTÜNDE: `if (!appointment) return null` altına
     * konursa çağrı sırası randevu bulunup bulunmamasına göre değişir.
     */
    const who = appointment?.customer_name ?? '';
    const risks = useMemo(
        () => (who === 'Ayşe Yılmaz'
            ? [{ kind: 'Alerji', text: 'Boya alerjisi bildirildi — kulak arkası testi şart.' }]
            : who === 'Elif Demir'
                ? [
                    { kind: 'Alerji', text: 'Boya alerjisi bildirildi, kulak arkası testi şart.' },
                    { kind: 'Hassasiyet', text: 'Saç derisi hassas: amonyaklı ürün kullanılmıyor.' },
                ]
                : []),
        [who],
    );
    /** Grup başlığının liste içindeki dikey konumu — kopya kararı bundan. */
    const headY = useRef(0);

    if (!appointment) return null;

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
                {send === 'queued' ? (
                    <Band label="Sırada 3 yazma" note="sinyal yok" />
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
                            {lines.length === 0 ? (
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
                                setStartedAt(new Date().toISOString());
                                setNow(Date.now());
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
                            errorWord={errorLine(null)}
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
                            onAdd={(item) => {
                                feedback.light();
                                // İkinci dokunuş ×2 yapıyor, ikinci satır
                                // AÇMIYOR: aynı kalemin iki ayrı satırı altı ay
                                // sonra okuyan kişiye hata gibi görünür.
                                setLines((current) => addLine(current, item, `n${Date.now()}`));
                                setLastAdded(item.name);
                            }}
                            frequent={frequent}
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
                            results={searchCatalog(CATALOG, query)}
                            frequent={frequent.items}
                            onQuery={setQuery}
                            onPick={(item) => {
                                feedback.light();
                                setLines((current) => addLine(current, item, `n${Date.now()}`));
                                setLastAdded(item.name);
                                setQuery('');
                                setSheet('catalog');
                            }}
                            onFree={(name, kind) => {
                                const item = freeItem(name, kind);
                                setLines((current) => addLine(current, item, `n${Date.now()}`));
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
                            /* Geçen seferin formülü. `customer` ucu bağlanınca
                               buraya oradan gelecek — `090_visit_formula.sql`
                               müşterinin formül geçmişi için indeksi açtı. */
                            previous={DEMO_PREVIOUS}
                            /* Malzeme yanlışsa düzeltme ADİSYONDA: alt sayfa
                               kapanıyor, personel unuttuğu ürünü ekliyor. Yol
                               varsa yol gösteriliyor, yoksa sebep. */
                            onMaterial={() => setSheet('catalog')}
                            onSave={(next) => {
                                feedback.medium();
                                // Ekran durumu TEK BAŞINA yetmiyordu: kumanda
                                // kapanınca formül kayboluyordu. Müşteri
                                // sayfası da aynı depodan okuyor.
                                saveVisitFormula(appointment.id, next);
                                setFormula(next);
                                setSheet(null);
                            }}
                        />
                    ) : null}
                    {sheet === 'note' ? (
                        <NoteSheet note={appointment.notes} onClose={() => setSheet(null)} />
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
    appointment, phase, delivered, send, dialKind, tail, risks, onNote, onCall, onCard,
}: {
    appointment: DemoAppointment;
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
        : delivered ? { word: plateWord(send).word, tone: plateWord(send).tone === 'gr' ? c.gr : c.am }
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

function CatalogSheet({ count, frequent, rows, onAdd, resultOf, onSearch, onDone }: {
    count: number;
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
                                accessibilityLabel={`${item.name}, ${KIND_LABEL[item.kind]}`}
                                onPress={() => {
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
                                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: c.tx3 }}>
                                    {KIND_LABEL[item.kind]}
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
                {count > 0 ? rows : (
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
    materials, wait, waitSpan, current, locked, previous, mixing, waitRunning,
    onSave, onMaterial,
}: {
    materials: [string, string][];
    wait: number | null;
    waitSpan?: string;
    current: VisitFormula | null;
    locked: boolean;
    previous: FormulaPrevious | null;
    /** Karıştırma anı — üçüncü hâlin dili buradan geliyor. */
    mixing: boolean;
    waitRunning: boolean;
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
    const history = historyState(previous ? {
        materials: [], ratio: previous.ratio, waitMinutes: previous.waitMinutes,
        waitSource: 'manual', result: previous.result, note: null,
        staffId: null, writtenAt: null,
    } : null, true);
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
                    onPress={() => onSave({
                        materials: [],
                        ratio: draft.ratio,
                        waitMinutes: timerRan ? wait : draft.wait,
                        waitSource: timerRan ? 'timer' : 'manual',
                        result: draft.result ? draft.result.toLocaleLowerCase('tr-TR') : null,
                        tags: draft.tags,
                        note: draft.note.trim() || null,
                        staffId: null,
                        writtenAt: new Date().toISOString(),
                    })}
                    style={({ pressed }) => ({
                        height: 64, borderRadius: 22, backgroundColor: c.or,
                        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1,
                    })}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                        {save?.label}
                    </Text>
                </Pressable>
                {save?.note ? (
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

function NoteSheet({ note, onClose }: { note: string | null; onClose: () => void }) {
    const { c } = useTheme();
    return (
        <>
            <SheetHead title="Not" note="müşteri görmez" />
            <View style={{ paddingHorizontal: 16 }}>
                <View style={{
                    padding: 15,
                    borderRadius: 18,
                    backgroundColor: c.surf2,
                    borderWidth: 1,
                    borderColor: c.bd,
                    minHeight: 132,
                }}>
                    <Text style={{ fontSize: 16, fontWeight: '500', lineHeight: 24, color: note ? c.tx : c.tx3 }}>
                        {note ?? 'Bu randevuda not yok.'}
                    </Text>
                </View>
                {/* Sunucuda not ucu YOK. Ölü kontrol değil, bekleyen iş. */}
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
                        Sunucuda not ucu henüz yok: yazılan not cihazda duruyor ve
                        uç açıldığında gönderilecek.
                    </Text>
                </View>
            </View>
            <SheetFoot label="Kapat" onPress={onClose} />
        </>
    );
}

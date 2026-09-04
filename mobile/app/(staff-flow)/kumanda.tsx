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
    Animated, Easing, Linking, PanResponder, Pressable, ScrollView, Text, TextInput, View,
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
    RATIOS, RESULTS, WAITS, groupState, summaryOf,
    type FormulaSourceItem, type VisitFormula,
} from '../../src/lib/formula';
import { feedback } from '../../src/lib/feedback';
import { Glyph } from '../../src/components/Glyph';
import { Auto, Field, Grid, GridButton } from '../../src/components/FormulaFields';
import { numeric, useTheme } from '../../src/theme';
import { upperTR } from '../../src/lib/text';

/**
 * Alt sayfanın kapanma yolu, gerçek boy ölçülene kadar. Ölçülen boy her zaman
 * bundan küçük; büyük tahmin sayfayı ekran dışında tutar, küçük tahmin
 * açılırken bir an sırıtmasına yol açardı.
 */
const SHEET_FALLBACK_H = 720;

/** Kalem ekleme sayfasındaki sık kullanılanlar — sıklık sırasına göre. */
const FREQUENT: { name: string; kind: 'material' | 'product' | 'extra'; price?: number }[] = [
    { name: 'Boya · 7.3 kumral', kind: 'material' },
    { name: 'Oksidan %6', kind: 'material' },
    { name: 'Şampuan 300 ml', kind: 'product', price: 320 },
    { name: 'Saç bakım yağı', kind: 'product', price: 640 },
    { name: 'Kaş alma', kind: 'extra', price: 180 },
    { name: 'Fön', kind: 'extra', price: 350 },
];

const KIND_LABEL: Record<string, string> = {
    extra: 'EK HİZMET',
    product: 'ÜRÜN',
    material: 'MALZEME',
};

/** Bekleme sayacının hazır süreleri. */
const MINUTES = [20, 25, 30, 35, 45, 60];

interface Line {
    id: string;
    name: string;
    kind: 'material' | 'product' | 'extra';
    price?: number;
    qty: number;
}

const money = (value: number) => `₺${value.toLocaleString('tr-TR')}`;

export default function Kumanda() {
    const { c, small } = useTheme();
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
    const [sent, setSent] = useState(false);

    const DEFAULT_LINES: Line[] = [
        { id: 'k1', name: 'Kaş alma', kind: 'extra', price: 180, qty: 1 },
        { id: 'k2', name: 'Saç bakım yağı', kind: 'product', price: 640, qty: 2 },
        { id: 'k3', name: 'Boya · 7.3 kumral', kind: 'material', qty: 2 },
        { id: 'k4', name: 'Oksidan %6', kind: 'material', qty: 1 },
    ];
    const [lines, setLines] = useState<Line[]>(DEFAULT_LINES);
    const [lastAdded, setLastAdded] = useState('Boya · 7.3 kumral');

    /** Bekleme sayacı SUNUCUYA YAZILMIYOR — cihazda yaşıyor. */
    const [wait, setWait] = useState<{ endsAt: number; total: number; source: string } | null>(null);
    const [sheet, setSheet] = useState<'catalog' | 'minutes' | 'note' | 'formula' | null>(null);
    const [revealed, setRevealed] = useState(false);
    /** Her açılışta artıyor: fitil baştan yanmalı, kaldığı yerden değil. */
    const [revealKey, setRevealKey] = useState(0);
    /** Ziyaretin formülü — sunucuya bağlanınca `visit.formula`dan gelecek. */
    const [formula, setFormula] = useState<VisitFormula | null>(null);
    /** Gerçek grup başlığı ekranda mı? Değilse alta bir kopya pinleniyor. */
    const [headSeen, setHeadSeen] = useState(true);
    const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const appointment = useMemo(() => (base ? {
        ...base,
        arrived_at: startedAt ?? base.arrived_at,
        service_ended_at: endedAt ?? base.service_ended_at,
        adisyon_items: sent ? lines : base.adisyon_items,
    } : null), [base, startedAt, endedAt, sent, lines]);

    const phase = appointment ? phaseOf(appointment, now) : 'before';
    const running = phase === 'running';
    /** Adisyon zaten kasada: bu oturumda gönderildi ya da veri öyle diyor. */
    const delivered = sent || phase === 'closed';

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), running || wait ? 1000 : 20_000);
        return () => clearInterval(id);
    }, [running, wait]);

    useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

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
        setSent(false);
        setWait(null);
        setLines(DEFAULT_LINES);
        setLastAdded('Boya · 7.3 kumral');
        setRevealed(false);
        setSheet(null);
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

    const total = lines.reduce((sum, line) => sum + (line.price ?? 0), 0);
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
    const group = groupState(lines as readonly FormulaSourceItem[], formula);

    const glowColor = glowTone(phase === 'running' ? 'running' : 'before', level);

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
                    onCard={() => router.push({
                        pathname: '/(staff-flow)/musteri',
                        params: { name: appointment.customer_name },
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
                        count={lines.length}
                        revealed={revealed}
                        onReveal={reveal}
                        runKey={revealKey}
                        span={`${startClock} – ${clockOf(Date.parse(appointment.service_ended_at ?? ''))}`}
                        minutes={Math.round(elapsedSec / 60)}
                    />
                ) : null}

                {/* ── ADİSYON ── */}
                {phase === 'running' ? (
                    <Strip
                        count={lines.length}
                        last={lastAdded}
                        total={total}
                        revealed={revealed}
                        onReveal={reveal}
                        runKey={revealKey}
                        onAdd={() => setSheet('catalog')}
                    />
                ) : null}

                {phase === 'closing' || phase === 'closed' ? (
                    <View style={{ flex: 1, minHeight: 0 }}>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: group === 'none' ? 0 : 48 }}
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
                            {lines.filter((line) => line.kind !== 'material').map((line) => (
                                <LineRow key={line.id} line={line} revealed={revealed} />
                            ))}

                            {group === 'none' ? null : (
                                <View onLayout={(e) => { headY.current = e.nativeEvent.layout.y; }}>
                                    <GroupHead
                                        state={group}
                                        summary={summaryOf(formula)}
                                        onPress={() => { feedback.selection(); setSheet('formula'); }}
                                    />
                                </View>
                            )}
                            {lines.filter((line) => line.kind === 'material').map((line) => (
                                <LineRow key={line.id} line={line} revealed={revealed} />
                            ))}
                        </ScrollView>

                        {group !== 'none' && !headSeen ? (
                            <View pointerEvents="box-none" style={{ position: 'absolute', left: 20, right: 20, bottom: 0 }}>
                                <GroupHead
                                    state={group}
                                    summary={summaryOf(formula)}
                                    pinned
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

                    {phase === 'closing' || phase === 'closed' ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Adisyonu kasaya gönder"
                            disabled={delivered}
                            onPress={() => { feedback.medium(); setSent(true); }}
                            style={({ pressed }) => ({
                                alignSelf: 'stretch',
                                height: 64,
                                borderRadius: 22,
                                backgroundColor: delivered ? c.gr : c.or,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                opacity: pressed ? 0.9 : 1,
                            })}
                        >
                            <Glyph name={delivered ? 'check' : 'cash'} size={21} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                                {delivered ? 'Kasaya gönderildi' : 'Adisyonu kasaya gönder'}
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>

            {sheet ? (
                <Sheet onClose={() => setSheet(null)}>
                    {sheet === 'catalog' ? (
                        <CatalogSheet
                            count={lines.length}
                            onAdd={(item) => {
                                feedback.light();
                                setLines((current) => [...current, {
                                    id: `n${current.length + 1}`,
                                    name: item.name,
                                    kind: item.kind,
                                    price: item.price,
                                    qty: 1,
                                }]);
                                setLastAdded(item.name);
                            }}
                            onDone={() => setSheet(null)}
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
                            onSave={(next) => {
                                feedback.medium();
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
    appointment, phase, delivered, dialKind, tail, risks, onNote, onCall, onCard,
}: {
    appointment: DemoAppointment;
    phase: string;
    delivered: boolean;
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
        : delivered ? { word: 'Kasada', tone: c.gr }
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

function Strip({ count, last, total, revealed, onReveal, runKey, onAdd }: {
    count: number; last: string; total: number;
    revealed: boolean; onReveal: () => void; runKey: number; onAdd: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            marginHorizontal: 20,
            marginBottom: 12,
            paddingLeft: 16,
            paddingRight: 8,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: c.surf,
            borderWidth: 1,
            borderColor: c.bd,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        }}>
            <Pressable onPress={onAdd} style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.76, color: c.tx3 }}>
                    {upperTR(`Adisyon · ${count} kalem`)}
                </Text>
                {/* Son eklenen kalem: "boyayı ekledim mi?" sorusu bir sayfa
                    açtırmamalı. */}
                <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', letterSpacing: -0.15, color: c.tx }}>
                    <Text style={{ color: c.tx3, fontWeight: '700' }}>son </Text>
                    {last}
                </Text>
            </Pressable>
            <Money value={total} revealed={revealed} onReveal={onReveal} runKey={runKey} />
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
function GroupHead({ state, summary, pinned, onPress }: {
    state: 'pending' | 'done';
    summary: string;
    pinned?: boolean;
    onPress: () => void;
}) {
    const { c, dark } = useTheme();
    const done = state === 'done';
    const tone = done ? c.gr : c.am;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={done ? `Formül yazıldı: ${summary}` : 'Formül bekliyor, yazmak için dokunun'}
            onPress={onPress}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10,
                minHeight: 48, paddingHorizontal: 12, borderRadius: 14,
                marginTop: pinned ? 0 : 14, marginBottom: pinned ? 0 : 4,
                // Pinlenen kopya saydam OLAMAZ: altındaki satır okunurdu.
                backgroundColor: pinned
                    ? (dark ? (done ? '#16220F' : '#241B0E') : (done ? '#E8F0E4' : '#F6ECD9'))
                    : (done ? 'rgba(95,191,100,0.10)' : 'rgba(217,164,59,0.10)'),
                borderWidth: 1,
                borderColor: done ? 'rgba(95,191,100,0.28)' : 'rgba(217,164,59,0.28)',
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68, color: tone }}>
                {upperTR('Malzeme')}
            </Text>
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: '600', letterSpacing: -0.14, color: tone }}>
                · {summary}
            </Text>
            <Glyph name={done ? 'check' : 'chev'} size={19} color={tone} />
        </Pressable>
    );
}

function LineRow({ line, revealed }: { line: Line; revealed: boolean }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 56,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: c.bd,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '600', letterSpacing: -0.23, color: c.tx }}>
                    {line.name}
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.47, color: c.tx3 }}>
                    {KIND_LABEL[line.kind]}
                </Text>
            </View>
            {line.qty > 1 ? (
                <Text style={[{ fontSize: 13.5, fontWeight: '700', color: c.tx2 }, numeric]}>×{line.qty}</Text>
            ) : null}
            {line.price == null ? (
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.26, color: c.tx3, minWidth: 70, textAlign: 'right' }}>
                    {upperTR('stoktan düşer')}
                </Text>
            ) : revealed ? (
                <Text style={[{ fontSize: 15.5, fontWeight: '700', color: c.tx, minWidth: 70, textAlign: 'right' }, numeric]}>
                    {money(line.price)}
                </Text>
            ) : (
                <View style={{ flexDirection: 'row', gap: 5, minWidth: 70, justifyContent: 'flex-end' }}>
                    {[0, 1, 2].map((index) => (
                        <View key={index} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.tx3 }} />
                    ))}
                </View>
            )}
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

    /** Ölçülmeden önce sayfa kendi boyu kadar aşağıda: ekranda hiç görünmüyor. */
    const fall = enter.interpolate({ inputRange: [0, 1], outputRange: [h || SHEET_FALLBACK_H, 0] });

    const shut = () => {
        if (closing.current) return;
        closing.current = true;
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
                    left: 0, right: 0, bottom: 0,
                    maxHeight: '76%',
                    backgroundColor: c.card,
                    borderTopWidth: 1,
                    borderTopColor: c.bd2,
                    borderTopLeftRadius: 30,
                    borderTopRightRadius: 30,
                    paddingBottom: insets.bottom,
                    transform: [{ translateY: Animated.add(fall, drag) }],
                }}
            >
                <View
                    {...pan.panHandlers}
                    accessibilityRole="button"
                    accessibilityLabel="Sayfayı kapat"
                    onAccessibilityTap={shut}
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

function SheetFoot({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34 }}>
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

function CatalogSheet({ count, onAdd, onDone }: {
    count: number;
    onAdd: (item: typeof FREQUENT[number]) => void;
    onDone: () => void;
}) {
    const { c } = useTheme();
    const [added, setAdded] = useState<string | null>(null);
    return (
        <>
            <SheetHead title="Kalem ekle" note={`${count} kalem`} />
            <ScrollView style={{ paddingHorizontal: 16 }}>
                <View style={{
                    height: 50, borderRadius: 16, backgroundColor: c.surf2,
                    borderWidth: 1, borderColor: c.bd, paddingHorizontal: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
                }}>
                    <Glyph name="search" size={19} color={c.tx3} />
                    <Text style={{ fontSize: 15.5, fontWeight: '600', color: c.tx3 }}>Katalogda ara</Text>
                </View>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, color: c.tx3, paddingVertical: 8 }}>
                    {upperTR('Sık kullanılanlar')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {FREQUENT.map((item) => {
                        const on = added === item.name;
                        return (
                            <Pressable
                                key={item.name}
                                accessibilityRole="button"
                                accessibilityLabel={`${item.name}, ${KIND_LABEL[item.kind]}`}
                                onPress={() => {
                                    onAdd(item);
                                    setAdded(item.name);
                                    setTimeout(() => setAdded(null), 700);
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
                                    {on ? 'Eklendi' : item.name}
                                </Text>
                                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: c.tx3 }}>
                                    {KIND_LABEL[item.kind]}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
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
 * Dört alan, ikisi dolu gelir: malzeme adisyondan, bekleme sayaçtan.
 * Personel yalnız orana ve sonuca dokunuyor — dört dokunuş, on saniye.
 *
 * ENGELLEMİYOR: boş alanlarla da kaydediliyor. Uydurulmuş formül
 * formülsüzlükten kötüdür; eksiklik müşteri kartında GÖRÜNEN bir gap
 * olarak duruyor.
 */
function FormulaSheet({ materials, wait, current, onSave }: {
    materials: [string, string][];
    wait: number | null;
    current: VisitFormula | null;
    onSave: (next: VisitFormula) => void;
}) {
    const { c } = useTheme();
    const [ratio, setRatio] = useState<string | null>(current?.ratio ?? null);
    const [result, setResult] = useState<string | null>(current?.result ?? null);
    const [minutes, setMinutes] = useState<number | null>(current?.waitMinutes ?? wait);
    const [note, setNote] = useState(current?.note ?? '');
    const ready = Boolean(ratio && result);

    return (
        <>
            <SheetHead title="Formül" note={ready ? '4 alan hazır' : '2 alan dolu geldi'} />
            <ScrollView style={{ paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
                <Field label="kullanılan malzeme" note="adisyondan">
                    <Auto rows={materials} />
                </Field>

                <Field label="oran">
                    <Grid columns={4}>
                        {RATIOS.map((value) => (
                            <GridButton
                                key={value} label={value} big on={ratio === value}
                                onPress={() => { feedback.selection(); setRatio(value); }}
                            />
                        ))}
                        <GridButton label="±" sub="adım" big on={false} onPress={() => feedback.selection()} />
                    </Grid>
                </Field>

                {/* Sayaç kurulmadıysa alan KALKMIYOR: dört alanın sırası her
                    yerde aynı, ve boş bırakmak ölçülmemişle sıfırı karıştırır. */}
                <Field label="bekleme" note={wait != null ? 'sayaçtan' : 'sayaç kurulmadı'}>
                    {wait != null ? (
                        <Auto rows={[[`${wait} dk`, 'ölçüldü']]} />
                    ) : (
                        <Grid columns={4}>
                            {WAITS.map((value) => (
                                <GridButton
                                    key={value} label={String(value)} unit="dk" big on={minutes === value}
                                    onPress={() => { feedback.selection(); setMinutes(value); }}
                                />
                            ))}
                            <GridButton label="±" sub="adım" big on={false} onPress={() => feedback.selection()} />
                        </Grid>
                    )}
                </Field>

                <Field label="sonuç">
                    <Grid columns={3}>
                        {RESULTS.map((option) => (
                            <GridButton
                                key={option.label} label={option.label} tone={option.tone}
                                on={result === option.label}
                                onPress={() => { feedback.selection(); setResult(option.label); }}
                            />
                        ))}
                    </Grid>
                </Field>

                <Field label="serbest not" note="isteğe bağlı">
                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Kendi cümlenle yaz…"
                        placeholderTextColor={c.tx3}
                        selectionColor={c.or}
                        multiline
                        style={{
                            padding: 14, paddingHorizontal: 15, borderRadius: 18,
                            backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd,
                            minHeight: 52, fontSize: 15, fontWeight: '500', lineHeight: 21.75, color: c.tx,
                        }}
                    />
                </Field>
                <View style={{ height: 12 }} />
            </ScrollView>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34 }}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => onSave({
                        materials: [],
                        ratio,
                        waitMinutes: wait ?? minutes,
                        waitSource: wait != null ? 'timer' : 'manual',
                        result: result ? result.toLocaleLowerCase('tr-TR') : null,
                        note: note.trim() || null,
                        staffId: null,
                        writtenAt: new Date().toISOString(),
                    })}
                    style={({ pressed }) => ({
                        height: 64, borderRadius: 22, backgroundColor: c.or,
                        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.9 : 1,
                    })}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                        {ready ? 'Formülü kaydet' : 'Şimdilik böyle kaydet'}
                    </Text>
                </Pressable>
            </View>
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

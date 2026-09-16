import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
    cellGlyph, cellSpec, pillMotion, reducedFill,
} from '../lib/actionPill.ts';
import type { CellKey } from '../lib/actionPill.ts';
import { actionPillMetrics as M, font, panelInk } from '../theme/tokens';
import type { PanelInk } from '../theme/tokens';
import { useTheme } from '../theme';
import { feedback } from '../lib/feedback';

/**
 * Müdür 34 · eylem hapı v2.
 *
 * Tasarım: docs/design-reference/Luera Mobil - Mudur 34 Eylem Hapi v2.html
 *
 * Bir menü DEĞİL, bir alet: tek yüzey, içinde turuncu halkalı gözler. Dört
 * ayrı yuvarlak düğme dört ayrı nesne olarak okunurdu; ayraçsız tek hap
 * parmağın altında tek bir şey olarak okunuyor — halkalar zaten ayırıyor,
 * ayraç çizgisi ikinci bir sınır çiziyordu ve v2'de kaldırıldı.
 *
 * HALKA ÇERÇEVE, DOLGU EYLEM. Dinlenirken halka %55 opak turuncu bir kontur;
 * basılınca %100'e çıkıyor ve içi turuncu bir diskle doluyor. Dördü birden
 * dolu turuncu olsaydı "hangisi acil" sorusunu soran renk susardı.
 *
 * ÇAPA TETİKLEYİCİDİR. Hap kartın tepesine değil, `Yönet` düğmesinin
 * kenarına yapışır ve ok ucu ona DEĞER; büyüme noktası da okun olduğu yer.
 */

// ── Simgeler ────────────────────────────────────────────────────────────────
// 22 pt, 1,7 kontur, tek elden. Personel gözünde simge yok: orada personelin
// BAŞ HARFLERİ duruyor — çan "bir bildirim" derdi, baş harf "Selin" diyor.

const STROKE = 1.7;

function Glyph({ cell, color, initials }: {
    cell: CellKey | 'chk'; color: string; initials: string | null;
}) {
    if (initials) {
        return (
            <Text style={{
                color,
                fontSize: M.initials,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: M.initials * -0.02,
                lineHeight: M.initials,
            }}>
                {initials}
            </Text>
        );
    }
    const p = {
        stroke: color, strokeWidth: STROKE, fill: 'none',
        strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    };
    return (
        <Svg width={M.icon} height={M.icon} viewBox="0 0 24 24">
            {cell === 'ara' ? (
                <Path {...p} d="M7.5 3.6h2.5l1.4 3.5-2 1.3a11.4 11.4 0 0 0 5.1 5.1l1.3-2 3.5 1.4v2.5a2 2 0 0 1-2 2C10.7 17.4 5.6 12.3 5.6 5.6a2 2 0 0 1 1.9-2z" />
            ) : null}
            {cell === 'wa' || cell === 'waoff' ? (
                <>
                    <Path {...p} d="M6.5 4.6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7l-4.2 3.2V14.6a2 2 0 0 1-1.8-2v-6a2 2 0 0 1 2-2z" />
                    <Path {...p} d="M8.9 9.6h6.1" />
                    <Path {...p} d="M12.6 7.3l2.4 2.3-2.4 2.3" />
                </>
            ) : null}
            {cell === 'nox' ? (
                <>
                    <Circle {...p} cx="10" cy="7.9" r="3.2" />
                    <Path {...p} d="M4.4 19c0-3.2 2.5-5.2 5.6-5.2 1 0 1.9.2 2.7.6" />
                    <Path {...p} d="M15.9 15.6l3.4 3.4" />
                    <Path {...p} d="M19.3 15.6l-3.4 3.4" />
                </>
            ) : null}
            {/* Personel gözünün YEDEĞİ. Normalde orada personelin baş
                harfleri durur; veri adı taşımıyorsa göz boş kalamaz —
                çan geri gelir. Boş bir daire, dokunulup hiçbir şey
                anlatmayan bir noktadır. */}
            {cell === 'inf' ? (
                <>
                    <Path {...p} d="M12 4.2a5.1 5.1 0 0 0-5.1 5.1v3.3L5.4 16h13.2l-1.5-3.4V9.3A5.1 5.1 0 0 0 12 4.2z" />
                    <Path {...p} d="M9.9 18.4a2.3 2.3 0 0 0 4.2 0" />
                </>
            ) : null}
            {cell === 'chk' ? <Path {...p} d="M5.6 12.4l4.2 4.2 8.6-9.4" /> : null}
        </Svg>
    );
}

// ── Tek göz ─────────────────────────────────────────────────────────────────

/** Basılı olmayan gözlerin dolgusu — tek örnek, her karede yeniden kurulmaz. */
const ZERO = new Animated.Value(0);
const NO_CELLS: readonly CellKey[] = [];
const ONE = new Animated.Value(1);

function Cell({ cell, offCell = false, ink, orange, initials, staffGiven, enter, active, dimmed, done, progress, pop, halo, onStart, onEnd }: {
    cell: CellKey;
    /** Sönük göz — numara kullanılamıyor. Basılı tutma yok, dokunuş yönlendirir. */
    offCell?: boolean;
    /** Personelin adı — yalnız sesli etiketi kişiselleştirmek için. */
    staffGiven?: string;
    ink: PanelInk;
    orange: string;
    initials: string | null;
    /** Kademeli girişin bu göze düşen payı (0 → 1). */
    enter: Animated.Value;
    active: boolean;
    dimmed: boolean;
    done: boolean;
    progress: Animated.Value;
    /** Ödül anındaki disk sıçraması. */
    pop: Animated.Value;
    /** Ödül anındaki halka dalgası. */
    halo: Animated.Value;
    onStart: () => void;
    onEnd: () => void;
}) {
    const { reduceMotion } = useTheme();
    const off = cell === 'waoff' || offCell;
    const spec = cellSpec(cell, staffGiven);

    /*
     * Komşunun ÇEKİLMESİ — tasarımın `neighbor: 100`u. Bu süre sözlükte
     * tanımlıydı ve HİÇ KULLANILMIYORDU: sönme ve küçülme anlık sıçrıyordu.
     *
     * Sıçramanın ikinci ve daha kötü sonucu cihazda görüldü: sönen gözün
     * SİMGESİ tamamen kayboluyor, geriye boş bir halka kalıyordu. Sebebi
     * karışım — `opacity` bir kare yerli sürücüdeki `enter`, ertesi kare düz
     * bir sayı (0,32) oluyordu; aynı üslupta `transform` de yerli sürücüde.
     * Bir görünümün aynı özelliğini iki sürücü arasında gidip getirmek
     * `react-native-svg` çocuğunu yeniden boyanmadan bırakıyor. Metin
     * (personelin baş harfleri) etkilenmiyordu — o yüzden dört gözden yalnız
     * simgeli olanlar boşalıyordu.
     *
     * Çözüm ikisini birden kapatıyor: çekilme artık BİR ANİMASYON, ve gözün
     * `opacity` ile `scale`i baştan sona yerli sürücüde kalıyor.
     */
    const retreat = useRef(new Animated.Value(0)).current;
    const pulled = dimmed && !active;
    useEffect(() => {
        if (reduceMotion) { retreat.setValue(pulled ? 1 : 0); return; }
        Animated.timing(retreat, {
            toValue: pulled ? 1 : 0,
            duration: pillMotion.neighbor,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [pulled, reduceMotion, retreat]);

    // Simgenin kreme dönmesi RENK ANİMASYONU DEĞİL: iki simge üst üste durur
    // ve çapraz söner. Sözleşme rengi animasyonlamayı yasaklıyor.
    const cross = { inputRange: [0, pillMotion.crossFrom, pillMotion.crossTo, 1] };
    const inkOpacity = progress.interpolate({ ...cross, outputRange: [1, 1, 0, 0] });
    const creamOpacity = progress.interpolate({ ...cross, outputRange: [0, 0, 1, 1] });

    // Gözün ölçeği üç kaynaktan gelir: kademeli giriş, basış, komşu çekilmesi.
    // Üçü de ÇARPILIYOR — ara değerler yeniden kurulmuyor, yani yerli sürücü
    // düğümü hiç değişmiyor.
    const scale = active
        ? Animated.multiply(enter, pop)
        : Animated.multiply(
            enter.interpolate({
                inputRange: [0, 1], outputRange: [pillMotion.cellFrom, 1],
            }),
            retreat.interpolate({
                inputRange: [0, 1], outputRange: [1, pillMotion.neighborScale],
            }),
        );

    // Sönme de aynı zincirde: `enter` × (dinlenme → çekilme).
    const eyeOpacity = Animated.multiply(
        enter,
        retreat.interpolate({
            inputRange: [0, 1],
            outputRange: [off ? M.offOpacity : 1, pillMotion.dimOpacity],
        }),
    );

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${spec.label} — ${spec.hint}`}
            accessibilityHint="Çalışması için basılı tutun"
            onPressIn={onStart}
            onPressOut={onEnd}
            style={{
                width: M.cell,
                height: M.height,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Animated.View style={{
                width: M.eye,
                height: M.eye,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale }],
                opacity: eyeOpacity,
            }}>
                {/* Ödül dalgası — halkanın kopyası, büyürken sönüyor. */}
                {active ? (
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                            borderRadius: M.eye / 2,
                            borderWidth: M.ring,
                            borderColor: orange,
                            opacity: halo.interpolate({
                                inputRange: [0, 1], outputRange: [0, pillMotion.haloOpacity],
                            }),
                            transform: [{
                                scale: halo.interpolate({
                                    inputRange: [0, 1], outputRange: [pillMotion.haloScale, 1],
                                }),
                            }],
                        }}
                    />
                ) : null}

                {/* Halka — ÇERÇEVE. Dinlenirken %55, basılınca %100. */}
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                        borderRadius: M.eye / 2,
                        borderWidth: M.ring,
                        borderColor: orange,
                        opacity: off ? M.ringOff : active ? M.ringPress : M.ringRest,
                    }}
                />

                {/* Dolgu diski — halkanın içine 0,75 pt kalana kadar büyür.
                    Okunan şey halkaya kalan boşluk. YALNIZ basılıyken kurulur:
                    sakin hâlde turuncu yok, kuralı bu. */}
                {active && !off ? (
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: M.discInset, top: M.discInset,
                            width: M.disc, height: M.disc,
                            borderRadius: M.disc / 2,
                            backgroundColor: orange,
                            transform: [{ scale: progress }],
                        }}
                    />
                ) : null}

                <Animated.View style={{
                    position: 'absolute',
                    opacity: done ? 0 : active ? inkOpacity : 1,
                }}>
                    <Glyph cell={cell} color={ink.ink} initials={initials} />
                </Animated.View>
                {active && !done ? (
                    <Animated.View style={{ position: 'absolute', opacity: creamOpacity }}>
                        <Glyph cell={cell} color={ink.panel} initials={initials} />
                    </Animated.View>
                ) : null}
                {done ? (
                    <View style={{ position: 'absolute' }}>
                        <Glyph cell="chk" color={ink.panel} initials={null} />
                    </View>
                ) : null}
            </Animated.View>
        </Pressable>
    );
}

// ── Hap ─────────────────────────────────────────────────────────────────────

export interface ActionPillProps {
    cells: readonly CellKey[];
    /** Sönük çizilecek gözler (`pillOff`). */
    offCells?: readonly CellKey[];
    /** Hap tetikleyicinin üstünde mi açılıyor, altında mı. */
    below?: boolean;
    /** Tetikleyicinin genişliği — okun yeri bundan türer. */
    triggerWidth: number;
    /** Tetikleyicinin kartın üstünden uzaklığı ve yüksekliği. */
    triggerTop: number;
    triggerHeight: number;
    /** Randevunun personeli — baş harf gözü ve kelime bundan geliyor. */
    staffInitials?: string;
    staffGiven?: string;
    onPick: (cell: CellKey) => void;
    onDismiss: () => void;
}

export function ActionPill({
    cells, offCells = NO_CELLS, below = false, triggerWidth, triggerTop, triggerHeight,
    staffInitials, staffGiven, onPick, onDismiss,
}: ActionPillProps) {
    const { c, dark, reduceMotion } = useTheme();
    const ink = dark ? panelInk.dark : panelInk.light;

    const [held, setHeld] = useState<CellKey | null>(null);
    const [done, setDone] = useState<CellKey | null>(null);
    const [step, setStep] = useState(0);

    const progress = useRef(new Animated.Value(0)).current;
    const shell = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(1)).current;
    const halo = useRef(new Animated.Value(0)).current;
    const running = useRef<Animated.CompositeAnimation | null>(null);

    /*
     * BALON EKRAN KATMANINDA AÇILIR, KARTIN İÇİNDE DEĞİL.
     *
     * Perde `-1000` iç boşluklarla ekranı kaplıyor gibi duruyordu ama iOS bir
     * görünümün KENDİ SINIRLARI DIŞINDAKİ dokunuşu çocuklarına dağıtmaz. Perde
     * kartın içinde yaşadığı için yalnız kartın üstündeki dokunuşu yakalıyor,
     * ekranın geri kalanına basınca hap açık kalıyordu — müdür alete kilitleniyor.
     *
     * Çözüm: hap `Modal` ile ekranın en üst katmanına çıkıyor. Yeri kaybolmasın
     * diye kartın içinde görünmez bir ÇAPA duruyor; balon onun ölçülen ekran
     * koordinatına kuruluyor. Böylece çapa hâlâ tetikleyiciden türüyor (ok ucu
     * yerinde kalıyor) ama perde gerçekten bütün ekranı dinliyor.
     */
    const anchor = useRef<View>(null);
    const [box, setBox] = useState<{ x: number; y: number } | null>(null);
    const measure = useCallback(() => {
        anchor.current?.measureInWindow((x, y) => {
            // Ölçüm bir kare gecikir; giriş animasyonu ölçümü BEKLER, yoksa
            // hap bir kare yanlış yerde belirip zıplardı.
            if (Number.isFinite(x) && Number.isFinite(y)) setBox({ x, y });
        });
    }, []);

    /**
     * Kademeli giriş — her göz için ayrı bir değer.
     *
     * KADEME OKUN DOĞDUĞU NOKTADAN UZAĞA AKAR: ok sağda olduğu için ilk giren
     * göz en sağdaki. Hareket tetikleyiciden doğuyor, ona doğru değil.
     */
    const eyes = useMemo(
        () => cells.map(() => new Animated.Value(0)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [cells.length],
    );

    useEffect(() => {
        // Ölçülmeden çizilmiyor: animasyon da ölçümle birlikte başlar.
        if (!box) return;
        if (reduceMotion) {
            shell.setValue(1);
            eyes.forEach((eye) => eye.setValue(1));
            return;
        }
        shell.setValue(0);
        eyes.forEach((eye) => eye.setValue(0));
        Animated.timing(shell, {
            toValue: 1, duration: pillMotion.open,
            easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
        // Sağdan sola: son göz oka en yakın olan.
        const ordered = [...eyes].reverse();
        Animated.stagger(pillMotion.stagger, ordered.map((eye) => Animated.sequence([
            Animated.timing(eye, {
                toValue: pillMotion.cellOvershoot / 1, duration: pillMotion.cellIn,
                easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(eye, {
                toValue: 1, duration: pillMotion.cellSettle,
                easing: Easing.out(Easing.quad), useNativeDriver: true,
            }),
        ]))).start();
    }, [box, eyes, reduceMotion, shell]);

    const complete = useCallback((cell: CellKey) => {
        feedback.medium();
        setHeld(null);
        setDone(cell);
        // Ödül: disk sıçrar, halka dalgası dışarı açılır.
        pop.setValue(1);
        halo.setValue(0);
        Animated.parallel([
            Animated.sequence([
                Animated.timing(pop, {
                    toValue: pillMotion.donePop, duration: pillMotion.doneDisc / 2,
                    easing: Easing.out(Easing.cubic), useNativeDriver: true,
                }),
                Animated.timing(pop, {
                    toValue: 1, duration: pillMotion.doneDisc / 2,
                    easing: Easing.inOut(Easing.quad), useNativeDriver: true,
                }),
            ]),
            Animated.timing(halo, {
                toValue: 1, duration: pillMotion.halo,
                easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
        ]).start();
        setTimeout(() => { onPick(cell); }, pillMotion.doneHold);
    }, [halo, onPick, pop]);

    const start = useCallback((cell: CellKey) => {
        if (cell === 'waoff' || offCells.includes(cell)) { feedback.selection(); onPick(cell); return; }
        feedback.selection();
        setHeld(cell);
        setStep(0);
        progress.setValue(0);
        pop.setValue(pillMotion.pressScale);
        if (reduceMotion) return;
        const animation = Animated.timing(progress, {
            toValue: 1, duration: pillMotion.hold,
            easing: Easing.linear, useNativeDriver: true,
        });
        running.current = animation;
        animation.start(({ finished }) => { if (finished) complete(cell); });
    }, [complete, offCells, onPick, pop, progress, reduceMotion]);

    // `reduceMotion` açıkken dolgu KADEMELİ ilerler ama DURMAZ: müdüre daha ne
    // kadar tutması gerektiğini söyleyen tek şey o. Rakam yazılmıyor — 500 ms
    // sayılamaz, diskin kendisi sayıyor.
    useEffect(() => {
        if (!reduceMotion || !held) return;
        const steps = 6;
        const timer = setInterval(() => {
            setStep((value) => {
                const next = Math.min(steps, value + 1);
                progress.setValue(reducedFill(next / steps));
                return next;
            });
        }, pillMotion.hold / steps);
        return () => clearInterval(timer);
    }, [held, reduceMotion, progress]);

    useEffect(() => {
        if (!reduceMotion || !held || step < 6) return;
        complete(held);
    }, [complete, held, reduceMotion, step]);

    const end = useCallback(() => {
        if (!held) return;
        running.current?.stop();
        running.current = null;
        setHeld(null);
        setStep(0);
        pop.setValue(1);
        Animated.timing(progress, {
            toValue: 0, duration: pillMotion.release,
            easing: Easing.out(Easing.quad), useNativeDriver: true,
        }).start();
    }, [held, pop, progress]);

    const width = cells.length * M.cell;
    const arrowInset = M.arrowInset(triggerWidth);
    const focus = held ?? done;

    // Balonun kart içindeki yeri — çapa da balon da AYNI hesabı kullanır.
    const seat = below
        ? { top: triggerTop + triggerHeight + M.gap }
        : { top: triggerTop - M.height - M.gap };

    return (
        <>
            {/* ÇAPA — görünmez, dokunulmaz, yer kaplamaz. Tek işi balonun
                kartın içindeki yerini ölçtürmek. */}
            <View
                ref={anchor}
                onLayout={measure}
                pointerEvents="none"
                style={{
                    position: 'absolute', right: 0, ...seat, width, height: M.height,
                }}
            />

            <Modal
                transparent
                visible={box != null}
                // Kendi geçişi YOK: açılışı hapın kendi hareketi anlatıyor.
                animationType="none"
                statusBarTranslucent
                // Android geri tuşu da kapatır.
                onRequestClose={onDismiss}
            >
                {/* Perde — kartı okunmaz yapmayacak kadar hafif. Müdür hâlâ
                    kimin kartında olduğunu görüyor. Artık BÜTÜN ekranı
                    dinliyor: dışarıya dokunmak hapı kapatır. */}
                <Animated.View
                    // RN 0.86: `absoluteFillObject` kalktı, `absoluteFill` duruyor.
                    style={[StyleSheet.absoluteFill, {
                        backgroundColor: dark ? M.scrimDark : M.scrimLight,
                        opacity: shell,
                    }]}
                >
                    <Pressable accessibilityLabel="Kapat" onPress={onDismiss} style={{ flex: 1 }} />
                </Animated.View>

                <Animated.View
                    style={{
                        position: 'absolute',
                        left: box?.x ?? 0,
                        top: box?.y ?? 0,
                        width,
                        opacity: shell,
                        // Büyüme noktası okun olduğu yer. ÜÇ DEĞER ZORUNLU:
                        // react-native dizi verilince [x, y, z] bekliyor.
                        transformOrigin: [
                            width - arrowInset - M.arrow / 2,
                            below ? 0 : M.height,
                            0,
                        ],
                        transform: reduceMotion ? [] : [{
                            scale: shell.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
                        }],
                    }}
                >
                    {/* KELİME BLOĞU YOK — karar 2026-08-30.
                        Simgenin ne yaptığını yazan balon kaldırıldı: müdür bu
                        aleti günde onlarca kez açıyor ve dördüncü açılışta
                        kelime öğretmiyor, yalnız gözlerin üstünü örtüyordu.
                        Simge + basılı tutma dolgusu tek başına anlatıyor.

                        SESLİ OKUMA KAYBOLMADI: her gözün kendi
                        `accessibilityLabel`i ("Personele bilgi ver — Selin'e
                        bildirim gider") ve "Çalışması için basılı tutun"
                        ipucu yerinde duruyor. Görmeyen kullanıcı kelimeyi
                        ekrandan değil, zaten okuyucudan alıyordu. */}

                    <View style={{
                        flexDirection: 'row',
                        height: M.height,
                        borderRadius: M.radius,
                        backgroundColor: ink.panel,
                    }}>
                        {cells.map((cell, index) => (
                            <Cell
                                key={cell}
                                cell={cell}
                                offCell={offCells.includes(cell)}
                                ink={ink}
                                orange={c.or}
                                initials={cellGlyph(cell, staffInitials)}
                                staffGiven={staffGiven}
                                enter={reduceMotion ? ONE : eyes[index]}
                                active={held === cell || done === cell}
                                dimmed={focus != null && focus !== cell}
                                done={done === cell}
                                progress={held === cell || done === cell ? progress : ZERO}
                                pop={held === cell || done === cell ? pop : ONE}
                                halo={done === cell ? halo : ZERO}
                                onStart={() => start(cell)}
                                onEnd={end}
                            />
                        ))}
                    </View>

                    {/* Ok ucu — tetikleyicinin kenarına DEĞER. Yeri sabit değil,
                        tetikleyicinin genişliğinden türer. */}
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            right: arrowInset,
                            ...(below ? { top: -M.arrowHeight } : { bottom: -M.arrowHeight }),
                            width: 0, height: 0,
                            borderLeftWidth: M.arrow / 2,
                            borderRightWidth: M.arrow / 2,
                            borderLeftColor: 'transparent',
                            borderRightColor: 'transparent',
                            ...(below
                                ? { borderBottomWidth: M.arrowHeight, borderBottomColor: ink.panel }
                                : { borderTopWidth: M.arrowHeight, borderTopColor: ink.panel }),
                        }}
                    />
                </Animated.View>
            </Modal>
        </>
    );
}

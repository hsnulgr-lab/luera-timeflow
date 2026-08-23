import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AccessibilityInfo, Animated, AppState, Easing, Pressable, Text, View,
    useWindowDimensions, type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Glass } from './Glass';
import { CheckIcon, PlusIcon } from './ApptParts';
import { feedback } from '../lib/feedback';
import {
    COUNTDOWN_MS, confirmCopy, confirmSpeech, countdownFor, countdownRuns,
    durationText, messageText, phoneText, priceText, rangeText, secondsLeft,
    sendGate, stillBookedLine, type ConfirmState,
} from '../lib/apptConfirm';
import { formatDayLong, type Appt } from '../lib/calendar';
import { confirmInk, confirmMetrics, font, numeric, useTheme, type ConfirmInk } from '../theme';
import { upperTR } from '../lib/text';

/**
 * Müdür 16 — randevu oluşturuldu onayı.
 *
 * Akışın son karesi. Müdür hâlâ telefonda olabilir; ekran önce "oldu" der,
 * sonra ne olduğunu gösterir, sonra tek bir sonraki adım sunar. Kimse
 * dokunmazsa 7 saniyede kendi kapanır ve Akış'a döner.
 *
 * TİK YEŞİL, HALKA TURUNCU. Turuncu envanterde "şimdi" ve "yap" demek;
 * sonucu anlatmıyor. Ekranda turuncunun yalnız iki yeri var: halka (zaman)
 * ve birincil buton (eylem).
 *
 * İSTİF YOK: ekran tek yüzey. Sebebi hem biçimsel (tek sonuç cümlesi ikiye
 * bölünmez) hem teknik — halkayı tüketen kapaklar ekran zemini renginde.
 */

const M = confirmMetrics;

export function ConfirmScreen({ appointment, staffName, staffInitials, price, salon, topInset, bottomInset, onDone }: {
    appointment: Appt;
    staffName: string;
    staffInitials: string;
    price: number | null;
    salon: string;
    topInset: number;
    bottomInset: number;
    onDone: () => void;
}) {
    const { c, dark, small } = useTheme();
    const { fontScale, height } = useWindowDimensions();
    const ink = dark ? confirmInk.dark : confirmInk.light;
    const ax = fontScale > M.axFontScale;
    const short = small || height < M.shortHeight;

    const [state, setState] = useState<ConfirmState>('idle');
    const [reduceMotion, setReduceMotion] = useState(true);
    const [screenReader, setScreenReader] = useState(false);
    const [foreground, setForeground] = useState(true);
    const [remaining, setRemaining] = useState(COUNTDOWN_MS);

    const phone = phoneText(appointment);
    const hasPhone = !phone.missing;
    const copy = confirmCopy(state, hasPhone);

    // ── Erişilebilirlik tercihleri ─────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        Promise.all([
            AccessibilityInfo.isReduceMotionEnabled(),
            AccessibilityInfo.isScreenReaderEnabled(),
        ]).then(([motion, reader]) => {
            if (!alive) return;
            setReduceMotion(motion);
            setScreenReader(reader);
        }).catch(() => undefined);

        const m = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
        const s = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
        return () => { alive = false; m.remove(); s.remove(); };
    }, []);

    // Ekran arka plana düşünce sayaç durur; dönünce kaldığı yerden devam eder.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
        return () => sub.remove();
    }, []);

    // ── Sesli okuma: her hâl BİR KEZ duyurulur ─────────────────────────────
    useEffect(() => {
        AccessibilityInfo.announceForAccessibility(
            confirmSpeech({ state, appointment, staffName, hasPhone }),
        );
    }, [state, appointment, staffName, hasPhone]);

    // ── Giriş dizisi: yalnız opaklık ve dönüşüm ────────────────────────────
    const enter = useRef({
        tick: new Animated.Value(0),
        title: new Animated.Value(0),
        card: new Animated.Value(0),
        dock: new Animated.Value(0),
    }).current;

    useEffect(() => {
        if (reduceMotion) {
            // Hareketi azalt: hiçbir şey ölçeklenmez, kaymaz. Yalnız belirir.
            Animated.parallel([enter.tick, enter.title, enter.card, enter.dock].map((v) => (
                Animated.timing(v, { toValue: 1, duration: M.enterReduced, useNativeDriver: true })
            ))).start();
            return;
        }
        const ease = Easing.bezier(0.2, 0, 0, 1);
        Animated.parallel([
            Animated.timing(enter.tick, { toValue: 1, duration: M.enterTick, easing: ease, useNativeDriver: true }),
            Animated.timing(enter.title, { toValue: 1, duration: M.enterTitle, delay: M.enterTitleDelay, easing: ease, useNativeDriver: true }),
            Animated.timing(enter.card, { toValue: 1, duration: M.enterCard, delay: M.enterCardDelay, easing: ease, useNativeDriver: true }),
            Animated.timing(enter.dock, { toValue: 1, duration: M.enterDock, delay: M.enterDockDelay, easing: ease, useNativeDriver: true }),
        ]).start();
    }, [reduceMotion, enter]);

    // ── Geri sayım ─────────────────────────────────────────────────────────
    //
    // Sayaç `Date.now()` hedef damgasıyla kuruluyor, tick sayısıyla değil:
    // arka planda geçen süre kaybolmasın.
    const total = countdownFor(state);
    const runs = countdownRuns({ state, screenReader, foreground });

    useEffect(() => {
        if (!runs) return;
        const startedAt = Date.now();
        const from = remaining;
        const id = setInterval(() => {
            const left = from - (Date.now() - startedAt);
            if (left <= 0) {
                clearInterval(id);
                setRemaining(0);
                onDone();
                return;
            }
            setRemaining(left);
        }, 250);
        return () => clearInterval(id);
        // `remaining` bilerek bağımlılıkta yok: her tikte sayacı kurmaz.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runs, state]);

    // Hâl değişince sayaç yeni süresiyle başlar.
    useEffect(() => { setRemaining(countdownFor(state)); }, [state]);

    const elapsed = total - remaining;

    const gate = sendGate(state, hasPhone);

    /** Pasif buton sessizce yutmaz: sebep satırı bir kez nabız atar. */
    const pulse = useRef(new Animated.Value(1)).current;
    const send = () => {
        if (!gate.enabled) {
            feedback.warning();
            if (reduceMotion) return;
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 110, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.55, duration: 110, useNativeDriver: true }),
            ]).start();
            return;
        }
        feedback.selection();
        setState(state === 'failed' ? 'sending' : 'sending');
    };

    const dockStyle: ViewStyle = {
        position: 'absolute',
        left: M.dockX, right: M.dockX,
        bottom: bottomInset + M.dockLift,
        borderRadius: M.dockRadius,
        padding: M.dockPad,
        gap: M.dockGap,
        overflow: 'hidden',
    };

    const ringSize = ax ? M.ringAx : short ? M.ringSmall : M.ring;
    const mini = state === 'sent';

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: topInset }}>
            <View style={{ flex: 1, paddingHorizontal: M.bodyX }}>
                {/* ── Kahraman: halka + tik + başlık ───────────────────── */}
                <View style={{
                    paddingTop: ax ? M.heroTopAx : short ? M.heroTopSmall : M.heroTop,
                    gap: short ? M.heroGapSmall : M.heroGap,
                    alignItems: mini ? 'flex-start' : 'center',
                    flexDirection: mini ? 'row' : 'column',
                }}>
                    <Animated.View style={{
                        opacity: enter.tick,
                        transform: reduceMotion ? [] : [{
                            scale: enter.tick.interpolate({
                                inputRange: [0, 1], outputRange: [M.tickScaleFrom, 1],
                            }),
                        }],
                    }}>
                        <CountdownRing
                            size={mini ? M.ringMini : ringSize}
                            elapsed={elapsed}
                            total={total}
                            state={state}
                            still={reduceMotion || !runs}
                            background={c.bg}
                            track={c.bd}
                            arc={c.or}
                            ink={ink}
                            ax={ax}
                            short={short}
                            mini={mini}
                        />
                    </Animated.View>

                    <Animated.View style={{
                        opacity: enter.title,
                        flex: mini ? 1 : undefined,
                        paddingTop: mini ? 8 : 0,
                        transform: reduceMotion ? [] : [{
                            translateY: enter.title.interpolate({
                                inputRange: [0, 1], outputRange: [M.titleShift, 0],
                            }),
                        }],
                    }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: mini ? M.titleMini : ax ? M.titleAx : short ? M.titleSmall : M.title,
                            fontFamily: font.extraBold, fontWeight: '800',
                            letterSpacing: M.title * -0.03,
                            lineHeight: (mini ? M.titleMini : M.title) * 1.06,
                            textAlign: mini ? 'left' : 'center',
                        }}>
                            {copy.title}
                        </Text>
                        {copy.subtitle ? (
                            <Text style={{
                                marginTop: 12,
                                color: c.tx2, fontSize: M.subtitle,
                                fontFamily: font.semiBold, fontWeight: '600',
                                textAlign: mini ? 'left' : 'center', lineHeight: M.subtitle * 1.4,
                            }}>
                                {copy.subtitle}
                            </Text>
                        ) : null}
                    </Animated.View>
                </View>

                {/* ── Kanıt ────────────────────────────────────────────── */}
                <Animated.View style={{
                    opacity: enter.card,
                    transform: reduceMotion ? [] : [{
                        translateY: enter.card.interpolate({
                            inputRange: [0, 1], outputRange: [M.cardShift, 0],
                        }),
                    }],
                }}>
                    {state === 'sent' ? (
                        <MessagePreview
                            to={appointment.customer_name}
                            text={messageText(appointment, staffName, salon)}
                        />
                    ) : null}

                    {state === 'failed' ? (
                        <StillBookedStrip line={stillBookedLine(appointment, staffName)} ink={ink} />
                    ) : null}

                    <EvidenceCard
                        appointment={appointment}
                        staffName={staffName}
                        staffInitials={staffInitials}
                        price={price}
                        compact={state === 'sent'}
                        skipCustomer={state === 'sent'}
                        ax={ax}
                        short={short}
                    />
                </Animated.View>
            </View>

            {/* ── Tek cam yüzey: yüzen kontrol bloğu ───────────────────── */}
            <Animated.View
                pointerEvents="box-none"
                style={{
                    position: 'absolute',
                    left: M.dockX, right: M.dockX,
                    bottom: bottomInset + M.dockLift,
                    borderRadius: M.dockRadius,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 10 },
                    shadowRadius: 26,
                    shadowOpacity: 0.2,
                    elevation: 8,
                    opacity: enter.dock,
                    transform: reduceMotion ? [] : [{
                        translateY: enter.dock.interpolate({
                            inputRange: [0, 1], outputRange: [M.dockShift, 0],
                        }),
                    }],
                }}
            >
                <Glass interactive effect="regular" style={{ ...dockStyle, position: 'relative', left: 0, right: 0, bottom: 0 }}>
                    <PrimaryButton
                        label={copy.primary}
                        state={state}
                        enabled={gate.enabled}
                        ax={ax}
                        ink={ink}
                        onPress={send}
                    />

                    {gate.reason ? <WhyRow text={gate.reason} opacity={pulse} /> : null}

                    {state === 'idle' && !hasPhone ? (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <SecondaryButton label="Numara ekle" filled ax={ax} onPress={onDone} icon />
                            <SecondaryButton label="Kapat" ax={ax} onPress={onDone} />
                        </View>
                    ) : copy.secondary ? (
                        <SecondaryButton label={copy.secondary} ax={ax} onPress={onDone} />
                    ) : null}

                    {copy.note ? (
                        <Text style={{
                            color: c.tx3, fontSize: ax ? M.noteTextAx : M.noteText,
                            fontFamily: font.semiBold, fontWeight: '600',
                            textAlign: 'center', lineHeight: M.noteText * 1.4,
                        }}>
                            {/* Hareketi azalt açıkken kalan saniye YAZIYLA gösterilir:
                                halka dönmüyor, süre bilgisi kaybolmasın. */}
                            {reduceMotion && runs ? (
                                <>
                                    <Text style={[numeric, { fontSize: 14, fontWeight: '700', color: c.tx2 }]}>
                                        {secondsLeft(elapsed, total)}
                                    </Text>
                                    {' saniye sonra Akış’a döner — ya da şimdi kapatın.'}
                                </>
                            ) : copy.note}
                        </Text>
                    ) : null}
                </Glass>
            </Animated.View>
        </View>
    );
}

// ── Geri sayım halkası ──────────────────────────────────────────────────────

/**
 * Tam turuncu halka statik duruyor; üstündeki iki yarım kapak onu örterek
 * tüketiyor. Kapaklar EKRAN ZEMİNİ renginde — ekranın tek yüzey olmasının
 * teknik sebebi bu.
 *
 * `stroke-dashoffset` kullanılmadı: react-native-svg'de o özellik native
 * sürücüde animasyonlanmıyor ve müdür mesaj gönderirken takılırdı.
 */
function CountdownRing({ size, elapsed, total, state, still, background, track, arc, ink, ax, short, mini }: {
    size: number; elapsed: number; total: number; state: ConfirmState; still: boolean;
    background: string; track: string; arc: string; ink: ConfirmInk;
    ax: boolean; short: boolean; mini: boolean;
}) {
    const { c } = useTheme();
    const half = size / 2;
    const holding = state === 'sending';
    const hidden = still || state === 'failed';

    const right = useRef(new Animated.Value(-180)).current;
    const left = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (hidden) return;
        const halfMs = total / 2;
        right.setValue(-180 + 180 * Math.min(1, elapsed / halfMs));
        left.setValue(180 * Math.min(1, Math.max(0, (elapsed - halfMs) / halfMs)));
        if (holding) return;

        const remainingFirst = Math.max(0, halfMs - elapsed);
        const animation = Animated.sequence([
            Animated.timing(right, {
                toValue: 0, duration: remainingFirst, easing: Easing.linear, useNativeDriver: true,
            }),
            Animated.timing(left, {
                toValue: 180, duration: halfMs, easing: Easing.linear, useNativeDriver: true,
            }),
        ]);
        animation.start();
        return () => animation.stop();
        // Yeniden kurulum yalnız hâl değişince olur; her tikte değil.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, hidden, holding, total]);

    const tickInset = mini ? M.tickInsetMini
        : ax ? M.tickInsetAx : short ? M.tickInsetSmall : M.tickInset;
    const iconSize = mini ? M.tickIconMini
        : ax ? M.tickIconAx : short ? M.tickIconSmall : M.tickIcon;
    const bad = state === 'failed';

    return (
        <View style={{ width: size, height: size }}>
            {/* İz: tüketilmiş kısmı gösteren nötr halka. */}
            <View style={{
                position: 'absolute', left: 0, top: 0, width: size, height: size,
                borderRadius: half, borderWidth: M.ringStroke, borderColor: track,
            }} />

            {hidden ? null : (
                <>
                    <HalfCover
                        side="right" size={size} background={background} arc={arc}
                        angle={right} dim={holding}
                    />
                    <HalfCover
                        side="left" size={size} background={background} arc={arc}
                        angle={left} dim={holding}
                    />
                </>
            )}

            <View style={{
                position: 'absolute',
                left: tickInset, top: tickInset, right: tickInset, bottom: tickInset,
                borderRadius: size,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: bad ? ink.badFill : ink.okFill,
                borderWidth: 1, borderColor: bad ? ink.badBorder : ink.okBorder,
            }}>
                {bad ? (
                    <AlertIcon color={c.rd} size={iconSize} />
                ) : (
                    <CheckIcon color={c.gr} size={iconSize} />
                )}
            </View>
        </View>
    );
}

/** Halkanın bir yarısı: turuncu yay + üstünde dönen kapak. */
function HalfCover({ side, size, background, arc, angle, dim }: {
    side: 'right' | 'left'; size: number; background: string; arc: string;
    angle: Animated.Value; dim: boolean;
}) {
    const half = size / 2;
    return (
        <View style={{
            position: 'absolute', top: 0, bottom: 0, width: half,
            [side]: 0,
            overflow: 'hidden',
        } as ViewStyle}>
            <View style={{
                position: 'absolute', top: 0, width: size, height: size,
                [side]: 0,
                borderRadius: half, borderWidth: M.ringStroke, borderColor: arc,
                opacity: dim ? M.holdOpacity : 1,
            } as ViewStyle} />
            <Animated.View style={{
                position: 'absolute', top: 0,
                left: side === 'right' ? 0 : half,
                width: half, height: size,
                backgroundColor: background,
                transformOrigin: 'left center',
                transform: [{ rotate: angle.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] }) }],
            }} />
        </View>
    );
}

// ── Kanıt kartı ─────────────────────────────────────────────────────────────

function EvidenceCard({ appointment, staffName, staffInitials, price, compact, skipCustomer, ax, short }: {
    appointment: Appt; staffName: string; staffInitials: string; price: number | null;
    compact: boolean; skipCustomer: boolean; ax: boolean; short: boolean;
}) {
    const { c } = useTheme();
    const phone = phoneText(appointment);
    const amount = priceText(price);

    return (
        <View style={{
            marginTop: short ? M.cardTopSmall : M.cardTop,
            borderRadius: M.cardRadius,
            backgroundColor: c.card,
            borderWidth: 1, borderColor: c.bd,
            paddingHorizontal: M.cardPadX,
        }}>
            {skipCustomer ? null : (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    minHeight: M.rowHeight, paddingVertical: ax ? 8 : 0,
                }}>
                    <Text numberOfLines={1} style={{
                        flex: 1, color: c.tx, fontSize: ax ? 20 : M.rowName,
                        fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {appointment.customer_name}
                    </Text>
                    <Text style={[phone.missing ? {} : numeric, {
                        color: phone.missing ? c.tx3 : c.tx2,
                        fontSize: ax ? 17 : M.rowPhone,
                        fontFamily: font.semiBold, fontWeight: '600',
                    }]}>
                        {phone.text}
                    </Text>
                </View>
            )}

            {/* Gün–saat–kişi tek bantta: müdür telefonda tek nefeste okuyabilsin. */}
            <View style={{
                flexDirection: ax ? 'column' : 'row',
                alignItems: ax ? 'flex-start' : 'center',
                gap: ax ? 12 : 12,
                paddingTop: skipCustomer ? 0 : M.whenPadTop,
                paddingBottom: M.whenPadBottom,
                borderTopWidth: skipCustomer ? 0 : 1, borderTopColor: c.bd,
            }}>
                <View style={{ flex: ax ? undefined : 1, gap: 3 }}>
                    <Text style={{
                        color: c.tx2, fontSize: ax ? 19 : M.whenDay,
                        fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {formatDayLong(appointment.date)}
                    </Text>
                    <Text style={[numeric, {
                        color: c.tx,
                        fontSize: ax ? M.whenRangeAx : short ? M.whenRangeSmall : M.whenRange,
                        fontWeight: '600', letterSpacing: M.whenRange * -0.03,
                        lineHeight: M.whenRange,
                    }]}>
                        {rangeText(appointment)}
                    </Text>
                </View>
                <View style={{
                    flexDirection: ax ? 'row' : 'column',
                    alignItems: 'center', gap: ax ? 10 : 6,
                    paddingLeft: ax ? 0 : 8,
                    borderLeftWidth: ax ? 0 : 1, borderLeftColor: c.bd,
                }}>
                    <View style={{
                        width: M.staffAvatar, height: M.staffAvatar, borderRadius: M.staffAvatar / 2,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd2,
                    }}>
                        <Text style={{ color: c.tx, fontSize: 13, fontFamily: font.extraBold, fontWeight: '800' }}>
                            {staffInitials}
                        </Text>
                    </View>
                    <Text style={{
                        color: c.tx, fontSize: ax ? 19 : M.staffName,
                        fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {staffName}
                    </Text>
                </View>
            </View>

            {compact ? null : (
                <View style={{
                    flexDirection: ax ? 'column' : 'row',
                    alignItems: ax ? 'flex-start' : 'center',
                    gap: 11, minHeight: M.svcHeight, paddingVertical: ax ? 10 : 0,
                    borderTopWidth: 1, borderTopColor: c.bd,
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: ax ? undefined : 1 }}>
                        <View style={{
                            width: M.svcMark, height: M.svcMarkHeight, borderRadius: 2,
                            backgroundColor: appointment.service_color ?? c.bd2,
                        }} />
                        <View style={{ flex: 1, gap: 1 }}>
                            <Text numberOfLines={1} style={{
                                color: c.tx, fontSize: ax ? 20 : M.svcName,
                                fontFamily: font.bold, fontWeight: '700',
                            }}>
                                {appointment.service}
                            </Text>
                            <Text style={[numeric, {
                                color: c.tx2, fontSize: ax ? 19 : M.svcMeta, fontWeight: '600',
                            }]}>
                                {durationText(appointment)}
                            </Text>
                        </View>
                    </View>
                    {amount ? (
                        <Text style={[numeric, {
                            color: c.tx, fontSize: ax ? 19 : M.svcPrice,
                            fontWeight: '700', letterSpacing: M.svcPrice * -0.01,
                        }]}>
                            {amount}
                        </Text>
                    ) : null}
                </View>
            )}

            {compact || !appointment.notes ? null : (
                <View style={{
                    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
                    paddingTop: M.memoPadTop, paddingBottom: M.memoPadBottom,
                    borderTopWidth: 1, borderTopColor: c.bd,
                }}>
                    <Text style={{
                        color: c.tx3, fontSize: M.memoLabel, fontFamily: font.bold,
                        fontWeight: '700', letterSpacing: M.memoLabel * 0.12,
paddingTop: 2,
                    }}>
                        {upperTR('Not')}
                    </Text>
                    <Text style={{
                        flex: 1, color: c.tx2, fontSize: M.memoText,
                        fontFamily: font.semiBold, fontWeight: '600', lineHeight: M.memoText * 1.4,
                    }}>
                        {appointment.notes}
                    </Text>
                </View>
            )}
        </View>
    );
}

// ── D · mesaj önizlemesi · E · randevu duruyor ──────────────────────────────

function MessagePreview({ to, text }: { to: string; text: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            marginTop: M.msgTop,
            borderRadius: M.msgRadius,
            backgroundColor: c.surf2,
            borderWidth: 1, borderColor: c.bd,
            paddingVertical: M.msgPadY, paddingHorizontal: M.msgPadX,
            gap: 7,
        }}>
            <Text style={{
                color: c.tx3, fontSize: M.msgLabel, fontFamily: font.bold, fontWeight: '700',
                letterSpacing: M.msgLabel * 0.12,            }}>
                {upperTR(`${to}’ya giden`)}
            </Text>
            <Text style={{
                color: c.tx, fontSize: M.msgText, fontFamily: font.semiBold,
                fontWeight: '600', lineHeight: M.msgText * 1.45,
            }}>
                {`“${text}”`}
            </Text>
        </View>
    );
}

/** Müdürün ilk korkusu randevunun da gitmiş olması; ilk satır onu keser. */
function StillBookedStrip({ line, ink }: { line: string; ink: ConfirmInk }) {
    const { c } = useTheme();
    return (
        <View style={{
            marginTop: M.stripTop,
            flexDirection: 'row', alignItems: 'center', gap: 11,
            minHeight: M.stripHeight,
            paddingVertical: M.stripPadY, paddingHorizontal: M.stripPadX,
            borderRadius: M.stripRadius,
            backgroundColor: ink.okFill,
            borderWidth: 1, borderColor: ink.okBorder,
        }}>
            <CheckIcon color={c.gr} size={20} />
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.tx, fontSize: M.stripTitle, fontFamily: font.extraBold, fontWeight: '800' }}>
                    Randevu duruyor
                </Text>
                <Text style={[numeric, { color: c.tx2, fontSize: M.stripSub, fontWeight: '600' }]}>
                    {line}
                </Text>
            </View>
        </View>
    );
}

// ── Kontroller ──────────────────────────────────────────────────────────────

function PrimaryButton({ label, state, enabled, ax, ink, onPress }: {
    label: string; state: ConfirmState; enabled: boolean; ax: boolean;
    ink: ConfirmInk; onPress: () => void;
}) {
    const { c } = useTheme();
    const busy = state === 'sending';
    return (
        <Pressable
            onPress={onPress}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled || busy, busy }}
            accessibilityLabel={label}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                height: ax ? M.primaryHeightAx : M.primaryHeight,
                borderRadius: M.primaryRadius,
                backgroundColor: enabled ? c.or : c.tint,
                borderWidth: enabled ? 0 : 1, borderColor: c.bd,
                transform: pressed && enabled ? [{ scale: 0.97 }] : [],
            })}
        >
            {busy ? <Spinner color={ink.pink} /> : null}
            <Text style={{
                color: enabled ? ink.pink : c.tx3,
                fontSize: ax ? M.primaryTextAx : M.primaryText,
                fontFamily: font.extraBold, fontWeight: '800',
                letterSpacing: M.primaryText * -0.02,
            }}>
                {ax && label === 'Randevu mesajı gönder' ? 'Mesaj gönder' : label}
            </Text>
            {state === 'idle' ? <SendIcon color={enabled ? ink.pink : c.tx3} /> : null}
            {state === 'failed' ? <RetryIcon color={ink.pink} /> : null}
        </Pressable>
    );
}

function SecondaryButton({ label, filled, ax, onPress, icon }: {
    label: string; filled?: boolean; ax: boolean; onPress: () => void; icon?: boolean;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                height: ax ? M.secondaryHeightAx : M.secondaryHeight,
                borderRadius: M.secondaryRadius,
                backgroundColor: filled ? c.tint : 'transparent',
                borderWidth: filled ? 1 : 0, borderColor: c.bd2,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            {icon ? <PlusIcon color={c.tx} size={17} /> : null}
            <Text style={{
                color: filled ? c.tx : c.tx2,
                fontSize: ax ? M.secondaryTextAx : M.secondaryText,
                fontFamily: font.bold, fontWeight: '700',
            }}>
                {label}
            </Text>
        </Pressable>
    );
}

/** Pasif butonun sebebi RENKLE değil KELİMEYLE. */
function WhyRow({ text, opacity }: { text: string; opacity: Animated.Value }) {
    const { c } = useTheme();
    return (
        <Animated.View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: opacity.interpolate({ inputRange: [0.55, 1], outputRange: [0.55, 1] }),
        }}>
            <AlertIcon color={c.am} size={15} />
            <Text style={{
                color: c.am, fontSize: M.whyText, fontFamily: font.bold, fontWeight: '700',
                textAlign: 'center', lineHeight: M.whyText * 1.35,
            }}>
                {text}
            </Text>
        </Animated.View>
    );
}

/** Bekleme göstergesi: rotate 0→360°, 900 ms, sonsuz. Genişlik/renk değişmez. */
function Spinner({ color }: { color: string }) {
    const spin = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(Animated.timing(spin, {
            toValue: 1, duration: M.spinPeriod, easing: Easing.linear, useNativeDriver: true,
        }));
        loop.start();
        return () => loop.stop();
    }, [spin]);
    return (
        <Animated.View style={{
            width: M.spinner, height: M.spinner, borderRadius: M.spinner / 2,
            borderWidth: M.spinnerStroke,
            borderColor: `${color}55`, borderTopColor: color,
            transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }} />
    );
}

// ── İkonlar ─────────────────────────────────────────────────────────────────

const stroke = {
    strokeWidth: 1.7, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const, fill: 'none',
};

function SendIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M4.5 12 20 4.6l-3.2 15.6-4.4-5.2-4.6-1.6z" stroke={color} {...stroke} />
            <Path d="M8.2 13.4 20 4.6" stroke={color} {...stroke} />
        </Svg>
    );
}

function RetryIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.4h-4.4" stroke={color} {...stroke} />
        </Svg>
    );
}

function AlertIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M12 8v5.4" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
            <Circle cx={12} cy={17} r={0.9} fill={color} />
            <Path d="M12 3.6 21.4 20H2.6z" stroke={color} {...stroke} />
        </Svg>
    );
}

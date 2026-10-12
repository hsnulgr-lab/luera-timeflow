import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { StaffHeroPanelCard } from './StaffDayParts';
import { feedback } from '../lib/feedback';
import { soloPickSpoken, type SoloPickItem } from '../lib/soloDay';
import {
    PICK_CAPTURE_SLOP, PICK_DRAG_SLOP, PICK_HINT, PICK_SPRING, PICK_STEP, overshootTable, rubberBand,
    settleTarget, stackPad, stackTables, stepTarget, tapTarget,
} from '../lib/soloPicker';
import { staffDayMetrics, useTheme } from '../theme';

/** İlk açılış ipucu bir kez oynar; bayrak cihazda (G5 · Karar 1). */
const HINT_KEY = 'tek.g5.ipucu';

/**
 * G5 · Gün kartının seçicisi.
 *
 * Tasarım: `docs/design-reference/Luera Mobil - Tek Kisilik G5 Secici.html`.
 * Kart v4'teki gibi; yeni olan yalnız YIĞIN ve HAREKET. Başlatılabilir birden
 * çok randevu varsa saat sırasıyla kartın arkasında dizilir, seçili olan
 * ortada tam durur. Karttan başlayan dikey sürükleme seçiliyi değiştirir,
 * bırakınca en yakın randevuya oturur; kenarı görünen karta dokunmak onu
 * seçer; seçili karta (ve hapına) dokunmak SEÇİLENİN kumandasını açar.
 *
 * ── Hareket ─────────────────────────────────────────────────────────────────
 * Bütün kartlar TEK bir konumdan (`pos`, sıradaki yer) `interpolate` ile
 * türüyor; değerler `soloPicker.ts`te ve tasarımın tablosunun birebiri.
 * Native sürücü: yalnız translateY · scale · opacity (AGENTS.md). Sürükleme
 * `PanResponder` (gesture-handler yok); parmak `pos.setValue()` yazıyor.
 * Öne geçme (`zIndex`) native sürücüde canlanmıyor — yuvarlanan konum
 * değişince React durumuyla, tık ile aynı karede.
 *
 * ── Sayfayla jest paylaşımı (Karar 1) ───────────────────────────────────────
 * Gün sayfası dikey kayıyor. Karttan başlayan dikey jest seçicinin: jest
 * devralınıyor, bırakılmıyor ve sürükleme boyunca sayfanın kaydırması kapalı
 * (`onDrag`). Kartın dışından başlayan jest sayfanın.
 *
 * ── Tek başlatılabilir (G5·5) ───────────────────────────────────────────────
 * Bugünkü kartın birebiri: yığın izi yok, pay yok, sürükleme yok.
 */
export function SoloPicker({ items, index, onSettle, onOpen, onDrag }: {
    items: readonly SoloPickItem[];
    /** Seçili kartın yeri — seçim randevuya bağlı, yer ekran tarafından bulunuyor. */
    index: number;
    /** Kart bir randevuya OTURDU (kullanıcı seçti). */
    onSettle: (index: number) => void;
    /** Seçili kartın hapı: kumandayı aç. */
    onOpen: (index: number) => void;
    /** Sürükleme başladı / bitti — sayfanın kaydırması bu arada kapalı. */
    onDrag: (active: boolean) => void;
}) {
    const { reduceMotion } = useTheme();
    const count = items.length;

    // Konum bileşenin ömrü boyunca TEK değer; tembel kurulum, ref değil.
    const [pos] = useState(() => new Animated.Value(index));
    const [height, setHeight] = useState(100);
    const [front, setFront] = useState(index);

    /*
     * Jestin ve dinleyicinin ortak hafızası. `silent`: konumu ekran
     * değiştirdiğinde (seçim başka yerde, liste değişti) tık çalınmaz — tık
     * kullanıcının parmağının sesi.
     */
    const live = useRef({ value: index, front: index, silent: false, start: index, moved: false, dragging: false });
    // Jest geri çağrılarının okuduğu güncel değerler — render'da değil,
    // çizimden hemen sonra yazılıyor.
    const latest = useRef({ items, count, onSettle, onOpen, onDrag, reduceMotion, height });
    useLayoutEffect(() => {
        latest.current = { items, count, onSettle, onOpen, onDrag, reduceMotion, height };
    });

    /*
     * Konumu dinleyen TEK yer: öne geçen kart (`zIndex`) ve tık (G5 · Karar
     * 7 — her randevuya oturuşta, sürüklerken her ,5 sınır geçişinde).
     * Native yay sürerken de olaylar geliyor (dinleyici varken RN değeri
     * JS'e yolluyor).
     */
    useEffect(() => {
        const id = pos.addListener(({ value }) => {
            live.current.value = value;
            const last = latest.current.count - 1;
            const nearest = Math.round(Math.max(0, Math.min(last, value)));
            if (nearest !== live.current.front) {
                live.current.front = nearest;
                setFront(nearest);
                if (!live.current.silent) feedback.selection();
            }
        });
        return () => pos.removeListener(id);
    }, [pos]);

    /** Konumu sessizce yerleştir — ekranın kararı, kullanıcının değil. */
    const place = useCallback((target: number) => {
        pos.stopAnimation();
        live.current.silent = true;
        pos.setValue(target);
        live.current.silent = false;
    }, [pos]);

    /*
     * Seçim dışarıda değişti (liste değişti, Gün'e dönüldü, seçili randevu
     * başlatılamaz oldu): kart oraya ANINDA geçer. Kullanıcının kendi
     * oturuşu da buradan geçer ama konum zaten orada — iş yok.
     */
    useEffect(() => {
        if (live.current.dragging) return;
        if (Math.abs(live.current.value - index) > 0.001) place(index);
    }, [index, place]);

    const settle = useCallback((target: number, velocity = 0) => {
        if (latest.current.reduceMotion) {
            pos.stopAnimation();
            pos.setValue(target);
            latest.current.onSettle(target);
            return;
        }
        Animated.spring(pos, {
            toValue: target,
            velocity,
            ...PICK_SPRING,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) latest.current.onSettle(target);
        });
    }, [pos]);

    /*
     * İLK AÇILIŞ İPUCU (Karar 1): yığın ilk kez görününce kart bir kez
     * hafifçe yukarı kayıp geri döner — "altında başka kart var ve kayıyor".
     * Sayaç yok; picker'lar da konum yazmaz. reduceMotion'da yok.
     */
    const stacked = count > 1;
    useEffect(() => {
        if (!stacked || reduceMotion) return undefined;
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        void (async () => {
            const seen = await AsyncStorage.getItem(HINT_KEY).catch(() => '1');
            if (!alive || seen) return;
            await AsyncStorage.setItem(HINT_KEY, '1').catch(() => undefined);
            const from = live.current.value;
            Animated.spring(pos, { toValue: from + PICK_HINT.to, ...PICK_SPRING, useNativeDriver: true }).start();
            timer = setTimeout(() => {
                Animated.spring(pos, { toValue: from, ...PICK_SPRING, useNativeDriver: true }).start();
            }, PICK_HINT.backAfterMs);
        })();
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, [stacked, reduceMotion, pos]);

    // Geri çağrılar YALNIZ jest olaylarında çalışıyor, render'da değil; ref'ler
    // orada okunuyor. Kural `create`e verilen nesnenin içini göremiyor.
    // eslint-disable-next-line react-hooks/refs
    const responder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > PICK_CAPTURE_SLOP,
        // Sayfa jesti isteyince bırakılmıyor: karttan başlayan jest seçicinin.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
            pos.stopAnimation((value) => {
                const last = latest.current.count - 1;
                live.current.start = Math.max(0, Math.min(last, value));
            });
            live.current.moved = false;
            live.current.dragging = true;
            latest.current.onDrag(true);
        },
        onPanResponderMove: (_, g) => {
            if (!live.current.moved && Math.abs(g.dy) > PICK_DRAG_SLOP) live.current.moved = true;
            if (!live.current.moved) return;
            const { count: n, reduceMotion: still } = latest.current;
            pos.setValue(still
                ? stepTarget(live.current.start, g.dy, n)
                : rubberBand(live.current.start - g.dy / PICK_STEP, n));
        },
        onPanResponderRelease: (event, g) => {
            live.current.dragging = false;
            latest.current.onDrag(false);
            const { count: n, height: h } = latest.current;
            if (!live.current.moved) {
                // Dokunuş: kenarı görünen kart seçilir, seçili kart açılır.
                const target = tapTarget(event.nativeEvent.locationY, h, live.current.front, n);
                if (target === null) return;
                if (target !== live.current.front) settle(target);
                else if (latest.current.items[target]?.action) latest.current.onOpen(target);
                return;
            }
            // reduceMotion: konum yuvarlanır, hız taşınmaz.
            if (latest.current.reduceMotion) {
                settle(settleTarget(live.current.value, 0, n));
                return;
            }
            // vy pt/ms → randevu/sn; yukarı sürükleme ileri.
            const velocity = -(g.vy * 1000) / PICK_STEP;
            settle(settleTarget(live.current.value, velocity, n), velocity);
        },
        onPanResponderTerminate: () => {
            live.current.dragging = false;
            latest.current.onDrag(false);
            settle(settleTarget(live.current.value, 0, latest.current.count));
        },
    }), [pos, settle]);

    const measure = useCallback((event: LayoutChangeEvent) => {
        const next = event.nativeEvent.layout.height;
        if (next > 0) setHeight((current) => (Math.abs(current - next) > 0.5 ? next : current));
    }, []);

    /*
     * Kartların tabloları — yükseklik ve sayı değişince yeniden. Kartlar
     * uçlarda KIRPILMIŞ konumdan dizilir; uçtaki aşmayı yığının tamamı taşır.
     */
    const clamped = useMemo(
        () => pos.interpolate({ inputRange: [0, Math.max(1, count - 1)], outputRange: [0, Math.max(1, count - 1)], extrapolate: 'clamp' }),
        [pos, count],
    );
    const overshoot = useMemo(() => {
        const table = overshootTable(Math.max(2, count));
        return pos.interpolate({ ...table, extrapolate: 'extend' });
    }, [pos, count]);
    // Sayıya ve yüksekliğe bağlı — kartların İÇERİĞİ her saniye değişse de
    // (süren işin sayacı) native tablolar yeniden kurulmuyor.
    const poses = useMemo(() => Array.from({ length: count }, (_, i) => {
        const t = stackTables(i, height);
        const at = (outputRange: number[]) => clamped.interpolate({ inputRange: t.inputRange, outputRange, extrapolate: 'clamp' });
        return { translateY: at(t.translateY), scale: at(t.scale), opacity: at(t.opacity), content: at(t.content) };
    }), [count, height, clamped]);

    const onAction = useCallback((event: AccessibilityActionEvent) => {
        const current = live.current.front;
        const last = latest.current.count - 1;
        switch (event.nativeEvent.actionName) {
            case 'increment': if (current < last) settle(current + 1); break;
            case 'decrement': if (current > 0) settle(current - 1); break;
            case 'activate': if (latest.current.items[current]?.action) latest.current.onOpen(current); break;
            default: break;
        }
    }, [settle]);

    if (count === 0) return null;

    // G5·5 — tek başlatılabilir: bugünkü kartın birebiri.
    if (count === 1) {
        const only = items[0];
        return (
            <StaffHeroPanelCard
                panel={only.panel}
                action={only.action ? { label: only.action.label, tone: only.action.tone, onPress: () => onOpen(0) } : undefined}
            />
        );
    }

    return (
        <View
            {...responder.panHandlers}
            // Üstteki kenarlar kartın 16 pt üst payına taşıyor; oraya dokunmak da seçer.
            hitSlop={{ top: staffDayMetrics.panelMarginTop }}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Seçili randevu"
            accessibilityValue={{ text: soloPickSpoken(items, front) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
            onAccessibilityAction={onAction}
            style={{ marginTop: staffDayMetrics.panelMarginTop, height: height + stackPad(count) }}
        >
            <Animated.View pointerEvents="none" style={{ flex: 1, transform: [{ translateY: overshoot }] }}>
                {items.map((item, i) => (
                    <Animated.View
                        key={item.id}
                        onLayout={i === front ? measure : undefined}
                        importantForAccessibility="no-hide-descendants"
                        accessibilityElementsHidden
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 0,
                            zIndex: 100 - Math.abs(i - front) * 10,
                            opacity: poses[i].opacity,
                            transform: [{ translateY: poses[i].translateY }, { scale: poses[i].scale }],
                        }}
                    >
                        <StaffHeroPanelCard
                            flush
                            panel={item.panel}
                            action={item.action ? { label: item.action.label, tone: item.action.tone, onPress: () => undefined } : undefined}
                            contentOpacity={poses[i].content}
                        />
                    </Animated.View>
                ))}
            </Animated.View>
        </View>
    );
}

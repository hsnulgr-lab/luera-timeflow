import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { numeric, useTheme } from '../../src/theme';

const TODAY = [
    { name: 'Ciro', detail: '3 işlem tamamlandı', value: '₺4.010' },
    { name: 'Ortalama işlem süresi', detail: 'Son 7 gün', value: '68 dk' },
    { name: 'Gelmeyen müşteri', detail: 'Bu ay', value: '2' },
] as const;

const BARS = [
    { day: 'Çar', height: 38, highlight: false },
    { day: 'Per', height: 56, highlight: false },
    { day: 'Cum', height: 44, highlight: false },
    { day: 'Cmt', height: 88, highlight: false },
    { day: 'Paz', height: 22, highlight: false },
    { day: 'Pzt', height: 61, highlight: false },
    { day: 'Sal', height: 47, highlight: true },
] as const;

function TopBar() {
    const { c, glass } = useTheme();
    const style: ViewStyle = {
        height: 52,
        paddingHorizontal: 18,
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: c.glassBorder,
    };
    const content = (
        <View style={{ minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: c.tx, fontSize: 16, fontWeight: '800', letterSpacing: -0.32 }}>
                Merve · Kuaför
            </Text>
            <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 11.5, fontWeight: '600' }}>
                Studio Ayla — Kadıköy
            </Text>
        </View>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={style}>
                {content}
            </GlassView>
        );
    }
    return <View style={[style, { backgroundColor: c.surf }]}>{content}</View>;
}

function SectionTitle({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: 9 }}>
            <Text style={{
                color: c.tx2,
                fontSize: 11.5,
                fontWeight: '700',
                letterSpacing: 1.84,
                textTransform: 'uppercase',
            }}>
                {children}
            </Text>
        </View>
    );
}

export default function Performance() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const chartReveal = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

    useEffect(() => {
        if (reduceMotion) {
            chartReveal.setValue(1);
            return;
        }
        chartReveal.setValue(0);
        Animated.timing(chartReveal, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [chartReveal, reduceMotion]);

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 122 }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 12, gap: 3 }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: 30,
                        lineHeight: 31.5,
                        fontWeight: '800',
                        letterSpacing: -1.05,
                    }}>
                        Performansım
                    </Text>
                    <Text style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                        Ağustos · 1–11
                    </Text>
                </View>

                <View style={{
                    flexDirection: 'row',
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: c.bd,
                    backgroundColor: c.surf,
                }}>
                    {[
                        ['₺48.6B', 'Aylık ciro'],
                        ['62', 'İşlem'],
                        ['₺4.86B', 'Prim'],
                    ].map(([value, label], index) => (
                        <View key={label} style={{
                            flex: 1,
                            gap: 3,
                            paddingVertical: 16,
                            paddingHorizontal: 14,
                            borderRightWidth: index < 2 ? 1 : 0,
                            borderRightColor: c.bd,
                        }}>
                            <Text numberOfLines={1} adjustsFontSizeToFit style={[{
                                color: c.tx,
                                fontSize: 24,
                                fontWeight: '800',
                                letterSpacing: -0.84,
                            }, numeric]}>
                                {value}
                            </Text>
                            <Text numberOfLines={1} style={{
                                color: c.tx2,
                                fontSize: 11.5,
                                fontWeight: '600',
                                letterSpacing: 0.92,
                                textTransform: 'uppercase',
                            }}>
                                {label}
                            </Text>
                        </View>
                    ))}
                </View>

                <SectionTitle>Bugün</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    {TODAY.map((item, index) => (
                        <View key={item.name}>
                            <View style={{
                                minHeight: 62,
                                paddingVertical: 10,
                                paddingHorizontal: 18,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 13,
                            }}>
                                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Text numberOfLines={1} style={{
                                        color: c.tx,
                                        fontSize: 15.5,
                                        fontWeight: '700',
                                        letterSpacing: -0.23,
                                    }}>
                                        {item.name}
                                    </Text>
                                    <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                                        {item.detail}
                                    </Text>
                                </View>
                                <Text style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                                    {item.value}
                                </Text>
                            </View>
                            {index < TODAY.length - 1 ? <View style={{ height: 1, backgroundColor: c.bd }} /> : null}
                        </View>
                    ))}
                </View>

                <SectionTitle>Son 7 gün · ciro</SectionTitle>
                <View style={{
                    height: 104,
                    paddingTop: 18,
                    paddingHorizontal: 20,
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 7,
                }}>
                    {BARS.map((bar) => (
                        <View key={bar.day} style={{ flex: 1, height: '100%', alignItems: 'center', gap: 6 }}>
                            <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
                                <Animated.View style={{
                                    width: '100%',
                                    height: chartReveal.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['0%', `${bar.height}%`],
                                    }),
                                    borderTopLeftRadius: 6,
                                    borderTopRightRadius: 6,
                                    borderWidth: 1,
                                    borderBottomWidth: 0,
                                    borderColor: bar.highlight ? c.or + '52' : c.bd,
                                    backgroundColor: bar.highlight ? c.or + '3D' : c.surf2,
                                }} />
                            </View>
                            <Text style={{ color: c.tx3, fontSize: 10.5, fontWeight: '600' }}>
                                {bar.day}
                            </Text>
                        </View>
                    ))}
                </View>

                <SectionTitle>Prim</SectionTitle>
                <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        padding: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                    }}>
                        <View style={{
                            marginBottom: 7,
                            flexDirection: 'row',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: 10,
                        }}>
                            <Text numberOfLines={1} style={{
                                flex: 1,
                                color: c.tx,
                                fontSize: 16.5,
                                fontWeight: '700',
                                letterSpacing: -0.33,
                            }}>
                                Hizmet primi %10
                            </Text>
                            <Text style={[{
                                color: c.tx,
                                fontSize: 19,
                                fontWeight: '800',
                                letterSpacing: -0.57,
                            }, numeric]}>
                                ₺4.860
                            </Text>
                        </View>
                        <Text style={{ color: c.tx2, fontSize: 14, lineHeight: 21, fontWeight: '500' }}>
                            Ayın 5'inde ödenir. Tahsil edilmiş adisyonlar üzerinden hesaplanır.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

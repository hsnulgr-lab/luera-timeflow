import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { numeric, useTheme } from '../../src/theme';

const HISTORY = [
    { name: 'Saç boyama + fön', detail: '11 Tem · Merve', amount: '₺1.800' },
    { name: 'Keratin bakım', detail: '18 Haz · Merve', amount: '₺2.200' },
    { name: 'Kesim', detail: '2 Haz · Emre', amount: '₺650' },
] as const;

function BackChevron() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 11,
            height: 11,
            borderLeftWidth: 1.8,
            borderBottomWidth: 1.8,
            borderColor: c.tx,
            transform: [{ rotate: '45deg' }],
            marginLeft: 4,
        }} />
    );
}

function TopBar({ onBack }: { onBack: () => void }) {
    const { c, glass } = useTheme();
    const barStyle: ViewStyle = {
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: c.glassBorder,
    };
    const content = (
        <>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                onPress={onBack}
                hitSlop={6}
                style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    marginLeft: -12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.55 : 1,
                })}
            >
                <BackChevron />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: 16,
                    fontWeight: '800',
                    letterSpacing: -0.32,
                }}>
                    Müşteri
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 11.5, fontWeight: '600' }}>
                    Ayşe Yılmaz
                </Text>
            </View>
        </>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={barStyle}>
                {content}
            </GlassView>
        );
    }
    return <View style={[barStyle, { backgroundColor: c.surf }]}>{content}</View>;
}

function ShieldIcon() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 20,
            height: 20,
            alignItems: 'center',
            paddingTop: 4,
            borderWidth: 1.7,
            borderColor: c.am,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
        }}>
            <View style={{ width: 1.7, height: 6, borderRadius: 1, backgroundColor: c.am }} />
            <View style={{ width: 2, height: 2, marginTop: 2, borderRadius: 1, backgroundColor: c.am }} />
        </View>
    );
}

function SectionTitle({ children, trailing }: { children: string; trailing?: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            paddingTop: 22,
            paddingHorizontal: 20,
            paddingBottom: 9,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: 11.5,
                fontWeight: '700',
                letterSpacing: 1.84,
                textTransform: 'uppercase',
            }}>
                {children}
            </Text>
            {trailing ? (
                <Text style={{ color: c.or, fontSize: 12.5, fontWeight: '700' }}>
                    {trailing}
                </Text>
            ) : null}
        </View>
    );
}

function HistoryRow({ item }: { item: typeof HISTORY[number] }) {
    const { c } = useTheme();
    return (
        <View style={{
            minHeight: 62,
            paddingVertical: 10,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: c.tx, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23 }}>
                    {item.name}
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                    {item.detail}
                </Text>
            </View>
            <Text style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                {item.amount}
            </Text>
        </View>
    );
}

function NewAppointmentAction() {
    const { c, glass } = useTheme();
    const insets = useSafeAreaInsets();
    const shell: ViewStyle = {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 10,
        padding: 12,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: c.glassBorder,
        overflow: 'hidden',
    };
    const content = (
        <Pressable
            accessibilityRole="button"
            onPress={() => undefined}
            style={({ pressed }) => ({
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.bd,
                backgroundColor: c.surf2,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Text style={{ color: c.tx, fontSize: 16, fontWeight: '700' }}>
                Yeni randevu ver
            </Text>
        </Pressable>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={shell}>
                {content}
            </GlassView>
        );
    }
    return <View style={[shell, { backgroundColor: c.surf }]}>{content}</View>;
}

export default function CustomerCard() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar onBack={() => router.back()} />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 126 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{
                    paddingTop: 20,
                    paddingHorizontal: 18,
                    paddingBottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                }}>
                    <View style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.surf2,
                    }}>
                        <Text style={{ color: c.tx, fontSize: 22, fontWeight: '800', letterSpacing: -0.44 }}>
                            AY
                        </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{ color: c.tx, fontSize: 24, fontWeight: '800', letterSpacing: -0.77 }}>
                            Ayşe Yılmaz
                        </Text>
                        <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                            2022'den beri · 38 işlem
                        </Text>
                    </View>
                </View>

                <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
                    <View style={{
                        paddingVertical: 15,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 11,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.am + '4D',
                        backgroundColor: c.am + '14',
                    }}>
                        <View style={{ marginTop: 1 }}>
                            <ShieldIcon />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <Text style={{
                                color: c.am,
                                fontSize: 14,
                                fontWeight: '700',
                                letterSpacing: 0.84,
                                textTransform: 'uppercase',
                            }}>
                                Bilinmesi gerekenler
                            </Text>
                            <Text style={{ color: c.tx, fontSize: 15, lineHeight: 22.5, fontWeight: '600' }}>
                                Amonyaklı boyada ciltte kızarıklık oluyor. Amonyaksız seri kullanılıyor.
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={{
                    flexDirection: 'row',
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: c.bd,
                    backgroundColor: c.surf,
                }}>
                    {[
                        ['4', 'Kalan seans'],
                        ['₺12.4B', 'Toplam'],
                        ['31 gün', 'Son geliş'],
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

                <SectionTitle>Devam eden paket</SectionTitle>
                <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        padding: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                    }}>
                        <View style={{
                            marginBottom: 11,
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
                                Bakım paketi 10'lu
                            </Text>
                            <Text numberOfLines={1} style={{ color: c.or2, fontSize: 14, fontWeight: '700' }}>
                                4 / 10 kaldı
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                            {Array.from({ length: 10 }, (_, index) => (
                                <View key={index} style={{
                                    flex: 1,
                                    height: 7,
                                    borderRadius: 4,
                                    backgroundColor: index < 6 ? c.surf2 : c.or + '59',
                                }} />
                            ))}
                        </View>
                    </View>
                </View>

                <SectionTitle trailing="Tümü">Geçmiş işlemler</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    {HISTORY.map((item, index) => (
                        <View key={item.name}>
                            <HistoryRow item={item} />
                            {index < HISTORY.length - 1 ? <View style={{ height: 1, backgroundColor: c.bd }} /> : null}
                        </View>
                    ))}
                </View>

                <SectionTitle>Notlar</SectionTitle>
                <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                    }}>
                        <Text style={{
                            marginBottom: 5,
                            color: c.tx3,
                            fontSize: 12,
                            fontWeight: '700',
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                        }}>
                            11 Tem · Merve
                        </Text>
                        <Text style={{ color: c.tx2, fontSize: 15, lineHeight: 22.5, fontWeight: '500' }}>
                            7.3 kumral tercih ediyor, kökte yarım ton koyu.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            <NewAppointmentAction />
        </View>
    );
}

import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '../../src/lib/feedback';
import { numeric, useTheme } from '../../src/theme';

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
                    Randevu
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 11.5, fontWeight: '600' }}>
                    Bugün 10:00
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

function UserIcon() {
    const { c } = useTheme();
    return (
        <View style={{ width: 19, height: 19, alignItems: 'center' }}>
            <View style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                borderWidth: 1.6,
                borderColor: c.tx,
            }} />
            <View style={{
                position: 'absolute',
                bottom: 0,
                width: 14,
                height: 8,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderWidth: 1.6,
                borderBottomWidth: 0,
                borderColor: c.tx,
            }} />
        </View>
    );
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

function ServiceRow({ name, duration, amount }: { name: string; duration: string; amount: string }) {
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
                <Text style={{ color: c.tx, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23 }}>
                    {name}
                </Text>
                <Text style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                    {duration}
                </Text>
            </View>
            <Text style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                {amount}
            </Text>
        </View>
    );
}

function SmallButton({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => undefined}
            style={({ pressed }) => ({
                flex: 1,
                height: 44,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.bd,
                backgroundColor: c.surf2,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Text numberOfLines={1} style={{ color: c.tx, fontSize: 14.5, fontWeight: '700', letterSpacing: -0.15 }}>
                {children}
            </Text>
        </Pressable>
    );
}

function BottomActions() {
    const { c, glass } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const shell: ViewStyle = {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 10,
        padding: 12,
        gap: 9,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: c.glassBorder,
        overflow: 'hidden',
    };
    const content = (
        <>
            <Pressable
                accessibilityRole="button"
                onPress={() => {
                    feedback.medium();
                    router.push('/visit');
                }}
                style={({ pressed }) => ({
                    height: 60,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 18,
                    backgroundColor: c.or,
                    opacity: pressed ? 0.82 : 1,
                })}
            >
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                    İşleme başla
                </Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 9 }}>
                <SmallButton>Müşteri gelmedi</SmallButton>
                <SmallButton>Ertele</SmallButton>
            </View>
        </>
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

export default function AppointmentDetail() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar onBack={() => router.back()} />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 188 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{
                    paddingTop: 20,
                    paddingHorizontal: 18,
                    paddingBottom: 16,
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
                        <Text numberOfLines={1} style={{
                            color: c.tx,
                            fontSize: 23,
                            fontWeight: '800',
                            letterSpacing: -0.69,
                        }}>
                            Ayşe Yılmaz
                        </Text>
                        <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                            4 yıllık müşteri · 38 işlem
                        </Text>
                    </View>
                </View>

                <View style={{ paddingHorizontal: 18, paddingBottom: 14 }}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            feedback.selection();
                            router.push('/customer');
                        }}
                        style={({ pressed }) => ({
                            width: '100%',
                            height: 44,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 7,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: c.bd,
                            backgroundColor: c.surf2,
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <UserIcon />
                        <Text style={{ color: c.tx, fontSize: 14.5, fontWeight: '700', letterSpacing: -0.15 }}>
                            Müşteri kartını aç
                        </Text>
                    </Pressable>
                </View>

                <View style={{
                    flexDirection: 'row',
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: c.bd,
                    backgroundColor: c.surf,
                }}>
                    {[
                        ['10:00', 'Saat'],
                        ['120 dk', 'Süre'],
                        ['₺1.800', 'Tutar'],
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
                            <Text style={{
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

                <SectionTitle>Hizmetler</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    <ServiceRow name="Saç boyama" duration="90 dk" amount="₺1.450" />
                    <View style={{ height: 1, backgroundColor: c.bd }} />
                    <ServiceRow name="Fön" duration="30 dk" amount="₺350" />
                </View>

                <SectionTitle>Dikkat</SectionTitle>
                <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        paddingVertical: 15,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.am + '4D',
                        backgroundColor: c.am + '14',
                    }}>
                        <Text style={{ color: c.am, fontSize: 15, lineHeight: 22.5, fontWeight: '600' }}>
                            Amonyaklı boyada ciltte kızarıklık oluyor. Amonyaksız seri kullanılacak.
                        </Text>
                    </View>
                </View>

                <SectionTitle>Not</SectionTitle>
                <View style={{ paddingHorizontal: 18 }}>
                    <View style={{
                        paddingVertical: 15,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.card,
                    }}>
                        <Text style={{ color: c.tx2, fontSize: 15, lineHeight: 22.5, fontWeight: '500' }}>
                            Geçen sefer 7.3 kumral tercih etti. Kökte yarım ton koyu istedi.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            <BottomActions />
        </View>
    );
}

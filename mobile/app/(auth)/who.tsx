import { Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '../../src/lib/feedback';
import { useTheme } from '../../src/theme';

const STAFF = [
    { id: 'merve', initials: 'MK', name: 'Merve Kaya', role: 'Kuaför' },
    { id: 'selin', initials: 'SB', name: 'Selin Boz', role: 'Estetisyen' },
    { id: 'emre', initials: 'EY', name: 'Emre Yıldız', role: 'Berber' },
    { id: 'hande', initials: 'HA', name: 'Hande Arslan', role: 'Manikürist' },
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

function NextChevron() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 10,
            height: 10,
            borderRightWidth: 1.7,
            borderTopWidth: 1.7,
            borderColor: c.tx3,
            transform: [{ rotate: '45deg' }],
            marginRight: 3,
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
                    Studio Ayla
                </Text>
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: 11.5,
                    fontWeight: '600',
                }}>
                    Kadıköy
                </Text>
            </View>
        </>
    );

    if (glass) {
        return (
            <GlassView
                glassEffectStyle="regular"
                tintColor={c.tint}
                style={barStyle}
            >
                {content}
            </GlassView>
        );
    }

    return <View style={[barStyle, { backgroundColor: c.surf }]}>{content}</View>;
}

export default function ChooseStaff() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <TopBar onBack={() => router.back()} />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
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
                        Siz kimsiniz?
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: 14,
                        fontWeight: '600',
                    }}>
                        Listeden kendinizi seçin
                    </Text>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                    {STAFF.map((member) => (
                        <Pressable
                            key={member.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${member.name}, ${member.role}`}
                            onPress={() => {
                                feedback.selection();
                                router.push({
                                    pathname: '/(auth)/pin',
                                    params: {
                                        staffId: member.id,
                                        initials: member.initials,
                                        name: member.name,
                                        role: member.role,
                                    },
                                });
                            }}
                            style={({ pressed }) => ({
                                minHeight: 74,
                                paddingVertical: 10,
                                paddingHorizontal: 18,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 13,
                                borderBottomWidth: 1,
                                borderBottomColor: c.bd,
                                backgroundColor: pressed ? c.surf2 : 'transparent',
                            })}
                        >
                            <View style={{
                                width: 52,
                                height: 52,
                                flexShrink: 0,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 26,
                                borderWidth: 1,
                                borderColor: c.bd,
                                backgroundColor: c.surf2,
                            }}>
                                <Text style={{
                                    color: c.tx,
                                    fontSize: 18,
                                    fontWeight: '800',
                                    letterSpacing: -0.36,
                                }}>
                                    {member.initials}
                                </Text>
                            </View>

                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text numberOfLines={1} style={{
                                    color: c.tx,
                                    fontSize: 17,
                                    fontWeight: '700',
                                    letterSpacing: -0.26,
                                }}>
                                    {member.name}
                                </Text>
                                <Text numberOfLines={1} style={{
                                    color: c.tx2,
                                    fontSize: 13,
                                    fontWeight: '500',
                                }}>
                                    {member.role}
                                </Text>
                            </View>

                            <NextChevron />
                        </Pressable>
                    ))}
                </View>

                <View style={{
                    marginTop: 18,
                    marginHorizontal: 22,
                    paddingVertical: 13,
                    paddingHorizontal: 15,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: c.bd,
                    backgroundColor: c.surf2,
                }}>
                    <Text style={{
                        color: c.tx2,
                        fontSize: 13.5,
                        lineHeight: 19.6,
                        fontWeight: '600',
                    }}>
                        Listede yoksanız işletme sahibi sizi eklemeli.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

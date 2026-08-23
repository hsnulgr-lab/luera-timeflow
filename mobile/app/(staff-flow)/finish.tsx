import { Alert, Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '../../src/lib/feedback';
import { numeric, useTheme } from '../../src/theme';
import { upperTR } from '../../src/lib/text';

const SERVICES = [
    { name: 'Saç boyama', detail: '90 dk', amount: '₺1.450' },
    { name: 'Fön', detail: '30 dk', amount: '₺350' },
    { name: 'Saç bakım maskesi', detail: '20 dk', amount: '₺210' },
] as const;

const MATERIALS = [
    { name: 'Boya · 7.3 kumral', detail: '2 tüp' },
    { name: 'Oksidan %6', detail: '1 şişe' },
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
                    İşlem özeti
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

function SectionTitle({ children, trailing, compact = false }: {
    children: string;
    trailing?: string;
    compact?: boolean;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            paddingTop: compact ? 6 : 22,
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
            }}>
                {upperTR(children)}
            </Text>
            {trailing ? (
                <Text style={{ color: c.or, fontSize: 12.5, fontWeight: '700' }}>
                    {trailing}
                </Text>
            ) : null}
        </View>
    );
}

function SummaryRow({
    name,
    detail,
    amount,
    compact = false,
}: {
    name: string;
    detail: string;
    amount?: string;
    compact?: boolean;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            minHeight: compact ? 52 : 62,
            paddingVertical: compact ? 7 : 10,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: c.tx, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23 }}>
                    {name}
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                    {detail}
                </Text>
            </View>
            {amount ? (
                <Text style={[{ color: c.tx, fontSize: 15, fontWeight: '700' }, numeric]}>
                    {amount}
                </Text>
            ) : null}
        </View>
    );
}

function TotalBar() {
    const { c } = useTheme();
    return (
        <View style={{
            paddingVertical: 18,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: c.bd,
            backgroundColor: c.surf2,
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: 1.82,
            }}>
                {upperTR('Toplam')}
            </Text>
            <Text style={[{
                color: c.tx,
                fontSize: 34,
                fontWeight: '800',
                letterSpacing: -1.19,
            }, numeric]}>
                ₺2.010
            </Text>
        </View>
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

    const confirmSend = () => {
        Alert.alert(
            'Adisyon kasaya gönderilsin mi?',
            'Gönderdikten sonra geri alamazsınız. Tahsilatı kasadaki kişi yapacak.',
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Kasaya gönder',
                    style: 'destructive',
                    onPress: () => {
                        feedback.success();
                        router.replace('/sent');
                    },
                },
            ],
        );
    };

    const content = (
        <>
            <Pressable
                accessibilityRole="button"
                onPress={confirmSend}
                style={({ pressed }) => ({
                    height: 64,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 18,
                    backgroundColor: c.or,
                    opacity: pressed ? 0.82 : 1,
                    transform: [{ scale: pressed ? 0.988 : 1 }],
                })}
            >
                <Text numberOfLines={1} style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                    Adisyonu kasaya gönder
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                onPress={() => router.back()}
                style={({ pressed }) => ({
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.55 : 1,
                })}
            >
                <Text style={{ color: c.tx2, fontSize: 16, fontWeight: '700' }}>
                    Düzeltmem var, geri dön
                </Text>
            </Pressable>
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

export default function FinishSummary() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar onBack={() => router.back()} />
            <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    <View style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 12, gap: 3 }}>
                        <Text style={{
                            color: c.tx,
                            fontSize: 30,
                            lineHeight: 31.5,
                            fontWeight: '800',
                            letterSpacing: -1.05,
                        }}>
                            Yapılanlar
                        </Text>
                        <Text style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                            10:00 – 11:52 · Saç boyama + fön
                        </Text>
                    </View>

                    <SectionTitle compact>Hizmetler</SectionTitle>
                    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                        {SERVICES.map((service, index) => (
                            <View key={service.name}>
                                <SummaryRow {...service} />
                                {index < SERVICES.length - 1 ? <View style={{ height: 1, backgroundColor: c.bd }} /> : null}
                            </View>
                        ))}
                    </View>

                    <SectionTitle trailing="Depodan düşülecek">Kullanılan malzeme</SectionTitle>
                    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                        {MATERIALS.map((material, index) => (
                            <View key={material.name}>
                                <SummaryRow {...material} compact />
                                {index < MATERIALS.length - 1 ? <View style={{ height: 1, backgroundColor: c.bd }} /> : null}
                            </View>
                        ))}
                    </View>

                    <SectionTitle>Not</SectionTitle>
                    <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
                        <View style={{
                            paddingVertical: 15,
                            paddingHorizontal: 16,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: c.bd,
                            backgroundColor: c.card,
                        }}>
                            <Text style={{ color: c.tx2, fontSize: 15, lineHeight: 22.5, fontWeight: '500' }}>
                                Kökte yarım ton koyu uygulandı. Amonyaksız seri kullanıldı.
                            </Text>
                        </View>
                    </View>
                </ScrollView>

                <TotalBar />
                <View style={{ height: 120 }} />
            </View>

            <BottomActions />
        </View>
    );
}

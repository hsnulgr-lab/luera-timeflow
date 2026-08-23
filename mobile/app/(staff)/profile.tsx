import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi, type AuthSession } from '../../src/api/session';
import { feedback } from '../../src/lib/feedback';
import { useTheme } from '../../src/theme';
import { upperTR } from '../../src/lib/text';

function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
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
            <Text style={{ color: c.tx, fontSize: 16, fontWeight: '800', letterSpacing: -0.32 }}>
                {title}
            </Text>
            <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 11.5, fontWeight: '600' }}>
                {subtitle}
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
            }}>
                {upperTR(children)}
            </Text>
        </View>
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

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
    const { c, reduceMotion } = useTheme();
    const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        if (reduceMotion) {
            progress.setValue(value ? 1 : 0);
            return;
        }
        Animated.timing(progress, {
            toValue: value ? 1 : 0,
            duration: 210,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [progress, reduceMotion, value]);

    const toggle = () => {
        feedback.toggle(!value);
        onChange();
    };

    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: value }}
            onPress={toggle}
            style={({ pressed }) => ({
                width: 50,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.62 : 1,
            })}
        >
            <Animated.View style={{
                width: 50,
                height: 30,
                padding: 3,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [c.bd, 'rgba(0,0,0,0)'],
                }),
                backgroundColor: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [c.surf2, c.gr],
                }),
            }}>
                <Animated.View style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: value ? '#fff' : c.tx3,
                    transform: [{
                        translateX: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 18],
                        }),
                    }],
                }} />
            </Animated.View>
        </Pressable>
    );
}

function NotificationRow({
    name,
    detail,
    value,
    onChange,
}: {
    name: string;
    detail: string;
    value: boolean;
    onChange: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            minHeight: 62,
            paddingVertical: 9,
            paddingLeft: 18,
            paddingRight: 12,
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
            <Toggle value={value} onChange={onChange} label={name} />
        </View>
    );
}

function SettingRow({
    name,
    detail,
    value,
    onPress,
}: {
    name: string;
    detail: string;
    value?: string;
    onPress?: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => ({
                minHeight: 62,
                paddingVertical: 10,
                paddingHorizontal: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                opacity: pressed ? 0.58 : 1,
            })}
        >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: c.tx, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23 }}>
                    {name}
                </Text>
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                    {detail}
                </Text>
            </View>
            {value ? (
                <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 15, fontWeight: '700' }}>
                    {value}
                </Text>
            ) : null}
            <NextChevron />
        </Pressable>
    );
}

export default function Profile() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [newAppointment, setNewAppointment] = useState(true);
    const [cancellation, setCancellation] = useState(true);
    const [dailySummary, setDailySummary] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.resume.get().then((result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace('/(auth)/welcome');
                return;
            }
            setSession(result.data);
        });
        return () => { alive = false; };
    }, [router]);

    if (!session) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const { profile } = session;

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <TopBar
                title="Profil"
                subtitle={`${profile.business.name} — ${profile.business.location}`}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 122 }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{
                    paddingTop: 24,
                    paddingHorizontal: 20,
                    paddingBottom: 20,
                    alignItems: 'center',
                    gap: 10,
                }}>
                    <View style={{
                        width: 76,
                        height: 76,
                        borderRadius: 38,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: c.or + '47',
                        backgroundColor: c.or + '24',
                    }}>
                        <Text style={{ color: c.or2, fontSize: 26, fontWeight: '800', letterSpacing: -0.52 }}>
                            {profile.initials}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 3 }}>
                        <Text style={{ color: c.tx, fontSize: 22, fontWeight: '800', letterSpacing: -0.66 }}>
                            {profile.name}
                        </Text>
                        <Text style={{ color: c.tx2, fontSize: 14, fontWeight: '600' }}>
                            {profile.actor === 'manager'
                                ? 'Hesap sahibi · bu telefona bağlı'
                                : `${profile.title ?? ''} · bu telefona bağlı`}
                        </Text>
                    </View>
                </View>

                <SectionTitle>Hesap</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    <SettingRow
                        name="Hesap"
                        detail="Giriş, Face ID ve oturum"
                        onPress={() => router.push('/(staff-flow)/account')}
                    />
                </View>

                <SectionTitle>Bildirimler</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    <NotificationRow
                        name="Yeni randevu bildirimi"
                        detail="Size randevu verildiğinde"
                        value={newAppointment}
                        onChange={() => setNewAppointment((current) => !current)}
                    />
                    <View style={{ height: 1, backgroundColor: c.bd }} />
                    <NotificationRow
                        name="Randevu iptali"
                        detail="Müşteri iptal ettiğinde"
                        value={cancellation}
                        onChange={() => setCancellation((current) => !current)}
                    />
                    <View style={{ height: 1, backgroundColor: c.bd }} />
                    <NotificationRow
                        name="Günün özeti"
                        detail="Akşam 20:00'de"
                        value={dailySummary}
                        onChange={() => setDailySummary((current) => !current)}
                    />
                </View>

                <SectionTitle>Görünüm</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    <SettingRow name="Tema" detail="Telefon ayarını izler" value="Otomatik" />
                    <View style={{ height: 1, backgroundColor: c.bd }} />
                    <SettingRow name="Yazı boyutu" detail="Telefon ayarını izler" value="Normal" />
                </View>

                <SectionTitle>Cihaz</SectionTitle>
                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd }}>
                    <SettingRow name="Şifremi değiştir" detail="4 haneli şifre" />
                    <View style={{ height: 1, backgroundColor: c.bd }} />
                    <SettingRow name="Yardım" detail="Sık sorulanlar, destek" />
                </View>

            </ScrollView>
        </View>
    );
}

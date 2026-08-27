import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    AmberNote,
    Checkbox,
    Foot,
    GhostButton,
    Group,
    HoldToDelete,
    ProfileNav,
    ProfileRow,
} from '../../../src/components/ProfileParts';
import {
    DELETE_FAILED,
    DELETE_KEPT_LABEL,
    DELETE_TIMING_LABEL,
    DELETE_TITLE,
    DELETE_WARN,
    canDelete,
    deletionCopy,
    type DeletionCopy,
} from '../../../src/lib/managerProfile';
import { deleteAccount, readDeletionFacts } from '../../../src/lib/salonSettings';
import { upperTR } from '../../../src/lib/text';
import { authApi } from '../../../src/api/session';
import { feedback } from '../../../src/lib/feedback';
import {
    font,
    profileMetrics as M,
    profileMotion as MO,
    useTheme,
} from '../../../src/theme';

/**
 * Müdür 27 · Hesabı sil.
 *
 * İki dokunuş + iki saniye basılı tutma. "SİL yazdırmak" reddedildi: salonda
 * ayakta, tek elle, gözlüksüz bir müdüre klavye açtırıyor — ve Türkçede
 * büyük harf tuzağı var (sil → SİL, noktalı İ).
 *
 * "30 gün geri alınabilir bekleyen silme" de reddedildi: Apple 5.1.1(v)
 * gerçek silme istiyor, ve geri alma penceresi zaten ulaşılamaz — oturumu
 * kapanmış kullanıcı iptal düğmesine nasıl basacak?
 *
 * SUNUCU UCU HENÜZ YOK. "Hesabınız silindi" cümlesi yalnız istek başarıyla
 * dönerse ekrana girer; bugün her zaman hata dalına düşer ve hesap olduğu
 * gibi durur. Sahte onay verilmez.
 */
export default function ManagerDeleteAccount() {
    const { c, reduceMotion } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [copy, setCopy] = useState<DeletionCopy | null>(null);
    const [consented, setConsented] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const shake = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let alive = true;
        void Promise.all([authApi.account.get(), readDeletionFacts()])
            .then(([account, facts]) => {
                if (!alive) return;
                if (!account.ok) { router.replace('/(auth)/welcome'); return; }
                const { profile } = account.data.session;
                // Sayılar bilinmeden liste çizilmez — "312 randevu" uydurulamaz.
                setCopy(deletionCopy({
                    businessName: profile.business.name,
                    businessLocation: profile.business.location,
                    managerName: profile.name,
                    managerEmail: profile.email ?? null,
                    soleManager: facts.soleManager,
                    appointments: facts.appointments,
                    customers: facts.customers,
                    services: facts.services,
                    staff: facts.staff,
                }));
            })
            .catch(() => { /* okunamazsa ekran boş kalır, liste uydurulmaz */ });
        return () => { alive = false; };
    }, [router]);

    /** Sessiz reddetme yok, ama modal da yok: sallanma + kutunun vurgulanması. */
    const blocked = () => {
        feedback.warning();
        if (reduceMotion) return;
        const step = (to: number) => Animated.timing(shake, {
            toValue: to,
            duration: MO.shakeMs / 4,
            easing: Easing.linear,
            useNativeDriver: true,
        });
        Animated.sequence([
            step(MO.shakeShift), step(-MO.shakeShift),
            step(MO.shakeShift), step(0),
        ]).start();
    };

    if (!copy) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const ready = canDelete(copy, consented);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title={DELETE_TITLE} onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: 28,
                    gap: 13,
                }}
            >
                <Text style={{
                    color: c.rd,
                    fontSize: 13,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: 13 * 0.06,
                }}>
                    {DELETE_WARN}
                </Text>

                <Text style={{
                    color: c.tx,
                    fontSize: 16,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    lineHeight: 16 * 1.45,
                }}>
                    {copy.lead}
                </Text>

                <Group>
                    {copy.lines.map((line, index) => (
                        <ProfileRow
                            key={line.title}
                            first={index === 0}
                            chevron={false}
                            title={line.title}
                            sub={line.detail}
                        />
                    ))}
                </Group>

                {/* Silinmeyen — başlıksız bir satır değil, kendi bloğu. */}
                <View style={{
                    gap: 5,
                    padding: 13,
                    borderWidth: 1,
                    borderColor: c.bd,
                    borderRadius: M.groupRadius,
                    backgroundColor: c.surf,
                }}>
                    <Text style={{
                        color: c.tx3,
                        fontSize: M.groupHead,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: M.groupHead * M.groupHeadTrack,
                    }}>
                        {upperTR(DELETE_KEPT_LABEL)}
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: M.rowValue,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: M.rowValue * 1.45,
                    }}>
                        {copy.kept}
                    </Text>
                </View>

                <AmberNote label={DELETE_TIMING_LABEL} text={copy.timing} />

                {/* Onay kutusu YALNIZ tek müdürde: yıkım o zaman işletmeyi
                    kapsıyor. Kutu "hesabımı siliyorum" demiyor. */}
                {copy.consent ? (
                    <Checkbox
                        checked={consented}
                        label={copy.consent}
                        shake={shake}
                        onToggle={() => setConsented(!consented)}
                    />
                ) : null}

                {failed ? (
                    <Text style={{
                        color: c.rd,
                        fontSize: M.rowValue,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: M.rowValue * 1.45,
                    }}>
                        {DELETE_FAILED}
                    </Text>
                ) : null}

                <HoldToDelete
                    label={copy.action}
                    enabled={ready}
                    busy={busy}
                    onBlocked={blocked}
                    onFire={() => {
                        setBusy(true);
                        setFailed(false);
                        void deleteAccount().then((result) => {
                            setBusy(false);
                            if (!result.ok) {
                                // Ekran YERİNDE kalır, dolum sıfırlanır,
                                // hata satırı yazılır. "Silindi" yazılmaz.
                                setFailed(true);
                                return;
                            }
                            router.replace('/(auth)/welcome');
                        });
                    }}
                />

                <GhostButton label={copy.cancel} onPress={() => router.back()} />

                <Foot>
                    Silme tamamlandığında oturumunuz kapanır ve bu e-posta ile giriş yapılamaz.
                </Foot>
            </ScrollView>
        </View>
    );
}

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, ScrollView, Text, View } from 'react-native';
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
    DELETE_EXPORT_ACTION,
    DELETE_EXPORT_BODY,
    DELETE_EXPORT_LABEL,
    DELETE_EXPORT_PATH,
    DELETE_KEPT_LABEL,
    DELETE_TIMING_LABEL,
    DELETE_TITLE,
    DELETE_WARN,
    canDelete,
    deleteFailureText,
    deletionCopy,
    type DeleteFailureReason,
    type DeletionCopy,
} from '../../../src/lib/managerProfile';
import { fetchDeletionFacts } from '../../../src/lib/managerSource';
import { DurumUnread } from '../../../src/components/Durum';
import { deleteAccount } from '../../../src/api/accountDeletion';
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
 * CANLI (müdür planı 9. adım). Sayılar sayılıyor (`fetchDeletionFacts`),
 * silme `account-delete`e bu cihazda seçili SALONLA gidiyor. "Hesabınız
 * silindi" yalnız sunucu gerçekten silerse; aksi hâlde ekran yerinde kalır ve
 * sebebi yazar. Sahte onay verilmez.
 *
 * SAHİP OLMAYAN müdür: sunucu silmeyi reddediyor (`forbidden_role`). Ekran
 * bunu basılı tutmadan ÖNCE söylüyor ve düğme çalışmıyor — iki saniye basılı
 * tutturup sonra "yapamazsınız" demek, müdürü boşuna uğraştırmaktı.
 */
export default function ManagerDeleteAccount() {
    const { c, reduceMotion } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    /**
     * Web uygulamasının adresi. Tanımlı değilse dışa aktarma düğmesi hiç
     * çizilmez — uydurma bir adrese götürmek ölü düğmeden kötüdür.
     */
    const appUrl = (process.env.EXPO_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

    const [copy, setCopy] = useState<DeletionCopy | null>(null);
    const [consented, setConsented] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<DeleteFailureReason | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [ownerOnly, setOwnerOnly] = useState(false);
    const [unread, setUnread] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const shake = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let alive = true;
        void Promise.all([authApi.account.get(), fetchDeletionFacts()])
            .then(([account, facts]) => {
                if (!alive) return;
                if (!account.ok) { router.replace('/(auth)/welcome'); return; }
                const { profile } = account.data.session;
                setOrgId(profile.business.id);
                setOwnerOnly(!facts.canDeleteRole);
                setUnread(false);
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
            // Okunamazsa liste UYDURULMUYOR; "okuyamadık" ve tekrar dene.
            .catch(() => { if (alive) setUnread(true); });
        return () => { alive = false; };
    }, [router, attempt]);

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

    if (!copy) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                <View style={{ paddingHorizontal: M.padX - 2 }}>
                    <ProfileNav title={DELETE_TITLE} onBack={() => router.back()} />
                </View>
                {unread ? (
                    <DurumUnread
                        what="Silinecekleri"
                        notMeaning="Silinecek bir şey olmadığı"
                        onRetry={() => { setUnread(false); setAttempt((value) => value + 1); }}
                        style={{ paddingHorizontal: M.padX }}
                    />
                ) : null}
            </View>
        );
    }

    const ready = !ownerOnly && canDelete(copy, consented);

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

                {/*
                  * Silmeden ÖNCE dışa aktarma uyarısı.
                  *
                  * Salon kendi finansal kayıtlarını saklamak zorunda; biz
                  * hepsini siliyoruz. Dışa aktarma masaüstünde zaten var
                  * (Ayarlar → Veri, CSV), cepte ikincisi yazılmadı — yıllık
                  * kayıt indirmek telefonda yapılacak iş değil.
                  *
                  * Adres bilinmiyorsa DÜĞME ÇİZİLMEZ; cümle yine de nereye
                  * bakılacağını söylüyor.
                  */}
                <AmberNote
                    label={DELETE_EXPORT_LABEL}
                    text={DELETE_EXPORT_BODY}
                    action={appUrl ? {
                        label: DELETE_EXPORT_ACTION,
                        onPress: () => { void Linking.openURL(`${appUrl}${DELETE_EXPORT_PATH}`); },
                    } : null}
                />

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

                {ownerOnly ? (
                    <Text style={{
                        color: c.rd,
                        fontSize: M.rowValue,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: M.rowValue * 1.45,
                    }}>
                        {deleteFailureText('forbidden')}
                    </Text>
                ) : null}

                {failed ? (
                    <Text style={{
                        color: c.rd,
                        fontSize: M.rowValue,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: M.rowValue * 1.45,
                    }}>
                        {deleteFailureText(failed)}
                    </Text>
                ) : null}

                <HoldToDelete
                    label={copy.action}
                    enabled={ready}
                    busy={busy}
                    onBlocked={blocked}
                    onFire={() => {
                        setBusy(true);
                        setFailed(null);
                        void deleteAccount(orgId).then((result) => {
                            setBusy(false);
                            if (!result.ok) {
                                // Ekran YERİNDE kalır, dolum sıfırlanır ve
                                // SEBEBİ yazılır. "Silindi" yazılmaz.
                                setFailed(result.reason ?? 'server');
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

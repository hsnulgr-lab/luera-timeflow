import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
    authApi,
    type AuthAccountOverview,
} from '../../src/api/session';
import { accountDeletionItems } from '../../src/lib/authCopy';
import {
    AuthAccountRow,
    AuthActionButton,
    AuthBanner,
    AuthDeleteDialog,
    AuthHeader,
    AuthIdentityBar,
} from '../../src/components/ui';
import { authMetrics, font, useTheme } from '../../src/theme';

function SignOutIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.accountIconSize}
            height={authMetrics.accountIconSize}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M9.5 20H5.6V4h3.9M14 8l4 4-4 4M18 12H9"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

function TrashIcon({ color }: { color: string }) {
    return (
        <Svg
            width={authMetrics.accountIconSize}
            height={authMetrics.accountIconSize}
            viewBox="0 0 24 24"
            fill="none"
        >
            <Path
                d="M4.6 7h14.8M9.4 7V4.6h5.2V7M6.6 7l.9 12.4h9L17.4 7M10.4 10.6v6M13.6 10.6v6"
                stroke={color}
                strokeWidth={authMetrics.iconStroke}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

type DeletePhase = 'closed' | 'confirm' | 'reauth';

export default function AccountScreen() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [account, setAccount] = useState<AuthAccountOverview | null>(null);
    const [busy, setBusy] = useState(false);
    const [deletePhase, setDeletePhase] = useState<DeletePhase>('closed');
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.account.get().then((result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace('/(auth)/welcome');
                return;
            }
            setAccount(result.data);
        });
        return () => { alive = false; };
    }, [router]);

    const deletionItems = useMemo(
        () => accountDeletionItems(account?.businesses.map((business) => business.name) ?? []),
        [account?.businesses],
    );

    if (!account) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const { session, businesses } = account;
    const { profile } = session;
    const isManager = session.actor === 'manager';
    const biometricLabel = session.biometricEnabled ? 'Açık' : 'Kapalı';
    const topBarSubtitle = isManager
        ? `${profile.business.name} · Hesap`
        : `${profile.business.name} · ${profile.title ?? ''}`;

    const closeDelete = () => {
        setDeletePhase('closed');
        setPassword('');
        setPasswordError(false);
    };

    const updateBiometric = async () => {
        if (busy) return;
        setBusy(true);
        const result = await authApi.account.setBiometric(!session.biometricEnabled);
        setBusy(false);
        if (result.ok) {
            setAccount({ ...account, session: result.data });
        }
    };

    const signOut = async () => {
        if (busy) return;
        setBusy(true);
        const result = await authApi.account.signOut();
        if (!result.ok) {
            setBusy(false);
            return;
        }
        router.replace('/(auth)/welcome');
    };

    const requestDeletion = async () => {
        if (busy) return;
        setBusy(true);
        const result = await authApi.account.requestDeletion();
        setBusy(false);
        if (result.ok && result.data.reauthRequired) setDeletePhase('reauth');
    };

    const confirmDeletion = async () => {
        if (busy || !password) return;
        setBusy(true);
        const result = await authApi.account.confirmDeletion(password);
        setBusy(false);
        if (!result.ok) {
            setPasswordError(true);
            return;
        }
        router.replace('/(auth)/welcome');
    };

    return (
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.bg }}>
            <AuthIdentityBar
                title={profile.name}
                subtitle={topBarSubtitle}
                contentGap={authMetrics.accountTopBarGap}
                onBack={() => router.back()}
            />
            <View style={{ flex: 1 }}>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingBottom: Math.max(insets.bottom, authMetrics.accountBottom),
                    }}
                    contentInsetAdjustmentBehavior="never"
                    showsVerticalScrollIndicator={false}
                >
                    <AuthHeader
                        account
                        title={isManager ? 'Hesap' : 'Profil'}
                        body={isManager
                            ? profile.email ?? ''
                            : `${profile.business.name} — ${profile.business.location}`}
                    />

                    <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                        {/*
                          Müdürün şifresi e-posta bağlantısıyla değişir —
                          kurtarma ekranının yaptığı iş bu ve satır artık
                          oraya gidiyor. Personelin PIN satırı DEĞİŞMEDİ:
                          hedefi hâlâ yok, ama o personel modunun işi.
                        */}
                        <AuthAccountRow
                            title={isManager ? 'Şifreyi değiştir' : 'PIN’i değiştir'}
                            onPress={isManager
                                ? () => router.push('/(auth)/manager/recover')
                                : () => undefined}
                        />
                        <AuthAccountRow
                            title="Face ID ile aç"
                            subtitle={biometricLabel}
                            onPress={updateBiometric}
                        />
                        {/* Tek işletmeli müdürde satır ÇİZİLMEZ — pasif değil, yok. */}
                        {isManager && businesses.length > 1 ? (
                            <AuthAccountRow
                                title="İşletme değiştir"
                                subtitle={`${businesses.length} işletme`}
                                onPress={() => router.push('/(auth)/manager/business')}
                            />
                        ) : null}
                    </View>

                    <View style={{
                        paddingTop: authMetrics.accountActionTop,
                        paddingHorizontal: authMetrics.actionsX,
                        gap: authMetrics.accountActionGap,
                    }}>
                        <AuthActionButton
                            kind="secondary"
                            label="Oturumu kapat"
                            disabled={busy}
                            left={<SignOutIcon color={c.tx} />}
                            onPress={signOut}
                        />
                        {!isManager ? (
                            <Text style={{
                                color: c.tx3,
                                fontSize: authMetrics.accountDangerHintSize,
                                lineHeight: authMetrics.accountDangerHintSize
                                    * authMetrics.accountDangerHintLine,
                                fontFamily: font.medium,
                                fontWeight: '500',
                            }}>
                                Çıkarsanız bu telefonu yeniden bağlamak için işletmeden yeni bir kod istemeniz gerekir.
                            </Text>
                        ) : null}
                    </View>

                    <View style={{ flex: 1 }} />

                    {session.actor === 'manager' ? (
                        <View style={{
                            paddingHorizontal: authMetrics.actionsX,
                            gap: authMetrics.actionsGap,
                        }}>
                            <Text style={{
                                color: c.tx3,
                                fontSize: authMetrics.accountDangerHintSize,
                                lineHeight: authMetrics.accountDangerHintSize
                                    * authMetrics.accountDangerHintLine,
                                fontFamily: font.medium,
                                fontWeight: '500',
                            }}>
                                Hesabınızı silmek geri alınamaz.
                            </Text>
                            {/*
                              Müdür 27 · silme kendi ekranında.
                              Eski akış yerel bir "bekleyen silme" kaydı
                              yazıyordu; Apple 5.1.1(v) gerçek silme istiyor
                              ve yerel çıkış saymıyor. Yeni ekran neyin
                              silineceğini sayarak yazıyor ve sonucu sunucuya
                              bağlıyor.
                            */}
                            <AuthActionButton
                                kind="danger"
                                label="Hesabımı sil"
                                left={<TrashIcon color={c.rd} />}
                                onPress={() => router.push('/(manager-flow)/profil/hesap-sil')}
                            />
                        </View>
                    ) : (
                        <AuthBanner>
                            Bilgileriniz işletmenin kaydında tutuluyor. Çıkarılmak isterseniz işletme sahibiyle konuşun.
                        </AuthBanner>
                    )}
                </ScrollView>

                {deletePhase !== 'closed' ? (
                    <AuthDeleteDialog
                        items={deletionItems}
                        reauth={deletePhase === 'reauth'}
                        password={password}
                        passwordError={passwordError}
                        busy={busy}
                        onPasswordChange={(value) => {
                            setPassword(value);
                            setPasswordError(false);
                        }}
                        onConfirm={deletePhase === 'confirm' ? requestDeletion : confirmDeletion}
                        onCancel={closeDelete}
                    />
                ) : null}
            </View>
        </View>
    );
}

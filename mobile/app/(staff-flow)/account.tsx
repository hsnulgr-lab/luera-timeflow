import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
    authApi,
    type AuthAccountOverview,
} from '../../src/api/session';
import { businessLine } from '../../src/lib/accountMap';
import { accountDeletionItems } from '../../src/lib/authCopy';
import {
    AuthAccountRow,
    AuthActionButton,
    AuthBackBar,
    AuthBanner,
    AuthDeleteDialog,
    AuthHeader,
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
        // Personelde telefon bağlı kalır (099): sonraki giriş yalnız şifre.
        router.replace(isManager ? '/(auth)/welcome' : '/(auth)/staff/pin');
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
            {/*
              * KİMLİK BANDI KALDIRILDI.
              *
              * Bant kişinin adını ve altında e-postasını yazıyordu; hemen
              * altındaki başlık da aynı iki şeyi söylüyordu. Aynı ekranda iki
              * kez yazılan bir bilgi, ikinci kez hiçbir şey anlatmıyor — yalnız
              * 64 pt yer kaplıyor ve sayfanın asıl başlığını aşağı itiyordu.
              *
              * Girişteki kullanımları DURUYOR (`staff/pin`, `staff/who`): orada
              * bant gerçekten bilgi taşıyor — hangi salona bağlandığını
              * söylüyor ve o bilgi ekranda başka yerde yok.
              */}
            <AuthBackBar onPress={() => router.back()} />
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
                            : businessLine(profile.business, ' — ')}
                    />

                    <View style={{ borderTopWidth: 1, borderTopColor: c.bd }}>
                        {/*
                          İKİ ROL DE TELEFONDAN, E-POSTASIZ değiştiriyor.
                          Müdür eskiden kurtarma ekranına gidiyordu (e-posta
                          bağlantısı) — sunucuda SMTP yok, bağlantı hiç
                          gitmiyordu (2026-09-25). Oturumu açık kişiye e-posta
                          gerekmiyor: `profil/sifre` şu anki şifreyi sorup
                          yenisini yazıyor. Personelin şifresi (099)
                          `pin.change` ile.
                        */}
                        <AuthAccountRow
                            title="Şifreyi değiştir"
                            // İki adres ayrı `router.push`: rota testi yalnız
                            // doğrudan yazılmış adresi "gidiliyor" sayıyor.
                            onPress={() => (isManager
                                ? router.push('/(manager-flow)/profil/sifre')
                                : router.push('/(staff-flow)/sifre'))}
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
                                Telefon işletmeye bağlı kalır; sonraki girişte yalnız şifreniz sorulur.
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

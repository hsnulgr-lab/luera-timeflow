import { useEffect, useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authApi, type SignupSector } from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBackBar,
    AuthBanner,
    AuthField,
    AuthHeader,
    AuthPage,
    AuthSectorOption,
    AuthStepIndicator,
} from '../../../src/components/ui';
import { authMetrics, font, type, useTheme } from '../../../src/theme';
import { upperTR } from '../../../src/lib/text';

type SignupBusinessStage = 'name' | 'sector';

export default function SignupBusiness() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const nameRef = useRef<TextInput>(null);
    const [stage, setStage] = useState<SignupBusinessStage>('name');
    const [name, setName] = useState('');
    const [sectors, setSectors] = useState<SignupSector[]>([]);
    const [selectedSector, setSelectedSector] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        Promise.all([authApi.signup.draft(), authApi.signup.sectors()])
            .then(([draftResult, sectorChoices]) => {
                if (!alive) return;
                if (!draftResult.ok) {
                    router.replace('/(auth)/signup/account');
                    return;
                }
                const draft = draftResult.data;
                setName(draft.businessName ?? '');
                setSelectedSector(draft.sector ?? null);
                setSectors(sectorChoices);
                setStage(draft.businessName ? 'sector' : 'name');
                setLoading(false);
            });
        return () => { alive = false; };
    }, [router]);

    const saveName = async () => {
        const normalizedName = name.trim();
        if (!normalizedName || busy) return false;
        setBusy(true);
        const result = await authApi.signup.business(normalizedName);
        setBusy(false);
        if (!result.ok) {
            setError('İşletme adı kaydedilemedi. Yeniden deneyin.');
            return false;
        }
        setName(result.data.businessName);
        setError(null);
        return true;
    };

    const openSectorStage = async () => {
        if (!await saveName()) return;
        Keyboard.dismiss();
        setStage('sector');
    };

    const chooseSector = async (sectorId: string) => {
        if (busy) return;
        setSelectedSector(sectorId);
        setError(null);
        if (stage === 'name') {
            if (!await saveName()) return;
            const result = await authApi.signup.sector(sectorId);
            if (!result.ok) {
                setError('Sektör kaydedilemedi. Yeniden deneyin.');
                return;
            }
            Keyboard.dismiss();
            setStage('sector');
        }
    };

    const finishBusiness = async () => {
        if (!selectedSector || busy) return;
        setBusy(true);
        const sectorResult = await authApi.signup.sector(selectedSector);
        if (!sectorResult.ok) {
            setBusy(false);
            setError('Sektör kaydedilemedi. Yeniden deneyin.');
            return;
        }
        const sessionResult = await authApi.signup.complete();
        setBusy(false);
        if (!sessionResult.ok) {
            setError('Kurulum tamamlanamadı. Yeniden deneyin.');
            return;
        }
        router.replace('/(auth)/signup/ready');
    };

    const goBack = () => {
        if (stage === 'sector') {
            setStage('name');
            requestAnimationFrame(() => nameRef.current?.focus());
            return;
        }
        router.back();
    };

    if (loading) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const sectorStage = stage === 'sector';
    return (
        <AuthPage contentStyle={{
            paddingBottom: sectorStage
                ? Math.max(insets.bottom, authMetrics.noSafeAreaBottom)
                : 0,
        }}>
            <AuthBackBar onPress={goBack} />
            <AuthStepIndicator step={2} />
            <AuthHeader
                signup
                compact={sectorStage}
                title={sectorStage ? name : 'İşletmeniz'}
                body={sectorStage
                    ? 'Ne iş yapıyorsunuz? Hizmet listesi, süreler ve kayıt alanları buna göre kurulur.'
                    : 'Adı müşterilere gönderilen hatırlatmalarda görünür.'}
            />

            <View style={{
                paddingHorizontal: small ? authMetrics.smallFormX : authMetrics.formX,
                gap: small ? authMetrics.smallFormGap : authMetrics.formGap,
            }}>
                {!sectorStage ? (
                    <AuthField
                        ref={nameRef}
                        autoFocus
                        label="İşletme adı"
                        value={name}
                        onChangeText={(value) => { setName(value); setError(null); }}
                        autoCapitalize="words"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={openSectorStage}
                    />
                ) : null}

                <View style={{ gap: authMetrics.fieldGap }}>
                    {!sectorStage ? (
                        <Text style={{
                            color: c.tx2,
                            fontSize: type.tiny.fontSize,
                            fontFamily: font.bold,
                            fontWeight: '700',
                            letterSpacing: type.tiny.fontSize * 0.1,
                        }}>
                            {upperTR('Ne iş yapıyorsunuz?')}
                        </Text>
                    ) : null}
                    <View style={{ gap: authMetrics.sectorGap }}>
                        {sectors.map((sector) => (
                            <AuthSectorOption
                                key={sector.id}
                                label={sector.label}
                                selected={selectedSector === sector.id}
                                disabled={busy}
                                onPress={() => { void chooseSector(sector.id); }}
                            />
                        ))}
                    </View>
                </View>

                {error ? <AuthBanner kind="error" inset={false}>{error}</AuthBanner> : null}
            </View>

            <View style={{ flex: 1 }} />
            {sectorStage ? (
                <View style={{
                    paddingHorizontal: authMetrics.actionsX,
                    gap: authMetrics.actionsGap,
                }}>
                    <Text style={{
                        color: c.tx3,
                        textAlign: 'center',
                        fontSize: authMetrics.sectorNoteSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        Sonradan değiştirebilirsiniz.
                    </Text>
                    <AuthActionButton
                        label="Devam"
                        disabled={!selectedSector || busy}
                        onPress={finishBusiness}
                    />
                </View>
            ) : null}
        </AuthPage>
    );
}

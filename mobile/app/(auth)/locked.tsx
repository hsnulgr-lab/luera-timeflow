import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';

import { enterShell } from '../../src/lib/enterShell';

import { authApi, type AuthSession } from '../../src/api/session';
import {
    AuthActionButton,
    AuthBanner,
    AuthDetailList,
    AuthNoteCard,
    AuthRefreshIcon,
    AuthStatusScreen,
} from '../../src/components/ui';
import { subscriptionLocked } from '../../src/lib/authCopy';
import { onAccent, useTheme } from '../../src/theme';

interface OwnerContact {
    name: string;
    title: string;
    phone: string;
}

/**
 * Giriş 15d / 15e — abonelik bitmiş.
 *
 * Ayrı bir rota, çünkü buradan ileri gidilemez: kimlik doğruydu, oturum açıldı,
 * kapıyı indiren abonelik. Dört farklı yerden (müdür işletme seçimi, tek
 * işletmeli müdür girişi, personel PIN'i, dönüş girişi) buraya gelinir.
 *
 * İki varyantın farkı sorumluluk: müdür yenileyebilir, personel yenileyemez.
 * Personele fiyat, plan ve ödeme gösterilmez — yapamayacağı iş teklif edilmez.
 * Müdüre de gösterilmez, ama sebebi başka: abonelik uygulama dışında satılıyor
 * ve App Store kuralı 3.1.1 uygulama içinden satın almaya yönlendirmeye izin
 * vermiyor.
 */
export default function SubscriptionLocked() {
    const router = useRouter();
    const { c } = useTheme();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [owner, setOwner] = useState<OwnerContact | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        authApi.subscription.locked().then((result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace('/(auth)/welcome');
                return;
            }
            setSession(result.data.session);
            setOwner(result.data.owner);
        });
        return () => { alive = false; };
    }, [router]);

    // "Yeniledim, tekrar dene": abonelik dışarıda yenilendiyse oturum zaten
    // duruyor, tek yapılacak kapıyı bir daha yoklamak.
    const retry = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        const result = await authApi.resume.get();
        setBusy(false);
        if (result.ok) enterShell(result.data.actor);
        // `enterShell` yönlendiriciyi modülden alıyor; bağımlılık kalmadı.
    }, [busy]);

    const signOut = useCallback(async () => {
        await authApi.resume.signOut();
        router.replace('/(auth)/welcome');
    }, [router]);

    if (!session || !owner) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const { profile } = session;

    if (session.actor === 'manager') {
        const copy = subscriptionLocked.manager;
        return (
            <AuthStatusScreen
                tone="amber"
                icon="lock"
                align="top"
                identity={{ title: profile.business.name, subtitle: profile.name }}
                title={copy.title}
                body={copy.body}
                extra={(
                    <>
                        <AuthNoteCard label={copy.cardLabel} body={copy.cardBody} />
                        <AuthBanner inset={false}>{copy.retention}</AuthBanner>
                    </>
                )}
            >
                <AuthActionButton
                    kind="secondary"
                    label={copy.retry}
                    disabled={busy}
                    onPress={retry}
                    left={<AuthRefreshIcon color={c.tx} />}
                />
                <AuthActionButton kind="ghost" label={copy.signOut} onPress={signOut} />
            </AuthStatusScreen>
        );
    }

    const copy = subscriptionLocked.staff;
    return (
        <AuthStatusScreen
            tone="amber"
            icon="lock"
            identity={{
                title: `${profile.name.split(' ')[0]} · ${profile.title ?? ''}`.trim(),
                subtitle: `${profile.business.name} — ${profile.business.location}`,
            }}
            title={copy.title}
            body={copy.body}
            detail={(
                <AuthDetailList rows={[{
                    title: owner.name,
                    subtitle: owner.title,
                    status: copy.ownerStatus,
                }]} />
            )}
        >
            <AuthActionButton
                kind="secondary"
                label={copy.call}
                onPress={() => { void Linking.openURL(`tel:${owner.phone}`); }}
            />
            <AuthActionButton kind="ghost" label={copy.retry} disabled={busy} onPress={retry} />
        </AuthStatusScreen>
    );
}

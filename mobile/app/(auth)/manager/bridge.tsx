import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { authApi, type SocialBridge } from '../../../src/api/session';
import { AuthPage } from '../../../src/components/ui';
import {
    AuthAccountPlate,
    AuthBand,
    AuthV4Button,
    AuthV4Note,
    AuthV4Title,
} from '../../../src/components/AuthSocial';
import { bridgeCopy } from '../../../src/lib/authCopy';
import { ssoMetrics as S, useTheme } from '../../../src/theme';

/**
 * Giriş v4 · B5 — köprü: "Bu hesapla bir işletme bulamadık".
 *
 * Kişi GİRİŞTEN Apple ya da Google ile geldi ve bu hesapla açılmış işletme
 * yok (karar 6). Boş işletme sessizce AÇILMIYOR — çoğu zaman kişinin işletmesi
 * vardır ama başka bir adresle (Apple'ın "E-postamı gizle"si) açılmıştır.
 * Ekran sorar:
 *
 *   Yeni işletme oluştur → K akışının 2/3'ü (hesap açık, kod yok).
 *   E-postayla giriş yap → B1. Arkadaki boş hesap kişiye anlatılmadan
 *                          bırakılır; işletmesiz hesabı sunucu 24 saat sonra
 *                          siler (karar 3).
 *
 * Geri oku YOK: iki çıkış zaten iki düğme. Kaydırarak geri dönmek "E-postayla
 * giriş yap" ile aynı işi yapar — oturum kapanır.
 *
 * Gelen adres gösteriliyor: Apple'ın gizli adresini gören kişi notu okumadan
 * da neden bulunamadığını anlıyor. Not yalnız Apple'da; Google adresi
 * değiştirmiyor.
 */
export default function SocialBridgeScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const { c } = useTheme();
    const [account, setAccount] = useState<SocialBridge | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    // "Yeni işletme oluştur" ileri gidiyor; o çıkışta oturum KAPANMAZ.
    const forward = useRef(false);

    useEffect(() => {
        let alive = true;
        authApi.social.bridge().then((result) => {
            if (!alive) return;
            if (!result.ok) {
                router.replace('/(auth)/manager/sign-in');
                return;
            }
            setAccount(result.data);
        });
        return () => { alive = false; };
    }, [router]);

    useEffect(() => navigation.addListener('beforeRemove', () => {
        if (!forward.current) void authApi.social.leave();
    }), [navigation]);

    const create = async () => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        const result = await authApi.social.createBusiness();
        if (!result.ok) {
            setBusy(false);
            setFailed(true);
            return;
        }
        forward.current = true;
        router.replace('/(auth)/signup/business');
    };

    const emailInstead = () => {
        if (router.canGoBack()) router.back();
        else {
            void authApi.social.leave();
            forward.current = true;
            router.replace('/(auth)/manager/sign-in');
        }
    };

    if (!account) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    return (
        <AuthPage>
            <View style={{ height: S.bridgeTop }} />
            <AuthV4Title title={bridgeCopy.title} body={bridgeCopy.body(account.provider)} />
            <View style={{ paddingHorizontal: S.formX, gap: S.formGap }}>
                <AuthAccountPlate label={bridgeCopy.account(account.provider)} email={account.email} />
                {account.provider === 'apple' ? <AuthV4Note>{bridgeCopy.appleNote}</AuthV4Note> : null}
                {failed ? <AuthBand>{bridgeCopy.failed}</AuthBand> : null}
            </View>
            <View style={{ flex: 1 }} />
            <View style={{
                paddingHorizontal: S.formX,
                paddingBottom: S.actsBottom,
                gap: S.actsGap,
            }}>
                <AuthV4Button label={bridgeCopy.create} busy={busy} onPress={() => { void create(); }} />
                <AuthV4Button glass label={bridgeCopy.email} disabled={busy} onPress={emailInstead} />
            </View>
        </AuthPage>
    );
}

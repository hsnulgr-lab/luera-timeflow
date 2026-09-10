import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AuthSessionErrorScreen } from '../src/components/ui';
import { authApi, type LaunchState } from '../src/api/session';
import { useTheme } from '../src/theme';

/**
 * Uygulamanın İLK ekranı — kimin nereye gideceğine karar veriyor.
 *
 * Okuma başarısız olursa ne yapılacağı burada kritik: eskiden `.catch` yoktu
 * ve `launch` sonsuza kadar `null` kalıyordu. Sonuç, uygulamanın ilk
 * ekranında KALICI BOŞ ZEMİN — kullanıcı için "açılmıyor" demek.
 *
 * Sessizce `welcome`a düşmek de doğru değil: geçici bir okuma hatası yüzünden
 * geçerli bir oturumu olan kişiyi yeniden giriş yapmaya zorlardı. Onun yerine
 * hata GÖRÜNÜR ve tekrar denenebilir — rol kapısıyla aynı ekran, aynı arıza
 * (`src/lib/roleGate.ts`).
 */
export default function Index() {
    const { c } = useTheme();
    const [launch, setLaunch] = useState<LaunchState | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let alive = true;
        authApi.getLaunchState().then((next) => {
            if (alive) setLaunch(next);
        }).catch(() => {
            if (alive) setFailed(true);
        });
        return () => { alive = false; };
    }, [attempt]);

    if (failed) {
        // Sıfırlama efektte değil burada — bkz. `roleGate.ts` · retry.
        return (
            <AuthSessionErrorScreen
                onRetry={() => { setFailed(false); setAttempt((n) => n + 1); }}
            />
        );
    }
    if (!launch) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
    if (launch.target === 'resume') return <Redirect href="/(auth)/resume" />;
    if (launch.target === 'staffRoster') return <Redirect href="/(auth)/staff/who" />;
    return <Redirect href="/(auth)/welcome" />;
}

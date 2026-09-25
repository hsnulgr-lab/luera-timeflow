import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AuthSessionErrorScreen } from '../src/components/ui';
import { authApi, type LaunchState } from '../src/api/session';
import { dropSplashHandoff } from '../src/lib/splashHandoff';
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
const LAUNCH_TIMEOUT_MS = 5000;

export default function Index() {
    const { c } = useTheme();
    const [launch, setLaunch] = useState<LaunchState | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let alive = true;
        // 5 sn'de okuma bırakılıyor: sistem karesinin arkasında sonsuza kadar
        // beklemek, uygulamanın "açılmıyor" olması demek. Sessizce karşılamaya
        // düşülmüyor — hata ekranı tekrar denemeyi sunuyor.
        const timer = setTimeout(() => { if (alive) setFailed(true); }, LAUNCH_TIMEOUT_MS);
        authApi.getLaunchState().then((next) => {
            clearTimeout(timer);
            if (alive) setLaunch(next);
        }).catch((err) => {
            clearTimeout(timer);
            /*
             * SESSİZ YUTMAK PAHALIYA MAL OLDU (2026-09-25).
             *
             * Burada boş bir `catch` vardı. Üretim paketinde açılışı tamamen
             * kıran bir hata (dinamik `import()` — RN'de `location` yok)
             * yalnızca "Oturum bilgisi okunamadı" ekranı olarak görünüyordu;
             * SEBEBİ hiçbir yere yazılmadığı için `--no-dev` ile elle
             * kazılana kadar bulunamadı. Aynı hata App Store derlemesinde de
             * olurdu.
             *
             * Sentry yok (bilinen borç). En azından konsola düşsün: bir daha
             * aynı körlükte kalmayalım.
             */
            console.error('[açılış] getLaunchState başarısız:', err);
            if (alive) setFailed(true);
        });
        return () => { alive = false; clearTimeout(timer); };
    }, [attempt]);

    // Karşılama DIŞINDAKİ her yol sistem karesini doğrudan kaldırıyor;
    // karşılama ise onu devralıp hapı açıyor (`splashHandoff.ts`).
    useEffect(() => {
        if (failed || (launch && launch.target !== 'welcome')) dropSplashHandoff();
    }, [failed, launch]);

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
    // Telefon bağlı ve kim olduğu biliniyor: yalnız şifre (099).
    if (launch.target === 'staffPin') return <Redirect href="/(auth)/staff/pin" />;
    // Müdürün oturumu duruyor, profil kaydı yok: salon ekranı onu oturumdan
    // kurar. Şifre yeniden sorulmaz.
    if (launch.target === 'managerBusiness') return <Redirect href="/(auth)/manager/business" />;
    return <Redirect href="/(auth)/welcome" />;
}

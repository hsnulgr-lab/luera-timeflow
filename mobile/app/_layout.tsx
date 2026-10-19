/*
 * `URL` YAMASI — Supabase'in React Native kurulumunun ilk adımı.
 *
 * Paket kuruluydu ama hiçbir yerden içe aktarılmıyordu; REST çağrıları
 * yamasız da çalıştığı için bu bugüne kadar görünmedi. Realtime websocket'i
 * adresi `URL` ile kuruyor ve RN'in kendi `URL`i eksik: yamayı unutmak,
 * kanalın telefonda SESSİZCE bağlanmaması demek. En üstte, çünkü yamanın her
 * şeyden önce yüklenmesi gerekiyor.
 */
import 'react-native-url-polyfill/auto';
// Sistem açılış karesi yazı tipleri ve oturum okunurken yerinde kalsın.
import '../src/lib/splashHandoff';
/*
 * Bildirim işleyicisi ve Android kanalı (103). Burada, çünkü uygulama
 * AÇIKKEN gelen ilk bildirim işleyici kurulmadan düşerse sessizce yutulur.
 */
import '../src/lib/pushSetup';

import {
    HankenGrotesk_200ExtraLight,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    HankenGrotesk_900Black,
    useFonts,
} from '@expo-google-fonts/hanken-grotesk';
// Giriş v4 · Google düğmesi — Google'ın kuralı Google Sans Medium. Yalnız
// bu ağırlık (alt yol): paketin kökü sekiz dosyanın hepsini pakete koyardı.
import { GoogleSans_500Medium } from '@expo-google-fonts/google-sans/500Medium';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthCrashScreen } from '../src/components/ui';
import { LoginNoticeHost } from '../src/components/LoginNotice';
import { useBackgroundSync } from '../src/lib/backgroundSync';
import { dropSplashHandoff } from '../src/lib/splashHandoff';
import { ThemeProvider, useTheme } from '../src/theme';

/**
 * KÖK ÇÖKME AĞI — App Store 2.1.
 *
 * Bu olmadan yakalanmamış bir çizim hatası üretim derlemesinde uygulamayı
 * KAPATIR: geliştirmedeki kırmızı ekran mağazada yok. Hakemin gördüğü çökme
 * en sık ret sebebi; bu ekran onu "Tekrar dene"ye çeviriyor.
 *
 * `RootLayout`un YERİNE çiziliyor, yani onun sağlayıcıları bunu SARMIYOR —
 * tema ve güvenli alan burada yeniden kuruluyor. Sağlayıcısız `useTheme`
 * varsayılan açık temaya düşerdi ve koyu modda kullanıcı bembeyaz bir
 * ekranla karşılaşırdı.
 *
 * Sistem açılış karesi burada HEMEN kalkıyor: hata açılışta olduysa kare
 * 6 saniyelik emniyete kadar hata ekranının önünde dururdu.
 *
 * Yalnız ÇİZİM hatalarını yakalar. Olay işleyicisindeki ve `await`teki
 * hatalar sınırlara ulaşmaz; onlar kendi `catch`lerinde ele alınıyor.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
    useEffect(() => {
        dropSplashHandoff();
        console.error('[kök hata sınırı]', error);
    }, [error]);
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <AuthCrashScreen onRetry={() => { void retry(); }} />
            </ThemeProvider>
        </SafeAreaProvider>
    );
}

// Kök kabuk. Tema ve güvenli alan burada; rota grupları altta.

/**
 * Randevu kartının alt sayfaları (Hizmeti değiştir, Notu düzenle) — Kasa'nın
 * sayfalarıyla aynı: iOS'un sayfası, boyu içerik kadar, aşağı çekince kapanır.
 */
const APPT_SHEET = {
    presentation: 'formSheet',
    sheetAllowedDetents: 'fitToContents',
    sheetGrabberVisible: false,
} as const;

/** Kasa'nın sayfaları: iOS'un sayfası, boyu içerik kadar. */
const CASH_SHEET = {
    presentation: 'formSheet',
    sheetAllowedDetents: 'fitToContents',
    sheetGrabberVisible: false,
} as const;

function Shell() {
    const { c, dark } = useTheme();
    // Kuyruğun boşalması ve token'ın tazelenmesi. Kök kabukta çünkü ekran
    // değil UYGULAMA seviyesinde bir iş: hangi sayfada olunduğu fark etmiyor.
    useBackgroundSync();
    return (
        <>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: c.bg },
                    // Cam kabuk kendi ekranında; yığın başlığı kullanılmıyor.
                }}
            >
                {/* ÜÇ KABUK DA GERİ KAYDIRMAZ. Kabuk bir sayfa değil,
                    uygulamanın kendisi: arkasında geri dönülecek yer yok.
                    Jest açıkken müdür profilinden sağa kaydırınca alttan
                    personel profili çıkıyordu — telefonda görüldü.
                    Geçmişin kendisi `src/lib/enterShell.ts` ile siliniyor;
                    bu satır jestin kalıntı bir girdiyi bulmasını da kapatıyor.
                    Tek kişilik kabuk (108) listeye sonradan girdi: ekibe
                    geçişte (113) kabuk değişiyor ve geride kalan bir tek
                    kişilik girdi kaydırmayla geri gelmemeli. */}
                <Stack.Screen name="mudur" options={{ gestureEnabled: false }} />
                <Stack.Screen name="personel" options={{ gestureEnabled: false }} />
                <Stack.Screen name="tek" options={{ gestureEnabled: false }} />

                {/* Personel 06 — kumanda YATAY JESTİ KAPATIYOR. "Kaydır ve
                    başlat" tutamağı çubuğun solunda, ekranın geri-kaydırma
                    şeridinin (~30 pt) içinde duruyor: parmak sağa gittiğinde
                    yerli jest kazanıyor ve sayfa geri çıkıyordu. Simülatörde
                    farede görünmüyor, telefonda her seferinde oluyor.
                    Geri yolu KAPANMIYOR — başlıktaki "‹ Bugün" düğmesi duruyor;
                    kapanan yalnız kazayla tetiklenen jest. */}
                <Stack.Screen name="(staff-flow)/kumanda" options={{ gestureEnabled: false }} />

                {/* Müdür 25 — randevu kartı ALTTAN gelir: tasarım onu bir
                    sayfa değil, arkası duran bir yüzey olarak çiziyor ve
                    üstündeki tutamak ancak öyle anlam taşıyor. */}
                <Stack.Screen name="(manager-flow)/randevu/[id]" options={{ presentation: 'modal' }} />
                {/* Kartın alt sayfaları kartın ÜSTÜNDE açılıyor (2026-10-13):
                    Kasa'nınkiler gibi içerik boyunda, aşağı çekince kapanır.
                    Verisi kartta: `src/state/apptSheet.ts`. */}
                <Stack.Screen name="(manager-flow)/randevu/hizmet" options={APPT_SHEET} />
                <Stack.Screen name="(manager-flow)/randevu/not" options={APPT_SHEET} />

                {/* Kasa'nın üç sayfası — randevu kartının kabuğu, ama boyu
                    İÇERİK KADAR (2026-10-13, kullanıcı: "tahsilata göre zaten
                    uzar kısalır"). Aşağı çekip kapatmayı iOS yapıyor; tutamak
                    sayfanın kendi `SheetGrab`ı, sistemin çubuğu kapalı.
                    Verisi Kasa ekranında: `src/state/cashSheet.ts`. */}
                <Stack.Screen name="(manager-flow)/kasa/hareket" options={CASH_SHEET} />
                <Stack.Screen name="(manager-flow)/kasa/ozet" options={CASH_SHEET} />
                <Stack.Screen name="(manager-flow)/kasa/bekleyen" options={CASH_SHEET} />

                {/* Müdür 24 — personel günü YATAY KAYMAZ: tasarım sayfanın
                    şeritteki halkadan doğduğunu söylüyor. Yığının kendi
                    kaydırma animasyonu o büyümeyi tamamen örterdi; ekran
                    anında gelir, hareketi kendi içindeki halka yapar. */}
                <Stack.Screen name="(manager-flow)/personel/[id]" options={{ animation: 'none' }} />

                {/* Müdür 27 — profil alt ekranları. Yığın içi itme: giren
                    ekran yandan gelir, çıkan hafifçe geri çekilir. Paylaşımlı
                    öge geçişi yok; kütüphanesi projede bulunmuyor. */}
                <Stack.Screen name="(manager-flow)/profil/saatler" />
                <Stack.Screen name="(manager-flow)/profil/hizmetler" />
                {/* 1.0.1 — Paketler'in alt ekranı: satışta seçilen türler. */}
                <Stack.Screen name="(manager-flow)/profil/paket-turleri" />
                <Stack.Screen name="(ortak)/profil/gorunum" />
                <Stack.Screen name="(manager-flow)/profil/bildirimler" />
                <Stack.Screen name="(ortak)/profil/yasal" />
                <Stack.Screen name="(manager-flow)/profil/hesap-sil" />
                {/* Müdürün şifresi — telefondan, e-postasız (2026-09-25). */}
                <Stack.Screen name="(manager-flow)/profil/sifre" />
                {/* 099 — personelin telefonu: ekip kodu ve şifre. */}
                <Stack.Screen name="(manager-flow)/profil/personel" />
                {/* Telefondan personel ekle — masaüstünün satırının aynısı (2026-10-13). */}
                <Stack.Screen name="(manager-flow)/profil/personel-ekle" />
                {/* 113 · v4 P2 — tek kişilik işletmenin ekibe geçiş kapısı. */}
                <Stack.Screen name="(manager-flow)/profil/ekip-ekle" />
                {/* 115 — öbür yönü: ekipte yalnız sahip kalınca tek kişiliğe dönüş. */}
                <Stack.Screen name="(manager-flow)/profil/tek-kisilige-don" />
                <Stack.Screen name="(staff-flow)/sifre" />
            </Stack>
        </>
    );
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        // 200: Personel 09'un ad muamelesi — ince ad + kalın soyad.
        HankenGrotesk_200ExtraLight,
        HankenGrotesk_400Regular,
        HankenGrotesk_500Medium,
        HankenGrotesk_600SemiBold,
        HankenGrotesk_700Bold,
        HankenGrotesk_800ExtraBold,
        HankenGrotesk_900Black,
        GoogleSans_500Medium,
    });
    if (!fontsLoaded) return null;
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                {/* Müdür günü artık KÖKTE DEĞİL — bkz. `app/mudur/_layout.tsx`.
                    Canlı okuma burada dursaydı personel telefonu da müdür
                    sorgusu atardı. */}
                <Shell />
                {/* Giriş v4 · K4 — kayıttan gelip zaten hesabı olana içeride not. */}
                <LoginNoticeHost />
            </ThemeProvider>
        </SafeAreaProvider>
    );
}

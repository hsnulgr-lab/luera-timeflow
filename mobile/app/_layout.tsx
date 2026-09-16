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
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useBackgroundSync } from '../src/lib/backgroundSync';
import { ThemeProvider, useTheme } from '../src/theme';

// Kök kabuk. Tema ve güvenli alan burada; rota grupları altta.

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
                {/* İKİ KABUK DA GERİ KAYDIRMAZ. Kabuk bir sayfa değil,
                    uygulamanın kendisi: arkasında geri dönülecek yer yok.
                    Jest açıkken müdür profilinden sağa kaydırınca alttan
                    personel profili çıkıyordu — telefonda görüldü.
                    Geçmişin kendisi `src/lib/enterShell.ts` ile siliniyor;
                    bu satır jestin kalıntı bir girdiyi bulmasını da kapatıyor. */}
                <Stack.Screen name="mudur" options={{ gestureEnabled: false }} />
                <Stack.Screen name="personel" options={{ gestureEnabled: false }} />

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
                <Stack.Screen name="(ortak)/profil/gorunum" />
                <Stack.Screen name="(manager-flow)/profil/bildirimler" />
                <Stack.Screen name="(ortak)/profil/yasal" />
                <Stack.Screen name="(manager-flow)/profil/hesap-sil" />
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
    });
    if (!fontsLoaded) return null;
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                {/* Müdür günü artık KÖKTE DEĞİL — bkz. `app/mudur/_layout.tsx`.
                    Canlı okuma burada dursaydı personel telefonu da müdür
                    sorgusu atardı. */}
                <Shell />
            </ThemeProvider>
        </SafeAreaProvider>
    );
}

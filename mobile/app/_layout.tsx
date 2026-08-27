import {
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
import { ManagerDayProvider } from '../src/state/managerDay';
import { ThemeProvider, useTheme } from '../src/theme';

// Kök kabuk. Tema ve güvenli alan burada; rota grupları altta.

function Shell() {
    const { c, dark } = useTheme();
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
                <Stack.Screen name="(manager-flow)/profil/gorunum" />
                <Stack.Screen name="(manager-flow)/profil/bildirimler" />
                <Stack.Screen name="(manager-flow)/profil/yasal" />
                <Stack.Screen name="(manager-flow)/profil/hesap-sil" />
            </Stack>
        </>
    );
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
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
                {/* Müdür günü KÖKTE: randevu oluşturma sekmelerin dışında
                    yaşıyor ve kurduğu randevunun akışa düşmesi gerekiyor. */}
                <ManagerDayProvider>
                    <Shell />
                </ManagerDayProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
            />
        </>
    );
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <Shell />
            </ThemeProvider>
        </SafeAreaProvider>
    );
}

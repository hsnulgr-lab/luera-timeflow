import { Stack } from 'expo-router';
import { authMotion, useTheme } from '../../src/theme';

/** Giriş akışının hareket sözleşmesi 03: ileri itme, azaltılmışta saf solma. */
export default function AuthLayout() {
    const { c, reduceMotion, prefersCrossFade } = useTheme();
    const crossFade = reduceMotion || prefersCrossFade;
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: c.bg },
                animation: crossFade ? 'fade' : 'simple_push',
                animationDuration: crossFade
                    ? authMotion.screenReduced
                    : authMotion.screenForward,
                gestureEnabled: true,
            }}
        />
    );
}

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GlassView } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '../../src/lib/feedback';
import { numeric, useTheme } from '../../src/theme';

const DIGITS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'backspace'],
] as const;

const param = (value: string | string[] | undefined, fallback: string) =>
    typeof value === 'string' && value ? value : fallback;

function BackChevron() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 11,
            height: 11,
            borderLeftWidth: 1.8,
            borderBottomWidth: 1.8,
            borderColor: c.tx,
            transform: [{ rotate: '45deg' }],
            marginLeft: 4,
        }} />
    );
}

function TopBar({ name, role, onBack }: { name: string; role: string; onBack: () => void }) {
    const { c, glass } = useTheme();
    const barStyle: ViewStyle = {
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: c.glassBorder,
    };

    const content = (
        <>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                onPress={onBack}
                hitSlop={6}
                style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    marginLeft: -12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.55 : 1,
                })}
            >
                <BackChevron />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: 16,
                    fontWeight: '800',
                    letterSpacing: -0.32,
                }}>
                    {name}
                </Text>
                <Text numberOfLines={1} style={{
                    color: c.tx2,
                    fontSize: 11.5,
                    fontWeight: '600',
                }}>
                    {role}
                </Text>
            </View>
        </>
    );

    if (glass) {
        return (
            <GlassView glassEffectStyle="regular" tintColor={c.tint} style={barStyle}>
                {content}
            </GlassView>
        );
    }

    return <View style={[barStyle, { backgroundColor: c.surf }]}>{content}</View>;
}

function PinDot({ filled, error }: { filled: boolean; error: boolean }) {
    const { c, reduceMotion } = useTheme();
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!filled || reduceMotion) {
            pulse.setValue(1);
            return;
        }
        pulse.setValue(0.72);
        Animated.spring(pulse, {
            toValue: 1,
            damping: 13,
            stiffness: 320,
            mass: 0.55,
            useNativeDriver: true,
        }).start();
    }, [filled, pulse, reduceMotion]);

    return (
        <Animated.View style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 1.7,
            borderColor: error ? c.rd : filled ? c.tx : c.bd2,
            backgroundColor: filled ? c.tx : 'transparent',
            transform: [{ scale: pulse }],
        }} />
    );
}

export default function StaffPin() {
    const { c, small, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{
        staffId?: string;
        initials?: string;
        name?: string;
        role?: string;
    }>();
    const initials = param(params.initials, 'MK');
    const name = param(params.name, 'Merve Kaya');
    const role = param(params.role, 'Kuaför');

    const [pin, setPin] = useState('');
    const [remaining, setRemaining] = useState(3);
    const [verifying, setVerifying] = useState(false);
    const [hasError, setHasError] = useState(false);
    const shake = useRef(new Animated.Value(0)).current;
    const errorReveal = useRef(new Animated.Value(0)).current;
    const locked = remaining === 0;

    useEffect(() => {
        if (pin.length !== 4 || locked) return;
        setVerifying(true);
        const id = setTimeout(() => {
            if (pin === '1234') {
                feedback.success();
                router.replace({
                    pathname: '/(staff)',
                    params: {
                        staffId: param(params.staffId, 'merve'),
                        initials,
                        name,
                        role,
                    },
                });
                return;
            }

            const nextRemaining = Math.max(0, remaining - 1);
            feedback.error();
            setRemaining(nextRemaining);
            setHasError(true);
            setPin((current) => current.slice(0, 3));
            setVerifying(false);
            if (reduceMotion) {
                shake.setValue(0);
            } else {
                Animated.sequence([
                    Animated.timing(shake, { toValue: -8, duration: 55, useNativeDriver: true }),
                    Animated.timing(shake, { toValue: 8, duration: 70, useNativeDriver: true }),
                    Animated.timing(shake, { toValue: -5, duration: 60, useNativeDriver: true }),
                    Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
                ]).start();
            }
        }, 180);
        return () => clearTimeout(id);
    }, [initials, locked, name, params.staffId, pin, reduceMotion, remaining, role, router, shake]);

    useEffect(() => {
        if (!hasError) {
            errorReveal.setValue(0);
            return;
        }
        errorReveal.setValue(0);
        Animated.timing(errorReveal, {
            toValue: 1,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [errorReveal, hasError]);

    const keyPress = (key: string) => {
        if (!key || verifying || locked) return;
        if (key === 'backspace') {
            if (!pin.length) return;
            feedback.key();
            setHasError(false);
            setPin((current) => current.slice(0, -1));
            return;
        }
        if (pin.length >= 4) return;
        feedback.key();
        setHasError(false);
        setPin((current) => current + key);
    };

    const errorMessage = locked
        ? 'Bu telefon 15 dakika kilitlendi. İşletme sahibinden yardım isteyin.'
        : `Şifre yanlış. ${remaining} denemeniz kaldı. Üç kere yanlış girilirse bu telefon 15 dakika kilitlenir ve işletme sahibine haber gider.`;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <TopBar name={name} role={role} onBack={() => router.back()} />

            <View style={{ flex: 1, minHeight: 0 }}>
                <View style={{
                    flex: 1,
                    minHeight: 0,
                    paddingTop: small ? 12 : 30,
                    gap: small ? 12 : 24,
                    alignItems: 'center',
                }}>
                    <View style={{
                        width: small ? 52 : 64,
                        height: small ? 52 : 64,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: small ? 26 : 32,
                        borderWidth: 1,
                        borderColor: c.or + '47',
                        backgroundColor: c.or + '24',
                    }}>
                        <Text style={{
                            color: c.or2,
                            fontSize: small ? 18 : 22,
                            fontWeight: '800',
                            letterSpacing: -0.44,
                        }}>
                            {initials}
                        </Text>
                    </View>

                    <Text style={{
                        color: c.tx,
                        fontSize: 26,
                        fontWeight: '800',
                        letterSpacing: -0.78,
                        textAlign: 'center',
                    }}>
                        Şifrenizi girin
                    </Text>

                    <Animated.View style={{
                        flexDirection: 'row',
                        gap: 16,
                        transform: [{ translateX: shake }],
                    }}>
                        {Array.from({ length: 4 }, (_, index) => {
                            const filled = index < pin.length;
                            return <PinDot key={index} filled={filled} error={hasError} />;
                        })}
                    </Animated.View>
                </View>

                {hasError ? (
                    <Animated.View
                        accessibilityLiveRegion="assertive"
                        style={{
                        marginHorizontal: 22,
                        marginBottom: 16,
                        paddingVertical: 13,
                        paddingHorizontal: 15,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: c.rd + '42',
                        backgroundColor: c.rd + '1C',
                        opacity: errorReveal,
                        transform: [{
                            translateY: errorReveal.interpolate({
                                inputRange: [0, 1],
                                outputRange: reduceMotion ? [0, 0] : [4, 0],
                            }),
                        }],
                    }}>
                        <Text style={{
                            color: c.rd,
                            fontSize: 13.5,
                            lineHeight: 19.6,
                            fontWeight: '600',
                        }}>
                            {errorMessage}
                        </Text>
                    </Animated.View>
                ) : null}

                <View style={{ paddingHorizontal: 18, paddingBottom: 8, gap: 10 }}>
                    {DIGITS.map((row, rowIndex) => (
                        <View key={rowIndex} style={{ flexDirection: 'row', gap: 10 }}>
                            {row.map((key, keyIndex) => {
                                const blank = key === '';
                                return (
                                    <Pressable
                                        key={`${rowIndex}-${keyIndex}`}
                                        accessibilityRole={blank ? undefined : 'button'}
                                        accessibilityLabel={key === 'backspace' ? 'Son haneyi sil' : key || undefined}
                                        disabled={blank || locked}
                                        onPress={() => keyPress(key)}
                                        style={({ pressed }) => ({
                                            flex: 1,
                                            height: 62,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: 16,
                                            borderWidth: blank ? 0 : 1,
                                            borderColor: blank ? 'transparent' : c.bd,
                                            backgroundColor: blank ? 'transparent' : c.surf,
                                            opacity: locked ? 0.4 : pressed ? 0.72 : 1,
                                            transform: [{ scale: pressed && !blank && !locked ? 0.97 : 1 }],
                                        })}
                                    >
                                        {!blank ? (
                                            <Text style={[{
                                                color: c.tx,
                                                fontSize: key === 'backspace' ? 25 : 26,
                                                fontWeight: '700',
                                                letterSpacing: -0.52,
                                            }, numeric]}>
                                                {key === 'backspace' ? '⌫' : key}
                                            </Text>
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}
                </View>

                <View style={{
                    paddingTop: 10,
                    paddingHorizontal: 18,
                    paddingBottom: insets.bottom + 10,
                    alignItems: 'center',
                }}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => undefined}
                        style={({ pressed }) => ({
                            minHeight: 52,
                            paddingHorizontal: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.55 : 1,
                        })}
                    >
                        <Text style={{
                            color: c.tx2,
                            fontSize: 16,
                            fontWeight: '700',
                        }}>
                            Şifremi hatırlamıyorum
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

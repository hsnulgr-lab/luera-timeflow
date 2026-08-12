import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { feedback } from '../../src/lib/feedback';
import { numeric, useTheme } from '../../src/theme';

const DIGITS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'backspace'],
] as const;

function LueraMark() {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'flex-start' }}>
            <Text style={{
                color: c.tx,
                fontSize: 30,
                lineHeight: 30,
                fontWeight: '800',
                letterSpacing: -1.5,
            }}>
                luera
            </Text>
            <View style={{
                width: 6,
                height: 6,
                marginLeft: 1,
                marginBottom: 3,
                borderRadius: 3,
                backgroundColor: c.or,
            }} />
        </View>
    );
}

function ScanIcon() {
    const { c } = useTheme();
    const corner = {
        position: 'absolute' as const,
        width: 7,
        height: 7,
        borderColor: c.tx,
    };
    return (
        <View style={{ width: 19, height: 19 }}>
            <View style={[corner, { left: 1, top: 1, borderLeftWidth: 1.7, borderTopWidth: 1.7 }]} />
            <View style={[corner, { right: 1, top: 1, borderRightWidth: 1.7, borderTopWidth: 1.7 }]} />
            <View style={[corner, { left: 1, bottom: 1, borderLeftWidth: 1.7, borderBottomWidth: 1.7 }]} />
            <View style={[corner, { right: 1, bottom: 1, borderRightWidth: 1.7, borderBottomWidth: 1.7 }]} />
        </View>
    );
}

function CodeDigit({ value }: { value?: string }) {
    const { c, reduceMotion } = useTheme();
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!value || reduceMotion) {
            pulse.setValue(1);
            return;
        }
        pulse.setValue(0.78);
        Animated.spring(pulse, {
            toValue: 1,
            damping: 14,
            stiffness: 300,
            mass: 0.55,
            useNativeDriver: true,
        }).start();
    }, [pulse, reduceMotion, value]);

    return (
        <Animated.View style={{
            flex: 1,
            height: 66,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: value ? c.or : c.bd2,
            backgroundColor: value ? c.card : c.surf,
            transform: [{ scale: pulse }],
        }}>
            <Text style={[{
                color: c.tx,
                fontSize: 28,
                fontWeight: '800',
                letterSpacing: -0.84,
            }, numeric]}>
                {value ?? ''}
            </Text>
        </Animated.View>
    );
}

export default function PairDevice() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [code, setCode] = useState('');
    const ready = useRef(new Animated.Value(0)).current;

    const keyPress = (key: string) => {
        if (!key) return;
        if (key === 'backspace') {
            if (!code.length) return;
            feedback.key();
            setCode((current) => current.slice(0, -1));
            return;
        }
        if (code.length >= 6) return;
        feedback.key();
        setCode((current) => current + key);
    };

    const complete = code.length === 6;

    useEffect(() => {
        Animated.timing(ready, {
            toValue: complete ? 1 : 0,
            duration: reduceMotion ? 80 : 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [complete, ready, reduceMotion]);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{
                flex: 1,
                minHeight: 0,
                paddingTop: 38,
                paddingHorizontal: 26,
                gap: 22,
            }}>
                <LueraMark />

                <View style={{ gap: 9 }}>
                    <Text style={{
                        color: c.tx,
                        fontSize: 31,
                        lineHeight: 33.5,
                        fontWeight: '800',
                        letterSpacing: -1.08,
                    }}>
                        Bu telefonu{`\n`}işletmeye bağlayın
                    </Text>
                    <Text style={{
                        color: c.tx2,
                        fontSize: 15.5,
                        lineHeight: 24,
                        fontWeight: '500',
                    }}>
                        Bilgisayardaki Luera ekranında görünen altı haneli kodu yazın. Kodu işletme sahibi verir.
                    </Text>
                </View>

                <View
                    accessibilityLabel={`Eşleştirme kodu, ${code.length} hane girildi`}
                    style={{ flexDirection: 'row', gap: 9 }}
                >
                    {Array.from({ length: 6 }, (_, index) => {
                        const value = code[index];
                        return <CodeDigit key={index} value={value} />;
                    })}
                </View>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Kare kodu okut"
                    onPress={() => undefined}
                    style={({ pressed }) => ({
                        alignSelf: 'flex-start',
                        height: 44,
                        paddingHorizontal: 15,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: c.bd,
                        backgroundColor: c.surf2,
                        opacity: pressed ? 0.72 : 1,
                    })}
                >
                    <ScanIcon />
                    <Text style={{
                        color: c.tx,
                        fontSize: 14.5,
                        fontWeight: '700',
                        letterSpacing: -0.15,
                    }}>
                        Kare kodu okut
                    </Text>
                </Pressable>
            </View>

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
                                    disabled={blank}
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
                                        opacity: pressed ? 0.72 : 1,
                                        transform: [{ scale: pressed && !blank ? 0.97 : 1 }],
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
                paddingTop: 12,
                paddingHorizontal: 18,
                paddingBottom: insets.bottom + 10,
            }}>
                <Animated.View style={{
                    opacity: ready.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                    transform: [{
                        scale: ready.interpolate({
                            inputRange: [0, 1],
                            outputRange: reduceMotion ? [1, 1] : [0.985, 1],
                        }),
                    }],
                }}
                >
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !complete }}
                        disabled={!complete}
                        onPress={() => {
                            feedback.medium();
                            router.push('/(auth)/who');
                        }}
                        style={({ pressed }) => ({
                            height: 60,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 18,
                            backgroundColor: c.or,
                            opacity: pressed ? 0.86 : 1,
                        })}
                    >
                        <Text style={{
                            color: '#fff',
                            fontSize: 18,
                            fontWeight: '800',
                            letterSpacing: -0.36,
                        }}>
                            Devam
                        </Text>
                    </Pressable>
                </Animated.View>
            </View>
        </View>
    );
}

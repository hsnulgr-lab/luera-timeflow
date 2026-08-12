import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';

function CheckIcon() {
    const { c } = useTheme();
    return (
        <View style={{ width: 34, height: 34 }}>
            <View style={{
                position: 'absolute',
                left: 5,
                top: 17,
                width: 12,
                height: 2.8,
                borderRadius: 2,
                backgroundColor: c.gr,
                transform: [{ rotate: '45deg' }],
            }} />
            <View style={{
                position: 'absolute',
                left: 13,
                top: 13,
                width: 20,
                height: 2.8,
                borderRadius: 2,
                backgroundColor: c.gr,
                transform: [{ rotate: '-45deg' }],
            }} />
        </View>
    );
}

function NextChevron() {
    const { c } = useTheme();
    return (
        <View style={{
            width: 10,
            height: 10,
            borderRightWidth: 1.7,
            borderTopWidth: 1.7,
            borderColor: c.tx3,
            transform: [{ rotate: '45deg' }],
            marginRight: 3,
        }} />
    );
}

export default function SentConfirmation() {
    const { c, reduceMotion } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const ringReveal = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
    const copyReveal = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        ringReveal.setValue(reduceMotion ? 1 : 0);
        copyReveal.setValue(0);
        const animation = reduceMotion
            ? Animated.timing(copyReveal, {
                toValue: 1,
                duration: 120,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            })
            : Animated.parallel([
                Animated.spring(ringReveal, {
                    toValue: 1,
                    damping: 14,
                    stiffness: 210,
                    mass: 0.75,
                    useNativeDriver: true,
                }),
                Animated.timing(copyReveal, {
                    toValue: 1,
                    delay: 110,
                    duration: 230,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]);
        animation.start();
        return () => animation.stop();
    }, [copyReveal, reduceMotion, ringReveal]);

    return (
        <View style={{
            flex: 1,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            backgroundColor: c.bg,
        }}>
            <View style={{
                flex: 1,
                paddingHorizontal: 34,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
            }}>
                <Animated.View style={{
                    width: 78,
                    height: 78,
                    borderRadius: 39,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.7,
                    borderColor: c.gr + '57',
                    backgroundColor: c.gr + '1F',
                    opacity: ringReveal,
                    transform: [{
                        scale: ringReveal.interpolate({
                            inputRange: [0, 1],
                            outputRange: reduceMotion ? [1, 1] : [0.82, 1],
                        }),
                    }],
                }}>
                    <CheckIcon />
                </Animated.View>

                <Animated.Text style={{
                    color: c.tx,
                    fontSize: 27,
                    lineHeight: 30.2,
                    fontWeight: '800',
                    letterSpacing: -0.95,
                    textAlign: 'center',
                    opacity: copyReveal,
                    transform: [{
                        translateY: copyReveal.interpolate({
                            inputRange: [0, 1],
                            outputRange: reduceMotion ? [0, 0] : [5, 0],
                        }),
                    }],
                }}>
                    Adisyon kasaya gitti
                </Animated.Text>

                <Animated.Text style={{
                    color: c.tx2,
                    fontSize: 15,
                    lineHeight: 23.25,
                    fontWeight: '500',
                    textAlign: 'center',
                    opacity: copyReveal,
                }}>
                    Ayşe Yılmaz'ın ₺2.010 tutarındaki adisyonu kasada bekliyor. Tahsilatı kasadaki kişi alacak. Malzemeler depodan düşüldü.
                </Animated.Text>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sıradaki randevu Zeynep Ak"
                    onPress={() => undefined}
                    style={({ pressed }) => ({
                        width: '100%',
                        minHeight: 64,
                        marginTop: 8,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 13,
                        borderTopWidth: 1,
                        borderBottomWidth: 1,
                        borderColor: c.bd,
                        opacity: pressed ? 0.58 : 1,
                    })}
                >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text numberOfLines={1} style={{
                            color: c.tx,
                            fontSize: 15.5,
                            fontWeight: '700',
                            letterSpacing: -0.23,
                        }}>
                            Sıradaki randevu
                        </Text>
                        <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 13, fontWeight: '500' }}>
                            12:30 · Zeynep Ak · Fön
                        </Text>
                    </View>
                    <NextChevron />
                </Pressable>
            </View>

            <View style={{
                paddingHorizontal: 18,
                paddingBottom: 10,
                gap: 9,
            }}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => router.dismissTo('/(staff)')}
                    style={({ pressed }) => ({
                        height: 60,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 18,
                        backgroundColor: c.or,
                        opacity: pressed ? 0.82 : 1,
                    })}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.36 }}>
                        Bugüne dön
                    </Text>
                </Pressable>

                <Pressable
                    accessibilityRole="button"
                    onPress={() => undefined}
                    style={({ pressed }) => ({
                        height: 52,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.55 : 1,
                    })}
                >
                    <Text style={{ color: c.tx2, fontSize: 16, fontWeight: '700' }}>
                        Ayşe'ye yeni randevu ver
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

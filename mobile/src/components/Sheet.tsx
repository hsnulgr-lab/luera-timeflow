import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';

import {
    apptCardMetrics, apptInCurve, apptMotion, apptOutCurve, detailMetrics, useTheme,
    type Curve,
} from '../theme';


/** Eğriyi `Easing.bezier`'e uygular — üçlü koşulda demet tipi kaybolmasın. */
function bezier(curve: Curve) {
    return Easing.bezier(curve[0], curve[1], curve[2], curve[3]);
}

/**
 * Alt sheet kabuğu — Müdür 25'in B, C ve E ekranları ile Müdür 07c menüsü
 * aynı kabuğu kullanır.
 *
 * `Modal animationType="slide"` iOS'ta kendi eğrisini dayatıyor ve tasarımın
 * 300/240 ms sözleşmesini tutturamıyordu; hareket burada elle sürülüyor.
 * Yalnız `translateY` ve `opacity` — ikisi de native sürücüde.
 */
export function BottomSheet({ visible, onDismiss, fill = false, children }: {
    visible: boolean;
    onDismiss: () => void;
    /**
     * Gövdesi KAYAN sayfalar için sabit yükseklik.
     *
     * Sayfa varsayılan olarak içeriği kadar uzar. Ama içinde `flex: 1` bir
     * `ScrollView` varsa (saat listesi, personel listesi) yüksekliği belirsiz
     * bir kapta o çocuk SIFIR yükseklik alır: ekranda yalnız tutamak ve
     * başlık kalır, liste hiç çizilmez. Böyle sayfalar `fill` ister.
     */
    fill?: boolean;
    children: ReactNode;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const enter = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduceMotion) {
            enter.setValue(visible ? 1 : 0);
            return;
        }
        Animated.timing(enter, {
            toValue: visible ? 1 : 0,
            duration: visible ? apptMotion.sheet.in : apptMotion.sheet.out,
            easing: bezier(visible ? apptInCurve : apptOutCurve),
            useNativeDriver: true,
        }).start();
    }, [visible, reduceMotion, enter]);

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
            <Animated.View style={{ flex: 1, opacity: enter }}>
                <Pressable
                    accessibilityLabel="Kapat"
                    onPress={onDismiss}
                    style={{
                        flex: 1,
                        justifyContent: 'flex-end',
                        backgroundColor: dark ? detailMetrics.scrimDark : detailMetrics.scrimLight,
                    }}
                >
                    {/*
                      Klavye açılınca sayfa YUKARI ÇIKAR.
                      Not alanı sayfanın altındaydı ve klavye tam üstüne
                      biniyordu: müdür yazdığını göremiyordu. `padding` iOS'ta
                      sayfayı kısaltmadan yukarı iter; Android klavyeyi kendi
                      yönetir (`adjustResize`), orada davranış eklenmez.
                    */}
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        /*
                          Esneme zincirini SÜRDÜRMEK zorunda: kapsayıcı
                          `flex:1` almazsa kendi içeriği kadar büzülüyor ve
                          içerideki `maxHeight:'88%'` sıfır yükseklikli bir
                          kaba göre çözülüyor — sayfa altta ince bir şeride
                          iniyor, gövdesi hiç görünmüyordu.
                        */
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                    >
                    <Animated.View style={{
                        maxHeight: '88%',
                        ...(fill ? { height: '88%' as const } : null),
                        transform: [{
                            translateY: enter.interpolate({
                                inputRange: [0, 1],
                                outputRange: [420, 0],
                            }),
                        }],
                    }}>
                        <Pressable
                            onPress={(event) => event.stopPropagation()}
                            style={{
                                /*
                                  Sabit yükseklikli sayfada YÜZEY DE dolmalı.
                                  Yalnız dış kutuyu %88 yapmak yetmiyordu:
                                  içerideki yüzey kendi içeriği kadar kalıp
                                  kutunun TEPESİNDE bir şerit olarak duruyordu.
                                */
                                ...(fill ? { flex: 1 } : null),
                                backgroundColor: c.surf,
                                borderTopLeftRadius: apptCardMetrics.sheetRadius,
                                borderTopRightRadius: apptCardMetrics.sheetRadius,
                                borderTopWidth: 1,
                                borderColor: c.bd,
                                overflow: 'hidden',
                            }}
                        >
                            {children}
                        </Pressable>
                    </Animated.View>
                    </KeyboardAvoidingView>
                </Pressable>
            </Animated.View>
        </Modal>
    );
}

/** Tutamak — sheet'in dokunulabilir olduğunu söyleyen tek işaret. */
export function SheetGrab() {
    const { c } = useTheme();
    return (
        <View style={{ height: 26, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.tx, opacity: 0.28 }} />
        </View>
    );
}

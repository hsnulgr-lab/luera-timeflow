import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { feedback } from '../lib/feedback';
import { useKeyboardInset } from '../lib/keyboardInset';
import { upperTR } from '../lib/text';
import {
    apptCardMetrics, apptInCurve, apptMotion, apptOutCurve, detailMetrics, font, hit, useTheme,
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
export function BottomSheet({ visible, onDismiss, fill = false, system = false, children }: {
    visible: boolean;
    onDismiss: () => void;
    /**
     * iOS'UN KENDİ SAYFASI (2026-10-15, telefonda bulundu · kullanıcı kararı).
     *
     * Bu kabuğun tutamağı ÇİZİLİ ama sürüklenmiyor: "Yeni hizmet"te aşağı
     * çekmek hiçbir şey yapmıyordu. Elle yazılmış jest transparent `Modal`
     * içinde telefonda iki kez tutmadı (hafıza: sayfa kapatma sistemin);
     * çare sistemin sayfası. Yalnız UZUN sayfalar — boyları zaten %88,
     * görünüm neredeyse aynı. Küçük sayfalar sistemde ekranın tepesine kadar
     * uzardı; onlar içerik boyunda `formSheet` rotasına taşınacak (1.0.2).
     *
     * Ardından BAŞKA bir modal açan sayfaya verilmez: iOS kapanmakta olan
     * sayfanın üstüne yeni modal açmıyor (taşıma listesi → sonuç sayfası).
     */
    system?: boolean;
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
    const kb = useKeyboardInset();

    useEffect(() => {
        if (system) return;
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
    }, [visible, reduceMotion, enter, system]);

    if (system) {
        return (
            /*
              * Aşağı çekip kapatmayı iOS yapıyor (`allowSwipeDismissal`;
              * verilmezse sistem jesti KAPATIR). Kaydırarak kapanınca
              * `onRequestClose` geldiğinde sayfa zaten inmiş oluyor — çağıran
              * yalnız açık hâli düşürüyor.
              *
              * Klavye payı: sistem sayfasının altı ekranın altı, yani klavyenin
              * kapladığı yer klavyenin kendi boyu. `KeyboardAvoidingView` bu
              * sayfada payı sayfanın üst boşluğu kadar eksik hesaplıyordu.
              */
            <Modal
                visible={visible}
                animationType="slide"
                presentationStyle="pageSheet"
                allowSwipeDismissal
                onRequestClose={onDismiss}
            >
                <View style={{ flex: 1, backgroundColor: c.surf, paddingBottom: kb }}>
                    {children}
                </View>
            </Modal>
        );
    }

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

/**
 * Sistem sayfasının başlık satırı — randevu kartının (Müdür 25 · A1) kabuğu:
 * solda harf aralıklı küçük etiket ("RANDEVU", "TAHSİLAT"), sağda kapat.
 *
 * Randevu kartı ile Kasa fişi AYNI kabuğu taşıyor (2026-10-13, kullanıcı:
 * "tasarımını da aynısını uygulasak"): ikisi de sistemin sayfası, ikisi de
 * aşağı çekilince kapanıyor, ikisinin de tepesi bu satır.
 */
export function SheetHeader({ label, onClose }: { label: string; onClose: () => void }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: apptCardMetrics.sheetPadX,
            paddingRight: apptCardMetrics.sheetPadX - 6,
            paddingTop: 2,
            paddingBottom: 12,
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: 12,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: 12 * 0.18,
            }}>
                {upperTR(label)}
            </Text>
            <SheetClose onPress={onClose} />
        </View>
    );
}

function SheetClose({ onPress }: { onPress: () => void }) {
    const { c } = useTheme();
    const tap = useCallback(() => { feedback.selection(); onPress(); }, [onPress]);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={tap}
            hitSlop={6}
            style={({ pressed }) => ({
                width: hit.icon,
                height: hit.icon,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                backgroundColor: pressed ? c.surf2 : 'transparent',
            })}
        >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.tx2} strokeWidth={1.7} strokeLinecap="round">
                <Path d="M6 6l12 12M18 6L6 18" />
            </Svg>
        </Pressable>
    );
}

/**
 * `luera` + turuncu hap · **timeflow**
 *
 * Markanın noktası modülün adına açılıyor. İkinci bir logo eklenmiyor, var
 * olan açılıyor: nokta zaten oradaydı, hap onun büyümüş hâli.
 *
 * Bu, tasarımın "luera. tek başına" kararını geçersiz kılıyor ve gerekçesini
 * de çürütüyor. Belge şöyle demişti: *"44 pt'de «luera timeflow» iki satıra
 * düşüyor ya da 34 pt'ye iniyor."* Hap formunda düşmüyor — 44 pt'de `luera`
 * ≈ 110 pt, hap ≈ 48 pt, toplam ≈ 158 pt; kullanılabilir genişlik 345 pt.
 *
 * ── Dört adım, süreleri kaynağından ─────────────────────────────────────────
 *   0 ms      kelime gelir      opacity + translateY 10→0, 650 ms
 *   900 ms    nokta patlar      scale 0,3→1, 380 ms, hafif taşmayla
 *   1360 ms   hap açılır        genişlik ve yükseklik, 520 ms
 *   1920 ms   yazı belirir      opacity + translateX −4→0, 350 ms
 *
 * Toplam ≈ 2,27 sn. Karşılamanın koreografisi 1,0 sn'de bitiyor ve **kural
 * çiğnenmiyor**: kural "ekran 1 saniyede KULLANILABİLİR" idi, "hiçbir şey
 * hareket etmiyor" değil. Marka üstte kendi hikâyesini anlatırken kapılar
 * çoktan basılabilir durumda.
 *
 * Genişlik ölçülüyor, hesaplanmıyor: "timeflow" kelimesinin eni yazı tipine ve
 * punto'ya bağlı. Görünmez bir kopya `onLayout` ile ölçülüyor, hap hedefini
 * oradan alıyor. Ölçüm gelmeden animasyon başlamıyor — yarım açılmış bir hap
 * göstermektense bir kare beklemek yeğdir.
 */

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
    Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';

import { authMetrics, font, onAccent, radius, useTheme } from '../theme';

/** Kaynaktaki eğriler. Nokta patlarken 1,4'lük son terim hafif bir taşma. */
const EASE_WORD = Easing.bezier(0.22, 0.8, 0.2, 1);
const EASE_POP = Easing.bezier(0.2, 0.7, 0.2, 1.4);
const EASE_PILL = Easing.bezier(0.4, 0, 0.15, 1);

export const BRAND_STEPS = {
    word: { at: 0, ms: 650 },
    pop: { at: 900, ms: 380 },
    pill: { at: 1360, ms: 520 },
    text: { at: 1920, ms: 350 },
} as const;

export function LueraTimeflowMark({ size, animate = true, align = 'flex-start' }: {
    size: number;
    /** Kapalıysa hap açık ve hareketsiz durur — marka aynı, gösteri yok. */
    animate?: boolean;
    align?: 'flex-start' | 'center';
}) {
    const { c, reduceMotion } = useTheme();
    const [textW, setTextW] = useState<number | null>(null);

    const dot = size * authMetrics.brandDotRatio;

    /**
     * ── Hap KELİMENİN BANDINDA, altında değil ───────────────────────────────
     *
     * Kaynak dosyadaki `0.38em` telefonda hapı taban çizgisinin altına
     * sarkıtıyordu: küçük, aşağıda asılı bir rozet. Referans logoda ise hap
     * `luera`nın kendi bandını dolduruyor — **tabanı taban çizgisinde, tepesi
     * x-yüksekliğinde.**
     *
     * Geometri noktadan türüyor ve ölçmeye gerek yok: nokta zaten taban
     * çizgisinin ÜSTÜNDE duruyor (`brandDotBottomRatio` onu oraya koyuyor).
     * Yani hap aynı alt payı koruyup yukarı doğru büyürse tabanı yerinde
     * kalır. Kalan tek sayı yüksekliği: x-yüksekliği ≈ 0,52 em, biraz cömert
     * davranıp 0,54.
     */
    const pillH = size * 0.54;

    /**
     * ── Hapın tabanı: metin KUTUSUNUN dibi değil, TABAN ÇİZGİSİ ─────────────
     *
     * `alignItems: 'flex-end'` hapı `luera`nın metin kutusunun dibine
     * yaslıyor. Ama o dip taban çizgisi değil — altında inişlerin (g, y, p)
     * payı var ve hap oraya oturunca çizginin ALTINDA kalıyor. Telefonda
     * görülen buydu.
     *
     * Fark hesaplanabiliyor. Hanken Grotesk'te iniş payı ≈ 0,26 em; biz
     * `lineHeight`'i `fontSize`'a eşitlediğimiz için satır kutusu yazının
     * doğal yüksekliğinden (≈1,24 em) dar kalıyor ve taşan kısım iki yana
     * eşit dağılıyor:
     *
     *     taban çizgisi = 0,26 − (1,24 − 1,00) / 2 ≈ 0,14 em
     *
     * Yani hapın tabanı, kutunun dibinden ≈0,14 em yukarıda. Eski değer
     * 0,04'tü (`brandDotBottomRatio`) — nokta gibi küçük bir şeyde fark
     * edilmiyordu, hap kadar büyük bir yüzeyde göze batıyor.
     *
     * Nihai değer **0,18**: hesap 0,14 diyor ama telefonda hap hâlâ bir tık
     * aşağıda duruyordu. Aradaki fark yazı tipinin gerçek ölçüleriyle
     * varsaydığım ortalamalar arasındaki paydan geliyor; göz kararı kapatıldı
     * ve kaynağı burada yazılı ki bir dahaki sefere hesap sanılmasın.
     */
    const baseline = size * 0.18;
    // "timeflow" hapın yüksekliğinin **yarısından biraz fazlası**. Referanstaki oran ~%42'ydi
    // ama telefonda kelime hapın içinde kayboluyordu; yarıya çıkınca hap bir
    // rozet gibi okunuyor. 9,5 pt taban duruyor: 34 pt'lik küçük ekran
    // markasında oran yine altına iniyor ve bir logonun ikincil kelimesi süs
    // değil, ADIN parçası.
    const textSize = Math.max(pillH * 0.52, 9.5);
    // Yazı büyüdükçe yanları da büyüyor ama daha yavaş — yoksa hap uzayıp
    // kapsül olmaktan çıkıyor.
    const pad = textSize * 0.70;
    const pillW = textW == null
        ? dot
        : Math.max(textW + pad * 2, pillH * 2.6);

    const still = reduceMotion || !animate;
    const ready = textW != null;

    const word = useSharedValue(still ? 1 : 0);
    const pop = useSharedValue(still ? 1 : 0.3);
    const open = useSharedValue(still ? 1 : 0);
    const label = useSharedValue(still ? 1 : 0);

    useEffect(() => {
        if (!ready) return;
        if (still) { word.value = 1; pop.value = 1; open.value = 1; label.value = 1; return; }
        word.value = 0; pop.value = 0.3; open.value = 0; label.value = 0;
        const S = BRAND_STEPS;
        word.value = withDelay(S.word.at,
            withTiming(1, { duration: S.word.ms, easing: EASE_WORD }));
        pop.value = withDelay(S.pop.at,
            withTiming(1, { duration: S.pop.ms, easing: EASE_POP }));
        open.value = withDelay(S.pill.at,
            withTiming(1, { duration: S.pill.ms, easing: EASE_PILL }));
        label.value = withDelay(S.text.at,
            withTiming(1, { duration: S.text.ms, easing: EASE_WORD }));
    }, [ready, still, word, pop, open, label]);

    const wordStyle = useAnimatedStyle(() => ({
        opacity: word.value,
        transform: [{ translateY: 10 * (1 - word.value) }],
    }));

    // Hap noktadan doğuyor: aynı yuvarlaklık, aynı turuncu, yalnız ölçüsü
    // büyüyor. Ayrı bir nesnenin belirmesi olsaydı bağ kopardı.
    const badgeStyle = useAnimatedStyle(() => ({
        width: dot + (pillW - dot) * open.value,
        height: dot + (pillH - dot) * open.value,
        transform: [{ scale: pop.value }],
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: label.value,
        transform: [{ translateX: -4 * (1 - label.value) }],
    }));

    return (
        <View style={{ alignSelf: align }}>
            {/* Ölçüm kopyası: düzeni etkilemesin diye mutlak konumda ve
                görünmez. Genişliği buradan geliyor. */}
            <View
                pointerEvents="none"
                style={{ position: 'absolute', opacity: 0, top: 0, left: 0 }}
            >
                <Text
                    onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
                    style={{
                        fontSize: textSize,
                        fontFamily: font.extraBold,
                        fontWeight: '800',
                        letterSpacing: textSize * -0.01,
                    }}
                >
                    timeflow
                </Text>
            </View>

            <Animated.View style={[{ flexDirection: 'row', alignItems: 'flex-end' }, wordStyle]}>
                <Text style={{
                    color: c.tx,
                    fontSize: size,
                    fontFamily: font.black,
                    lineHeight: size,
                    fontWeight: '900',
                    letterSpacing: size * -0.05,
                }}>
                    luera
                </Text>
                <Animated.View style={[{
                    // Nokta için 0,02 doğruydu; hap bir kelime, nefes alsın.
                    marginLeft: size * 0.045,
                    marginBottom: baseline,
                    borderRadius: radius.pill,
                    backgroundColor: c.or,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                }, badgeStyle]}>
                    <Animated.Text
                        numberOfLines={1}
                        style={[{
                            color: onAccent,
                            fontSize: textSize,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: textSize * -0.01,
                        }, labelStyle]}
                    >
                        timeflow
                    </Animated.Text>
                </Animated.View>
            </Animated.View>
        </View>
    );
}

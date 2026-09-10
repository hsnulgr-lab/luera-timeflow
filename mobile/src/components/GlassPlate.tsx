/**
 * Giriş v3 · cam plaka.
 *
 * "Cam yalnız kabukta" kuralı kalkmadı, KAPSAMI DARALDI: cam, içeriğin
 * olmadığı ekranlarda serbest. Girişte okunacak bir tutar, saat ya da isim
 * yok — iki düğme, bir marka, bir cümle var.
 *
 * ── Kontrast şansa bırakılmıyor ─────────────────────────────────────────────
 * Dolgu yalnız bir görünüm değil, garantinin taşıyıcısı. Camın arkası tam
 * turuncuya (#FF5A1F, %100) dönse bile koyu temada bileşik zemin ≈ #7B2D11
 * olur ve üstündeki #F3EDE3 metinle oran 6,8:1 — alan hangi renge dönerse
 * dönsün metin 4,5:1'in altına inemiyor, çünkü inemeyeceği bir dolgu var.
 *
 * Aydınlıkta risk kontrast değil plakanın KAYBOLMASI: beyaz üstüne beyaz cam
 * görünmez. Çözüm aynı değil — dolgu daha opak (.62), kenar beyaz değil KOYU.
 *
 * ── Yapılamayan tek şey ─────────────────────────────────────────────────────
 * Tasarımdaki `saturate(160%)`. `expo-blur` yalnız `intensity` ve `tint`
 * veriyor. Telafisi CAMDA DEĞİL, alanın kütle renklerinde: doygunluk
 * bileşiğe değil kaynağa uygulandı (bkz. `lightField.ts` · Mass.color).
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';

import { useTheme } from '../theme';

/** Plakanın nerede kullanıldığı — her yüzeyin kendi bulanıklığı ve dolgusu var. */
export type GlassKind = 'plate' | 'input' | 'key' | 'keyboard';

/**
 * ── Tarif mock'un CSS'inden birebir ────────────────────────────────────────
 *
 * İlk uygulamada dolguları kıstım, çünkü telefonda cam siyah bir kutu gibi
 * duruyordu. Teşhis yanlıştı: kabahat dolguda değil ARKASINDAKİ ALANDAYDI —
 * düzyazının "×0,6" kısıntısını uygulamıştım, oysa mock'un kendi HTML'i form
 * ekranlarında alanı hiç kısmıyor. Alan düzelince cam da düzeliyor.
 *
 * Bu yüzden sayılar mock'a geri döndü. Korunan tek fark parıltının
 * KÖŞEYE GİRMEMESİ (aşağıda) — bu mock'ta da böyle görünüyor, CSS'in
 * `inset box-shadow`'u yuvarlak köşeyi zaten takip ediyor, bizim düz
 * çizgimiz takip etmiyordu.
 *
 * `saturate(160%)` hâlâ yok ve olmayacak; karşılığı kütle renklerinin
 * kendisine işlendi (bkz. `lightField.ts` · Mass.color).
 *
 * ── KENAR TEK RENK: Android yuvarlak köşeyi ancak öyle çiziyor ──────────────
 * Mock'ta kenar üstte ince altta kalın — "ışığı yukarıdan alan cam". CSS bunu
 * yuvarlak köşeyle birlikte çizebiliyor; **React Native Android'de çizemiyor.**
 * Kenar renkleri kenardan kenara FARKLI olduğu anda yuvarlak dikdörtgen yolu
 * bırakılıyor ve dört ayrı DÜZ çizgi çiziliyor: köşe kavisleri kayboluyor,
 * yatay çizgiler köşenin ötesine taşıyor. Telefonda tam olarak bu görüldü.
 *
 * Kanıtı aynı ekranda duruyordu: tuş takımının kenarı zaten tek renkti ve
 * onun köşeleri sağlamdı; kırık olan her yüzeyde alt kenar farklıydı.
 *
 * Bu yüzden alt kenarın kalınlaşması KALKTI. Işığın yukarıdan geldiği hissini
 * artık yalnız üst kenardaki parıltı taşıyor — o zaten ayrı bir katman ve
 * köşeyle derdi yok.
 *
 * ── Dolgu mock'tan .08 AÇIK, ve bu bir düzeltme ─────────────────────────────
 * CSS'in `backdrop-filter: blur()`'ü yalnız bulanıklaştırır. `expo-blur` ise
 * `tint="dark"` ile aynı anda karartır. Yani mock'un .52'sini birebir almak,
 * üstüne bir de tonun kendi perdesini eklemek demek — plaka camdan çok kuyu
 * gibi duruyordu. .44, tonun kattığı karartma düşüldükten sonra mock'un
 * bileşiğine denk geliyor.
 */
const RECIPE: Record<GlassKind, {
    blur: number;
    darkFill: number;
    lightFill: number;
    /** Üst kenardaki ışık. Mock'ta yalnız `.gp` sınıfında var. */
    sheen: boolean;
}> = {
    // İki kapı, personel satırları, Face ID halkası, avatar — mock'ta `.gp`.
    plate: { blur: 18, darkFill: 0.44, lightFill: 0.58, sheen: true },
    // Form alanı — mock'ta `.gp.in`: aynı cam, yalnız yarıçapı küçük.
    input: { blur: 18, darkFill: 0.44, lightFill: 0.58, sheen: true },
    // Tuş ve kod kutusu — mock'ta `.keys button` / `.code-in i`: `.gp` DEĞİL.
    // Ne parıltısı var ne kabartması; on iki kez tekrarlanan bir kıl çizgi
    // ışık değil dikiş izi oluyor.
    key: { blur: 16, darkFill: 0.44, lightFill: 0.58, sheen: false },
    // Klavye zemini — mock'ta `.kbd`, kendi dolgusu var.
    keyboard: { blur: 24, darkFill: 0.66, lightFill: 0.72, sheen: false },
};

export function glassColors(dark: boolean, kind: GlassKind = 'plate') {
    const r = RECIPE[kind];
    // Kenar mock'un .16'sından biraz güçlü: CSS'in kıl çizgisi tarayıcıda
    // 1 CSS px, telefonda 1 pt = 3 fiziksel piksele yayılıyor ve aynı alfa
    // soluk kalıyor. Plakanın "oturaklı ve keskin" durması bu kenardan
    // geliyor — istenen de buydu.
    const edge = 0.22;
    return {
        blur: r.blur,
        fill: dark
            ? `rgba(18,14,8,${r.darkFill})`
            : `rgba(255,255,255,${r.lightFill})`,
        border: dark ? `rgba(243,237,227,${edge})` : 'rgba(14,14,14,0.14)',
        // Plakanın kalınlığını veren şey: üst kenara ince bir ışık. Yalnız
        // tek başına duran büyük yüzeylerde; ızgarada dikiş izine dönüyor.
        sheen: r.sheen
            ? (dark ? 'rgba(243,237,227,0.10)' : 'rgba(255,255,255,0.75)')
            : null,
    };
}

export function GlassPlate({
    kind = 'plate', radius = 22, style, children, focus, error,
}: {
    kind?: GlassKind;
    radius?: number;
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    /** Odaktaki alan: kenar turuncuya geçer. */
    focus?: boolean;
    /** Hatalı alan: kenar kırmızıya geçer — sarsıntı YOK. */
    error?: boolean;
}) {
    const { c, dark } = useTheme();
    const g = glassColors(dark, kind);
    const edge = error ? c.rd : focus ? c.or : g.border;

    return (
        <View style={[{
            borderRadius: radius,
            borderWidth: 1,
            borderColor: edge,
            overflow: 'hidden',
        }, style]}>
            {/* Bulanıklığın KENDİ yarıçapı var.
                Android'de `expo-blur` üst kabuğun `overflow: hidden`'ına
                uymuyor: dikdörtgen bir bulanıklık yaması çiziyor ve yuvarlak
                köşenin dışında kalan düz kenarları plakanın üstünde ve altında
                yatay çizgi olarak görünüyor — plaka "oturmuyor", kesilmiş
                duruyor. Yarıçapı bulanıklığa da vermek bunu kapatıyor. */}
            <BlurView
                intensity={g.blur}
                tint={dark ? 'dark' : 'light'}
                style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
            />
            <View style={[
                StyleSheet.absoluteFill,
                { backgroundColor: g.fill, borderRadius: radius },
            ]} />
            {/* Parıltı köşe yarıçapına GİRMİYOR: yuvarlak köşede biten bir kıl
                çizgi ışık değil dikiş izi gibi okunuyordu. */}
            {g.sheen ? (
                <View style={{
                    position: 'absolute', top: 0,
                    left: radius * 0.7, right: radius * 0.7, height: 1,
                    backgroundColor: g.sheen,
                }} />
            ) : null}
            {children}
        </View>
    );
}

import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
    amountSize, formatAmount, methodLabel, movementSpeech, staffLine, traceLine,
    type CashMethod, type CashTotals, type Movement,
} from '../lib/cash';
import { cashInk, cashMetrics, font, numeric, useTheme, type CashInk, type MethodInk } from '../theme';

/**
 * Müdür 14 — Kasa'nın görsel parçaları.
 *
 * İki yazı tipi bilinçli olarak iş bölümü yapıyor: METİN Hanken Grotesk,
 * PARA sistem yazı tipi (iOS'ta SF Pro Display). Sebep biçimsel: Hanken
 * geometrik ve yuvarlak, büyük puntoda dev tutar tokat gibi duruyordu; sistem
 * yazı tipi dar ve oval, ince ağırlıkta zarif kalıyor. Para rakamlarında
 * `fontFamily` VERİLMEZ — sistem yazı tipi böyle seçiliyor.
 */

/** Para metni: sistem yazı tipi + hizalı rakam. fontFamily bilerek yok. */
export function Money({ children, style, numberOfLines }: {
    children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
    return <Text numberOfLines={numberOfLines} style={[numeric, style]}>{children}</Text>;
}

/** Metin: uygulamanın sesi. */
function Txt({ children, style, numberOfLines }: {
    children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
    return <Text numberOfLines={numberOfLines} style={[{ fontFamily: font.medium }, style]}>{children}</Text>;
}

// ── Yöntem rengi ────────────────────────────────────────────────────────────

/**
 * Yöntem rengi TEK KAYNAKTAN okunur. Oran çubuğu ile daireler ayrışırsa hata
 * bileşende değil burada olur — iki yer aynı fonksiyonu çağırıyor.
 *
 * `ink` parametresi temaya değil BULUNULAN YÜZEYE bakar: kahraman panel her
 * iki temada da koyu olduğu için içindeki çubuk daima koyu seti kullanır.
 */
export function methodColor(ink: CashInk, method: CashMethod): MethodInk {
    switch (method) {
        case 'cash': return ink.cash;
        case 'card': return ink.card;
        case 'transfer': return ink.transfer;
        default: return ink.other;
    }
}

function MethodIcon({ method, size, color }: { method: CashMethod; size: number; color: string }) {
    const common = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            {method === 'cash' ? (
                <>
                    <Path d="M3.6 7.4h16.8v9.2H3.6z" {...common} />
                    <Circle cx={12} cy={12} r={2.4} {...common} />
                </>
            ) : method === 'transfer' ? (
                <Path d="M4 8.5h13l-3-3M20 15.5H7l3 3" {...common} />
            ) : (
                <>
                    <Rect x={3.4} y={6} width={17.2} height={12} rx={2.4} {...common} />
                    <Path d="M3.4 10.2h17.2" {...common} />
                </>
            )}
        </Svg>
    );
}

export function Chevron({ size, color }: { size: number; color: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M9.5 5.5 16 12l-6.5 6.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
    );
}

// ── Kahraman panelin parçaları ──────────────────────────────────────────────

/**
 * Dev tutar. ₺ ayrı bir `Text` ama AYNI stilde: eşit boy, eşit ağırlık, eşit
 * renk, satır içinde. Küçültme, soluklaştırma ya da yukarı kaydırma yok —
 * ekranı ucuzlatan en büyük ayrıntı buydu.
 *
 * `allowFontScaling={false}`: ekranın tek istisnası. Dev rakam liste metinleri
 * kadar büyürse panel ekranı yutuyor; kullanıcı metni büyütürken listeyi
 * okumak istiyor.
 */
/**
 * `value: null` — dönem henüz okunmadı ya da okunamadı. Rakamın yerine çizgi:
 * "₺0" yazmak, okunamayan günü parasız bir gün gibi gösterirdi.
 */
export function HeroAmount({ value, size }: { value: number | null; size: number }) {
    const style: TextStyle = {
        fontSize: size,
        fontWeight: '300',
        letterSpacing: cashMetrics.moneySpacing,
        lineHeight: size * cashMetrics.moneyLineRatio,
        color: '#F3EDE3',
    };
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'baseline',
            marginTop: cashMetrics.moneyTop, marginBottom: cashMetrics.moneyBottom,
        }}>
            {/* Tasarımda `.money s{margin-right:.04em}` — işaret rakama
                yapışmıyor ama boyu, ağırlığı ve rengi rakamla aynı. */}
            <Money style={[style, { marginRight: size * cashMetrics.currencyGap }]}>₺</Money>
            <Money style={style}>{value === null ? '—' : formatAmount(value)}</Money>
        </View>
    );
}

/** Oran çubuğu — üç kutu değil, tek bütün. Dilim genişlikleri türetilir. */
export function RatioBar({ totals, speech }: { totals: CashTotals; speech: string }) {
    const ink = cashInk.dark; // Panel her iki temada da koyu.
    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={speech}
            style={{ width: '100%', alignItems: 'center', gap: cashMetrics.ratioGap, paddingHorizontal: cashMetrics.ratioX, paddingTop: cashMetrics.ratioTop }}
        >
            <View
                importantForAccessibility="no-hide-descendants"
                style={{
                    width: '100%', flexDirection: 'row', gap: cashMetrics.barGap,
                    height: cashMetrics.barHeight, borderRadius: cashMetrics.barRadius,
                    overflow: 'hidden', backgroundColor: '#252015',
                }}
            >
                {totals.shares.map((s) => (
                    <View
                        key={s.method}
                        style={{
                            flexGrow: s.percent, flexShrink: 1, flexBasis: 0,
                            height: cashMetrics.barHeight, borderRadius: cashMetrics.barRadius,
                            backgroundColor: methodColor(ink, s.method).fill,
                        }}
                    />
                ))}
            </View>
            <View importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: cashMetrics.legGap }}>
                {totals.shares.map((s) => (
                    <View key={s.method} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: cashMetrics.legDot, height: cashMetrics.legDot, borderRadius: cashMetrics.legDot / 2, backgroundColor: methodColor(ink, s.method).fill }} />
                        <Money style={{ fontSize: cashMetrics.legFont, fontWeight: '600', color: 'rgba(243,237,227,0.58)' }}>
                            {methodTitle(s.method)} ₺{formatAmount(s.amount)}
                        </Money>
                    </View>
                ))}
            </View>
        </View>
    );
}

/** Çubuk altındaki etiket büyük harf değil — başlık biçimi. */
function methodTitle(method: CashMethod): string {
    switch (method) {
        case 'cash': return 'Nakit';
        case 'card': return 'Kart';
        case 'transfer': return 'Havale';
        default: return 'Diğer';
    }
}

// ── Hareket kartı ───────────────────────────────────────────────────────────

const AMOUNT_FONT = {
    small: cashMetrics.amountFontSmallDigits,
    normal: cashMetrics.amountFont,
    large: cashMetrics.amountFontBigDigits,
} as const;

export function MovementCard({ movement, largest, onPress }: {
    movement: Movement; largest: number; onPress?: () => void;
}) {
    const { c, dark } = useTheme();
    const ink = dark ? cashInk.dark : cashInk.light;
    const mc = methodColor(ink, movement.method);
    const voided = movement.status === 'voided';
    const corrected = movement.status === 'corrected';
    const trace = traceLine(movement);
    const who = staffLine(movement);

    const tone = corrected
        ? { from: ink.correctedFrom, to: ink.correctedTo, border: ink.correctedBorder }
        : voided
            ? { from: ink.voidedFrom, to: ink.voidedTo, border: ink.voidedBorder }
            : null;

    const body = (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: cashMetrics.cardGap,
            minHeight: cashMetrics.cardMinHeight,
            paddingVertical: cashMetrics.cardPadY, paddingHorizontal: cashMetrics.cardPadX,
        }}>
            {/* Daire dekoratif: yöntem bilgisi kartın cümlesinde kelime olarak
                geçiyor, yani renk tek başına anlam taşımıyor. */}
            <View
                accessible={false}
                style={{
                    width: cashMetrics.avatar, height: cashMetrics.avatar, borderRadius: cashMetrics.avatar / 2,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: voided ? 'transparent' : mc.fill,
                    borderWidth: voided ? 1 : 0,
                    borderColor: c.bd2,
                    borderStyle: voided ? 'dashed' : 'solid',
                }}
            >
                <Text style={{
                    fontFamily: font.extraBold, fontSize: cashMetrics.avatarFont,
                    color: voided ? c.tx3 : mc.ink,
                }}>
                    {movement.initials}
                </Text>
            </View>

            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: cashMetrics.nameFont, letterSpacing: -0.33, color: c.tx }}>
                    {movement.customer}
                </Txt>
                <Txt numberOfLines={1} style={{ fontSize: cashMetrics.serviceFont, color: c.tx2 }}>
                    {movement.service} <Text style={{ color: c.tx3 }}>· {movement.time}</Text>
                </Txt>
                {trace ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <View style={{ width: 12, height: 1.5, backgroundColor: c.rd }} />
                        <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.traceFont, letterSpacing: 1.1, color: c.rd }}>{trace}</Txt>
                    </View>
                ) : corrected ? (
                    <View style={{
                        alignSelf: 'flex-start', height: cashMetrics.chipHeight, marginTop: 3,
                        paddingHorizontal: 8, borderRadius: cashMetrics.chipRadius,
                        borderWidth: 1, borderColor: ink.correctedBorder, justifyContent: 'center',
                    }}>
                        <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.chipFont, letterSpacing: 0.95, color: c.am }}>DÜZELTİLDİ</Txt>
                    </View>
                ) : who ? (
                    <Txt style={{ fontFamily: font.semiBold, fontSize: cashMetrics.whoFont, color: c.tx3 }}>{who}</Txt>
                ) : null}
            </View>

            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Money style={{
                    fontSize: AMOUNT_FONT[amountSize(movement.amount, largest)],
                    fontWeight: '600', letterSpacing: -0.2,
                    color: voided ? c.tx2 : c.tx,
                    textDecorationLine: voided ? 'line-through' : 'none',
                }}>
                    ₺{formatAmount(movement.amount)}
                </Money>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <MethodIcon method={movement.method} size={cashMetrics.methodIcon} color={c.tx3} />
                    <Txt style={{ fontFamily: font.bold, fontSize: cashMetrics.methodFont, letterSpacing: cashMetrics.methodSpacing, color: c.tx3 }}>
                        {methodLabel(movement.method)}
                    </Txt>
                </View>
            </View>
        </View>
    );

    const shell: StyleProp<ViewStyle> = {
        borderRadius: cashMetrics.cardRadius,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: tone ? tone.border : c.bd,
        backgroundColor: tone ? 'transparent' : c.card,
    };

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={movementSpeech(movement)}
            // Basma yalnız ölçek: renk ve yarıçap animasyonu yasak.
            style={({ pressed }) => [shell, pressed ? { transform: [{ scale: 0.98 }] } : null]}
        >
            {tone ? (
                <LinearGradient
                    colors={[tone.from, tone.to]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.55, y: 1 }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
            ) : null}
            {body}
        </Pressable>
    );
}

import type { ReactNode } from 'react';
import {
    Pressable, Text, TextInput, View,
    type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { feedback } from '../lib/feedback';
import {
    blockHeight, blockLabels, blockTicks, daySpeech, freeLabel, slotSpeech,
    type DayOption, type RailItem, type RailSection, type ServiceOption,
    type StaffOption,
} from '../lib/createFlow';
import {
    APPT_SELECTED_DAY_LABEL, apptInk, apptMetrics, font, numeric, useTheme,
    type ApptInk, type Palette,
} from '../theme';
import { initialsOf, upperTR } from '../lib/text';

/**
 * Müdür 15 — randevu oluşturmanın görsel parçaları.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 15 Randevu Olustur.html`.
 *
 * İki yazı tipi Kasa'daki iş bölümünü sürdürüyor: METİN Hanken Grotesk, SAYI
 * (gün rakamı, saat, süre, tutar) sistem yazı tipi. Sayılarda `fontFamily`
 * VERİLMEZ — sistem yazı tipi böyle seçilir.
 *
 * CAM BU DOSYADA YOK. Cam yalnız yüzen kontrol katmanında: alt özet çubuğu ve
 * kaydırılmış arama çubuğu. Onlar `ApptBar` / `ApptFloatingSearch` içinde ve
 * `Glass` bileşenini kullanıyor. Saat satırları, müşteri satırları ve hizmet
 * kartları OPAK — arkasından içerik kayan camın üstünde 11 pt metin okunmaz.
 */

const M = apptMetrics;

/** Sayı: sistem yazı tipi + hizalı rakam. */
export function N({ children, style, numberOfLines }: {
    children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
    return <Text numberOfLines={numberOfLines} style={[numeric, style]}>{children}</Text>;
}

function Txt({ children, style, numberOfLines }: {
    children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
    return (
        <Text numberOfLines={numberOfLines} style={[{ fontFamily: font.medium }, style]}>
            {children}
        </Text>
    );
}

// ── İkonlar ─────────────────────────────────────────────────────────────────

const stroke = {
    strokeWidth: 1.7, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const, fill: 'none',
};

export function CloseIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6 6 18" stroke={color} {...stroke} />
        </Svg>
    );
}

export function BackChevron({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={color} {...stroke} />
        </Svg>
    );
}

export function SearchIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M17.6 11a6.6 6.6 0 1 1-13.2 0 6.6 6.6 0 0 1 13.2 0Z" stroke={color} {...stroke} />
            <Path d="M16 16l4.4 4.4" stroke={color} {...stroke} />
        </Svg>
    );
}

export function PlusIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M12 5v14M5 12h14" stroke={color} {...stroke} />
        </Svg>
    );
}

export function CheckIcon({ color, size = 13 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M5 12.6 9.6 17 19 7" stroke={color} strokeWidth={2.4}
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
    );
}

export function ArrowIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M5 12h13l-4.6-4.6M18 12l-4.6 4.6" stroke={color} {...stroke} />
        </Svg>
    );
}

export function SwapIcon({ color, size = 15 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M4 8.4h13l-3-3M20 15.6H7l3 3" stroke={color} {...stroke} />
        </Svg>
    );
}

export function PenIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" stroke={color} {...stroke} />
        </Svg>
    );
}

// ── Kahraman levha ──────────────────────────────────────────────────────────

/**
 * Koyu sıcak levha + etek. Kasa'nın iskeletinin AYNISI — yeni bir dil icat
 * edilmedi.
 *
 * GÖLGE VE KIRPMA AYRI KATMANLARDA: iOS'ta `overflow:'hidden'` gölgeyi de
 * kırpıyor, ikisi aynı View'da olursa gölge hiç çizilmez. Gölge burada içerik
 * levhasını kahramandan ayıran tek şey.
 */
export function ApptHero({ topInset, children, padBottom = M.heroPadBottom }: {
    topInset: number; children: ReactNode; padBottom?: number;
}) {
    return (
        <View
            style={{
                zIndex: 2,
                elevation: M.heroElevation,
                backgroundColor: M.heroBg,
                borderBottomLeftRadius: M.heroRadius,
                borderBottomRightRadius: M.heroRadius,
                shadowColor: '#000',
                shadowOffset: M.heroShadowOffset,
                shadowRadius: M.heroShadowRadius,
                shadowOpacity: M.heroShadowOpacity,
            }}
        >
            <View
                style={{
                    paddingTop: topInset,
                    paddingBottom: padBottom,
                    borderBottomLeftRadius: M.heroRadius,
                    borderBottomRightRadius: M.heroRadius,
                    overflow: 'hidden',
                }}
            >
                {/* Etek: ısınma alt kenara kadar KESİNTİSİZ artar. Gradyan —
                    bulanıklık değil; cam içerik katmanına inmiyor. */}
                <LinearGradient
                    pointerEvents="none"
                    colors={[...M.skirtColors]}
                    locations={M.skirtLocations}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        height: `${M.skirtRatio * 100}%`,
                    }}
                />
                {children}
            </View>
        </View>
    );
}

/** Kahramanın altına yükselen krem içerik levhası. */
export function ApptPlate({ children, bg }: { children: ReactNode; bg: string }) {
    return (
        <View style={{
            flex: 1,
            zIndex: 3,
            marginTop: M.plateOverlap,
            paddingTop: M.platePadTop,
            backgroundColor: bg,
            borderTopLeftRadius: M.plateRadius,
            borderTopRightRadius: M.plateRadius,
            overflow: 'hidden',
        }}>
            {children}
        </View>
    );
}

/**
 * Üst çubuk. Yuvarlak düğme CAM DEĞİL: düz tint + hairline. Düğme opak koyu
 * levhanın üstünde duruyor, kıracak hareketli içerik yok — orada cam sahte
 * cam olur. (Tasarım belgesi v1'de camdı, v2'de düzeltildi.)
 */
export function ApptTopBar({ mode, onPress, title, step, small }: {
    mode: 'close' | 'back'; onPress: () => void; title: string; step: string; small: boolean;
}) {
    const ink = '#F3EDE3';
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: M.topGap,
            height: small ? M.topHeightSmall : M.topHeight,
            paddingHorizontal: small ? M.topXSmall : M.topX,
        }}>
            <Pressable
                onPress={() => { feedback.selection(); onPress(); }}
                accessibilityRole="button"
                accessibilityLabel={mode === 'close' ? 'Kapat' : 'Geri'}
                hitSlop={8}
                style={({ pressed }) => ({
                    width: M.gbtn, height: M.gbtn, borderRadius: M.gbtn / 2,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(37,32,21,0.55)',
                    borderWidth: 1, borderColor: 'rgba(243,237,227,0.16)',
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                {mode === 'close' ? <CloseIcon color={ink} /> : <BackChevron color={ink} />}
            </Pressable>
            <Text style={{
                color: ink, fontSize: M.topTitle, fontFamily: font.bold,
                fontWeight: '700', letterSpacing: -M.topTitle * 0.01,
            }}>
                {title}
            </Text>
            <N style={{
                marginLeft: 'auto',
                color: 'rgba(243,237,227,0.58)',
                fontSize: M.stepSize,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: M.stepSize * M.stepTracking,
            }}>
                {step}
            </N>
        </View>
    );
}

/**
 * Tipografik kahraman: "Çar." solda, "24" sağda. Ürünümüzde fotoğraf yok
 * (salon, personel, müşteri) — kahraman alanı bu yüzden YAZI.
 */
export function ApptDayHero({ short, num, sub, size, subSize, x, top, subTop }: {
    short: string; num: number; sub: ReactNode;
    size: number; subSize: number; x: number; top: number; subTop: number;
}) {
    return (
        <View style={{ paddingHorizontal: x, paddingTop: top }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Text style={{
                    color: '#F3EDE3', fontSize: size, fontFamily: font.extraBold,
                    fontWeight: '800', letterSpacing: size * M.dayTracking, lineHeight: size,
                }}>
                    {short}
                </Text>
                {/* Marka noktası — logonun noktası, turuncu envanterinin
                    dışında değil: markanın kendi işareti. */}
                <View style={{
                    width: size * M.dotRatio, height: size * M.dotRatio,
                    borderRadius: size * M.dotRatio,
                    backgroundColor: '#FF5A1F',
                    marginLeft: size * 0.05, marginBottom: size * 0.06,
                }} />
                <N style={{
                    marginLeft: 'auto',
                    color: 'rgba(243,237,227,0.36)',
                    fontSize: size, fontWeight: '300',
                    letterSpacing: size * M.dayNumberTracking, lineHeight: size,
                }}>
                    {num}
                </N>
            </View>
            <View style={{
                flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
                gap: M.subGap, marginTop: subTop,
            }}>
                {sub}
            </View>
        </View>
    );
}

/** Kahramanın alt satırındaki ayırıcı nokta. */
export function HeroDot() {
    return (
        <View style={{
            width: M.subDot, height: M.subDot, borderRadius: M.subDot,
            backgroundColor: 'rgba(243,237,227,0.36)',
        }} />
    );
}

export function HeroSubText({ children, strong, size }: {
    children: ReactNode; strong?: boolean; size: number;
}) {
    return (
        <Text style={{
            color: strong ? '#F3EDE3' : 'rgba(243,237,227,0.58)',
            fontSize: size,
            fontFamily: strong ? font.bold : font.semiBold,
            fontWeight: strong ? '700' : '600',
        }}>
            {children}
        </Text>
    );
}

// ── Gün şeridi ──────────────────────────────────────────────────────────────

/**
 * 14 gün, yatay. Seçili gün TURUNCU — turuncu envanterine uygun, çünkü gün
 * bir ZAMAN. "Bugün" ve "Yarın" rakamın altında adıyla yazılır.
 */
export function DayChip({ day, selected, today, onPress, height, width, numberSize, labelSize }: {
    day: DayOption; selected: boolean; today: boolean; onPress: () => void;
    height: number; width: number; numberSize: number; labelSize: number;
}) {
    const named = Boolean(day.relative);
    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={daySpeech(day, selected)}
            style={({ pressed }) => ({
                width, height,
                borderRadius: M.dayBoxRadius,
                alignItems: 'center', justifyContent: 'center',
                gap: M.dayBoxGap,
                borderWidth: 1,
                borderColor: !selected && today ? 'rgba(243,237,227,0.20)' : 'transparent',
                backgroundColor: selected ? '#FF5A1F' : 'transparent',
                opacity: pressed ? 0.8 : 1,
            })}
        >
            <N style={{
                color: selected ? apptInk.dark.ork : '#F3EDE3',
                fontSize: numberSize, fontWeight: '600',
                letterSpacing: numberSize * -0.02,
            }}>
                {day.num}
            </N>
            <Text style={{
                color: selected
                    ? APPT_SELECTED_DAY_LABEL
                    : named ? 'rgba(243,237,227,0.58)' : 'rgba(243,237,227,0.36)',
                fontSize: named ? labelSize + 0.5 : labelSize,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: named ? labelSize * 0.01 : labelSize * 0.04,
            }}>
                {named ? (day.relative ?? day.short) : upperTR(day.relative ?? day.short)}
            </Text>
            {today && !selected ? (
                <View style={{
                    position: 'absolute', bottom: M.todayDotBottom,
                    width: M.todayDot, height: M.todayDot, borderRadius: M.todayDot,
                    backgroundColor: '#FF5A1F',
                }} />
            ) : null}
        </Pressable>
    );
}

// ── Bölüm başlığı ───────────────────────────────────────────────────────────

export function SectionHead({ title, count, link, onLink, size }: {
    title: string; count?: string; link?: string; onLink?: () => void; size: number;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'baseline', gap: M.secGap,
            paddingTop: M.secTop, paddingBottom: M.secBottom, paddingHorizontal: M.secX,
        }}>
            <Text style={{
                color: c.tx2, fontSize: size, fontFamily: font.bold, fontWeight: '700',
                letterSpacing: size * M.secTracking,            }}>
                {upperTR(title)}
            </Text>
            {count ? (
                <Text style={{
                    color: c.tx3, fontSize: size, fontFamily: font.semiBold, fontWeight: '600',
                }}>
                    {count}
                </Text>
            ) : null}
            {link ? (
                <Pressable onPress={onLink} hitSlop={10} style={{ marginLeft: 'auto' }}>
                    <Text style={{
                        color: c.tx2, fontSize: M.secLink, fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {link}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

// ── Ray ─────────────────────────────────────────────────────────────────────

function timeStyle(c: Palette, muted: boolean, size: number): TextStyle {
    return { color: muted ? c.tx3 : c.tx2, fontSize: size, fontFamily: font.semiBold, fontWeight: '600' };
}

/** Boş satır: ince, sessiz. Yalnız hairline ve saat — az mürekkep. */
function FreeSlot({ item, onPress, ax }: { item: RailItem & { kind: 'free' }; onPress: () => void; ax: boolean }) {
    const { c } = useTheme();
    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={slotSpeech(item)}
            style={({ pressed }) => ({
                flexDirection: ax ? 'column' : 'row',
                alignItems: 'flex-start',
                minHeight: ax ? M.slotHeightAx : M.slotHeight,
                borderTopWidth: 1, borderTopColor: c.bd,
                opacity: pressed ? 0.55 : 1,
            })}
        >
            <N style={[
                timeStyle(c, false, ax ? M.timeSizeAx : M.timeSize),
                ax ? { paddingTop: 6 } : { width: M.timeColumn, paddingTop: M.timeTop },
            ]}>
                {item.time}
            </N>
        </Pressable>
    );
}

/** Kapalı satır: soluk ama sebebi KELİMEYLE yazılı. Renk tek ayırt edici değil. */
function ClosedSlot({ item, ax }: { item: RailItem & { kind: 'closed' }; ax: boolean }) {
    const { c } = useTheme();
    return (
        <View
            accessible
            accessibilityState={{ disabled: true }}
            accessibilityLabel={slotSpeech(item)}
            style={{
                flexDirection: ax ? 'column' : 'row',
                alignItems: 'flex-start',
                minHeight: ax ? M.slotHeightAx : M.slotHeight,
                borderTopWidth: 1, borderTopColor: c.bd,
            }}
        >
            <N style={[
                timeStyle(c, true, ax ? M.timeSizeAx : M.timeSize),
                ax ? { paddingTop: 6 } : { width: M.timeColumn, paddingTop: M.timeTop },
            ]}>
                {item.time}
            </N>
            <Txt style={{
                color: c.tx3,
                fontSize: ax ? M.whySizeAx : M.whySize,
                fontFamily: font.semiBold, fontWeight: '600',
                paddingTop: ax ? 2 : M.timeTop,
                flex: ax ? undefined : 1,
            }}>
                {item.reason}
            </Txt>
        </View>
    );
}

/**
 * Dolu satır: gerçek bir kart, sebebini kendi içinde taşıyor. Kart LİSTEDEN
 * KALKMAZ — müdür "neden burası yok" sorusunu ekranı terk etmeden
 * cevaplayabilmeli.
 *
 * Yüksekliği süreden türetiliyor: `span` kaç 30 dakika ise kart o kadar.
 * Tasarım belgesi buraya 96 sabit vermişti ve o yükseklik sürenin karşılığı
 * değildi — kart "10:30'a" derken sütun 10:00'da bitiyordu.
 */
function BusySlot({ item, ax }: { item: RailItem & { kind: 'busy' }; ax: boolean }) {
    const { c } = useTheme();
    const minutes = item.span * 30;
    return (
        <View
            accessible
            accessibilityState={{ disabled: true }}
            accessibilityLabel={slotSpeech(item)}
            style={{
                flexDirection: ax ? 'column' : 'row',
                alignItems: 'flex-start',
                borderTopWidth: 1, borderTopColor: c.bd,
                paddingBottom: M.blockGap,
            }}
        >
            <N style={[
                timeStyle(c, false, ax ? M.timeSizeAx : M.timeSize),
                ax ? { paddingTop: 6 } : { width: M.timeColumn, paddingTop: M.timeTopBusy },
            ]}>
                {item.time}
            </N>
            <View style={{
                flex: ax ? undefined : 1,
                alignSelf: ax ? 'stretch' : undefined,
                flexDirection: 'row', alignItems: 'center', gap: M.cardGap,
                minHeight: Math.max(M.cardMinHeight, ax ? 0 : blockHeight(minutes) - M.blockGap),
                marginTop: M.blockGap,
                paddingVertical: M.cardPadY, paddingHorizontal: M.cardPadX,
                borderRadius: M.cardRadius,
                backgroundColor: c.card,
                borderWidth: 1, borderColor: c.bd,
            }}>
                <View style={{
                    width: M.cardMark, height: M.cardMarkHeight, borderRadius: 2,
                    backgroundColor: item.color ?? c.bd2,
                }} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={{
                        color: c.tx, fontSize: M.cardTitle, fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {item.title}
                    </Text>
                    {item.customer ? (
                        <Txt numberOfLines={1} style={{ color: c.tx2, fontSize: M.cardSub }}>
                            {item.customer}
                        </Txt>
                    ) : null}
                </View>
                {item.until ? (
                    <N style={{
                        color: c.tx3, fontSize: M.cardRange,
                        fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {item.until}
                    </N>
                ) : null}
            </View>
        </View>
    );
}

/**
 * Seçili aralık — SÜRE GÖLGESİ. 75 dakikalık bir hizmette 11:00'e dokununca
 * blok 11:00'dan 12:15'e kadar SÜREKLİ uzanır; 11:30 ve 12:00 solda soluk
 * durur ve bloğun içinde tik olarak görünür. Süre yazıyla değil MEKÂNLA
 * anlatılıyor.
 *
 * "Kim yapacak" bir soru değil, bloğun içinde duran bir SONUÇ — ama
 * değiştirilebilir bir sonuç.
 */
type PickItem = (RailItem & { kind: 'pick' }) & { serviceName: string };

function PickSlot({ item, onChangeStaff, ax, ink }: {
    item: PickItem; onChangeStaff: () => void; ax: boolean; ink: ApptInk;
}) {
    const { c } = useTheme();
    const labels = blockLabels(item.minutes, item.durationMinutes);
    const ticks = blockTicks(item.durationMinutes);
    const height = blockHeight(item.durationMinutes);
    // Kısa hizmetlerde blok büyümez, İÇERİK küçülür. Gerekçesi tokens.ts'te.
    const tight = !ax && height < M.blockWideAt;
    const single = !ax && height < M.blockTightAt;
    const avatarSize = tight ? M.avatarTight : M.avatar;

    return (
        <View
            accessible
            accessibilityLabel={slotSpeech(item)}
            style={{
                flexDirection: ax ? 'column' : 'row',
                alignItems: 'flex-start',
                borderTopWidth: 1, borderTopColor: ink.blockBorder,
                paddingBottom: M.blockGap,
            }}
        >
            {ax ? (
                <View style={{ flexDirection: 'row', gap: 14, paddingTop: 2 }}>
                    {labels.map((label) => (
                        <N key={label.time} style={{
                            color: label.lead ? c.or2 : c.tx3,
                            fontSize: M.timeSizeAx,
                            fontFamily: label.lead ? font.bold : font.semiBold,
                            fontWeight: label.lead ? '700' : '600',
                        }}>
                            {label.time}
                        </N>
                    ))}
                </View>
            ) : (
                <View style={{ width: M.timeColumn, height: height + M.blockGap }}>
                    {labels.map((label) => (
                        <N key={label.time} style={{
                            position: 'absolute', left: 0, top: label.top,
                            color: label.lead ? c.or2 : c.tx3,
                            fontSize: M.timeSize,
                            fontFamily: label.lead ? font.bold : font.semiBold,
                            fontWeight: label.lead ? '700' : '600',
                        }}>
                            {label.time}
                        </N>
                    ))}
                </View>
            )}

            <View style={{
                flex: ax ? undefined : 1,
                alignSelf: ax ? 'stretch' : undefined,
                height: ax ? undefined : height,
                marginTop: M.blockGap,
                paddingTop: tight ? M.blockPadTopTight : M.blockPadTop,
                paddingHorizontal: M.blockPadX,
                paddingBottom: tight ? M.blockPadBottomTight : M.blockPadBottom,
                justifyContent: 'center',
                borderRadius: M.blockRadius,
                borderWidth: 1, borderColor: ink.blockBorder,
                overflow: 'hidden',
                flexDirection: single ? 'row' : 'column',
                alignItems: single ? 'center' : undefined,
                gap: ax ? 8 : single ? 10 : undefined,
            }}>
                <LinearGradient
                    pointerEvents="none"
                    colors={[ink.blockFrom, ink.blockTo]}
                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                />
                {/* 30 dakikalık tikler: bloğun kaç kutu kapladığını gösterir. */}
                {ax ? null : ticks.map((top) => (
                    <View key={top} style={{
                        position: 'absolute', left: 0, right: 0, top,
                        height: 1, backgroundColor: ink.blockTick,
                    }} />
                ))}

                <View style={{
                    flexDirection: ax ? 'column' : 'row',
                    alignItems: ax ? 'flex-start' : 'baseline',
                    gap: ax ? 3 : 8,
                }}>
                    <N style={{
                        color: c.tx,
                        fontSize: ax ? M.blockTitleAx : tight ? M.blockTitleTight : M.blockTitle,
                        fontFamily: font.extraBold, fontWeight: '800',
                        letterSpacing: M.blockTitle * -0.02,
                    }}>
                        {item.range}
                    </N>
                    {single ? null : (
                        <Txt numberOfLines={1} style={{
                            flexShrink: 1,
                            color: c.tx2, fontSize: ax ? 17 : M.blockService,
                            fontFamily: font.semiBold, fontWeight: '600',
                        }}>
                            {item.serviceName}
                        </Txt>
                    )}
                    {ax || single ? null : (
                        <N style={{
                            marginLeft: 'auto', color: c.or2, fontSize: M.blockDuration,
                            fontFamily: font.extraBold, fontWeight: '800',
                        }}>
                            {item.durationMinutes} dk
                        </N>
                    )}
                </View>

                <View style={{
                    flex: single ? 1 : undefined,
                    marginTop: ax || single ? 0 : 'auto',
                    flexDirection: ax ? 'column' : 'row',
                    alignItems: ax ? 'flex-start' : 'center',
                    gap: ax ? 8 : 9,
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 }}>
                        <View style={{
                            width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd2,
                        }}>
                            <Text style={{
                                color: c.tx, fontSize: tight ? M.avatarTextTight : M.avatarText,
                                fontFamily: font.extraBold, fontWeight: '800',
                            }}>
                                {item.staff?.initials.slice(0, 1) ?? '—'}
                            </Text>
                        </View>
                        <Text numberOfLines={1} style={{
                            color: c.tx,
                            fontSize: ax ? 17 : tight ? M.whoNameTight : M.whoName,
                            fontFamily: font.bold, fontWeight: '700',
                        }}>
                            {item.staff ? `${item.staff.name} yapacak` : 'Kişi atanmadı'}
                        </Text>
                    </View>
                    <Pressable
                        onPress={() => { feedback.selection(); onChangeStaff(); }}
                        accessibilityRole="button"
                        accessibilityLabel="Yapacak kişiyi değiştir"
                        hitSlop={8}
                        style={{
                            marginLeft: ax ? 0 : 'auto',
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            height: single ? 30 : M.gbtn, paddingLeft: ax ? 0 : 8,
                        }}
                    >
                        <Text style={{
                            color: c.tx2,
                            fontSize: ax ? 17 : tight ? M.whoAction - 0.5 : M.whoAction,
                            fontFamily: font.bold, fontWeight: '700',
                        }}>
                            Değiştir
                        </Text>
                        <SwapIcon color={c.tx2} size={tight ? 14 : 15} />
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

/** Bir bölümün başlığı + satırları. */
export function RailBlock({ data, serviceName, onPick, onChangeStaff, ax, x }: {
    data: RailSection; serviceName: string;
    onPick: (minutes: number) => void; onChangeStaff: () => void; ax: boolean; x: number;
}) {
    const { dark } = useTheme();
    const ink = dark ? apptInk.dark : apptInk.light;
    return (
        <View>
            <SectionHead
                title={data.section.title}
                count={freeLabel(data.freeCount)}
                size={ax ? M.secTitleAx : M.secTitle}
            />
            <View style={{ paddingHorizontal: x }}>
                {data.items.map((item) => {
                    if (item.kind === 'free') {
                        return <FreeSlot key={item.minutes} item={item} ax={ax} onPress={() => onPick(item.minutes)} />;
                    }
                    if (item.kind === 'closed') return <ClosedSlot key={item.minutes} item={item} ax={ax} />;
                    if (item.kind === 'busy') return <BusySlot key={item.minutes} item={item} ax={ax} />;
                    return (
                        <PickSlot
                            key={item.minutes}
                            item={{ ...item, serviceName }}
                            ink={ink}
                            ax={ax}
                            onChangeStaff={onChangeStaff}
                        />
                    );
                })}
            </View>
        </View>
    );
}

// ── Müşteri ve hizmet ───────────────────────────────────────────────────────

export function Initials({ text, size, textSize, color }: {
    text: string; size: number; textSize: number; color?: string;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: c.surf2,
            borderWidth: 1, borderColor: color ?? c.bd2,
        }}>
            <Text style={{
                color: c.tx, fontSize: textSize, fontFamily: font.extraBold, fontWeight: '800',
            }}>
                {text}
            </Text>
        </View>
    );
}

/**
 * Müşteri satırı. Telefon EKRANDA HAM GÖSTERİLMEZ; numarası olmayan
 * müşteride tire.
 */
export function CustomerRow({ name, hint, phone, query, onPress }: {
    name: string; hint: string; phone: string | null; query?: string; onPress: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${hint}`}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: M.rowGap,
                minHeight: M.rowHeight,
                paddingVertical: M.rowPadY, paddingHorizontal: M.secX,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <Initials text={initialsOf(name)} size={M.rowAvatar} textSize={M.rowAvatarText} />
            <View style={{ flex: 1, gap: 2 }}>
                <Highlight
                    text={name}
                    query={query}
                    style={{ color: c.tx, fontSize: M.rowName, fontFamily: font.bold, fontWeight: '700' }}
                />
                <Txt numberOfLines={1} style={{ color: c.tx2, fontSize: M.rowHint }}>{hint}</Txt>
            </View>
            <N style={{ color: c.tx3, fontSize: M.rowPhone, fontFamily: font.semiBold, fontWeight: '600' }}>
                {phone ?? '—'}
            </N>
        </Pressable>
    );
}

/** Eşleşen harfleri kalınlaştırır — renk değil, ağırlık ve alt çizgi. */
export function Highlight({ text, query, style }: {
    text: string; query?: string; style: StyleProp<TextStyle>;
}) {
    const { c } = useTheme();
    const needle = (query ?? '').trim();
    if (!needle) return <Text numberOfLines={1} style={style}>{text}</Text>;

    const lower = text.toLocaleLowerCase('tr');
    const at = lower.indexOf(needle.toLocaleLowerCase('tr'));
    if (at < 0) return <Text numberOfLines={1} style={style}>{text}</Text>;

    return (
        <Text numberOfLines={1} style={style}>
            {text.slice(0, at)}
            <Text style={{ fontFamily: font.extraBold, fontWeight: '800', textDecorationLine: 'underline', textDecorationColor: c.bd2 }}>
                {text.slice(at, at + needle.length)}
            </Text>
            {text.slice(at + needle.length)}
        </Text>
    );
}

/**
 * Sayfa 1'in tipografik kahramanı.
 *
 * Müşteri seçilmeden soruyu sorar ("Kim ve ne."), seçildikten sonra MÜŞTERİNİN
 * ADINA dönüşür ve altına maskeli telefonu yazar. Böylece iki sayfanın da bir
 * kahramanı oluyor — sayfa 2'nin "Çar. 24"ü ile aynı dil — ve müdür kiminle
 * ilgilendiğini kaybetmiyor.
 *
 * Marka noktası YALNIZ soruda: bir kişinin adının sonuna nokta koymak markanın
 * işaretini kişiye yapıştırırdı.
 */
export function ApptPageTitle({ name, phone, onClear, size, x, top }: {
    name: string | null; phone: string | null; onClear?: () => void;
    size: number; x: number; top: number;
}) {
    const text = name ?? 'Kim ve ne';
    const shown = name && name.length > M.titleLongAt ? Math.min(size, M.titleLong) : size;
    return (
        <View style={{ paddingHorizontal: x, paddingTop: top }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{
                        flexShrink: 1,
                        color: '#F3EDE3', fontSize: shown, fontFamily: font.extraBold,
                        fontWeight: '800', letterSpacing: shown * M.titleTracking,
                        lineHeight: shown * 1.06,
                    }}
                >
                    {text}
                </Text>
                {name ? null : (
                    <View style={{
                        width: shown * M.dotRatio, height: shown * M.dotRatio,
                        borderRadius: shown * M.dotRatio,
                        backgroundColor: '#FF5A1F',
                        marginLeft: shown * 0.05, marginBottom: shown * 0.1,
                    }} />
                )}
                {name && onClear ? (
                    <Pressable
                        onPress={() => { feedback.selection(); onClear(); }}
                        accessibilityRole="button"
                        accessibilityLabel="Müşteriyi değiştir"
                        hitSlop={6}
                        style={{
                            marginLeft: 'auto',
                            width: M.gbtn, height: M.gbtn, borderRadius: M.gbtn / 2,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: 'rgba(37,32,21,0.55)',
                            borderWidth: 1, borderColor: 'rgba(243,237,227,0.16)',
                        }}
                    >
                        <CloseIcon color="rgba(243,237,227,0.72)" size={18} />
                    </Pressable>
                ) : null}
            </View>
            {/* Telefon yoksa satır HİÇ çizilmez: tek başına bir tire yarım
                kalmış gibi duruyordu. */}
            {name && phone ? (
                <N style={{
                    marginTop: 6,
                    color: 'rgba(243,237,227,0.58)', fontSize: M.subSize,
                    fontFamily: font.semiBold, fontWeight: '600',
                }}>
                    {phone}
                </N>
            ) : null}
        </View>
    );
}

/**
 * Hizmet satırı. Süre ve fiyat HER ZAMAN görünür — süre sayfa 2'nin rayını
 * değiştiriyor, müdür seçmeden önce görmeli.
 *
 * Seçim TURUNCU DEĞİL: turuncu envanteri zaman ve eylem. Seçim `surf2` zemin
 * + `bd2` kenar + onay işaretiyle anlatılıyor. Fiyat da nötr — vurgu yok,
 * rozet yok.
 */
export function ServiceRow({ service, selected, onPress }: {
    service: ServiceOption; selected: boolean; onPress: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${service.name}, ${service.minutes} dakika${service.price === null ? '' : `, ${service.price} lira`}`}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: M.rowGap,
                minHeight: M.rowHeight,
                marginHorizontal: M.secX, marginBottom: M.serviceGap,
                paddingHorizontal: M.servicePadX,
                borderRadius: M.serviceRadius,
                backgroundColor: selected ? c.surf2 : c.card,
                borderWidth: 1, borderColor: selected ? c.bd2 : c.bd,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <View style={{
                width: M.serviceMark, height: M.serviceMarkHeight, borderRadius: 2,
                backgroundColor: service.color,
            }} />
            <Text numberOfLines={1} style={{
                color: c.tx, fontSize: M.rowName, fontFamily: font.bold, fontWeight: '700',
            }}>
                {service.name}
            </Text>
            <N style={{
                marginLeft: 'auto', color: c.tx2, fontSize: M.serviceMeta,
                fontFamily: font.semiBold, fontWeight: '600',
            }}>
                {/* Fiyatı yazılmamış hizmette "₺0" DEĞİL: yalnız süre. */}
                {service.price === null
                    ? `${service.minutes} dk`
                    : `${service.minutes} dk · ₺${service.price.toLocaleString('tr-TR')}`}
            </N>
            {selected ? (
                <View style={{
                    width: M.serviceCheck, height: M.serviceCheck, borderRadius: M.serviceCheck / 2,
                    alignItems: 'center', justifyContent: 'center', backgroundColor: c.tx,
                }}>
                    <CheckIcon color={c.bg} />
                </View>
            ) : null}
        </Pressable>
    );
}

/**
 * Müdür 23 v2 · KAPALI hizmet satırı — randevu anı kartın sözünü tutuyor.
 *
 * Basılabilir DEĞİL: `Pressable` hiç sarmıyor ("disabled" bir düğme de değil
 * — ölü kontrol yasağının ekran okuyucu karşılığı düz metin). Kırmızı zemin,
 * KAPALI etiketi ve altında SEBEP: sebep satırı olmadan yasak keyfi görünür;
 * müdür sebebi bilirse müşteriye açıklayabilir. Kart ile aynı kaynak
 * (`eligibility.closedBy`), aynı kelime: kapalı.
 */
export function ClosedServiceRow({ service, reason }: { service: ServiceOption; reason: string }) {
    const { c, dark } = useTheme();
    return (
        <View
            accessible
            accessibilityLabel={`${service.name}, kapalı. ${reason}.`}
            style={{
                flexDirection: 'row', alignItems: 'center', gap: M.rowGap,
                minHeight: 56,
                marginHorizontal: M.secX, marginBottom: M.serviceGap,
                paddingHorizontal: M.servicePadX, paddingVertical: 10,
                borderRadius: M.serviceRadius,
                backgroundColor: dark ? 'rgba(224,114,114,0.10)' : 'rgba(201,64,64,0.07)',
                borderWidth: 1, borderColor: c.bd,
            }}
        >
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                    <Text numberOfLines={1} style={{
                        color: c.tx3, fontSize: M.rowName, fontFamily: font.bold, fontWeight: '700',
                    }}>
                        {service.name}
                    </Text>
                    <View style={{
                        height: 22, paddingHorizontal: 8, borderRadius: 6, justifyContent: 'center',
                        borderWidth: 1, borderColor: dark ? 'rgba(224,114,114,0.44)' : 'rgba(201,64,64,0.40)',
                    }}>
                        <Text style={{
                            color: c.rd, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800',
                            letterSpacing: 10.5 * 0.1,
                        }}>
                            KAPALI
                        </Text>
                    </View>
                </View>
                <Text style={{ color: c.rd, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500' }}>
                    {reason}
                </Text>
            </View>
        </View>
    );
}

// ── Not · boş sonuç · nötr buton ────────────────────────────────────────────

/**
 * İsteğe bağlı not. Katlanmış bir satır — sayfayı şişirmiyor; dokununca AYNI
 * kutunun içinde yazı alanına dönüşüyor. Hiçbir şey yapmayan bir satır
 * koymaktansa küçük ama gerçek bir alan koymak daha dürüst.
 */
export function NoteRow({ value, editing, onPress, onChange, onDone }: {
    value: string | null; editing: boolean;
    onPress: () => void; onChange: (text: string) => void; onDone: () => void;
}) {
    const { c } = useTheme();
    const box: ViewStyle = {
        flexDirection: 'row', alignItems: 'center', gap: M.noteGap,
        minHeight: M.noteHeight,
        marginTop: M.noteTop, marginHorizontal: M.secX,
        paddingHorizontal: M.notePadX,
        borderRadius: M.noteRadius,
        backgroundColor: c.surf2,
        borderWidth: 1, borderColor: c.bd2, borderStyle: 'dashed',
    };

    if (editing) {
        return (
            <View style={box}>
                <PenIcon color={c.tx2} />
                <TextInput
                    autoFocus
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onDone}
                    onSubmitEditing={onDone}
                    returnKeyType="done"
                    placeholder="Not"
                    placeholderTextColor={c.tx3}
                    accessibilityLabel="Randevu notu"
                    style={{
                        flex: 1, color: c.tx, fontSize: M.noteSize,
                        fontFamily: font.semiBold, fontWeight: '600',
                    }}
                />
            </View>
        );
    }

    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={value ? `Not: ${value}` : 'Not ekle'}
            style={({ pressed }) => [box, { opacity: pressed ? 0.7 : 1 }]}
        >
            <PenIcon color={c.tx2} />
            <Txt numberOfLines={1} style={{
                color: value ? c.tx : c.tx2,
                fontSize: M.noteSize, fontFamily: font.semiBold, fontWeight: '600', flex: 1,
            }}>
                {value ?? 'Not ekle'}
            </Txt>
        </Pressable>
    );
}

export function EmptyResult({ title, body }: { title: string; body: string }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingTop: M.emptyTop, paddingHorizontal: M.secX, gap: M.emptyGap }}>
            <Text style={{
                color: c.tx, fontSize: M.emptyTitle, fontFamily: font.extraBold,
                fontWeight: '800', letterSpacing: M.emptyTitle * -0.02,
            }}>
                {title}
            </Text>
            <Txt style={{ color: c.tx2, fontSize: M.emptyBody, lineHeight: M.emptyBody * 1.5 }}>
                {body}
            </Txt>
        </View>
    );
}

/**
 * Nötr mürekkep buton — "yeni müşteri ekle". Turuncu DEĞİL: turuncu zaman ve
 * eylem için ayrılmış ve bu ekranın turuncusu sayfa 2'de.
 */
export function SolidButton({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            onPress={() => { feedback.selection(); onPress(); }}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
                height: M.solidHeight,
                marginTop: M.solidTop, marginHorizontal: M.secX,
                borderRadius: M.solidRadius,
                backgroundColor: c.tx,
                opacity: pressed ? 0.8 : 1,
            })}
        >
            <PlusIcon color={c.bg} size={20} />
            <Text style={{
                color: c.bg, fontSize: M.solidText, fontFamily: font.extraBold,
                fontWeight: '800', letterSpacing: M.solidText * -0.015,
            }}>
                {label}
            </Text>
        </Pressable>
    );
}

/**
 * Yeni müşterinin telefonu. Tasarım "yalnız ad yeter" diyordu; hatırlatmalar
 * WhatsApp'tan gittiği için numarasız kayıt hatırlatma alamıyor, bu yüzden
 * alan SORULUYOR ama zorunlu değil — müdür telefondaki müşteriyi bekletmesin.
 * Boş bırakılırsa bedeli hemen altında yazılı.
 */
export function PhoneField({ value, onChange, autoFocus }: {
    value: string; onChange: (text: string) => void; autoFocus?: boolean;
}) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: M.searchGap,
            height: M.searchHeight,
            marginHorizontal: M.secX,
            paddingHorizontal: M.searchPadX,
            borderRadius: M.searchRadius,
            backgroundColor: c.surf2,
            borderWidth: 1, borderColor: c.bd,
        }}>
            <PhoneIcon color={c.tx2} />
            <TextInput
                value={value}
                onChangeText={onChange}
                autoFocus={autoFocus}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                placeholder="0532 000 00 00"
                placeholderTextColor={c.tx3}
                accessibilityLabel="Telefon numarası, isteğe bağlı"
                style={[numeric, {
                    flex: 1, color: c.tx, fontSize: M.searchSize, fontWeight: '600',
                }]}
            />
            {value ? (
                <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Numarayı sil">
                    <CloseIcon color={c.tx2} size={18} />
                </Pressable>
            ) : null}
        </View>
    );
}

export function PhoneIcon({ color, size = 20 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path
                d="M6.2 3.6h3l1.4 3.6-2 1.3a12.4 12.4 0 0 0 6.9 6.9l1.3-2 3.6 1.4v3a2 2 0 0 1-2.2 2A17.6 17.6 0 0 1 4.2 5.8a2 2 0 0 1 2-2.2Z"
                stroke={color} {...stroke}
            />
        </Svg>
    );
}

export function Hint({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <Txt style={{
            color: c.tx3, fontSize: M.hintSize,
            paddingTop: M.hintTop, paddingHorizontal: M.secX,
            lineHeight: M.hintSize * 1.5,
        }}>
            {children}
        </Txt>
    );
}

// ── Özet ızgarası + eylem ───────────────────────────────────────────────────

export interface KeyValue { label: string; value: string; muted?: boolean; numeric?: boolean }

/**
 * 2 × 2 etiket/değer ızgarası. Dört bilgi iki satırda — tarama süresi sıfır.
 * Erişilebilirlik boyutu büyüyünce tek kolona düşer.
 */
export function KeyValueGrid({ rows, ax }: { rows: readonly KeyValue[]; ax: boolean }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', flexWrap: 'wrap',
            rowGap: M.kvGapRow, columnGap: M.kvGapCol,
        }}>
            {rows.map((row) => (
                <View key={row.label} style={{ width: ax ? '100%' : '46%', gap: 2 }}>
                    <Text style={{
                        color: c.tx2, fontSize: ax ? M.kvLabelAx : M.kvLabel,
                        fontFamily: font.bold, fontWeight: '700',
                        letterSpacing: M.kvLabel * M.kvTracking,                    }}>
                        {upperTR(row.label)}
                    </Text>
                    {row.numeric ? (
                        <N numberOfLines={1} style={{
                            color: row.muted ? c.tx3 : c.tx,
                            fontSize: ax ? M.kvValueAx : M.kvValue,
                            fontWeight: '600', letterSpacing: M.kvValue * -0.005,
                        }}>
                            {row.value}
                        </N>
                    ) : (
                        <Text numberOfLines={1} style={{
                            color: row.muted ? c.tx3 : c.tx,
                            fontSize: ax ? M.kvValueAx : M.kvValue,
                            fontFamily: row.muted ? font.semiBold : font.bold,
                            fontWeight: row.muted ? '600' : '700',
                            letterSpacing: M.kvValue * -0.015,
                        }}>
                            {row.value}
                        </Text>
                    )}
                </View>
            ))}
        </View>
    );
}

/**
 * Tek turuncu eylem. Turuncu burada meşru: bu bir EYLEM.
 * Yüzey düz — gradyan, iç parlaklık ve 3B kabartma yok.
 */
export function ApptCta({ label, enabled, onPress, ax, right }: {
    label: string; enabled: boolean; onPress: () => void; ax: boolean; right?: ReactNode;
}) {
    const { c, dark } = useTheme();
    const ink = dark ? apptInk.dark : apptInk.light;
    return (
        <Pressable
            onPress={() => { if (!enabled) return; feedback.selection(); onPress(); }}
            disabled={!enabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            accessibilityLabel={label}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                height: ax ? M.ctaHeightAx : M.ctaHeight,
                borderRadius: M.ctaRadius,
                // Pasif hâlde DOLGU YOK: cam çubuğun içinde ikinci bir koyu
                // levha gibi duruyordu. İnce çerçeve yeter.
                backgroundColor: enabled ? c.or : 'transparent',
                borderWidth: enabled ? 0 : 1,
                borderColor: c.bd2,
                opacity: pressed && enabled ? 0.86 : 1,
            })}
        >
            <Text style={{
                color: enabled ? ink.pink : c.tx2,
                fontSize: ax ? M.ctaTextAx : M.ctaText,
                fontFamily: font.extraBold, fontWeight: '800',
                letterSpacing: M.ctaText * -0.02,
            }}>
                {label}
            </Text>
            {enabled ? right : null}
        </Pressable>
    );
}

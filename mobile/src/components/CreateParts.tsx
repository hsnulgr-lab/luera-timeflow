import { forwardRef, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { createMetrics, font, hit, numeric, radius, useTheme } from '../theme';
import type { SummaryRow } from '../lib/createFlow';
import { upperTR } from '../lib/text';

/**
 * Müdür 09 — randevu oluşturma sheet'inin parçaları.
 *
 * Sheet üç bölmeli ve bölmeler SABİT: tutamak + başlık + adım göstergesi üstte,
 * liste ortada kayar, tek eylem altta. Bu düzen dört adımda da aynı kalıyor —
 * müdür her adımda butonun nerede olduğunu yeniden aramasın.
 */

// ── Kabuk ───────────────────────────────────────────────────────────────────

export function SheetGrabber() {
    const { c } = useTheme();
    return (
        <View style={{
            height: createMetrics.grabberHeight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.glass,
            borderBottomWidth: 1,
            borderBottomColor: c.glassBorder,
        }}>
            <View style={{
                width: createMetrics.grabberWidth,
                height: createMetrics.grabberBar,
                borderRadius: createMetrics.grabberBar,
                backgroundColor: c.tx,
                opacity: createMetrics.grabberOpacity,
            }} />
        </View>
    );
}

export function SheetHead({ title, right }: { title: string; right?: ReactNode }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: createMetrics.headGap,
            paddingTop: createMetrics.headTop,
            paddingBottom: createMetrics.headBottom,
            paddingLeft: createMetrics.headLeft,
            paddingRight: createMetrics.headRight,
        }}>
            <Text numberOfLines={1} style={{
                flex: 1,
                color: c.tx,
                fontSize: createMetrics.headTitle,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: createMetrics.headTitle * -0.028,
            }}>
                {title}
            </Text>
            {right}
        </View>
    );
}

/**
 * Adım göstergesi. Dört ince çubuk — nokta değil çubuk, çünkü ilerleme
 * çubukları "ne kadar kaldı" sorusunu bir bakışta cevaplıyor.
 */
export function StepBars({ dots }: { dots: readonly boolean[] }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            gap: createMetrics.stepsGap,
            paddingHorizontal: createMetrics.stepsX,
            paddingTop: createMetrics.stepsTop,
            paddingBottom: createMetrics.stepsBottom,
        }}>
            {dots.map((on, index) => (
                <View
                    key={index}
                    style={{
                        flex: 1,
                        height: createMetrics.stepBar,
                        borderRadius: createMetrics.stepBar,
                        backgroundColor: on ? c.tx : c.bd2,
                    }}
                />
            ))}
        </View>
    );
}

export function SheetFoot({ children }: { children: ReactNode }) {
    const { c } = useTheme();
    return (
        <View style={{
            gap: createMetrics.footGap,
            paddingHorizontal: createMetrics.footX,
            paddingTop: createMetrics.footY,
            paddingBottom: createMetrics.footBottom,
            borderTopWidth: 1,
            borderTopColor: c.bd,
            backgroundColor: c.surf,
        }}>
            {children}
        </View>
    );
}

export function SheetFootNote({ children }: { children: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            textAlign: 'center',
            color: c.tx3,
            fontSize: createMetrics.footNote,
            fontFamily: font.medium,
            fontWeight: '500',
        }}>
            {children}
        </Text>
    );
}

/** Sheet'in kayan gövdesi. Liste hep burada; kabuk kaymaz. */
export function SheetBody({ children }: { children: ReactNode }) {
    return (
        <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            {children}
        </ScrollView>
    );
}

export function Hair() {
    const { c } = useTheme();
    return <View style={{ height: 1, backgroundColor: c.bd }} />;
}

export function Kicker({ label, right }: { label: string; right?: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 20,
            paddingBottom: 9,
            paddingHorizontal: 20,
        }}>
            <Text style={{
                color: c.tx2,
                fontSize: 11.5,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: 11.5 * 0.16,
            }}>
                {upperTR(label)}
            </Text>
            {right ? (
                <Text style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.bold, fontWeight: '700' }}>
                    {right}
                </Text>
            ) : null}
        </View>
    );
}

// ── Arama ───────────────────────────────────────────────────────────────────

export const SearchField = forwardRef<TextInput, {
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
}>(function SearchField({ value, onChangeText, placeholder }, ref) {
    const { c } = useTheme();
    const typed = value.length > 0;
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: createMetrics.searchGap,
            height: createMetrics.searchHeight,
            marginHorizontal: createMetrics.searchMargin,
            marginBottom: createMetrics.searchBottom,
            paddingHorizontal: createMetrics.searchX,
            borderRadius: radius.md,
            backgroundColor: c.surf2,
            borderWidth: 1,
            borderColor: typed ? c.bd2 : c.bd,
        }}>
            <SearchIcon color={c.tx3} />
            <TextInput
                ref={ref}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={c.tx2}
                autoCorrect={false}
                returnKeyType="search"
                selectionColor={c.or}
                style={{
                    flex: 1,
                    color: typed ? c.tx : c.tx2,
                    fontSize: createMetrics.searchText,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    // Android'de TextInput kendi dolgusunu ekliyor; kutu 48'i aşmasın.
                    padding: 0,
                }}
            />
        </View>
    );
});

function SearchIcon({ color }: { color: string }) {
    return (
        <Svg
            width={createMetrics.searchIcon}
            height={createMetrics.searchIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35" />
        </Svg>
    );
}

export function PlusIcon({ color, size = 21 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
            <Path d="M12 5v14M5 12h14" />
        </Svg>
    );
}

export function BackIcon({ color }: { color: string }) {
    return (
        <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
        </Svg>
    );
}

export function ChevronIcon({ color }: { color: string }) {
    return (
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 18l6-6-6-6" />
        </Svg>
    );
}

// ── Satırlar ────────────────────────────────────────────────────────────────

export function Avatar({ initials, color, size = 44 }: { initials: string; color?: string; size?: number }) {
    const { c } = useTheme();
    return (
        <View style={{
            width: size,
            height: size,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.surf2,
            borderWidth: 2,
            borderColor: color ?? c.bd2,
        }}>
            <Text style={{
                color: c.tx,
                fontSize: size * 0.33,
                fontFamily: font.extraBold,
                fontWeight: '800',
                letterSpacing: size * -0.007,
            }}>
                {initials}
            </Text>
        </View>
    );
}

/**
 * Liste satırı. Dokunulabilir olan ve olmayan AYNI biçimde çizilir, tek fark
 * saydamlık — "neden buraya dokunamıyorum" sorusu doğmasın diye satır yerinde
 * durur ve sebebini yazar.
 */
export function PickRow({ left, title, subtitle, right, onPress, disabled = false }: {
    left?: ReactNode;
    title: string;
    subtitle?: string;
    right?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
}) {
    const { c } = useTheme();

    const body = (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 13,
            paddingVertical: 14,
            paddingHorizontal: 18,
            minHeight: hit.row,
            opacity: disabled ? createMetrics.disabledOpacity : 1,
        }}>
            {left}
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text numberOfLines={1} style={{
                    color: c.tx,
                    fontSize: 15.5,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: 15.5 * -0.015,
                }}>
                    {title}
                </Text>
                {subtitle ? (
                    <Text numberOfLines={1} style={{
                        color: c.tx2,
                        fontSize: 13,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {right}
        </View>
    );

    if (disabled || !onPress) {
        return <View accessible accessibilityLabel={subtitle ? `${title} · ${subtitle}` : title}>{body}</View>;
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={subtitle ? `${title} · ${subtitle}` : title}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({ backgroundColor: pressed ? c.surf2 : 'transparent' })}
        >
            {body}
        </Pressable>
    );
}

/** Saat sütunu — sabit genişlik, rakamlar hizalı. */
export function SlotTime({ time }: { time: string }) {
    const { c } = useTheme();
    return (
        <Num size={createMetrics.slotTimeSize} style={{
            width: createMetrics.slotTimeWidth,
            color: c.tx,
            fontFamily: font.extraBold,
            fontWeight: '800',
        }}>
            {time}
        </Num>
    );
}

// ── Özet ────────────────────────────────────────────────────────────────────

/** Adı iki ağırlıkta yazar: ilk ad ince, soyad kalın. Tasarımın imzası. */
export function SummaryName({ name }: { name: string }) {
    const { c } = useTheme();
    const parts = name.trim().split(' ');
    const last = parts.length > 1 ? parts.pop() ?? '' : '';
    const first = parts.join(' ');
    return (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <Text style={{
                color: c.tx2,
                fontSize: createMetrics.summaryName,
                fontFamily: font.medium,
                fontWeight: '500',
                letterSpacing: createMetrics.summaryName * -0.03,
            }}>
                {first}
            </Text>
            {last ? (
                <Text style={{
                    color: c.tx,
                    fontSize: createMetrics.summaryName,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: createMetrics.summaryName * -0.035,
                }}>
                    {last}
                </Text>
            ) : null}
        </View>
    );
}

export function SummaryLine({ row }: { row: SummaryRow }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{
                width: createMetrics.summaryLabelWidth,
                color: c.tx2,
                fontSize: createMetrics.summaryLabel,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: createMetrics.summaryLabel * 0.1,
            }}>
                {upperTR(row.label)}
            </Text>

            {row.initials ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Avatar initials={row.initials} color={row.color} size={30} />
                    <Text style={{
                        color: c.tx,
                        fontSize: createMetrics.summaryValue,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        {row.value}
                    </Text>
                </View>
            ) : (
                <Text style={[
                    {
                        flex: 1,
                        color: row.emphasis ? c.or : c.tx,
                        fontSize: row.emphasis ? createMetrics.summaryAmount : createMetrics.summaryValue,
                        fontFamily: row.emphasis ? font.extraBold : font.bold,
                        fontWeight: row.emphasis ? '800' : '700',
                    },
                    // Saat ve tutar rakamdır; sütunlar oynamasın.
                    row.label === 'Saat' || row.emphasis ? numeric : null,
                ]}>
                    {row.value}
                </Text>
            )}
        </View>
    );
}

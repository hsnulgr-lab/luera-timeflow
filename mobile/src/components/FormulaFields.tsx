/**
 * Personel 08 — formülün dört alanı. Alt sayfa ve tam sayfa AYNI gövdeyi
 * kullanıyor: iki ayrı uygulama zamanla ayrışırdı.
 *
 * Sıra sabit: malzeme · oran · bekleme · sonuç. Karşılaştırmayı mümkün
 * kılan şey sabit hiza.
 */

import { Children } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import { upperTR } from '../lib/text';
import { numeric, useTheme } from '../theme';

export const F = {
    grid: 68, gap: 8, radius: 18,
    button: 64, buttonRadius: 22,
} as const;

export function Field({ label, note, children }: {
    label: string; note?: string; children: React.ReactNode;
}) {
    const { c } = useTheme();
    return (
        <View style={{ gap: 8, paddingTop: 8, paddingHorizontal: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{
                    fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89,
                    color: c.tx3,
                }}>
                    {upperTR(label)}
                </Text>
                {note ? (
                    <Text style={{ marginLeft: 'auto', fontSize: 11, fontWeight: '600', color: c.tx3 }}>
                        {note}
                    </Text>
                ) : null}
            </View>
            {children}
        </View>
    );
}

/**
 * "Bu bir girdi değil" bilgisi BİÇİMDEN geliyor: kenarlıksız, sönük zemin.
 * Dolu gelen alanlar ve kilitli alanlar aynı gövdeyi paylaşıyor.
 */
export function Auto({ rows, long }: { rows?: [string, string][]; long?: string }) {
    const { c } = useTheme();
    return (
        <View style={{ gap: 7, paddingVertical: 11, paddingHorizontal: 14, borderRadius: F.radius, backgroundColor: c.fld }}>
            {long ? (
                <Text style={{ fontSize: 14, fontWeight: '500', lineHeight: 20.3, color: c.tx2 }}>{long}</Text>
            ) : (rows ?? []).map(([name, meta]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.15, color: c.tx }}>
                        {name}
                    </Text>
                    {meta ? (
                        <Text style={[{
                            marginLeft: 'auto', fontSize: 10.5, fontWeight: '700',
                            letterSpacing: 1.37, color: c.tx3,
                        }, numeric]}>
                            {upperTR(meta)}
                        </Text>
                    ) : null}
                </View>
            ))}
        </View>
    );
}

/**
 * Izgara — sütun sayısı çocuk sayısından geliyor. `columns` yalnız çağıranın
 * niyetini okunur kılıyor; RN'de eşit paylaşımı `flex: 1` yapıyor.
 */
export function Grid({ children }: { columns?: 3 | 4; children: React.ReactNode }) {
    // `Children.toArray` DÜZLEŞTİRİYOR: çağıran `{LIST.map(...)}` ile tek bir
    // düğmeyi yan yana veriyor ve dizi olduğu gibi sarılırsa üç düğme tek
    // sütunda üst üste biniyordu.
    const items = Children.toArray(children);
    return (
        <View style={{ flexDirection: 'row', gap: F.gap }}>
            {items.map((child, index) => (
                <View key={index} style={{ flex: 1, minWidth: 0 }}>{child}</View>
            ))}
        </View>
    );
}

/** 68 pt — 44 pt tabanın 1,5 katı. Eldiven payı hiçbir ekranda küçülmüyor. */
export function GridButton({ label, sub, unit, big, on, tone, onPress }: {
    label: string; sub?: string; unit?: string; big?: boolean;
    on: boolean; tone?: 'gr' | 'am'; onPress: () => void;
}) {
    const { c } = useTheme();
    const active = on && tone;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={sub ? `${label} ${sub}` : label}
            onPress={onPress}
            style={({ pressed }) => ({
                height: F.grid, borderRadius: F.radius,
                alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 5,
                backgroundColor: active
                    ? (tone === 'gr' ? 'rgba(95,191,100,0.14)' : 'rgba(217,164,59,0.14)')
                    : on ? c.fld : c.surf2,
                borderWidth: 1,
                borderColor: active
                    ? (tone === 'gr' ? 'rgba(95,191,100,0.38)' : 'rgba(217,164,59,0.38)')
                    : on ? c.tx2 : c.bd,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <Text numberOfLines={1} style={[{
                fontSize: big ? 20 : 15.5,
                fontWeight: big ? '800' : '700',
                letterSpacing: big ? -0.6 : -0.31,
                color: active ? (tone === 'gr' ? c.gr : c.am) : c.tx,
            }, big ? numeric : null]}>
                {label}
                {unit ? <Text style={{ fontSize: 11, fontWeight: '700', color: c.tx3 }}> {unit}</Text> : null}
            </Text>
            {sub ? (
                <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 1.24, color: c.tx3 }}>
                    {upperTR(sub)}
                </Text>
            ) : null}
        </Pressable>
    );
}

/** İmza — devir teslimin ilk sorusu ama okumanın SON satırı. */
export function Signature({ initials, mine, text }: {
    initials: string; mine: boolean; text: string;
}) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingTop: 2 }}>
            <View style={{
                width: 22, height: 22, borderRadius: 11,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: c.bd2,
                backgroundColor: mine ? c.fld : 'transparent',
            }}>
                <Text style={{ fontSize: 8.5, fontWeight: '700', color: mine ? c.tx : c.tx2 }}>{initials}</Text>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, fontWeight: '600', color: c.tx3 }}>
                {text}
            </Text>
        </View>
    );
}

/** Yapılamayan görünmüyor, SEBEBİ görünüyor. */
export function LockLine({ at }: { at?: string }) {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            marginTop: 16, paddingVertical: 12, paddingHorizontal: 13,
            borderRadius: 14, backgroundColor: c.fld,
        }}>
            <Glyph name="lock" size={16} color={c.tx3} />
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', lineHeight: 18.1, color: c.tx3 }}>
                Adisyon {at ?? 'kasaya'} gitti. Formül o an kilitlendi; bu sayfa artık yalnız okunur.
            </Text>
        </View>
    );
}

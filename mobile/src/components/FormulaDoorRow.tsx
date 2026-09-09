/**
 * Personel 14 · formülün kapısı — MALZEMEYE asılı.
 *
 * Malzemeyi gösteren her yüzeyde AYNI satır, AYNI kelimeler: kumandada
 * adisyon şeridinin altında, adisyon alt sayfasında ve işlem bitince
 * sayfanın kendisinde `MALZEME` grup başlığının yerinde. Personel 13 iki yeri
 * de bilerek boş bırakmıştı.
 *
 * Neden malzemeye: formülün malzeme yarısı zaten adisyondan türüyor. Kapıyı
 * kadranın altına ya da ayrı bir karta koymak, ekrana yeni bir bölge eklemek
 * olurdu — kumandanın tek kuralı az düğme.
 *
 * ÜÇ TON, üç ayrı şey söylüyor:
 *   amber  — şimdi yazılabilir, ve gerekçe yanında: "geçen sefer açık kaldı"
 *   nötr   — bu evre bitti, sıra sende değil: "1:1,5 · sonuç yıkandıktan sonra"
 *   yeşil  — tamam: "1:1,5 · 35 dk · tuttu"
 *
 * Bekleyişin rengi yok: nötr bir hâl amber olsaydı yapılacak bir iş varmış
 * gibi görünürdü, oysa sıra sayaçta.
 */

import { Pressable, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import type { FormulaDoor } from '../lib/formula';
import { feedback } from '../lib/feedback';
import { useTheme } from '../theme';

/** 48 pt — 44 pt tabanın üstünde, ama bir ızgara kutusu kadar da yer tutmuyor. */
export const DOOR_H = 48;

export function FormulaDoorRow({ door, head, onPress }: {
    door: FormulaDoor;
    /**
     * Grup başlığının yerinde duruyorsa başlık metni — `MALZEME · 2`.
     * Kumandada şeridin altındayken başlık YOK, kapı tek satır.
     */
    head?: string;
    onPress: () => void;
}) {
    const { c } = useTheme();
    const tone = door.tone === 'ok' ? c.gr : door.tone === 'am' ? c.am : c.tx3;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={[head, 'Formül', door.value, door.tail].filter(Boolean).join(', ')}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10,
                minHeight: DOOR_H, paddingHorizontal: 2,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68, color: tone }}>
                    {head ?? 'FORMÜL'}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: c.tx }}>
                    {door.value}
                    {door.tail ? (
                        <Text style={{ fontWeight: '500', color: c.tx3 }}> · {door.tail}</Text>
                    ) : null}
                </Text>
            </View>
            {/* Tamamlanmışta çek, ötekilerde şevron: biri sonucu, öteki yolu
                söylüyor. */}
            <Glyph name={door.done ? 'check' : 'chev'} size={door.done ? 17 : 16} color={tone} />
        </Pressable>
    );
}

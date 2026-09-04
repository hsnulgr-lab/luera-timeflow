/**
 * Personel 01 — gün şeridi.
 *
 * Kaynak: Claude Design "Luera Mobil - Personel 01 Bugun.html" (`.wk`).
 * Müdürdeki `WeekStrip` DEĞİL: o bileşen "bugün" ile "seçili"yi ayırmıyor
 * (seçilinin etiketi turuncuya dönüyor) ve müdür takvimi onu kullanıyor —
 * müdür tasarımı dondurulmuş durumda, oraya dokunulmuyor.
 *
 * İKİ AYRI İŞARET, iki ayrı geometrik eksen:
 *   seçili gün → rakamı ÇEVRELER (38 pt çerçeve)
 *   bugün      → rakamın ALTINDA turuncu nokta + kısaltma turuncuya döner
 * Üst üste düştüklerinde bile ayrı okunurlar; tek eksende olsalardı bugün
 * seçiliyken hangi işaretin ne olduğu kaybolurdu.
 */

import { Pressable, Text, View } from 'react-native';
import {
    dayNameShort, dayNumber, formatDayLong, isMonthStart, monthShort,
} from '../lib/calendar';
import { numeric, useTheme } from '../theme';
import { upperTR } from '../lib/text';

export function StaffWeekStrip({
    days,
    todayISO,
    selectedISO,
    counts,
    offDays,
    onSelect,
}: {
    days: readonly string[];
    todayISO: string;
    selectedISO: string;
    /**
     * Gün başına randevu sayısı. ANAHTAR YOKSA nokta çizilmez ve ekran
     * okuyucu "randevu yok" demez: sıfır bir ölçümdür, bilinmemek bir boşluk.
     */
    counts: Record<string, number | undefined>;
    /** Vardiyası olmayan günler. İzinli ile randevusuz aynı şey değil. */
    offDays?: readonly string[];
    onSelect: (dateISO: string) => void;
}) {
    const { c, dark } = useTheme();

    return (
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 16 }}>
            {days.map((iso) => {
                const selected = iso === selectedISO;
                const isToday = iso === todayISO;
                const off = offDays?.includes(iso) ?? false;
                const count = counts[iso];
                const known = count !== undefined;

                const numberColor = selected ? c.tx : off ? c.tx3 : c.tx2;

                return (
                    <Pressable
                        key={iso}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={[
                            formatDayLong(iso),
                            isToday ? 'bugün' : null,
                            off ? 'vardiya yok'
                                : !known ? 'randevu sayısı bilinmiyor'
                                    : count ? `${count} randevu` : 'randevu yok',
                        ].filter(Boolean).join(', ')}
                        onPress={() => onSelect(iso)}
                        style={({ pressed }) => ({
                            flex: 1,
                            minWidth: 38,
                            alignItems: 'center',
                            gap: 4,
                            opacity: pressed ? 0.62 : 1,
                        })}
                    >
                        {/* Ay sınırı BİLDİRİLİR, gezindirilmez: şeridin işi bu
                            hafta, ayın tamamı Takvim sekmesinin işi. */}
                        {isMonthStart(iso) ? (
                            <Text style={{
                                position: 'absolute',
                                top: -3,
                                fontSize: 9,
                                fontWeight: '800',
                                letterSpacing: 1.08,
                                color: c.tx3,
                            }}>
                                {monthShort(iso)}
                            </Text>
                        ) : null}

                        <View style={{
                            width: selected ? 38 : 34,
                            height: selected ? 38 : 34,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...(selected ? {
                                borderWidth: 1,
                                borderColor: c.bd2,
                                backgroundColor: dark
                                    ? 'rgba(255,255,255,0.05)'
                                    : 'rgba(255,255,255,0.40)',
                            } : null),
                        }}>
                            <Text style={[{
                                fontSize: 17,
                                fontWeight: selected ? '800' : off ? '500' : '700',
                                color: numberColor,
                            }, numeric]}>
                                {dayNumber(iso)}
                            </Text>
                        </View>

                        <Text style={{
                            fontSize: 11.5,
                            fontWeight: '700',
                            letterSpacing: 0.69,
                            color: isToday ? c.or : c.tx3,
                        }}>
                            {upperTR(dayNameShort(iso))}
                        </Text>

                        {/* Nokta + saç teli. Nokta büyüdükçe tel kısalır;
                            yuva HER ZAMAN 15 pt, yoksa şeridin dizilimi
                            randevu sayısına göre oynardı. */}
                        <View style={{
                            width: '100%',
                            height: 15,
                            paddingTop: 2,
                            alignItems: 'center',
                        }}>
                            {isToday ? (
                                <View style={{
                                    width: 6, height: 6, borderRadius: 3, backgroundColor: c.or,
                                }} />
                            ) : known && count > 0 ? (
                                <View style={{
                                    width: count >= 3 ? 7 : 4,
                                    height: count >= 3 ? 7 : 4,
                                    borderRadius: 4,
                                    backgroundColor: count >= 3 ? c.tx2 : c.tx3,
                                }} />
                            ) : null}
                            <View style={{ width: 1, flex: 1, backgroundColor: c.bd }} />
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

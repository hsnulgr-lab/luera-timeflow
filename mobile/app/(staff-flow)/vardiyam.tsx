/**
 * Personel 10 · Vardiyam.
 *
 * Müdürün `profil/saatler` ekranının uyarlaması: aynı ızgara, aynı ölçüler
 * (52 + 7 × 60 = 472 pt, 375 pt'de bile kaydırma yok). Üç fark var ve üçü de
 * personelin gerçeğinden geliyor:
 *
 *   1. Gün adının yanında TARİH var. Müdürünki her hafta tekrar eden bir
 *      şablon; personelinki BU HAFTA, çünkü izinler tarihe bağlı.
 *   2. Günün üçüncü hâli var: `SALON` etiketli saat — personelin ayrı
 *      vardiyası yok, salonunkini kullanıyor.
 *   3. Satırlar DOKUNULAMAZ. `Pressable` değil `View`, chevron yok.
 *      Vardiyayı müdür belirler; personel tarafında ne uç var ne onay akışı.
 *      "İzin iste" düğmesi çizilseydi ölü doğardı.
 *
 * İzin ayrı bir satır ya da ikinci bir ızgara DEĞİL: şablon saati yerinde
 * kalır, söner, sağında "İzinli" tam kontrastla durur. Böylece "o gün
 * normalde çalışıyorum ama bu hafta izinliyim" tek satırda okunuyor ve izin
 * kalkınca satır kendi eski hâline dönüyor.
 */

import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Foot, Group, ProfileNav } from '../../src/components/ProfileParts';
import { DurumUnread } from '../../src/components/Durum';
import { Num } from '../../src/components/ui';
import { todayISO } from '../../src/lib/calendar';
import {
    mondayOf, weekFoot, weekRows, type WeekRow,
} from '../../src/lib/staffShift';
import { useShift } from '../../src/lib/shiftSource';
import { upperTR } from '../../src/lib/text';
import { font, profileMetrics as M, useTheme } from '../../src/theme';

export default function StaffShift() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const today = todayISO();
    /*
     * Vardiya SUNUCUDAN (`staff-api` · shift).
     *
     * Buraya sabit bir hafta yazılıydı: herkese 10:00–19:00 ve herkese
     * PERŞEMBE–CUMA İZİNLİ. Personel kendi vardiyasını açıp olmayan bir izin
     * görüyordu — ve izne göre plan yapılır.
     */
    const { state, source, reload } = useShift();
    const rows = useMemo(
        () => (source ? weekRows(source, mondayOf(today), today) : []),
        [source, today],
    );
    const foot = useMemo(
        () => (source ? weekFoot(source, rows, today) : []),
        [source, rows, today],
    );

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Vardiyam" onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingBottom: M.bottomInset + insets.bottom,
                    gap: 10,
                }}
            >
                {/* Okunamayan hafta BOŞ HAFTA gibi çizilmiyor: yedi kapalı
                    satır "bu hafta hiç çalışmıyorsun" der ve o cümle bir arıza
                    hâlinde yalan olur. Yükleniyorken de iskelet yok — sahte
                    saatler bir an bile görünmemeli. */}
                {source ? (
                    <>
                        <Group>
                            {rows.map((row, index) => (
                                <DayRow key={row.dateISO} row={row} first={index === 0} />
                            ))}
                        </Group>

                        <Foot>
                            {foot.map((span, index) => (
                                <Text
                                    key={index}
                                    style={span.strong ? { color: c.tx, fontFamily: font.extraBold, fontWeight: '800' } : undefined}
                                >
                                    {span.text}
                                </Text>
                            ))}
                        </Foot>
                    </>
                ) : state === 'error' ? (
                    <DurumUnread
                        what="Vardiyanızı"
                        notMeaning="Çalışma gününüz olmadığı"
                        onRetry={() => { void reload(); }}
                        style={{ paddingHorizontal: 0 }}
                    />
                ) : null}
            </ScrollView>
        </View>
    );
}


/**
 * Tek satır, üç hâl, üstünde bir katman. Dokunulamaz olduğu için
 * `accessibilityRole` da yok: ekran okuyucu düğme diye okumamalı.
 */
function DayRow({ row, first }: { row: WeekRow; first: boolean }) {
    const { c } = useTheme();

    return (
        <View
            accessible
            accessibilityLabel={[
                row.name,
                row.dateLabel,
                row.today ? 'bugün' : null,
                row.hours ?? row.closedWord,
                row.salon ? 'salonun saatleri' : null,
                row.leave ? 'izinli' : null,
            ].filter(Boolean).join(', ')}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: M.dayHeight,
                paddingHorizontal: M.rowPadX,
                borderTopWidth: first ? 0 : 1,
                borderColor: c.bd,
                backgroundColor: row.today ? c.surf2 : 'transparent',
            }}
        >
            {/* Bugünün omurgası — turuncu, çünkü bu bir ZAMAN işareti. */}
            {row.today ? (
                <View style={{
                    position: 'absolute', left: 0, top: 9, bottom: 9,
                    width: M.daySpine,
                    borderTopRightRadius: 2, borderBottomRightRadius: 2,
                    backgroundColor: c.or,
                }} />
            ) : null}

            <Text style={{
                color: c.tx,
                fontSize: M.dayName,
                fontFamily: font.bold,
                fontWeight: '700',
                letterSpacing: M.dayName * -0.02,
            }}>
                {row.name}
            </Text>
            <Num size={M.dayDate} style={{ color: c.tx3, fontWeight: '600' }}>
                {row.dateLabel}
            </Num>

            {row.today ? <Badge tone="or">Bugün</Badge> : null}
            {/* `SALON` etiketi `BUGÜN` ile AYNI parça, rengi sönük: turuncu
                yalnız zaman ve eylem. Saatin nereden geldiğini gün gün
                tekrar ediyor — Foot'taki cümlenin satır karşılığı. */}
            {row.salon ? <Badge tone="q">Salon</Badge> : null}

            <View style={{ flex: 1 }} />

            {row.hours ? (
                <>
                    <Num
                        size={row.leave ? M.dayClosed : M.dayTime}
                        style={{
                            // İzinli günde şablon saati YOK OLMUYOR, söniyor:
                            // "normalde çalışırım ama bu hafta izinliyim".
                            color: row.leave ? c.tx3 : c.tx,
                            fontWeight: '600',
                            letterSpacing: M.dayTime * -0.01,
                        }}
                    >
                        {row.hours}
                    </Num>
                    {row.leave ? (
                        <Text style={{
                            marginLeft: 9,
                            color: c.tx,
                            fontSize: M.dayClosed,
                            fontFamily: font.bold,
                            fontWeight: '700',
                        }}>
                            İzinli
                        </Text>
                    ) : null}
                </>
            ) : (
                <Text style={{
                    color: c.tx3,
                    fontSize: M.dayClosed,
                    fontFamily: font.bold,
                    fontWeight: '700',
                }}>
                    {row.closedWord}
                </Text>
            )}
        </View>
    );
}

function Badge({ tone, children }: { tone: 'or' | 'q'; children: string }) {
    const { c } = useTheme();
    return (
        <Text style={{
            color: tone === 'or' ? c.or : c.tx3,
            fontSize: M.dayBadge,
            fontFamily: font.extraBold,
            fontWeight: '800',
            letterSpacing: M.dayBadge * M.dayBadgeTrack,
        }}>
            {upperTR(children)}
        </Text>
    );
}

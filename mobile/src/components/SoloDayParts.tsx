import { Pressable, Text, View } from 'react-native';

import { Num } from './ui';
import { feedback } from '../lib/feedback';
import { type Appt } from '../lib/calendar';
import { soloApptDuration, soloApptStamp } from '../lib/soloDay';
import { splitStaffName } from '../lib/staffDay';
import { font, radius, soloDayMetrics as M, useTheme } from '../theme';

/**
 * Tek kişilik Gün — randevu kartı ve şimdi hapı (108).
 *
 * Tasarım: `docs/design-reference/Luera Mobil - Tek Kisilik v4.html` ·
 * `.gl` / `.gc` / `.gk` / `.nowp`. Ölçüler `soloDayMetrics`.
 *
 * ── Neden Müdür 24'ün satırı kullanılmadı ───────────────────────────────────
 * `StaffAppointmentRow` ayırıcı çizgiyle ayrılmış bir LİSTE satırı. Orada
 * doğru: ekranın yarısı personelin kimliğine ait ve liste altta kalan dar
 * şeridi paylaşıyor. Burada liste gövdenin TAMAMI — kimlik başlığı yok,
 * meslek satırı yok, personel şeridi yok. O yüzden her iş kendi yüzeyini
 * alıyor ve durum o yüzeyin kenarına yazılabiliyor; on iki ayırıcı çizgiyle
 * bölünmüş bir ekran aynı bilgiyi taşımaz.
 *
 * Saat kartın DIŞINDA: gözün aşağı indirdiği tek bir dikey sütun oluyor ve
 * kart içindeki ad her satırda aynı yerden başlıyor.
 */

// ── Randevu kartı ───────────────────────────────────────────────────────────

export function SoloAppointmentCard({
    appointment,
    nowMinutes,
    onOpen,
}: {
    appointment: Appt;
    nowMinutes: number;
    onOpen: (appointment: Appt) => void;
}) {
    const { c } = useTheme();
    const { given, family } = splitStaffName(appointment.customer_name);
    const duration = soloApptDuration(appointment);
    const stamp = soloApptStamp(appointment, nowMinutes);
    const tone = stamp ? (stamp.tone === 'rd' ? c.rd : stamp.tone === 'am' ? c.am : c.gr) : null;
    /*
     * BİTEN İŞ yalnız ADINDA soluyor, kartın tamamında değil.
     *
     * Kartı soldurmak hizmet satırını ve durumu da okunmaz yapardı; oysa
     * "tamamlandı" biten işin taşıdığı tek bilgi. Tasarım da böyle:
     * `.gk.done .nm{opacity:.72}` — gövdeye hiç dokunmuyor.
     */
    const done = stamp?.tone === 'gr';

    const spokenStamp = stamp ? `, ${stamp.label}` : '';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${appointment.start_time.slice(0, 5)}, ${appointment.customer_name}, ${appointment.service}${spokenStamp}`}
            onPress={() => { feedback.selection(); onOpen(appointment); }}
            style={({ pressed }) => ({
                flexDirection: 'row',
                gap: M.rowGap,
                alignItems: 'flex-start',
                opacity: pressed ? 0.7 : 1,
            })}
        >
            {/* Saat kartın dışında, ilk satırla hizalı. */}
            <Num
                size={M.timeSize}
                style={{
                    width: M.timeWidth,
                    paddingTop: M.timePadTop,
                    color: c.tx2,
                    fontFamily: font.semiBold,
                    fontWeight: '600',
                    letterSpacing: 0,
                }}
            >
                {appointment.start_time.slice(0, 5)}
            </Num>

            <View style={{
                flex: 1,
                minWidth: 0,
                backgroundColor: c.card,
                borderRadius: M.cardRadius,
                paddingTop: M.cardPadTop,
                paddingLeft: M.cardPadX,
                // Durum şeridi varsa sağ dolgu şeride yer açıyor.
                paddingRight: stamp ? M.barPadRight : M.cardPadX,
                paddingBottom: M.cardPadBottom,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: M.cardGapX }}>
                    <Text numberOfLines={1} style={{
                        flex: 1,
                        minWidth: 0,
                        color: c.tx,
                        fontSize: M.nameSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                        letterSpacing: M.nameSize * M.nameTrack,
                        lineHeight: M.nameSize * M.nameLine,
                        opacity: done ? M.doneNameOpacity : 1,
                    }}>
                        {given} <Text style={{ fontFamily: font.extraBold, fontWeight: '800' }}>{family}</Text>
                    </Text>

                    {/* Süre hesaplanamıyorsa YAZILMIYOR — "0 dk" diye bir iş yok. */}
                    {duration ? (
                        <Num size={M.durationSize} style={{
                            color: c.tx3,
                            fontFamily: font.semiBold,
                            fontWeight: '600',
                            letterSpacing: 0,
                        }}>
                            {duration}
                        </Num>
                    ) : null}
                </View>

                {/*
                  * Hizmet ve durum TEK SATIR. Durum ayrı satır almıyor: biten
                  * kart sıradakinden büyük olmuyor ve liste tek ritimde iniyor.
                  *
                  * Sığmayınca kırpılan HİZMET ADI, durum değil: hizmetin baş
                  * harfleri onu tanıtmaya yeter, "tamamland…" ise bilgi değil.
                  */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: M.cardGapY }}>
                    <Text numberOfLines={1} style={{
                        flexShrink: 1,
                        color: c.tx2,
                        fontSize: M.serviceSize,
                        fontFamily: font.medium,
                        fontWeight: '500',
                    }}>
                        {appointment.service}
                    </Text>

                    {stamp ? (
                        <>
                            <Text style={{
                                color: c.tx2,
                                fontSize: M.serviceSize,
                                fontFamily: font.medium,
                                fontWeight: '500',
                            }}>
                                {' · '}
                            </Text>
                            {/* Nokta TEK BAŞINA anlam taşımıyor — kelime yanında. */}
                            <View style={{
                                width: M.stampDot,
                                height: M.stampDot,
                                borderRadius: radius.pill,
                                backgroundColor: tone ?? c.gr,
                                marginRight: M.stampGap,
                            }} />
                            <Text numberOfLines={1} style={{
                                color: tone ?? c.gr,
                                fontSize: M.serviceSize,
                                fontFamily: font.semiBold,
                                fontWeight: '600',
                            }}>
                                {stamp.label}
                            </Text>
                        </>
                    ) : null}
                </View>

                {/* Kenar şeridi: durumu uzaktan okutuyor, kelimenin yerine değil. */}
                {stamp ? (
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            right: M.barRight,
                            top: M.barInset,
                            bottom: M.barInset,
                            width: M.barWidth,
                            borderRadius: M.barRadius,
                            backgroundColor: tone ?? c.gr,
                        }}
                    />
                ) : null}
            </View>
        </Pressable>
    );
}

// ── Şimdi hapı ──────────────────────────────────────────────────────────────

/**
 * Kartların ARASINDAN geçen turuncu hap.
 *
 * Müdür 24'teki "ŞİMDİ 13:41" yazısı değil: orada satırlar ayırıcı çizgiyle
 * bölünüyor ve bir metin başlığı araya girebiliyordu. Burada liste kartlardan
 * oluşuyor, çizgi diye bir şey yok — saat hapın içinde, çizgi hapın devamı.
 */
export function SoloNowLine({ time }: { time: string }) {
    const { c } = useTheme();

    return (
        <View
            accessible
            accessibilityLabel={`Şu an ${time}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: M.nowGap }}
        >
            <View style={{
                height: M.nowPillHeight,
                paddingHorizontal: M.nowPillPadX,
                borderRadius: radius.pill,
                backgroundColor: c.or,
                justifyContent: 'center',
            }}>
                <Num size={M.nowPillText} style={{ color: '#FFFFFF', letterSpacing: -0.15 }}>
                    {time}
                </Num>
            </View>
            <View style={{ flex: 1, height: 1, backgroundColor: c.or }} />
        </View>
    );
}

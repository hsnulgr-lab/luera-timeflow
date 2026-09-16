import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ConfirmDialog, NoteSheet, ServiceSheet } from './ApptSheets';
import { SheetGrab } from './Sheet';
import {
    AttendanceRow, ChangeRows, ChangeTiles, DangerAction, Identity, InfoLine,
    Stage, StateStrip, VisitPanel, useStagger,
} from './ApptParts25';
import { feedback } from '../lib/feedback';
import {
    CANCELLED_INFO, CANCEL_HINT, DELETE_HINT, DELETE_HINT_LONG,
    applyNote, applyService, changeRows, changeTiles, identityOf, isEditable,
    showsAttendance, splitName, stateLine, stateOf, visitSummary,
    type DestructiveAction,
} from '../lib/appointmentDetail';
import { upperTR } from '../lib/text';
import {
    apptInCurve, apptCardMetrics, apptMotion, apptOutCurve, font, hit, useTheme,
} from '../theme';
import type { Appt } from '../lib/calendar';
import type { ServiceOption } from '../lib/createFlow';

/**
 * Müdür 25 — randevu kartı.
 *
 * Sayfa yukarıdan aşağı TEK BİR CÜMLE kuruyor: kim · ne zaman · hangi durumda ·
 * geçmişi ne · neyi değiştirebilirim · neyi bitirebilirim.
 *
 * Müdür 08'den farkları:
 *   • Durum, adın altında kendi yüzeyinde (eskiden 14.5 punto gri bir cümleydi).
 *   • Gün başlıkta (eskiden yalnız "Saati değiştir" satırının içindeydi).
 *   • Dört eşit satır ikiye ayrıldı: iki jeton + iki satır.
 *   • İptalin de kendi onayı var; silme BASILI TUTMA istiyor.
 *   • "Hizmeti değiştir" ve "Notu düzenle" artık gerçekten bir şey açıyor.
 */
export function AppointmentDetail({
    appointment, staffName, dayAppointments = [], services, nowMinutes,
    onClose, onCustomer, onMove, onUpdate, onAttendance, onCancel, onDelete,
}: {
    appointment: Appt;
    staffName?: string | null;
    /** Hizmet süresi uzayınca çakışma AYNI GÜNÜN bloklarında aranır. */
    dayAppointments?: readonly Appt[];
    /** Salonun hizmet kataloğu — fiyat satırı ve "Hizmeti değiştir" listesi. */
    services: readonly ServiceOption[];
    nowMinutes: number;
    onClose: () => void;
    onCustomer?: () => void;
    onMove?: (mode: 'time' | 'staff') => void;
    onUpdate?: (next: Appt) => void;
    onAttendance?: (arrived: boolean) => void;
    /** Onaydan SONRA çağrılır. */
    onCancel?: () => void;
    /** Onaydan SONRA çağrılır. */
    onDelete?: () => void;
}) {
    const { c, reduceMotion } = useTheme();
    const [sheet, setSheet] = useState<'service' | 'note' | null>(null);
    const [confirming, setConfirming] = useState<DestructiveAction | null>(null);

    const identity = useMemo(() => identityOf(appointment, staffName), [appointment, staffName]);
    const line = useMemo(() => stateLine(appointment, nowMinutes), [appointment, nowMinutes]);
    const summary = useMemo(() => visitSummary(appointment), [appointment]);
    const tiles = useMemo(() => changeTiles(appointment, staffName), [appointment, staffName]);
    const rows = useMemo(() => changeRows(appointment, services), [appointment, services]);
    const name = splitName(appointment.customer_name);
    const editable = isEditable(appointment);
    const cancelled = stateOf(appointment) === 'cancelled';

    const stages = useStagger(reduceMotion);
    const { renderAttendance, leaving, stripIn } = useArriveSwap(
        showsAttendance(appointment),
        reduceMotion,
    );

    return (
        <View style={{
            flex: 1,
            backgroundColor: c.bg,
            borderTopLeftRadius: apptCardMetrics.sheetRadius,
            borderTopRightRadius: apptCardMetrics.sheetRadius,
            overflow: 'hidden',
        }}>
            <SheetGrab />

            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: apptCardMetrics.sheetPadX,
                paddingRight: apptCardMetrics.sheetPadX - 6,
                paddingTop: 2,
                paddingBottom: 12,
            }}>
                <Text style={{
                    color: c.tx2,
                    fontSize: 12,
                    fontFamily: font.bold,
                    fontWeight: '700',
                    letterSpacing: 12 * 0.18,
                }}>
                    {upperTR('Randevu')}
                </Text>
                <CloseButton onPress={onClose} />
            </View>

            {/* 393 × 852'de A1 kaydırmasız sığar; 375 × 667'de içerik taşar ve
                yıkıcı bölge ilk ekranda görünmez — bu KASITLI: yıkıcı eylem
                aranarak bulunur. */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingHorizontal: apptCardMetrics.sheetPadX,
                    paddingBottom: 18,
                    gap: 14,
                }}
            >
                <Stage at={0} values={stages} style={{ gap: 14 }}>
                    <Text numberOfLines={2} style={{
                        fontSize: 28,
                        lineHeight: 28 * 1.1,
                    }}>
                        {name.given ? (
                            <Text style={{
                                color: c.tx2,
                                fontFamily: font.medium,
                                fontWeight: '500',
                                letterSpacing: 28 * -0.03,
                            }}>
                                {`${name.given} `}
                            </Text>
                        ) : null}
                        <Text style={{
                            color: c.tx,
                            fontFamily: font.extraBold,
                            fontWeight: '800',
                            letterSpacing: 28 * -0.035,
                        }}>
                            {name.family}
                        </Text>
                    </Text>

                    <Identity identity={identity} />
                </Stage>

                <Stage at={1} values={stages} style={{ gap: 14 }}>
                    <StateStrip line={line} entering={stripIn} />
                    {/* Geldi / Gelmedi yalnız `waiting` hâlinde ÇİZİLİR —
                        öteki dört hâlde devre dışı değil, YOK. */}
                    {renderAttendance ? (
                        <AttendanceRow
                            leaving={leaving}
                            onAnswer={(arrived) => onAttendance?.(arrived)}
                        />
                    ) : null}
                </Stage>

                <Stage at={2} values={stages} style={{ flex: 1, gap: 14 }}>
                    <VisitPanel summary={summary} onOpen={onCustomer} />

                    {editable ? (
                        <>
                            <ChangeTiles tiles={tiles} onPress={(action) => onMove?.(action)} />
                            <ChangeRows
                                rows={rows}
                                onPress={(action) => setSheet(action === 'service' ? 'service' : 'note')}
                            />
                        </>
                    ) : (
                        <InfoLine text={CANCELLED_INFO} />
                    )}

                    <View style={{
                        marginTop: 'auto',
                        paddingTop: apptCardMetrics.dangerTop,
                        paddingBottom: apptCardMetrics.dangerBottom,
                        gap: apptCardMetrics.dangerGap,
                        borderTopWidth: 1,
                        borderColor: c.bd,
                    }}>
                        {/* Tamamlanmış ya da iptal edilmiş randevuda "iptal et"in
                            anlamı yok; satır çizilmez. */}
                        {editable && stateOf(appointment) !== 'done' ? (
                            <DangerAction
                                label="Randevuyu iptal et"
                                hint={CANCEL_HINT}
                                icon="ban"
                                danger
                                onPress={() => { feedback.warning(); setConfirming('cancel'); }}
                            />
                        ) : null}
                        <DangerAction
                            label="Randevuyu sil"
                            hint={cancelled ? DELETE_HINT_LONG : DELETE_HINT}
                            icon="trash"
                            danger={false}
                            onPress={() => { feedback.warning(); setConfirming('delete'); }}
                        />
                    </View>
                </Stage>
            </ScrollView>

            <ServiceSheet
                visible={sheet === 'service'}
                appointment={appointment}
                dayAppointments={dayAppointments}
                services={services}
                staffName={staffName}
                onDismiss={() => setSheet(null)}
                onPick={(choice) => { setSheet(null); onUpdate?.(applyService(appointment, choice)); }}
            />

            <NoteSheet
                visible={sheet === 'note'}
                appointment={appointment}
                onDismiss={() => setSheet(null)}
                onSave={(text) => { setSheet(null); onUpdate?.(applyNote(appointment, text)); }}
            />

            <ConfirmDialog
                visible={confirming !== null}
                action={confirming ?? 'cancel'}
                appointment={appointment}
                staffName={staffName}
                onDismiss={() => setConfirming(null)}
                onConfirm={() => {
                    const action = confirming;
                    setConfirming(null);
                    if (action === 'cancel') onCancel?.(); else onDelete?.();
                }}
            />
        </View>
    );
}

/**
 * "Geldi"ye basış — TAKAS, dönüşüm değil.
 *
 * İki 66 pt buton gidiyor, yerine tek 52 pt durum şeridi geliyor. Şeridin
 * YÜZEYİ zaten oradaydı ve hiç kıpırdamıyor; içeriği takas ediliyor.
 * Butonlar görünmez OLDUKTAN SONRA sayfa tek karede 76 pt kısalıyor —
 * LayoutAnimation yok, görünen hiçbir öğe boyut değiştirmiyor.
 */
function useArriveSwap(attending: boolean, reduceMotion: boolean) {
    const [renderAttendance, setRenderAttendance] = useState(attending);
    const leaving = useRef(new Animated.Value(attending ? 1 : 0)).current;
    const stripIn = useRef(new Animated.Value(1)).current;
    const previous = useRef(attending);

    useEffect(() => {
        if (previous.current === attending) return;
        previous.current = attending;

        if (reduceMotion) {
            // Bilgi harekete emanet edilmez: kelime her hâlde yazılı.
            leaving.setValue(attending ? 1 : 0);
            stripIn.setValue(1);
            setRenderAttendance(attending);
            return;
        }

        if (attending) {
            setRenderAttendance(true);
            leaving.setValue(1);
            stripIn.setValue(1);
            return;
        }

        Animated.timing(leaving, {
            toValue: 0,
            duration: apptMotion.arrive.out,
            easing: Easing.bezier(...apptOutCurve),
            useNativeDriver: true,
        }).start(({ finished }) => { if (finished) setRenderAttendance(false); });

        stripIn.setValue(0);
        Animated.timing(stripIn, {
            toValue: 1,
            duration: apptMotion.arrive.in,
            delay: apptMotion.arrive.delay,
            easing: Easing.bezier(...apptInCurve),
            useNativeDriver: true,
        }).start();
    }, [attending, reduceMotion, leaving, stripIn]);

    return { renderAttendance, leaving, stripIn };
}

function CloseButton({ onPress }: { onPress: () => void }) {
    const { c } = useTheme();
    const tap = useCallback(() => { feedback.selection(); onPress(); }, [onPress]);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={tap}
            hitSlop={6}
            style={({ pressed }) => ({
                width: hit.icon,
                height: hit.icon,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                backgroundColor: pressed ? c.surf2 : 'transparent',
            })}
        >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c.tx2} strokeWidth={1.7} strokeLinecap="round">
                <Path d="M6 6l12 12M18 6L6 18" />
            </Svg>
        </Pressable>
    );
}

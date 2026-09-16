import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { StaffDay } from '../../../src/components/StaffDay';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { useManagerCalendarDay } from '../../../src/lib/managerCalendarDay';
import { orgDurum } from '../../../src/lib/managerDurum';
import { useMoveWriter } from '../../../src/lib/managerMove';
import { STALE_LINE, STALE_TITLE } from '../../../src/lib/managerWriteMap';
import { todayISO, type Appt } from '../../../src/lib/calendar';
import { useTheme } from '../../../src/theme';

/**
 * Müdür 24 — Bir personelin günü (Müdür 05 yeniden tasarımı).
 *
 * Şeritten avatara dokununca açılır.
 * Personeller arası yatay sayfalama (pagingEnabled) ve tek sayaç mimarisi.
 *
 * ── Takvimle AYNI okumadan besleniyor ───────────────────────────────────────
 * Ekran `mockDay.presence`ten ve sahte kaynaktan okuyordu; gün de sabitti
 * (`mockDay.dateISO`), yani hangi günden gelinirse gelinsin hep aynı gün
 * çiziliyordu.
 *
 * Şimdi `useManagerCalendarDay` — takvimin kullandığı kaynağın aynısı. Sebep
 * yalnız tasarruf değil: iki ekranın aynı günü iki ayrı okumadan çizmesi,
 * ikisinin farklı şey söylediği bir anı mümkün kılardı. Müdür şeritten bir
 * avatara dokunup başka bir gerçek görmemeli.
 */
export default function ManagerStaffDay() {
    const { c } = useTheme();
    const router = useRouter();
    /** Gün ÇAĞIRANDAN geliyor; yoksa bugün. Sabit gün hatası buradaydı. */
    const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
    const dateISO = date ?? todayISO();
    const { state, data, refusal, reload } = useManagerCalendarDay(dateISO);
    /*
     * Taşıma buradan da SUNUCUYA yazılıyor. Sayfanın kendi yerel katmanı
     * vardı ve ekrandan çıkınca randevu eski saatine dönüyordu; takvimle aynı
     * kusurdu, aynı yerden düzeltiliyor.
     */
    const {
        appointments, commit, refused, clearRefusal,
    } = useMoveWriter(data.rows, data.stamps, reload);

    const openDetail = (appointment: Appt) => router.push({
        pathname: '/randevu/[id]',
        params: { id: appointment.id, date: appointment.date },
    });

    /*
     * Randevu akışı `staff` ve `date` bekliyor — `staffId` diye gönderilince
     * ön dolgu sessizce boş kalıyordu. "Yarına randevu ver" için tarih de
     * gitmeli, yoksa yarınki randevu bugüne yazılırdı.
     */
    const createAppointment = (staffId: string, dayISO: string) => router.navigate({
        pathname: '/mudur/create',
        params: { staff: staffId, date: dayISO },
    });

    if (refusal) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
                <DurumBlock
                    tone={orgDurum(refusal).tone}
                    title={orgDurum(refusal).title}
                    lines={orgDurum(refusal).lines}
                    actions={[{ label: 'Geri dön', onPress: () => router.back() }]}
                    style={{ marginHorizontal: 16 }}
                />
            </View>
        );
    }

    if (state === 'error') {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg }}>
                <DurumUnread
                    what="Personelin gününü"
                    notMeaning="Randevusu olmadığı"
                    onRetry={() => { void reload(); }}
                    style={{ flex: 1, paddingHorizontal: 16 }}
                />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <View style={{ flex: 1 }}>
                <StaffDay
                    initialStaffId={id}
                    presence={data.presence}
                    appointments={appointments}
                    onCommitMove={commit}
                    openHours={data.open}
                    // Gün okunmadan boş hâl çizilmez — yanlış cümle görünmesin.
                    loading={state === 'loading'}
                    onBack={() => router.back()}
                    onOpenAppointment={openDetail}
                    onCreateAppointment={createAppointment}
                />
            </View>
            {/* Reddedilen taşıma — takvimdeki blokla aynı dil. */}
            {refused && !refused.ok ? (
                <DurumBlock
                    tone={refused.kind === 'stale' ? 'amber' : 'red'}
                    title={
                        refused.kind === 'stale' ? STALE_TITLE
                            : refused.kind === 'conflict' ? 'O saate taşınamadı'
                                : refused.kind === 'paused' ? 'Değişiklik şimdilik alınmıyor'
                                    : 'Taşıma uygulanmadı'
                    }
                    lines={[
                        refused.kind === 'stale' ? STALE_LINE
                            : refused.kind === 'conflict' ? refused.message
                                : refused.kind === 'paused' ? 'Kısa bir süre sonra tekrar deneyin.'
                                    : 'Bağlantı kesilmiş olabilir. Tekrar deneyin.',
                    ]}
                    actions={[{ label: 'Anladım', onPress: clearRefusal }]}
                    style={{ marginHorizontal: 16, marginBottom: 16 }}
                />
            ) : null}
        </View>
    );
}

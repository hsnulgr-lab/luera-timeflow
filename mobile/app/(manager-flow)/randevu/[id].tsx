import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppointmentDetail } from '../../../src/components/AppointmentDetail';
import { MoveResultSheet, MoveSheet } from '../../../src/components/MoveParts';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { Empty } from '../../../src/components/ui';
import { useManagerAppointment } from '../../../src/lib/managerAppointment';
import { orgDurum } from '../../../src/lib/managerDurum';
import { deleteAppointment, updateAppointment } from '../../../src/lib/managerWrite';
import {
    STALE_LINE, STALE_TITLE, writablePatch, type WriteOutcome,
} from '../../../src/lib/managerWriteMap';
import {
    applyMove, undoMove, type MoveResult, type MoveTarget,
} from '../../../src/lib/moveAppointment';
import { useTheme } from '../../../src/theme';
import { nowInMinutes, toMinutes, todayISO, type Appt } from '../../../src/lib/calendar';
import { initialsOf } from '../../../src/lib/text';
import type { StaffOption } from '../../../src/lib/createFlow';

/**
 * Müdür 25 — randevu kartı.
 *
 * Rota `(manager)` sekme grubunun DIŞINDA: o grupta her dosya bir sekmeye
 * dönüşüyor (Müdür 05'te aynı hatayla karşılaşılmıştı). Buraya takvimdeki
 * bloktan, akıştan ve personelin gününden geliniyor.
 *
 * ── Randevu artık KİMLİĞİYLE geliyor ────────────────────────────────────────
 * Ekran günün tamamını okuyup içinden id arıyordu, çünkü sahte kaynakta "id
 * ile getir" diye bir yol yoktu. Yol parametresindeki gün yanlışsa kart
 * "randevu bulunamadı" diyordu — var olan bir randevu için.
 *
 * ── Müdürün İLK yazma ekranı burası ─────────────────────────────────────────
 * Taşıma, hizmet, not, "geldi" damgası ve iptal artık gerçekten yazılıyor.
 * Üç koruma birden devrede: org süzgeci, iyimser kilit (092) ve sunucudaki
 * çakışma tetikleyicisi (060).
 */
export default function ManagerAppointment() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string }>();
    const {
        state, data, refusal, reload,
    } = useManagerAppointment(params.id);

    const [moveMode, setMoveMode] = useState<'time' | 'staff' | null>(null);
    const [result, setResult] = useState<MoveResult | null>(null);
    /**
     * Yazma sonrası yerel hâl.
     *
     * Sunucu kabul ettiği an ekran yeni hâli gösteriyor; bir sonraki okumayı
     * beklemiyor. Beklemek, müdürün dokunduğu şeyin bir saniye boyunca eski
     * hâlinde durması demekti.
     *
     * `from` yazmanın DAYANDIĞI damga, `to` sunucunun döndürdüğü yeni damga.
     * İkisi birlikte "sunucu bizi yakaladı mı" sorusunu efekt kurmadan
     * cevaplıyor — efekt içinde `setState` bu projede sert hata ve haklı
     * olarak: çizim sırasında durum sıfırlamak basamaklı çizime yol açıyor.
     */
    const [local, setLocal] = useState<{ row: Appt; from: string | null; to: string | null } | null>(null);
    /** Reddedilen yazmanın ekrandaki karşılığı. */
    const [refused, setRefused] = useState<WriteOutcome | null>(null);

    /*
     * Sunucu HÂLÂ bizim yazmadan önceki damgayı gösteriyorsa yerel hâl
     * kullanılıyor. Damga değiştiği an — ister bizim yazmamız yüzünden, ister
     * başka bir cihaz yüzünden — sunucununki geçerli. İki gerçek tutmanın
     * anlamı yok; güncel olan sunucununki.
     */
    const usesLocal = local !== null && data.updatedAt === local.from;
    const appointment = usesLocal && local ? local.row : data.appointment;
    const updatedAt = usesLocal && local ? local.to : data.updatedAt;

    // Şimdi çizgisi cihazın saatinden gelir; sabit bir saat "10 dk sonra"
    // derken aslında geçmişte olabilirdi.
    const [now, setNow] = useState(() => nowInMinutes());
    useEffect(() => {
        const timer = setInterval(() => setNow(nowInMinutes()), 60_000);
        return () => clearInterval(timer);
    }, []);

    const staffName = useMemo(
        () => data.columns.find((person) => person.id === appointment?.staff_id)?.name ?? null,
        [data.columns, appointment?.staff_id],
    );

    const staffOptions: StaffOption[] = useMemo(
        () => data.columns.map((person) => ({
            id: person.id,
            initials: initialsOf(person.name),
            name: person.name,
            color: person.color ?? undefined,
            available: person.active && !data.onLeave.has(person.id),
            reason: data.onLeave.has(person.id) ? 'izinli' : undefined,
        })),
        [data.columns, data.onLeave],
    );

    /**
     * Tek yazma yolu.
     *
     * Beş eylem de (taşıma, hizmet, not, geldi, iptal) buradan geçiyor: kilit,
     * çakışma ve vana kontrolü beş kez yazılmasın. Bir tanesini atlamak, o
     * eylemin sessizce ezmesi demek olurdu.
     */
    const commit = useCallback(async (next: Appt, targetStaffName?: string | null) => {
        if (!appointment || !updatedAt) return false;
        setRefused(null);
        const base = updatedAt;
        // İyimserlik ÖNCE: müdür dokunduğu şeyin cevabını beklemesin.
        setLocal({ row: next, from: data.updatedAt, to: base });
        const outcome = await updateAppointment(
            appointment.id, base, writablePatch(next), targetStaffName ?? staffName,
        ).catch(() => ({ ok: false, kind: 'failed' } as WriteOutcome));
        if (outcome.ok) {
            // Yeni damga taşınıyor: ikinci değişiklik kendi ilk yazmasına
            // takılmasın.
            setLocal({ row: next, from: data.updatedAt, to: outcome.updatedAt });
            return true;
        }
        // Reddedildi: YEREL HÂL GERİ ALINIYOR. Bırakmak, yapılmamış bir
        // değişikliği yapılmış gibi göstermek olurdu.
        setLocal(null);
        setRefused(outcome);
        // Bayat kilitte güncel hâl getiriliyor — müdür neye baktığını bilsin.
        if (outcome.kind === 'stale') void reload();
        return false;
    }, [appointment, updatedAt, data.updatedAt, staffName, reload]);

    const commitMove = useCallback((target: MoveTarget) => {
        if (!appointment) return;
        const moved = applyMove(appointment, target);
        void commit(moved, target.staffName).then((ok) => {
            // Sonuç sayfası YALNIZ gerçekten taşındıysa açılıyor: reddedilmiş
            // bir taşıma için "geri al" sunmak anlamsız.
            if (!ok || !appointment) return;
            setResult({
                appointment,
                fromStartMinutes: toMinutes(appointment.start_time),
                fromStaffName: staffName,
                toStartMinutes: target.startMinutes,
                toStaffName: target.staffName,
            });
        });
    }, [appointment, commit, staffName]);

    const close = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/mudur/calendar');
    }, [router]);

    /**
     * SİLME — kartı kapatmak değil, randevuyu kaldırmak.
     *
     * Basılı tutulan "Sil" bugüne kadar YALNIZ kartı kapatıyordu: müdür
     * sildiğini sanıyor, randevu takvimde duruyordu. İptalden ayrı bir iş —
     * iptal edilen randevu kayıtta kalır, silinen kalmaz — ve masaüstündeki
     * `deleteReservation` ile aynı işlem.
     *
     * Kart silme başarılıysa KAPANIYOR: silinmiş bir randevunun kartında
     * durmak, olmayan bir şeye bakmak olurdu.
     */
    const remove = useCallback(async () => {
        if (!appointment) return;
        // Damgasız randevu SİLİNMİYOR ve bu sessiz kalmıyor: kilitsiz silmek,
        // arka planda değişmiş bir randevuyu görmeden kaldırmak olurdu.
        if (!updatedAt) { setRefused({ ok: false, kind: 'failed' }); return; }
        setRefused(null);
        const outcome = await deleteAppointment(appointment.id, updatedAt)
            .catch(() => ({ ok: false, kind: 'failed' } as WriteOutcome));
        if (outcome.ok) { close(); return; }
        setRefused(outcome);
        if (outcome.kind === 'stale') void reload();
    }, [appointment, updatedAt, close, reload]);

    const refusedBlock = refused && !refused.ok ? (
        <DurumBlock
            tone={refused.kind === 'stale' ? 'amber' : 'red'}
            title={
                refused.kind === 'stale' ? STALE_TITLE
                    : refused.kind === 'conflict' ? 'O saate taşınamadı'
                        : refused.kind === 'paused' ? 'Değişiklik şimdilik alınmıyor'
                            : 'Değişiklik uygulanmadı'
            }
            lines={[
                refused.kind === 'stale' ? STALE_LINE
                    : refused.kind === 'conflict' ? refused.message
                        : refused.kind === 'paused' ? 'Kısa bir süre sonra tekrar deneyin.'
                            : 'Bağlantı kesilmiş olabilir. Tekrar deneyin.',
            ]}
            actions={[{ label: 'Anladım', onPress: () => setRefused(null) }]}
            style={{ marginHorizontal: 16, marginBottom: 16 }}
        />
    ) : null;

    return (
        <View style={{
            flex: 1,
            backgroundColor: c.bg,
            /*
             * ÜSTTE PAY YOK (iOS).
             *
             * Ekran `presentation: 'modal'` ile geliyor: iOS onu zaten durum
             * çubuğunun altına, köşeleri yuvarlatılmış bir yüzey olarak
             * yerleştiriyor. Üstüne bir de güvenli alan payı (34) eklenince
             * tutamakla "RANDEVU" satırı arasında ~60 pt boşluk kalıyordu ve
             * kart ekranın ortasından başlıyormuş gibi duruyordu.
             *
             * Tutamak (26 pt) tek başına yeterli üst nefes. Android'de modal
             * tam ekran çizilebildiği için orada pay korunuyor.
             */
            paddingTop: Platform.OS === 'ios' ? 0 : insets.top,
        }}>
            {refusedBlock}

            {refusal ? (
                <DurumBlock
                    tone={orgDurum(refusal).tone}
                    title={orgDurum(refusal).title}
                    lines={orgDurum(refusal).lines}
                    actions={[{ label: 'Geri dön', onPress: close }]}
                    style={{ marginHorizontal: 16 }}
                />
            ) : appointment ? (
                <AppointmentDetail
                    appointment={appointment}
                    staffName={staffName}
                    dayAppointments={data.dayRows}
                    services={data.services}
                    nowMinutes={now}
                    onClose={close}
                    onCustomer={() => router.push({
                        pathname: '/(staff-flow)/customer',
                        params: {
                            customerId: appointment.customer_id ?? undefined,
                            customerName: appointment.customer_name,
                        },
                    })}
                    onMove={(mode) => setMoveMode(mode)}
                    onUpdate={(next) => { void commit(next); }}
                    onAttendance={(arrived) => {
                        if (!arrived) { close(); return; }
                        /*
                         * Müşteri SALONA geldi. Hizmeti personel başlatır;
                         * `arrived_at` müdürün basacağı damga değil.
                         *
                         * Damga TAM ZAMAN ve SUNUCU saatiyle. Eskiden yalnız
                         * "HH:MM:00" yazılıyordu — saat dilimsiz bir metin.
                         * Cihaz saatiyle yazmak da yetmezdi: telefon kırk
                         * dakika ileriyse bekleme süresi kırk dakika şişerdi.
                         * Akış ekranı da aynı damgayı aynı saatten yazıyor.
                         */
                        const stamp = data.serverNow !== null && data.deviceAt !== null
                            ? new Date(data.serverNow + (Date.now() - data.deviceAt)).toISOString()
                            : new Date().toISOString();
                        void commit({ ...appointment, customer_arrived_at: stamp });
                    }}
                    onCancel={() => { void commit({ ...appointment, status: 'cancelled' }); }}
                    onDelete={() => { void remove(); }}
                />
            ) : state === 'error' ? (
                <DurumUnread
                    what="Randevuyu"
                    notMeaning="Silinmiş olduğu"
                    onRetry={() => { void reload(); }}
                    style={{ flex: 1, paddingHorizontal: 16 }}
                />
            ) : state === 'ok' ? (
                <Empty title="Randevu bulunamadı" hint="Silinmiş ya da başka bir güne taşınmış olabilir." />
            ) : null}

            {appointment && moveMode ? (
                <MoveSheet
                    visible
                    mode={moveMode}
                    appointment={appointment}
                    day={data.dayRows}
                    hours={data.open}
                    staff={staffOptions}
                    onDismiss={() => setMoveMode(null)}
                    onPick={(target) => {
                        setMoveMode(null);
                        if (!target.unchanged) commitMove(target);
                    }}
                />
            ) : null}

            {/* Müdür 25 · E. Onay değil sonuç: taşıma zaten oldu. */}
            <MoveResultSheet
                result={result}
                nowMinutes={now}
                today={todayISO()}
                onUndo={(moved) => { void commit(undoMove(moved)); setResult(null); }}
                onCall={(phone) => { void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`); }}
                onDone={() => setResult(null)}
            />
        </View>
    );
}

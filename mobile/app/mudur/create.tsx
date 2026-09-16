import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateFlow } from '../../src/components/CreateFlow';
import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { authApi } from '../../src/api/session';
import { useCreateContext } from '../../src/lib/managerCreate';
import { orgDurum } from '../../src/lib/managerDurum';
import { bookedEvent } from '../../src/lib/managerFlow';
import type { OrgRefusal } from '../../src/lib/managerMap';
import { forgetOrg } from '../../src/lib/managerSource';
import {
    createAppointment, fireCreatedWebhook, sendConfirmation,
} from '../../src/lib/managerWrite';
import { useManagerDay } from '../../src/state/managerDay';
import { useTheme } from '../../src/theme';

/**
 * Müdür 15 — randevu oluştur. "+" SEKMESİNİN KENDİSİ.
 *
 * Bir süre kök yığında yaşadı: sekme çubuğu akışın yüzen özet çubuğunu
 * yutuyordu. Bunun bedeli ağırdı — çubuk kaybolunca akıştan çıkmanın tek yolu
 * sol üstteki X'ti, ve X sekme seçimini "+"ta bıraktığı için ekran anında
 * yeniden açılıyordu. Kullanıcı içeride kilitleniyordu.
 *
 * iOS 26 bunu kendi çözüyor: sekme çubuğu aşağı kaydırınca küçülüyor
 * (`minimizeBehavior`, bkz. `_layout.tsx`) ve akışın altında yer kalıyor.
 * Yüzen çubuk `insets.bottom` üzerinden barın üstünde duruyor.
 *
 * GÜVENLİ ALAN BURADA YENİDEN ÖLÇÜLÜYOR. Kökteki `SafeAreaProvider`
 * sekmelerin DIŞINDA duruyor ve pencerenin payını veriyor (34) — sekme
 * çubuğunu saymıyor. Yüzen özet çubuğu o sayıya güvenince barın ALTINDA
 * kalıyordu. İç içe bir sağlayıcı kendi görünümünün `safeAreaInsets`'ini
 * okur; UIKit sekme çubuğunu oraya kendisi ekler, yani barın yüksekliğini
 * elle yazmamıza gerek kalmaz. (Kaydırırken bar küçülüp sayı düştüğünde
 * çubuk zıplamasın diye `CreateFlow` payı gördüğü en büyük değerde dondurur.)
 *
 * VERİ CANLI (müdür planı 7. adım). Bağlam burada okunuyor ve akış YALNIZ
 * okuma bittikten sonra kuruluyor: müşteri kartından gelen ön dolgu,
 * defter gelmeden kurulan bir akışta kaybolurdu. Okunamazsa akış hiç
 * açılmıyor — boş bir hizmet listesiyle randevu kurdurmak yerine sebep
 * yazıyor.
 *
 * TASLAK SEKME DEĞİŞTİRİNCE SİLİNMEZ. Müdür yarıda Takvim'e bakıp geri
 * dönebilmeli — barı geri getirmenin sebebi bu. Taslak yalnız iki yerde
 * sıfırlanır: randevu kurulduğunda ve X'e basıldığında.
 */
export default function ManagerCreateTab() {
    return (
        <SafeAreaProvider>
            <CreateTabBody />
        </SafeAreaProvider>
    );
}

function CreateTabBody() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { add, dateISO: flowDay } = useManagerDay();
    const ctx = useCreateContext();
    /** Günün okumasından gelen red de aynı bloğa düşer. */
    const [dayRefusal, setDayRefusal] = useState<OrgRefusal | null>(null);
    const refusal = ctx.refusal ?? dayRefusal;
    const onRefusalAction = useCallback(async () => {
        if (refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [refusal, router]);
    const params = useLocalSearchParams<{
        date?: string; start?: string; staff?: string; customerId?: string;
    }>();

    /**
     * Akışı baştan kurar. Parametreler de temizlenir: yoksa müdür takvimden
     * ön dolu girip çıktıktan sonra "+"a bastığında eski gün ve saat geri
     * gelirdi.
     */
    const [runId, setRunId] = useState(0);

    /**
     * ÖN DOLU GİRİŞ AKIŞI YENİDEN KURAR.
     *
     * Taslak sekme değiştirince silinmiyor — bu iyi. Ama takvimdeki boş
     * saatten, personelin gününden ya da müşteri kartından gelindiğinde akış
     * ZATEN kurulmuş oluyor ve `key` değişmediği için yeni ön dolgu hiç
     * uygulanmıyordu: müşteri kartındaki "Randevu ver" boş bir randevu ekranı
     * açıyor gibi görünüyordu.
     *
     * Parametreler değiştiğinde akış baştan kurulur. Boş parametreyle geliş
     * ("+" sekmesine dokunma) taslağı BOZMAZ.
     */
    const seedKey = [params.date, params.start, params.staff, params.customerId]
        .map((value) => value ?? '')
        .join('|');
    const lastSeed = useRef(seedKey);
    useEffect(() => {
        if (seedKey === lastSeed.current) return;
        lastSeed.current = seedKey;
        // Yalnız DOLU bir ön dolgu akışı sıfırlar; temizlenen parametreler değil.
        if (seedKey.replace(/\|/g, '')) setRunId((value) => value + 1);
    }, [seedKey]);
    const reset = useCallback(() => {
        setRunId((value) => value + 1);
        if (params.date || params.start || params.staff || params.customerId) {
            router.setParams({ date: '', start: '', staff: '', customerId: '' });
        }
    }, [router, params.date, params.start, params.staff, params.customerId]);

    /** Kapanış: Akış sekmesine geçilir, akış temizlenir. */
    const close = useCallback(() => {
        reset();
        router.navigate('/mudur');
    }, [reset, router]);

    const start = Number(params.start);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Kahraman levha her iki temada da koyu. */}
            <StatusBar style="light" />
            {refusal ? (
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <DurumBlock
                        tone={orgDurum(refusal).tone}
                        title={orgDurum(refusal).title}
                        lines={orgDurum(refusal).lines}
                        actions={[{
                            label: orgDurum(refusal).action.label,
                            onPress: () => { void onRefusalAction(); },
                        }]}
                    />
                </View>
            ) : ctx.data === null ? (
                ctx.state === 'error' ? (
                    <View style={{ flex: 1, paddingTop: insets.top + 24 }}>
                        <DurumUnread
                            what="Randevu bilgilerini"
                            notMeaning="Hizmet ya da müşteri olmadığı"
                            onRetry={() => { void ctx.reload(); }}
                        />
                    </View>
                ) : null
            ) : (
            <CreateFlow
                key={runId}
                context={ctx.data}
                onCreate={(input, staffName) => createAppointment(input, staffName, {
                    nowMs: ctx.data
                        ? ctx.data.serverNow + Math.max(0, Date.now() - ctx.data.deviceAt)
                        : Date.now(),
                    toleranceMin: ctx.data?.toleranceMin ?? 120,
                }).then((result) => {
                    // Masaüstünün "randevu kuruldu" haberi — adres yoksa hiç gitmez,
                    // sonucu beklenmez.
                    if (result.outcome.ok && result.row) {
                        fireCreatedWebhook(ctx.data?.settings.webhookUrl ?? null, result.row, staffName);
                    }
                    return result;
                })}
                onSend={sendConfirmation}
                onRefusal={setDayRefusal}
                topInset={insets.top}
                bottomInset={insets.bottom}
                prefill={{
                    dateISO: params.date || undefined,
                    startMinutes: Number.isFinite(start) && params.start ? start : undefined,
                    staffId: params.staff || undefined,
                    customerId: params.customerId || undefined,
                }}
                onClose={close}
                // Kurulan randevu akışa "yeni randevu" satırı olarak düşer.
                // Yalnız BUGÜNÜN canlı akışına: başka güne kurulan randevu
                // bugünün olayı değil. O gün cetvelden seçilince akış onu
                // kaynaktan okur (Müdür 03 · başka günün randevuları).
                onCreated={(appointment, staffName) => {
                    if (appointment.date !== flowDay) return;
                    add(bookedEvent(appointment, staffName));
                    // Bağlamdaki müşteri defteri yeni müşteriyi de görsün.
                    void ctx.reload();
                }}
            />
            )}
        </View>
    );
}

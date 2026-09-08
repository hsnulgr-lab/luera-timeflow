import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateFlow } from '../../src/components/CreateFlow';
import { bookedEvent, mockDay } from '../../src/lib/managerFlow';
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
    const { add } = useManagerDay();
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
            <CreateFlow
                key={runId}
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
                    if (appointment.date !== mockDay.dateISO) return;
                    add(bookedEvent(appointment, staffName));
                }}
            />
        </View>
    );
}

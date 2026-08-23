import { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateFlow } from '../../src/components/CreateFlow';
import { bookedEvent, mockDay } from '../../src/lib/managerFlow';
import { useManagerDay } from '../../src/state/managerDay';

/**
 * Müdür 15 — randevu oluştur.
 *
 * SEKMELERİN DIŞINDA yaşıyor ve bu bilinçli. Ekran önce `(manager)/create`
 * sekmesiydi; sistem sekme çubuğu (NativeTabs) ekranın üstünde durduğu için
 * yüzen özet çubuğunu ve alt saat satırlarını yutuyordu. Çubuğun yüksekliği
 * iOS 26'da kaydırmayla değiştiği için sabit bir pay da veremezdik.
 *
 * Tasarım belgesinin hiçbir karesinde sekme çubuğu yok: bu akış ekranın
 * tamamını kaplayan tek bir görev. Kök yığına taşınınca sekme çubuğu akış
 * boyunca kayboluyor, `insets.bottom` gerçek cihaz payına (34) düşüyor ve
 * belgenin 46'sı sihirli sayı olmadan birebir tutuyor. Çıkış sol üstteki X.
 *
 * Üç yerden geliniyor: sekme çubuğundaki "+", takvimde boş saate dokunma,
 * personelin günü. Son ikisinde gün, saat ve personel ön dolu gelir.
 * `back` parametresi kapanınca dönülecek sekmeyi taşır.
 */
export default function CreateAppointment() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { add } = useManagerDay();
    const params = useLocalSearchParams<{
        date?: string; start?: string; staff?: string; back?: string;
    }>();

    /**
     * Kapanış. Onay ekranı (Müdür 16) bitince ya da vazgeçilince buraya gelir.
     *
     * Randevu kurulduysa onay ekranı zaten sonucu gösterdi; tasarım oradan
     * AKIŞ'a dönmeyi söylüyor. Vazgeçildiyse geldiği sekmeye dönülür.
     * İkisi de `replace`: yığında boş bir "+" sekmesi bırakılmıyor.
     */
    const close = useCallback(() => {
        router.replace((params.back as '/(manager)') ?? '/(manager)');
    }, [router, params.back]);

    const start = Number(params.start);

    return (
        <>
            {/* Kahraman levha her iki temada da koyu. */}
            <StatusBar style="light" />
            <CreateFlow
                topInset={insets.top}
                bottomInset={insets.bottom}
                prefill={{
                    dateISO: params.date,
                    startMinutes: Number.isFinite(start) ? start : undefined,
                    staffId: params.staff,
                }}
                onClose={close}
                // Kurulan randevu akışa "yeni randevu" satırı olarak düşer.
                // Yalnız BUGÜNÜN akışına: başka güne kurulan randevu bugünün
                // olayı değil, o gün seçilince görünür.
                onCreated={(appointment, staffName) => {
                    if (appointment.date !== mockDay.dateISO) return;
                    add(bookedEvent(appointment, staffName));
                }}
            />
        </>
    );
}

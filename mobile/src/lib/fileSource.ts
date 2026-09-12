/**
 * Personel 09b — müşteri DOSYASININ veri kaynağı.
 *
 * Şekil (`CustomerFile`) ve saf yardımcılar `customerFile.ts`'te kalıyor;
 * burası yalnız okuma ve sunucu cevabının o şekle indirgenmesi.
 *
 * ── Dört hâl, üç değil ──────────────────────────────────────────────────────
 *   loading  henüz bilmiyoruz
 *   missing  sunucu 404 dedi — kayıt gerçekten yok
 *   error    okuyamadık — "kayıt yok" DEĞİL
 *   ok       okuduk
 *
 * `missing` ile `error` bilerek ayrı: ekran "Müşteri bulunamadı · kayıt
 * silinmiş olabilir" diyor ve bunu bir ağ hatasında söylemek, duran bir kaydı
 * silinmiş gibi göstermek olurdu.
 *
 * ── Yoklama yok ─────────────────────────────────────────────────────────────
 * `bookSource` ile aynı gerekçe. Ama odağa her dönüşte OKUNUYOR ve bu kritik:
 * formül sayfasından dönen personel, az önce kaydettiği formülü geçmiş
 * satırında görmeli. Yoksa "Kaydet" yine hiçbir şey yapmamış gibi olur.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api } from '../api/staff';
import { todayISO } from './calendar.ts';
import { demoCustomerFile, type CustomerFile } from './customerFile.ts';
// Saf eşleme yaprakta: burası React'e bağlı olduğu için testten çağrılamıyor,
// orası çağrılabiliyor (`freshness.ts` ile aynı gerekçe).
import { HISTORY_LIMIT, toCustomerFile, type ServerFile } from './customerFileMap.ts';
export { noteMask, riskMask, toCustomerFile, HISTORY_LIMIT } from './customerFileMap.ts';

export type FileState = 'loading' | 'ok' | 'missing' | 'error';

export interface FileSnapshot {
    state: FileState;
    file: CustomerFile | null;
    reload: () => Promise<void>;
}

export function useCustomerFile(
    customerId: string | undefined,
    name: string | undefined,
): FileSnapshot & { capped: boolean } {
    const [state, setState] = useState<FileState>('loading');
    const [file, setFile] = useState<CustomerFile | null>(null);

    const read = useCallback((visible: boolean) => {
        const today = todayISO();
        /*
         * Sahte yol da SÖZ dönüyor, senkron değil. `await`siz bir dalda
         * `setState` çağırmak, derleyicinin "efektin içinde senkron setState"
         * kuralına takılıyor (react-hooks/set-state-in-effect) — ve haklı:
         * aynı fonksiyonun bir dalda senkron, ötekinde asenkron davranması
         * çağıranı iki ayrı zamanlama bilmeye zorlardı.
         */
        const load: Promise<CustomerFile | null> = !LIVE_AUTH
            ? Promise.resolve(demoCustomerFile({ id: customerId, name }, today))
            : customerId
                ? api.customer(customerId).then((data) => toCustomerFile(data as ServerFile, today))
                : Promise.resolve(null);
        return load
            .then((next) => {
                setFile(next);
                setState(next ? 'ok' : 'missing');
            })
            .catch((cause: unknown) => {
                // 404 KAYIT YOK demek; ötekiler OKUYAMADIK. İkisini aynı
                // ekrana düşürmek, duran bir kaydı silinmiş gibi gösterirdi.
                const status = (cause as { status?: number } | null)?.status;
                if (status === 404) { setFile(null); setState('missing'); return; }
                if (visible) setState('error');
            });
    }, [customerId, name]);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    // Odağa dönüşte OKUNUYOR: formül sayfasından dönen personel kaydettiğini
    // geçmiş satırında görmeli.
    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, file, capped: (file?.history.length ?? 0) >= HISTORY_LIMIT, reload };
}

/**
 * Personel 10 — VARDİYANIN veri kaynağı.
 *
 * Şekil ve karar `staffShift.ts`te, sunucu cevabının indirgenmesi
 * `shiftMap.ts`te; burası yalnız okuma. `fileSource.ts` ile aynı bölüşme.
 *
 * ── Üç hâl ──────────────────────────────────────────────────────────────────
 *   loading  henüz bilmiyoruz
 *   error    okuyamadık — "izin yok" ya da "çalışma günü yok" DEĞİL
 *   ok       okuduk
 *
 * `missing` YOK ve bu bilinçli: her personelin bir vardiya bağlamı var. Kendi
 * saati tanımlı değilse salonunki geçerli — o da okunamıyorsa ortada bir
 * boşluk değil bir ARIZA var. Bunu boş bir hafta olarak çizmek, personele
 * "bu hafta hiç çalışmıyorsun" demek olurdu.
 *
 * ── Yoklama yok ─────────────────────────────────────────────────────────────
 * Vardiya dakikalık değişen bir şey değil; işletme haftada bir dokunuyor.
 * Ama odağa dönüşte ve uygulama öne gelince OKUNUYOR: izin bugün girilmişse
 * personel onu telefonu bir dahaki açışında görmeli.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api } from './../api/staff';
import { todayISO } from './calendar.ts';
import { toShiftSource, type ServerShift } from './shiftMap.ts';
import { demoSource, type ShiftSource } from './staffShift.ts';

export type ShiftState = 'loading' | 'ok' | 'error';

export interface ShiftSnapshot {
    state: ShiftState;
    /** Okunamadıysa `null` — sahte bir hafta ÜRETİLMİYOR. */
    source: ShiftSource | null;
    reload: () => Promise<void>;
}

export function useShift(): ShiftSnapshot {
    const [state, setState] = useState<ShiftState>('loading');
    const [source, setSource] = useState<ShiftSource | null>(null);

    const read = useCallback((visible: boolean) => {
        /*
         * Sahte yol da SÖZ dönüyor, senkron değil: aynı fonksiyonun bir dalda
         * senkron öteki dalda asenkron davranması çağıranı iki ayrı zamanlama
         * bilmeye zorlardı (ve derleyicinin efekt kuralına takılırdı).
         */
        const load: Promise<ShiftSource | null> = LIVE_AUTH
            ? api.shift().then((raw) => toShiftSource(raw as ServerShift))
            : Promise.resolve(demoSource(todayISO()));
        return load
            .then((next) => {
                // `toShiftSource` null döndüyse salonun saatleri okunamadı —
                // bu bir veri yokluğu değil, cevabın kullanılamaz olması.
                if (!next) { if (visible) setState('error'); return; }
                setSource(next);
                setState('ok');
            })
            .catch(() => {
                // ELDEKİ hafta DURUYOR: okunamayan bir vardiya, olmayan bir
                // vardiya değildir.
                if (visible) setState('error');
            });
    }, []);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, source, reload };
}

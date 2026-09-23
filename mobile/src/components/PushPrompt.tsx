import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

import { askPushPermission, readPushState, syncPush } from '../lib/push.ts';
import { myStaffId } from '../lib/me.ts';
import { shouldAsk } from '../lib/pushPermission.ts';
import { DurumBlock } from './Durum';

/**
 * "Bildirimleri açalım mı?" — izin sorusunun ÖN KAPISI.
 *
 * ── Neden ayrı bir kart, neden doğrudan sormuyoruz ──────────────────────────
 * iOS bu izni ÖMÜRDE BİR KEZ soruyor. "İzin verme" denirse bir daha
 * sorulamıyor; tek yol telefon ayarları ve oraya kimse girmiyor. Yani o tek
 * diyalog harcanabilir bir şey değil.
 *
 * Bu kart diyaloğu harcamıyor: neden istendiğini söylüyor ve "Şimdi değil"
 * seçeneği bırakıyor. Sistem diyaloğu yalnız "Aç"a basılırsa çıkıyor.
 *
 * ── Neden Bugün ekranında ───────────────────────────────────────────────────
 * Personelin yaşadığı yer burası ve kart giriş akışının ortasına değil,
 * kabuğa yerleştikten SONRA çıkıyor — `enterShell` yığını sıfırlıyor, akışın
 * ortasına ekran sokmak o sıfırlamayla çakışırdı.
 *
 * ── Tonu amber ──────────────────────────────────────────────────────────────
 * "İş durmuyor" demek. Bildirim bir kolaylık; gelmemesi bir arıza değil ve
 * personel randevusunu bu ekranda zaten görüyor. Kırmızı yalnız gerçekten
 * başarısız olan işlemde.
 */

/** Kapatıldı mı — kapatan personel bir daha görmüyor. */
const K_DISMISSED = 'tf.push.prompt';

export function PushPrompt() {
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);

    useFocusEffect(useCallback(() => {
        let alive = true;
        void (async () => {
            const dismissed = await AsyncStorage.getItem(K_DISMISSED).catch(() => null);
            if (dismissed === 'off') return;
            const state = await readPushState();
            // YALNIZ hiç sorulmamışken. Reddedilmişse kart bir şey yapamaz —
            // orada tek yol telefon ayarları ve onu profil satırı söylüyor.
            if (alive) setVisible(shouldAsk(state));
        })();
        return () => { alive = false; };
    }, []));

    const allow = useCallback(async () => {
        setBusy(true);
        const state = await askPushPermission();
        if (state === 'granted') await syncPush(await myStaffId());
        // Kart her koşulda kapanıyor: soru soruldu, cevabı ne olursa olsun
        // aynı soruyu ikinci kez sormanın yolu yok.
        await AsyncStorage.setItem(K_DISMISSED, 'off').catch(() => undefined);
        setBusy(false);
        setVisible(false);
    }, []);

    const later = useCallback(async () => {
        await AsyncStorage.setItem(K_DISMISSED, 'off').catch(() => undefined);
        setVisible(false);
    }, []);

    if (!visible) return null;
    return (
        <DurumBlock
            tone="amber"
            title="Bildirimler kapalı"
            lines={[
                'Randevun değişince, iptal olunca ve müşterin geldiğinde telefonun haber verir.',
            ]}
            note="Açmazsan da her şey Bugün sekmesinde görünmeye devam eder."
            actions={busy ? [] : [
                { label: 'Aç', onPress: () => { void allow(); } },
                { label: 'Şimdi değil', onPress: () => { void later(); } },
            ]}
        />
    );
}

/**
 * BEKLEME SAYACI — Live Activity'nin GÖRÜNÜMÜ (Dinamik Ada + kilit ekranı).
 *
 * ── Bu dosya uygulamada ÇİZİLMİYOR ─────────────────────────────────────────
 * `'widget'` yönergeli fonksiyon Babel'de (`babel-preset-expo` ·
 * widgets-plugin) DİZEYE çevriliyor ve iOS uzantısının kendi JS motorunda
 * çalışıyor. O yüzden kurallar sıkı (expo-widgets belgesi):
 *   • yalnız `@expo/ui/swift-ui` bileşenleri ve değiştiricileri — adları
 *     DEĞİŞTİRİLMEDEN içe aktarılıyor, uzantı onları bu adlarla tanıyor
 *   • fonksiyonun DIŞINDAKİ hiçbir şeye erişilmiyor (dosyanın sabitleri dahil):
 *     renkler ve metinler gövdenin İÇİNDE
 *   • kanca, durum, async yok; veri yalnız props + environment
 *
 * ── Bu dosya YALNIZ korumalı `require` ile yükleniyor ───────────────────────
 * `expo-widgets` ve `@expo/ui` modül yüklenirken yerel modülü ZORUNLU tutuyor
 * (`requireNativeModule`). Expo Go'da ve yerel modülü olmayan derlemede bu
 * dosyayı `import` etmek açılışta çökmek demek. Tek giriş kapısı
 * `waitActivityDevice.ts` (eşzamanlı `require` + try/catch; dinamik
 * `import()` YASAK — 2026-09-25 mağaza paketi dersi).
 *
 * ── Geri sayımı iOS akıtıyor ────────────────────────────────────────────────
 * `Text timerInterval countsDown` ve `ProgressView timerInterval` sistem
 * tarafından kendiliğinden ilerliyor; uygulama her saniye güncellemiyor.
 * Süre dolunca sayaç 0:00'da duruyor — "Bekleme · 0:00" o an da doğru okunuyor.
 * Sayacın genişliği belgedeki desenle: gizli yer tutucu + `Overlay` +
 * `monospacedDigit`, `fixedSize` Overlay'de.
 *
 * Kilit ekranında yalnız İLK AD (props'a ilk ad olarak giriyor,
 * `waitActivity.waitActivityProps`). Türkçe, emoji yok.
 */

import { HStack, Image, Overlay, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
    fixedSize, font, foregroundStyle, hidden, labelsHidden, lineLimit, monospacedDigit, padding, tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { WaitActivityProps } from './waitActivity.ts';

function BeklemeSayaci(props: WaitActivityProps, environment: LiveActivityEnvironment) {
    'widget';
    // Marka turuncusu; ışığı kısılmış ekranda (her zaman açık) sade beyaz.
    const dim = environment.isLuminanceReduced === true;
    const dark = environment.colorScheme !== 'light';
    const accent = dim ? '#FFFFFF' : '#FF5A1F';
    const primary = dark ? '#FFFFFF' : '#120E08';
    const muted = dark ? '#A8A29A' : '#6B635A';
    const range = { lower: new Date(props.startsAt), upper: new Date(props.endsAt) };
    const title = props.service ? `${props.name} · ${props.service}` : props.name;
    // En uzun değerin her basamağı 0: 60 dk "1:00:00" yazıyor.
    const widest = props.minutes >= 60 ? '0:00:00' : props.minutes >= 10 ? '00:00' : '0:00';

    return {
        banner: (
            <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 })]}>
                <HStack spacing={6}>
                    <Image systemName="hourglass" size={14} color={accent} />
                    <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Bekleme</Text>
                    <Spacer />
                    <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(primary), lineLimit(1)]}>
                        {title}
                    </Text>
                </HStack>
                <HStack spacing={0}>
                    <Overlay
                        alignment="leading"
                        modifiers={[
                            font({ size: 40, weight: 'bold' }),
                            monospacedDigit(),
                            fixedSize({ horizontal: true, vertical: false }),
                        ]}
                    >
                        <Text modifiers={[hidden()]}>{widest}</Text>
                        <Overlay.Content>
                            <Text timerInterval={range} countsDown modifiers={[foregroundStyle(accent)]} />
                        </Overlay.Content>
                    </Overlay>
                    <Spacer />
                </HStack>
                <ProgressView timerInterval={range} countsDown modifiers={[tint(accent), labelsHidden()]} />
            </VStack>
        ),
        compactLeading: <Image systemName="hourglass" size={14} color={accent} />,
        compactTrailing: (
            <Overlay
                alignment="trailing"
                modifiers={[
                    font({ size: 15, weight: 'semibold' }),
                    monospacedDigit(),
                    fixedSize({ horizontal: true, vertical: false }),
                ]}
            >
                <Text modifiers={[hidden()]}>{widest}</Text>
                <Overlay.Content>
                    <Text timerInterval={range} countsDown modifiers={[foregroundStyle(accent)]} />
                </Overlay.Content>
            </Overlay>
        ),
        minimal: <Image systemName="hourglass" size={14} color={accent} />,
        expandedLeading: (
            <VStack alignment="leading" spacing={2}>
                <HStack spacing={4}>
                    <Image systemName="hourglass" size={12} color={accent} />
                    <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted)]}>Bekleme</Text>
                </HStack>
                <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
                    {props.name}
                </Text>
            </VStack>
        ),
        expandedTrailing: (
            <Overlay
                alignment="trailing"
                modifiers={[
                    font({ size: 28, weight: 'bold' }),
                    monospacedDigit(),
                    fixedSize({ horizontal: true, vertical: false }),
                ]}
            >
                <Text modifiers={[hidden()]}>{widest}</Text>
                <Overlay.Content>
                    <Text timerInterval={range} countsDown modifiers={[foregroundStyle(accent)]} />
                </Overlay.Content>
            </Overlay>
        ),
        expandedBottom: (
            <VStack alignment="leading" spacing={6}>
                <Text modifiers={[font({ size: 13 }), foregroundStyle('#A8A29A'), lineLimit(1)]}>
                    {props.service}
                </Text>
                <ProgressView timerInterval={range} countsDown modifiers={[tint(accent), labelsHidden()]} />
            </VStack>
        ),
    };
}

/** Etkinlik fabrikası. Ad `waitActivity.WAIT_ACTIVITY_NAME` ile aynı. */
export default createLiveActivity<WaitActivityProps>('BeklemeSayaci', BeklemeSayaci);

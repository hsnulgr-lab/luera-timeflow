/**
 * "MÜŞTERİ BEKLİYOR" — Live Activity'nin GÖRÜNÜMÜ (Dinamik Ada + kilit ekranı).
 *
 * Bekleme sayacının (`waitActivityView.tsx`) kuralları aynen:
 *   • `'widget'` yönergeli fonksiyon DİZEYE çevrilip uzantıda çalışıyor —
 *     dışarıdaki sabitleri görmez; renk ve metinler gövdenin İÇİNDE, yalnız
 *     `@expo/ui/swift-ui` bileşenleri/değiştiricileri (adları değiştirmeden)
 *   • bu dosya YALNIZ korumalı `require` ile yükleniyor
 *     (`arrivalActivityDevice.ts`); `import` etmek Expo Go'da açılışta çöker
 *   • kart HER ZAMAN koyu zemin + açık yazı (telefon bulgusu 2026-11-12)
 *   • yalnız İLK AD, Türkçe, emoji yok
 *
 * Sayaç geliş anından YUKARI sayıyor (`countsDown={false}`); iOS akıtıyor,
 * uygulama kapalıyken de. Üst uç geliş + 2 saat — orada durur.
 *
 * Etkinliği çoğu zaman SUNUCU başlatıyor (APNs push-to-start): props'u
 * `supabase/functions/send-live-activity/apns.ts` yazıyor, alanlar aynı.
 * `isStale` (geliş + 45 dk, uygulama hiç açılmadıysa) sayacı soluklaştırıyor.
 */

import { HStack, Image, Overlay, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
    activityBackgroundTint, fixedSize, font, foregroundStyle, hidden, lineLimit, monospacedDigit, padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { ArrivalActivityProps } from './arrivalActivity.ts';

function MusteriBekliyor(props: ArrivalActivityProps, environment: LiveActivityEnvironment) {
    'widget';
    // Marka turuncusu; ışığı kısılmış ekranda sade beyaz; bayatlamışsa (uygulama
    // açılmadı, sunucu bitiremedi) soluk — sayaç artık kesin değil.
    const dim = environment.isLuminanceReduced === true;
    const stale = environment.isStale === true;
    const accent = stale ? '#A8A29A' : dim ? '#FFFFFF' : '#FF5A1F';
    // Kart HER ZAMAN koyu (uygulamanın zemini) ve yazı açık.
    const ground = '#120E08';
    const primary = '#FFFFFF';
    const muted = '#A8A29A';
    const range = { lower: new Date(props.arrivedAt), upper: new Date(props.arrivedAt + 2 * 60 * 60 * 1000) };
    const title = `${props.name} bekliyor`;
    const detail = [props.service, props.time].filter((part) => part).join(' · ');
    // En geniş değer: 2 saatlik üst uç "2:00:00".
    const widest = '0:00:00';

    return {
        banner: (
            <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint(ground)]}>
                <HStack spacing={6}>
                    <Image systemName="person.fill" size={14} color={accent} />
                    <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Müşterin geldi</Text>
                    <Spacer />
                    <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(1)]}>{detail}</Text>
                </HStack>
                <HStack spacing={8}>
                    <Text modifiers={[font({ size: 22, weight: 'semibold' }), foregroundStyle(primary), lineLimit(1)]}>
                        {title}
                    </Text>
                    <Spacer />
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
                            <Text timerInterval={range} countsDown={false} modifiers={[foregroundStyle(accent)]} />
                        </Overlay.Content>
                    </Overlay>
                </HStack>
            </VStack>
        ),
        compactLeading: <Image systemName="person.fill" size={14} color={accent} />,
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
                    <Text timerInterval={range} countsDown={false} modifiers={[foregroundStyle(accent)]} />
                </Overlay.Content>
            </Overlay>
        ),
        minimal: <Image systemName="person.fill" size={14} color={accent} />,
        expandedLeading: (
            <VStack alignment="leading" spacing={2}>
                <HStack spacing={4}>
                    <Image systemName="person.fill" size={12} color={accent} />
                    <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#A8A29A')]}>Bekliyor</Text>
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
                    <Text timerInterval={range} countsDown={false} modifiers={[foregroundStyle(accent)]} />
                </Overlay.Content>
            </Overlay>
        ),
        expandedBottom: (
            <Text modifiers={[font({ size: 13 }), foregroundStyle('#A8A29A'), lineLimit(1)]}>
                {detail}
            </Text>
        ),
    };
}

/** Etkinlik fabrikası. Ad `arrivalActivity.ARRIVAL_ACTIVITY_NAME` ve sunucunun `ACTIVITY_NAME`i ile aynı. */
export default createLiveActivity<ArrivalActivityProps>('MusteriBekliyor', MusteriBekliyor);

/**
 * Başlatma jetonu dinleyicisi — `expo-widgets`ten DEĞER olarak buradan
 * geçiyor ki paketin tek girişi bu dosya kalsın (cihaz dosyası yalnız bu
 * dosyayı korumalı `require` ile yüklüyor).
 */
export { addPushToStartTokenListener } from 'expo-widgets';

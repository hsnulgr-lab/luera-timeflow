/**
 * Personel 10 · Profil.
 *
 * Müdür 27'nin AYNI ekranı — aynı bileşenler, aynı ölçüler, aynı ritim.
 * Değişen yalnız hangi satırın kaldığı:
 *
 *   düşen  · hizmetler ve fiyatlar (fiyat müdürün işi)
 *   düşen  · 76 pt turuncu avatar diski (müdürünkinde avatar yok; iki ekran
 *            yan yana konduğunda aynı ürün görünmesinin şartı bu)
 *   düşen  · "Yazı boyutu · Normal" (telefonun ayarını ilan ediyordu, bir şey
 *            değiştirmiyordu)
 *   düşen  · üç bildirim anahtarı — üçü de sahteydi, `expo-notifications`
 *            kurulu değil. Yerine tek bir Foot cümlesi: nereye bakılacağını
 *            söylüyor. Kapalı-kısık bir anahtar yine hiçbir şey yapmaz ve
 *            müşterinin gözü önünde "iptaller bildirilebiliyor ama personel
 *            kapatmış" izlenimi verirdi.
 *   gelen  · "Şifreyi değiştir" (099) — 2026-08'de hedef ekranı ve sunucu
 *            tarafı olmadığı için kaldırılmıştı; ikisi de artık var
 *            (`(staff-flow)/sifre.tsx` · `pin.change`).
 *   gelen  · Vardiyam
 *   gelen  · Cihaz — personel modunun müdürde karşılığı olmayan tek bölümü
 *
 * Sıra "her gün okunan üstte, ayda bir açılan altta": 375 pt'de katlama
 * Cihaz grubunun üstünden geçiyor ve orada olması gereken tam olarak o.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoutSheet, UnlinkSheet } from '../../src/components/ProfileSheets';
import {
    Foot, Group, ProfileHead, ProfileRow, TodayCard,
} from '../../src/components/ProfileParts';
import { authApi, type AuthSession } from '../../src/api/session';
import { nowInMinutes, todayISO } from '../../src/lib/calendar';
import { legalSummary, themeLabel } from '../../src/lib/managerProfile';
import { readKvkkUrl } from '../../src/lib/legalSource';
import { useShift } from '../../src/lib/shiftSource';
import {
    mondayOf, NOTIFICATION_FOOT, shiftCard, weekRows, weekSummary,
} from '../../src/lib/staffShift';
import { upperTR } from '../../src/lib/text';
import { profileMetrics as M, useTheme } from '../../src/theme';

export default function StaffProfile() {
    const { c, themeMode } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [session, setSession] = useState<AuthSession | null>(null);
    const [kvkkUrl, setKvkkUrl] = useState<string | null>(null);
    const [leaving, setLeaving] = useState(false);
    const [unlinking, setUnlinking] = useState(false);

    const load = useCallback(() => {
        let alive = true;
        void Promise.all([authApi.resume.get(), readKvkkUrl()]).then(([resumed, kvkk]) => {
            if (!alive) return;
            if (!resumed.ok) { router.replace('/(auth)/welcome'); return; }
            setSession(resumed.data);
            setKvkkUrl(kvkk);
        });
        return () => { alive = false; };
    }, [router]);

    useFocusEffect(load);

    const today = todayISO();
    /*
     * Vardiya SUNUCUDAN (`staff-api` · shift).
     *
     * Buraya sabit bir hafta yazılıydı: herkese 10:00–19:00 ve herkese
     * PERŞEMBE–CUMA İZİNLİ. Personel kendi profilini açıp olmayan bir izin
     * görüyordu.
     *
     * Sayfanın GERİ KALANI buna bağlı DEĞİL: ad, hesap, görünüm ve cihaz
     * satırları oturumdan geliyor ve vardiya okunamasa da doğru. Bu yüzden
     * ekran bütünüyle bekletilmiyor, yalnız kart ve özet kendi hâlini
     * söylüyor.
     */
    const { state: shiftState, source } = useShift();
    const rows = useMemo(
        () => (source ? weekRows(source, mondayOf(today), today) : []),
        [source, today],
    );

    const [minutes, setMinutes] = useState(() => nowInMinutes());
    useEffect(() => {
        // Geri sayım dakikada bir yenilenir; saniye taşımıyor.
        const id = setInterval(() => setMinutes(nowInMinutes()), 30_000);
        return () => clearInterval(id);
    }, []);

    const weekday = useMemo(() => {
        const [y, m, d] = today.split('-').map(Number);
        return (new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7;
    }, [today]);
    const card = useMemo(
        () => (source ? shiftCard(source, today, weekday, minutes) : null),
        [source, today, weekday, minutes],
    );

    // Ekran ANCAK oturum okunduktan sonra monte ediliyor: iskelet, spinner ve
    // sahte satır yok. Ad ve rol sonradan yerine oturmuyor.
    if (!session) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

    const { profile } = session;
    const openShift = () => router.push('/(staff-flow)/vardiyam');

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: M.padX,
                    paddingTop: 10,
                    paddingBottom: M.bottomInset + insets.bottom,
                    gap: M.gap,
                }}
            >
                <ProfileHead
                    name={profile.name}
                    sub={[profile.title, `${profile.business.name}, ${profile.business.location}`]
                        .filter(Boolean).join(' · ')}
                />

                {/* Kart dokunulabilir ve yalan değil: gittiği yer bir düzenleyici
                    değil, bu haftanın yedi günü. Ok işareti "burayı değiştir"
                    demiyor, "devamı var" diyor.

                    Okunamadıysa kart HİÇ çizilmiyor. Sönük ya da boş bir kart
                    "bugün izinlisin" gibi okunur — saat yerine kelime duran
                    hâl zaten izinli hâli. Satır sebebi söylüyor ve yol
                    gösteriyor; dokunulunca açılan sayfa da aynı hatayı
                    tekrar deniyor. */}
                {card ? <TodayCard card={card} onPress={openShift} /> : null}

                <Group>
                    <ProfileRow
                        first
                        big
                        title="Vardiyam"
                        sub={source
                            ? weekSummary(rows)
                            : shiftState === 'error'
                                ? 'Okunamadı · dokunup tekrar deneyin'
                                : 'Okunuyor…'}
                        onPress={openShift}
                    />
                </Group>

                <Group>
                    <ProfileRow
                        first
                        title="Hesap"
                        value={profile.name}
                        onPress={() => router.push('/(staff-flow)/account')}
                    />
                    {/* 099 · şifreyi personel kendisi belirliyor ve değiştiriyor. */}
                    <ProfileRow
                        title="Şifreyi değiştir"
                        onPress={() => router.push('/(staff-flow)/sifre')}
                    />
                    <ProfileRow
                        title="Görünüm"
                        value={themeLabel(themeMode)}
                        onPress={() => router.push('/(ortak)/profil/gorunum')}
                    />
                    <ProfileRow
                        title="Yasal"
                        value={legalSummary(kvkkUrl)}
                        onPress={() => router.push('/(ortak)/profil/yasal')}
                    />
                </Group>

                <Foot>{NOTIFICATION_FOOT}</Foot>

                <Group head={upperTR('Cihaz')}>
                    {/* Beyan, kapı değil: gidilecek yer yok, chevron da yok. */}
                    <ProfileRow
                        first
                        chevron={false}
                        title="Bu telefon"
                        value={profile.business.name}
                    />
                    {/* Uyarı İKİ KEZ, iki ağırlıkta: kısa hâli burada, çünkü
                        satıra dokunmadan önce bilinmeli; tam hâli alt sayfada.
                        Satır kırmızı DEĞİL — listede kırmızı satır bu üründe
                        silme demek, oturum kapatma bir silme değil. */}
                    <ProfileRow
                        chevron={false}
                        title="Oturumu kapat"
                        sub="Telefon bağlı kalır · sonraki girişte yalnız şifreniz sorulur"
                        onPress={() => setLeaving(true)}
                    />
                </Group>

                {/* 099 · geri dönüşsüz iş AYRI grupta, en altta, kırmızı — yanlış
                    olana basılmasın diye "Oturumu kapat"ın yanında durmuyor. */}
                <Group>
                    <ProfileRow
                        first
                        danger
                        chevron={false}
                        title="Bu telefonu işletmeden çıkar"
                        onPress={() => setUnlinking(true)}
                    />
                </Group>
            </ScrollView>

            <LogoutSheet
                visible={leaving}
                businessName={profile.business.name}
                onDismiss={() => setLeaving(false)}
                onConfirm={async () => {
                    await authApi.resume.signOut();
                    setLeaving(false);
                    // Telefon bağlı (099): karşılamaya değil, şifre ekranına.
                    router.replace('/(auth)/staff/pin');
                }}
            />
            <UnlinkSheet
                visible={unlinking}
                businessName={profile.business.name}
                onDismiss={() => setUnlinking(false)}
                onConfirm={async () => {
                    await authApi.staff.unlinkDevice();
                    setUnlinking(false);
                    router.replace('/(auth)/welcome');
                }}
            />
        </View>
    );
}

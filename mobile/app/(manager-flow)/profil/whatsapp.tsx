import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated, Pressable, ScrollView, Text, TextInput, View, type TextInputInstance,
    type ScrollViewInstance,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileNav } from '../../../src/components/ProfileParts';
import {
    Bullet, Eyebrow, H1, Lead, PillButton, Rich, Skel, Stats, StatusKicker, WaButton, WaCard, WaIcon, WarnLine,
} from '../../../src/components/WaLinkParts';
import {
    failureLine, formatNumberInput, isQuietDay, pageOf, sinceLabel, statValues, TEST_TEXT, testResultText, tints,
    type TestResult, type WaHealth, type WaPage,
} from '../../../src/lib/waLink';
import { fetchWaHealth, sendWaTest } from '../../../src/lib/waLinkSource';
import { normalizePhone } from '../../../src/lib/phone';
import { feedback } from '../../../src/lib/feedback';
import { consumeTestFocus } from '../../../src/state/waLink';
import { font, useTheme } from '../../../src/theme';

/**
 * İşletme › WhatsApp — Müdür 37 (B · F2 · F3 · G · H1 · H2).
 *
 * İşletmenin WhatsApp hattı artık telefondan bağlanıyor; bilgisayarı olmayan
 * tek kişilik salon da hattını kurabiliyor. Sayfa açılınca hattın GERÇEK
 * durumu sorulur (`health`, live); cevap gelene kadar iskelet. Okunamazsa
 * "bağlı değil" DENMEZ: hat belki bağlı, yeniden bağlamak gereksiz kod ister.
 *
 * Bağlama tam ekran pencerede (`whatsapp-bagla`), kesme onayı iOS'un sayfasında
 * (`whatsapp-kes`). İkisinden dönünce sayfa durumu yeniden sorar.
 *
 * Asistan ve mesaj ayarları masaüstünde kalıyor; sayfa bunu tek satırla söyler.
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 37 WhatsApp Baglama.html`.
 */
export default function WhatsAppPage() {
    const { c, reduceMotion } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [health, setHealth] = useState<WaHealth | null | undefined>(undefined);
    const [failed, setFailed] = useState(false);
    const page: WaPage = pageOf(health, failed);

    const load = useCallback(() => {
        let alive = true;
        setFailed(false);
        void fetchWaHealth(true).then((h) => {
            if (!alive) return;
            if (h) setHealth(h);
            else { setHealth(null); setFailed(true); }
        });
        return () => { alive = false; };
    }, []);
    // Her odakta: sayılar sayfa açılınca yenilenir, pencere/sayfa dönüşünde durum.
    useFocusEffect(load);

    // Hâller arası çapraz solma (H1 → B/F2/G): 200 ms opaklık.
    const [fade] = useState(() => new Animated.Value(1));
    const shown = useRef(page);
    useEffect(() => {
        if (shown.current === page) return;
        shown.current = page;
        if (reduceMotion) { fade.setValue(1); return; }
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }, [page, reduceMotion, fade]);

    const openLink = () => router.push('/(manager-flow)/whatsapp-bagla');
    const canManage = health?.canManage !== false;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: 14 }}>
                <ProfileNav title="WhatsApp" onBack={() => router.back()} />
            </View>

            <Animated.View style={{ flex: 1, opacity: fade }}>
                {page === 'loading' ? <Loading /> : null}
                {page === 'unreadable' ? <Unreadable onRetry={() => { setHealth(undefined); load(); }} /> : null}
                {page === 'off' ? <NotLinked canManage={canManage} onLink={openLink} bottom={insets.bottom} /> : null}
                {page === 'dropped' ? <Dropped canManage={canManage} onLink={openLink} bottom={insets.bottom} /> : null}
                {(page === 'connected' || page === 'inbound') && health ? (
                    <Linked
                        health={health}
                        inbound={page === 'inbound'}
                        canManage={canManage}
                        bottom={insets.bottom}
                        onRelink={openLink}
                        onCut={() => router.push('/(manager-flow)/profil/whatsapp-kes')}
                    />
                ) : null}
            </Animated.View>
        </View>
    );
}

const PAD = 20;

// ── H1 · Kontrol ediliyor (iskelet F2'nin biçiminde) ────────────────────────

function Loading() {
    const { c } = useTheme();
    return (
        <View style={{ paddingHorizontal: PAD }} accessibilityLabel="Durum soruluyor">
            <StatusKicker tone="ld" text="KONTROL EDİLİYOR" />
            <Skel w={170} h={30} top={12} />
            <WaCard>
                <Skel w={96} h={12} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    {[0, 1, 2, 3].map((i) => (
                        <View key={i} style={{ flex: 1, gap: 6 }}><Skel w={34} h={26} /><Skel w={62} h={11} /></View>
                    ))}
                </View>
            </WaCard>
            <WaCard>
                <Skel w={110} h={12} />
                <View style={{ height: 50, borderRadius: 9, backgroundColor: c.fld }} />
            </WaCard>
        </View>
    );
}

// ── H1 · Okunamadı ──────────────────────────────────────────────────────────

function Unreadable({ onRetry }: { onRetry: () => void }) {
    const { c } = useTheme();
    return (
        <View style={{ alignItems: 'center', paddingTop: 120 - 60, paddingHorizontal: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.tx3 }} />
                <Text style={{ color: c.tx3, fontSize: 12, fontFamily: font.bold, fontWeight: '700', letterSpacing: 12 * 0.16 }}>DURUM OKUNAMADI</Text>
            </View>
            <Text style={{ color: c.tx, fontSize: 24, lineHeight: 29, textAlign: 'center', fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 24 * -0.025 }}>
                Hattın durumu şu an okunamadı
            </Text>
            <Text style={{ color: c.tx2, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 300, fontFamily: font.medium, fontWeight: '500' }}>
                Bu, hattın bağlı olmadığı anlamına gelmez. İnternetinizi kontrol edip tekrar deneyin.
            </Text>
            <View style={{ marginTop: 22 }}>
                <PillButton label="Tekrar dene" icon="refresh" onPress={onRetry} />
            </View>
        </View>
    );
}

// ── Personel: ana düğmenin yerinde tek cümle (H2) ───────────────────────────

function OwnerOnly() {
    const { c } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 16, paddingVertical: 14, paddingHorizontal: 16,
            borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: c.bd2,
        }}>
            <WaIcon name="lock" color={c.tx2} size={20} />
            <Text style={{ flex: 1, color: c.tx2, fontSize: 15, fontFamily: font.semiBold, fontWeight: '600' }}>Bağlantıyı işletme sahibi kurar.</Text>
        </View>
    );
}

/** Sayfanın altı: ana düğme başparmak bölgesinde (.ft). */
function Foot({ bottom, children }: { bottom: number; children: React.ReactNode }) {
    return <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(bottom, 16) + 14, gap: 10 }}>{children}</View>;
}

// ── B · Bağlı değil ─────────────────────────────────────────────────────────

const B_BULLETS = [
    'Randevu onayları ve hatırlatmalar müşteriye işletmenizin numarasından gider.',
    'Asistan açıksa müşteri hatırlatmaya “Evet” ya da “Hayır” diye cevap verebilir.',
    'Asistan açıksa gelen mesajlara asistan cevap verir.',
];

function NotLinked({ canManage, onLink, bottom }: { canManage: boolean; onLink: () => void; bottom: number }) {
    const { c } = useTheme();
    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                <StatusKicker tone="no" text="BAĞLI DEĞİL" />
                <H1>İşletmenizin WhatsApp hattını bağlayın</H1>
                <WaCard>
                    <Eyebrow>BAĞLANINCA</Eyebrow>
                    {B_BULLETS.map((t) => <Bullet key={t}>{t}</Bullet>)}
                </WaCard>
                {/* Güven cümlesi düğmenin hemen üstünde, kart dışında, küçük değil. */}
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 14, paddingHorizontal: 4 }}>
                    <View style={{ marginTop: 1 }}><WaIcon name="phn" color={c.tx2} size={20} /></View>
                    <Rich
                        parts={['Bağlamak, telefondaki WhatsApp\'ın ', 'Bağlı Cihazlar', ' listesine bir cihaz eklemektir. Sohbetleriniz yerinde kalır; bağlantıyı istediğinizde oradan da kaldırabilirsiniz.']}
                        style={{ flex: 1, color: c.tx2, fontSize: 14, lineHeight: 20, fontFamily: font.medium, fontWeight: '500' }}
                    />
                </View>
                {canManage ? null : <OwnerOnly />}
            </ScrollView>
            {canManage ? <Foot bottom={bottom}><WaButton label="WhatsApp'ı bağla" onPress={onLink} /></Foot> : null}
        </View>
    );
}

// ── G · Bağlantı düştü ──────────────────────────────────────────────────────

const G_ITEMS = ['Randevu onayları', 'Hatırlatmalar', 'İptal haberleri', 'Asistanın cevapları'];

function Dropped({ canManage, onLink, bottom }: { canManage: boolean; onLink: () => void; bottom: number }) {
    const { c } = useTheme();
    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                <StatusKicker tone="rd" text="BAĞLANTI DÜŞTÜ" />
                <H1>Hatırlatmalar ve mesajlar şu an gitmiyor.</H1>
                <Lead>Bu genelde telefon değişince, WhatsApp'tan çıkış yapılınca ya da telefon uzun süre internetsiz kalınca olur.</Lead>
                <WaCard tone="rd">
                    <Eyebrow>BAĞLANANA KADAR GİTMEYENLER</Eyebrow>
                    {G_ITEMS.map((t) => (
                        <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.rd }} />
                            <Text style={{ color: c.tx, fontSize: 16, fontFamily: font.semiBold, fontWeight: '600' }}>{t}</Text>
                        </View>
                    ))}
                </WaCard>
                {canManage ? null : <OwnerOnly />}
            </ScrollView>
            {canManage ? <Foot bottom={bottom}><WaButton label="Yeniden bağla" icon="arrow" onPress={onLink} /></Foot> : null}
        </View>
    );
}

// ── F2 · Bağlı (F3: gelen mesajlar işlenmiyor) ──────────────────────────────

function Linked({ health, inbound, canManage, bottom, onRelink, onCut }: {
    health: WaHealth; inbound: boolean; canManage: boolean; bottom: number; onRelink: () => void; onCut: () => void;
}) {
    const { c, dark } = useTheme();
    const t = tints(dark);
    const scroll = useRef<ScrollViewInstance>(null);
    const input = useRef<TextInputInstance>(null);
    const [testY, setTestY] = useState(0);
    const now = new Date();
    const fail = health.lastFailure ? failureLine(health.lastFailure, now) : null;

    // F1 · "Test mesajı gönder" → sayfa test alanına odaklanır.
    useFocusEffect(useCallback(() => {
        if (!consumeTestFocus()) return undefined;
        const id = setTimeout(() => {
            scroll.current?.scrollTo({ y: Math.max(0, testY - 80), animated: true });
            input.current?.focus();
        }, 350);
        return () => clearTimeout(id);
    }, [testY]));

    return (
        <ScrollView
            ref={scroll}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Math.max(bottom, 16) + 16 }}
        >
            <View style={{ paddingHorizontal: PAD }}>
                {/* Durum ve tarih — numara hiçbir yerde yok (kayıtlı değil). */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.gr }} />
                    <Text style={{ color: c.tx, fontSize: 27, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 27 * -0.03 }}>Bağlı</Text>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: c.tx2, fontSize: 15.5, fontFamily: font.semiBold, fontWeight: '600' }}>
                        {`· ${health.connectedAt ? sinceLabel(health.connectedAt, now) : 'Hat çalışıyor'}`}
                    </Text>
                </View>

                {inbound ? (
                    // F3 — amber, kırmızı değil: giden hatırlatmalar çalışıyor.
                    <View style={{ marginTop: 14, gap: 8, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 22, borderWidth: 1, borderColor: t.amd, backgroundColor: t.amb }}>
                        <Text style={{ color: c.am, fontSize: 11.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 11.5 * 0.16 }}>GELEN MESAJLAR İŞLENMİYOR</Text>
                        <Text style={{ color: c.tx, fontSize: 15, lineHeight: 21, fontFamily: font.medium, fontWeight: '500' }}>
                            Hat bağlı ama gelen mesajlara bot cevap vermiyor. Giden hatırlatmalar etkilenmez.
                        </Text>
                        {canManage ? (
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => { feedback.light(); onRelink(); }}
                                style={({ pressed }) => ({ height: 46, borderRadius: 999, backgroundColor: c.or, alignItems: 'center', justifyContent: 'center', marginTop: 4, opacity: pressed ? 0.85 : 1 })}
                            >
                                <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: font.extraBold, fontWeight: '800' }}>Yeniden bağla</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                <WaCard>
                    <Eyebrow>SON 24 SAAT</Eyebrow>
                    {isQuietDay(health.last24h)
                        ? <Text style={{ color: c.tx, fontSize: 17, fontFamily: font.bold, fontWeight: '700', paddingTop: 4, paddingBottom: 2 }}>Son 24 saatte mesaj yok.</Text>
                        : <Stats values={statValues(health.last24h)} />}
                    {fail ? <WarnLine divider title={fail.title} body={fail.body} /> : null}
                </WaCard>

                {canManage ? (
                    <View onLayout={(e) => setTestY(e.nativeEvent.layout.y)}>
                        <TestCard inputRef={input} />
                    </View>
                ) : <OwnerOnly />}
            </View>

            {canManage && !inbound ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
                    <Rich
                        parts={['Asistan ve mesaj ayarları masaüstünde: ', 'Ayarlar → WhatsApp', '.']}
                        style={{ color: c.tx2, fontSize: 13.5, lineHeight: 19, paddingHorizontal: 4, fontFamily: font.medium, fontWeight: '500' }}
                    />
                    {/* Kesme ayda bir bile açılmaz; altta ve kendi kutusunda, kırmızı yalnız yazıda. */}
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Bağlantıyı kes"
                        onPress={() => { feedback.selection(); onCut(); }}
                        style={({ pressed }) => ({ height: 50, borderRadius: 18, borderWidth: 1, borderColor: c.bd, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.surf2 : 'transparent' })}
                    >
                        <Text style={{ color: c.rd, fontSize: 16, fontFamily: font.bold, fontWeight: '700' }}>Bağlantıyı kes…</Text>
                    </Pressable>
                </View>
            ) : null}
        </ScrollView>
    );
}

// ── Test mesajı ─────────────────────────────────────────────────────────────

function TestCard({ inputRef }: { inputRef: React.RefObject<TextInputInstance | null> }) {
    const { c, reduceMotion } = useTheme();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<TestResult | null>(null);
    const [appear] = useState(() => new Animated.Value(0));
    const valid = normalizePhone(text) !== null;

    const send = async () => {
        if (!valid || busy) return;
        setBusy(true);
        setResult(null);
        const r = await sendWaTest(text, TEST_TEXT);
        setBusy(false);
        setResult(r);
        if (r === 'ok' || r === 'queued') feedback.success(); else feedback.warning();
        // Sonuç satırı: 160 ms, opacity 0→1 + y 4→0.
        appear.setValue(reduceMotion ? 1 : 0);
        if (!reduceMotion) Animated.timing(appear, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    };

    const res = result ? testResultText(result) : null;
    return (
        <WaCard>
            <Eyebrow>TEST MESAJI</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={(v) => { setText(formatNumberInput(v)); setResult(null); }}
                    placeholder="05xx xxx xx xx"
                    placeholderTextColor={c.tx3}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    // returnKeyType YOK: sayı klavyesinde iOS onu İngilizce
                    // "Send" balonu olarak çiziyordu (telefonda görüldü).
                    // Gönder düğmesi alanın hemen yanında.
                    accessibilityLabel="Test mesajının gideceği numara"
                    style={{
                        flex: 1, minWidth: 0, height: 50, borderRadius: 16, backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd,
                        paddingHorizontal: 15, color: c.tx, fontSize: 17, fontFamily: font.semiBold, fontWeight: '600', fontVariant: ['tabular-nums'],
                    }}
                />
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Test mesajını gönder"
                    accessibilityState={{ disabled: !valid || busy, busy }}
                    disabled={!valid || busy}
                    onPress={() => { feedback.light(); void send(); }}
                    style={({ pressed }) => ({
                        height: 50, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: valid && !busy ? c.tx : c.fld, borderWidth: valid && !busy ? 0 : 1, borderColor: c.bd,
                        opacity: pressed ? 0.8 : 1,
                    })}
                >
                    <Text style={{ color: valid && !busy ? c.bg : c.tx3, fontSize: 16, fontFamily: font.extraBold, fontWeight: '800' }}>
                        {busy ? 'Gönderiliyor' : 'Gönder'}
                    </Text>
                </Pressable>
            </View>
            {res ? (
                <Animated.View
                    accessibilityLiveRegion="polite"
                    style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }}
                >
                    {res.ok ? (
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                            <View style={{ marginTop: 1 }}><WaIcon name="check" color={c.gr} size={19} stroke={2.3} /></View>
                            <Text style={{ flex: 1, color: c.tx, fontSize: 14.5, lineHeight: 20, fontFamily: font.bold, fontWeight: '700' }}>
                                {res.title} <Text style={{ color: c.tx2, fontFamily: font.medium, fontWeight: '500' }}>{res.sub}</Text>
                            </Text>
                        </View>
                    ) : <WarnLine title={res.title} body={res.sub} size={14.5} />}
                </Animated.View>
            ) : (
                <Text style={{ color: c.tx2, fontSize: 13.5, lineHeight: 19, fontFamily: font.medium, fontWeight: '500' }}>
                    Hatırlatma ve onaylarla aynı hattan gider.
                </Text>
            )}
        </WaCard>
    );
}

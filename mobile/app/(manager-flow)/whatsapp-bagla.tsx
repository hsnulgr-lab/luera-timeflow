import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
    Animated, AppState, Easing, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text,
    TextInput, useWindowDimensions, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useKeepAwake } from 'expo-keep-awake';

import {
    Aside, CodeCells, Countdown, GhostText, H1, Lead, PillButton, PulseDot, Steps, WaButton, WaIcon, WarnLine,
    type WaIconName,
} from '../../src/components/WaLinkParts';
import {
    clock, CODE_TTL_S, codeChanged, formatNumberInput, pairNumberOf, POLL_MS, prefillNumber, QR_REFRESH_S, tints,
} from '../../src/lib/waLink';
import { fetchPublicPhone, pollLink, requestPairCode, requestQr } from '../../src/lib/waLinkSource';
import { feedback } from '../../src/lib/feedback';
import { markLinked, requestTestFocus } from '../../src/state/waLink';
import { font, useTheme } from '../../src/theme';

/**
 * WhatsApp'ı bağla — Müdür 37 · tam ekran pencere (C · D1 · D2 · D3 · E · F1 · H3).
 *
 * Akış tek soruyla ayrılır: işletmenin WhatsApp'ı hangi telefonda? Bu
 * telefondaysa numara yazılır, 8 karakterlik bağlama kodu alınır ve WhatsApp'a
 * girilir (aynı telefon kendi ekranındaki QR'ı okuyamaz). Başka telefondaysa
 * QR çıkar. Durum her 3 sn'de sorulur; bağlanınca F1.
 *
 * Kod ya da QR beklenirken çıkılırsa istek yarım bırakılır; sayfa bir dahaki
 * açılışta B'den temiz başlar (sunucu yarım bağlamayı "bağlı değil" sayar).
 *
 * `from`: page (WhatsApp sayfası) · pill (Gün'deki eylem hapı) · confirm
 * (randevu onayı — F1'in ana düğmesi "Randevu ekranına dön").
 */
type Step = 'choose' | 'number' | 'code' | 'qr' | 'done';
const ORDER: Step[] = ['choose', 'number', 'code', 'qr', 'done'];

export default function WhatsAppLink() {
    const { c, reduceMotion } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { height, width } = useWindowDimensions();
    const compact = height < 700;
    const { from } = useLocalSearchParams<{ from?: string }>();

    const [{ step, dir }, setNav] = useState<{ step: Step; dir: 1 | -1 }>({ step: 'choose', dir: 1 });
    const [where, setWhere] = useState<'here' | 'other'>('here');
    const [number, setNumber] = useState('');
    const [code, setCode] = useState<string | null>(null);
    const [codeAt, setCodeAt] = useState(0);
    const [qr, setQr] = useState<string | null>(null);
    const [qrAt, setQrAt] = useState(0);
    const [waiting, setWaiting] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    // ── Adım geçişi: 300 ms · (.2,.8,.25,1). Giren yandan, çıkan -40 + .5. ──
    const [enter] = useState(() => new Animated.Value(1));
    const go = useCallback((next: Step) => {
        setNav((cur) => ({ step: next, dir: ORDER.indexOf(next) >= ORDER.indexOf(cur.step) ? 1 : -1 }));
        if (reduceMotion) { enter.setValue(1); return; }
        enter.setValue(0);
        Animated.timing(enter, {
            toValue: 1, duration: 300, easing: Easing.bezier(0.2, 0.8, 0.25, 1), useNativeDriver: true,
        }).start();
    }, [enter, reduceMotion]);

    const close = useCallback(() => router.back(), [router]);

    // ── Bağlandı ──────────────────────────────────────────────────────────
    const linked = useCallback(() => {
        markLinked();
        feedback.success();
        go('done');
    }, [go]);

    // ── Yoklama: kod/QR beklenirken her 3 sn. Ekranda görünmez. ─────────────
    const polling = step === 'code' || step === 'qr';
    useEffect(() => {
        if (!polling) return undefined;
        let alive = true;
        const tick = async () => {
            const p = await pollLink();
            if (!alive || !p.reached) return;
            if (p.connected) { linked(); return; }
            if (step === 'code' && codeChanged(code, p.code)) { setCode(p.code); setCodeAt(Date.now()); }
            if (step === 'qr' && p.qr && p.qr !== qr) { setQr(p.qr); setQrAt(Date.now()); }
        };
        const id = setInterval(() => { void tick(); }, POLL_MS);
        return () => { alive = false; clearInterval(id); };
    }, [polling, step, code, qr, linked]);

    // Sayaçlar saniyede bir (rakam animasyonsuz değişir).
    useEffect(() => {
        if (!polling) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [polling]);

    // D2 → WhatsApp'a geçip dönünce D3: müdür bir şeye basmaz.
    useEffect(() => {
        if (step !== 'code') return undefined;
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setWaiting(true); });
        return () => sub.remove();
    }, [step]);

    const codeLeft = CODE_TTL_S - (now - codeAt) / 1000;
    const dead = step === 'code' && codeLeft <= 0;
    const qrLeft = QR_REFRESH_S - (now - qrAt) / 1000;

    // QR süresi dolunca masaüstündeki gibi kendiliğinden yenilenir.
    const [qrBusy, setQrBusy] = useState(false);
    const [qrFailed, setQrFailed] = useState(false);
    const fetchQr = useCallback(async () => {
        setQrBusy(true);
        const r = await requestQr();
        setQrBusy(false);
        if (r.kind === 'connected') { linked(); return; }
        if (r.kind === 'qr') { setQr(r.qr); setQrAt(Date.now()); setQrFailed(false); return; }
        setQrFailed(true);
    }, [linked]);
    useEffect(() => {
        if (step !== 'qr' || !qr) return undefined;
        const id = setTimeout(() => { void fetchQr(); }, QR_REFRESH_S * 1000);
        return () => clearTimeout(id);
    }, [step, qr, qrAt, fetchQr]);

    // ── Kod iste (D1 · Kodu al, D2 · Yeni kod al, H3 · Tekrar dene) ─────────
    const [codeBusy, setCodeBusy] = useState(false);
    const [codeFailed, setCodeFailed] = useState(false);
    const askCode = useCallback(async () => {
        setCodeBusy(true);
        setCodeFailed(false);
        const r = await requestPairCode(number);
        setCodeBusy(false);
        if (r.kind === 'connected') { linked(); return; }
        if (r.kind !== 'code') { feedback.warning(); setCodeFailed(true); if (step === 'code') go('number'); return; }
        setCode(r.code);
        setCodeAt(Date.now());
        setNow(Date.now());
        setWaiting(false);
        if (step !== 'code') go('code');
    }, [number, linked, go, step]);

    const header = (() => {
        switch (step) {
            case 'choose': return <ModalHeader title="WhatsApp'ı bağla" left="x" onLeft={close} />;
            case 'number': return <ModalHeader title="Numarayla bağla" left="back" onLeft={() => go('choose')} right="Vazgeç" onRight={close} />;
            case 'code': return <ModalHeader title="Numarayla bağla" left="back" onLeft={() => go('number')} right={waiting ? undefined : 'Vazgeç'} onRight={close} />;
            case 'qr': return <ModalHeader title="QR ile bağla" left="back" onLeft={() => go('choose')} right="Vazgeç" onRight={close} />;
            case 'done': return null;
        }
    })();

    const slide = {
        flex: 1,
        opacity: enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [dir * width, 0] }) }],
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            {header}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Animated.View style={slide}>
                    {step === 'choose' ? (
                        <Choose
                            where={where}
                            onPick={setWhere}
                            bottom={insets.bottom}
                            onNext={() => {
                                if (where === 'here') {
                                    go('number');
                                    if (!number) void fetchPublicPhone().then((p) => setNumber((n) => n || prefillNumber(p)));
                                } else {
                                    setQr(null);
                                    setQrFailed(false);
                                    go('qr');
                                    void fetchQr();
                                }
                            }}
                        />
                    ) : null}
                    {step === 'number' ? (
                        <NumberStep
                            value={number}
                            onChange={(v) => { setNumber(formatNumberInput(v)); setCodeFailed(false); }}
                            busy={codeBusy}
                            failed={codeFailed}
                            compact={compact}
                            bottom={insets.bottom}
                            onSubmit={() => { void askCode(); }}
                        />
                    ) : null}
                    {step === 'code' && code ? (
                        <CodeStep
                            code={code}
                            number={number}
                            dead={dead}
                            waiting={waiting && !dead}
                            left={codeLeft}
                            busy={codeBusy}
                            compact={compact}
                            bottom={insets.bottom}
                            onNewCode={() => { void askCode(); }}
                            onCancel={close}
                        />
                    ) : null}
                    {step === 'qr' ? (
                        <QrStep
                            qr={qr}
                            failed={qrFailed}
                            busy={qrBusy}
                            left={qrLeft}
                            compact={compact}
                            bottom={insets.bottom}
                            onRefresh={() => { void fetchQr(); }}
                        />
                    ) : null}
                    {step === 'done' ? (
                        <Done
                            from={from}
                            bottom={insets.bottom}
                            onTest={() => {
                                requestTestFocus();
                                if (from === 'page') router.back();
                                else router.replace('/(manager-flow)/profil/whatsapp');
                            }}
                            onClose={close}
                        />
                    ) : null}
                </Animated.View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ── Başlık çubuğu (.mhd): ilk adımda ×, sonra ‹ ve sağda Vazgeç ──────────────

function ModalHeader({ title, left, onLeft, right, onRight }: {
    title: string; left: 'x' | 'back'; onLeft: () => void; right?: string; onRight?: () => void;
}) {
    const { c } = useTheme();
    return (
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={left === 'x' ? 'Kapat' : 'Geri'}
                onPress={() => { feedback.selection(); onLeft(); }}
                style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
                <WaIcon name={left} color={c.tx} size={24} />
            </Pressable>
            <Text numberOfLines={1} style={{ flex: 1, color: c.tx, fontSize: 16.5, fontFamily: font.bold, fontWeight: '700', letterSpacing: 16.5 * -0.01 }}>{title}</Text>
            {right && onRight ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={() => { feedback.selection(); onRight(); }}
                    style={({ pressed }) => ({ height: 44, paddingHorizontal: 12, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                >
                    <Text style={{ color: c.tx2, fontSize: 15.5, fontFamily: font.bold, fontWeight: '700' }}>{right}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function Foot({ bottom, tight = false, children }: { bottom: number; tight?: boolean; children: ReactNode }) {
    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: tight ? 10 : Math.max(bottom, 16) + 14, gap: 10 }}>
            {children}
        </View>
    );
}

// ── C · Hangi telefonda? ────────────────────────────────────────────────────

function Choose({ where, onPick, onNext, bottom }: {
    where: 'here' | 'other'; onPick: (w: 'here' | 'other') => void; onNext: () => void; bottom: number;
}) {
    return (
        <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 20 }}>
                <H1 top={22}>İşletmenizin WhatsApp'ı hangi telefonda?</H1>
                <Lead>Bağlama yolu buna göre değişir.</Lead>
            </View>
            <View style={{ flex: 1 }} />
            {/* Seçenekler ekranın alt yarısında, 92 pt. Seçim hatırlanmaz:
                düşmenin sık sebebi telefon değişmesi. */}
            <Foot bottom={bottom}>
                <Option on={where === 'here'} icon="phn" title="Bu telefonda" sub="Numaranızla bağlanırsınız" recommended onPress={() => onPick('here')} />
                <Option on={where === 'other'} icon="phn2" title="Başka bir telefonda" sub="O telefonla QR kodu okutursunuz" onPress={() => onPick('other')} />
                <WaButton label="Devam" icon="arrow" onPress={onNext} />
            </Foot>
        </View>
    );
}

function Option({ on, icon, title, sub, recommended, onPress }: {
    on: boolean; icon: WaIconName; title: string; sub: string; recommended?: boolean; onPress: () => void;
}) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${title}. ${sub}${recommended ? '. Önerilen' : ''}`}
            onPress={() => { feedback.selection(); onPress(); }}
            style={{
                flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 92, borderRadius: 22,
                backgroundColor: on ? c.card : c.surf, borderWidth: 1.5, borderColor: on ? c.tx : c.bd,
            }}
        >
            <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.fld, borderWidth: 1, borderColor: c.bd, alignItems: 'center', justifyContent: 'center' }}>
                <WaIcon name={icon} color={c.tx} size={24} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: c.tx, fontSize: 18.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 18.5 * -0.02 }}>{title}</Text>
                    {recommended ? (
                        <View style={{ borderWidth: 1, borderColor: c.bd2, borderRadius: 5, paddingHorizontal: 5, paddingTop: 2, paddingBottom: 1 }}>
                            <Text style={{ color: c.tx2, fontSize: 9.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 9.5 * 0.14 }}>ÖNERİLEN</Text>
                        </View>
                    ) : null}
                </View>
                <Text style={{ color: c.tx2, fontSize: 14.5, fontFamily: font.medium, fontWeight: '500' }}>{sub}</Text>
            </View>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 7 : 1.8, borderColor: on ? c.tx : c.bd2 }} />
        </Pressable>
    );
}

// ── D1 · Hattın numarası (H3: kod alınamadı) ────────────────────────────────

function NumberStep({ value, onChange, busy, failed, compact, bottom, onSubmit }: {
    value: string; onChange: (v: string) => void; busy: boolean; failed: boolean; compact: boolean; bottom: number; onSubmit: () => void;
}) {
    const { c } = useTheme();
    const [focus, setFocus] = useState(false);
    const valid = pairNumberOf(value) !== null;
    return (
        <View style={{ flex: 1 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }}>
                <H1 top={22}>Hattın numarası</H1>
                {compact && focus ? null : <Lead>WhatsApp'ın kurulu olduğu numara.</Lead>}
                <View style={{ marginTop: 18, gap: 8 }}>
                    <Text style={{ color: c.tx3, fontSize: 12, fontFamily: font.bold, fontWeight: '700', letterSpacing: 12 * 0.14 }}>NUMARA</Text>
                    <TextInput
                        value={value}
                        onChangeText={onChange}
                        autoFocus={!failed}
                        onFocus={() => setFocus(true)}
                        onBlur={() => setFocus(false)}
                        keyboardType="number-pad"
                        textContentType="telephoneNumber"
                        placeholder="0532 000 00 00"
                        placeholderTextColor={c.tx3}
                        accessibilityLabel="Hattın numarası"
                        style={{
                            height: 62, borderRadius: 18, backgroundColor: c.surf, borderWidth: 1.5,
                            borderColor: focus ? c.or : c.bd2, paddingHorizontal: 18, color: c.tx, fontSize: 24,
                            fontFamily: font.bold, fontWeight: '700', fontVariant: ['tabular-nums'],
                        }}
                    />
                </View>
                {failed ? (
                    <View style={{ marginTop: 12 }} accessibilityLiveRegion="polite">
                        <WarnLine title="Kod alınamadı, tekrar deneyin." size={15} />
                    </View>
                ) : compact && focus ? null : (
                    <Text style={{ color: c.tx2, fontSize: 14, lineHeight: 20, marginTop: 10, fontFamily: font.medium, fontWeight: '500' }}>
                        İşletme profilindeki numara hazır geldi. Farklıysa değiştirin.
                    </Text>
                )}
            </ScrollView>
            {/* "Kodu al" klavyenin hemen üstünde; SE'de de görünür. */}
            <Foot bottom={bottom} tight={focus}>
                <WaButton
                    label={busy ? 'Kod alınıyor' : failed ? 'Tekrar dene' : 'Kodu al'}
                    icon={failed && !busy ? 'refresh' : undefined}
                    busy={busy}
                    disabled={!valid}
                    onPress={onSubmit}
                />
            </Foot>
        </View>
    );
}

// ── D2 · Bağlama kodu / D3 · Bağlantı bekleniyor ────────────────────────────

const STEPS_CODE = [
    ['WhatsApp\'ı açın.'],
    ['Ayarlar → ', 'Bağlı Cihazlar', ' → ', 'Cihaz Bağla', '.'],
    ['', '“Bunun yerine telefon numarasıyla bağla”', 'ya dokunun.'],
    ['Kodu girin.'],
];

function openWhatsApp() {
    void Linking.openURL('whatsapp://').catch(() => { /* WhatsApp yoksa bir şey olmaz */ });
}

function CodeStep({ code, number, dead, waiting, left, busy, compact, bottom, onNewCode, onCancel }: {
    code: string; number: string; dead: boolean; waiting: boolean; left: number; busy: boolean; compact: boolean;
    bottom: number; onNewCode: () => void; onCancel: () => void;
}) {
    const { c } = useTheme();
    // Yeni kod gelince "Kopyalandı" kendiliğinden düşer: işaret koda bağlı.
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const copied = copiedCode === code;
    const copy = async () => {
        // Kopyala kodu tire olmadan panoya alır.
        await Clipboard.setStringAsync(code);
        feedback.success();
        setCopiedCode(code);
    };
    const tools = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14, minHeight: 40 }}>
            {dead ? (
                <Text style={{ flex: 1, color: c.tx2, fontSize: 14, fontFamily: font.semiBold, fontWeight: '600' }}>Kodun süresi doldu. Yeni kod alın.</Text>
            ) : (
                <>
                    <PillButton label={copied ? 'Kopyalandı' : 'Kopyala'} icon={copied ? 'check' : 'copy'} onPress={() => { void copy(); }} />
                    <Countdown text={clock(left)} word="sonra geçersiz olur" fraction={left / CODE_TTL_S} />
                </>
            )}
        </View>
    );
    const label = (
        <Text style={{ color: c.tx3, fontSize: 12, fontFamily: font.bold, fontWeight: '700', letterSpacing: 12 * 0.14 }}>
            BAĞLAMA KODU{waiting ? '' : ' · '}
            {waiting ? null : <Text style={{ letterSpacing: 0, fontFamily: font.semiBold, fontWeight: '600' }}>{number}</Text>}
        </Text>
    );
    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
                {waiting ? <Waiting /> : null}
                <View style={{ marginTop: waiting ? 20 : 0, gap: 8 }}>
                    {label}
                    <CodeCells code={code} dead={dead} compact={compact} />
                </View>
                {tools}
                {waiting
                    ? <Aside>Kodu henüz girmediyseniz WhatsApp'ta: Bağlı Cihazlar → Cihaz Bağla → “Bunun yerine telefon numarasıyla bağla”.</Aside>
                    : (
                        <>
                            <Steps items={STEPS_CODE} compact={compact} />
                            <Aside>WhatsApp bazen kendisi “kodu girin” bildirimi gösterir. O bildirime dokunarak da girebilirsiniz.</Aside>
                        </>
                    )}
            </ScrollView>
            <Foot bottom={bottom}>
                {dead
                    ? <WaButton label="Yeni kod al" icon="refresh" busy={busy} onPress={onNewCode} />
                    : waiting
                        ? (
                            <>
                                <WaButton label="WhatsApp'a dön" variant="ln" icon="out" onPress={openWhatsApp} />
                                <GhostText label="Vazgeç" onPress={onCancel} />
                            </>
                        )
                        : <WaButton label="WhatsApp'ı aç" icon="out" onPress={openWhatsApp} />}
            </Foot>
        </View>
    );
}

function Waiting() {
    const { c } = useTheme();
    return (
        <View accessibilityLiveRegion="polite" style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, backgroundColor: c.surf, borderWidth: 1, borderColor: c.bd }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: 'rgba(255,90,31,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                <PulseDot color={c.or} size={10} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: c.tx, fontSize: 17.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 17.5 * -0.02 }}>Bağlantı bekleniyor…</Text>
                <Text style={{ color: c.tx2, fontSize: 14, lineHeight: 20, fontFamily: font.medium, fontWeight: '500' }}>
                    Kodu WhatsApp'a girdiyseniz bu ekran birkaç saniye içinde kendiliğinden değişir.
                </Text>
            </View>
        </View>
    );
}

// ── E · QR ──────────────────────────────────────────────────────────────────

const STEPS_QR = [
    ['Diğer telefonda WhatsApp\'ı açın.'],
    ['', 'Bağlı Cihazlar', ' → ', 'Cihaz Ekle', '.'],
    ['Kamerayı bu koda tutun.'],
];

function QrStep({ qr, failed, busy, left, compact, bottom, onRefresh }: {
    qr: string | null; failed: boolean; busy: boolean; left: number; compact: boolean; bottom: number; onRefresh: () => void;
}) {
    const { c, reduceMotion } = useTheme();
    // Okutulurken ekran kararmasın.
    useKeepAwake();
    const size = compact ? 232 : 272;
    // QR yenilenmesi: 200 ms çapraz solma; beyaz çerçeve kıpırdamaz.
    const [fade] = useState(() => new Animated.Value(1));
    useEffect(() => {
        if (!qr || reduceMotion) return;
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }, [qr, reduceMotion, fade]);

    if (failed && !qr) {
        return (
            <View style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
                    <WarnLine title="QR alınamadı, tekrar deneyin." size={15} />
                </View>
                <View style={{ flex: 1 }} />
                <Foot bottom={bottom}><WaButton label="Tekrar dene" icon="refresh" busy={busy} onPress={onRefresh} /></Foot>
            </View>
        );
    }
    return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(bottom, 16) + 14 }} showsVerticalScrollIndicator={false}>
            <Lead center top={4}>İşletmenin WhatsApp'ı olan telefonla okutun.</Lead>
            {/* İki temada da beyaz kutu, 20 pt sessiz alan; kod hiç ters çevrilmez. */}
            <View style={{ alignSelf: 'center', marginTop: 14, width: size, height: size, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: c.bd2 }}>
                {qr ? (
                    <Animated.View style={{ flex: 1, opacity: fade }}>
                        <Image source={{ uri: qr }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel="WhatsApp bağlama QR kodu" />
                    </Animated.View>
                ) : <View style={{ flex: 1, borderRadius: 9, backgroundColor: 'rgba(14,14,14,0.05)' }} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}>
                <Countdown text={clock(qr ? left : QR_REFRESH_S)} word="sonra yenilenir" fraction={qr ? left / QR_REFRESH_S : 1} />
                <PillButton label="Yenile" icon="refresh" disabled={busy} onPress={onRefresh} />
            </View>
            <Steps items={STEPS_QR} compact={compact} />
        </ScrollView>
    );
}

// ── F1 · Bağlandı ───────────────────────────────────────────────────────────

function Done({ from, bottom, onTest, onClose }: {
    from: string | undefined; bottom: number; onTest: () => void; onClose: () => void;
}) {
    const { c, dark, reduceMotion } = useTheme();
    const t = tints(dark);
    const [ring] = useState(() => new Animated.Value(reduceMotion ? 1 : 0.86));
    const [tick] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
    const [title] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
    const [sub] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
    const [dock] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

    useEffect(() => {
        if (reduceMotion) return;
        // ≈ 520 ms: halka .86→1.04→1 (yay 260) · tik .6→1 (120 gecikme) ·
        // başlık ve alt cümle 8→0, 60 ms arayla · dok 24→0.
        Animated.parallel([
            Animated.sequence([
                Animated.timing(ring, { toValue: 1.04, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.spring(ring, { toValue: 1, speed: 18, bounciness: 6, useNativeDriver: true }),
            ]),
            Animated.timing(tick, { toValue: 1, duration: 220, delay: 120, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
            Animated.timing(title, { toValue: 1, duration: 260, delay: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(sub, { toValue: 1, duration: 260, delay: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(dock, { toValue: 1, duration: 300, delay: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, [reduceMotion, ring, tick, title, sub, dock]);

    const rise = (v: Animated.Value, d: number) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [d, 0] }) }] });
    const toConfirm = from === 'confirm';

    return (
        <View style={{ flex: 1 }}>
            <View style={{ alignItems: 'center', gap: 20, paddingTop: 120, paddingHorizontal: 24 }}>
                <Animated.View style={{ width: 116, height: 116, borderRadius: 58, borderWidth: 3, borderColor: t.grd, transform: [{ scale: ring }] }}>
                    <Animated.View style={{
                        position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, borderRadius: 999,
                        alignItems: 'center', justifyContent: 'center', backgroundColor: t.grb, borderWidth: 1, borderColor: t.grd,
                        opacity: tick, transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
                    }}>
                        <WaIcon name="check" color={c.gr} size={34} stroke={2.4} />
                    </Animated.View>
                </Animated.View>
                <Animated.Text accessibilityRole="header" style={[{ color: c.tx, fontSize: 34, lineHeight: 36, textAlign: 'center', fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 34 * -0.03 }, rise(title, 8)]}>
                    WhatsApp bağlandı
                </Animated.Text>
                <Animated.Text style={[{ color: c.tx2, fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 300, marginTop: -8, fontFamily: font.semiBold, fontWeight: '600' }, rise(sub, 8)]}>
                    Hatırlatmalar ve onaylar artık bu hattan gider.
                </Animated.Text>
            </View>
            <View style={{ flex: 1 }} />
            <Animated.View style={[{ marginHorizontal: 12, marginBottom: Math.max(bottom, 16) + 14, borderRadius: 28, padding: 14, gap: 10, backgroundColor: c.surf, borderWidth: 1, borderColor: c.bd }, rise(dock, 24)]}>
                {toConfirm ? (
                    <BigButton label="Randevu ekranına dön" onPress={onClose} />
                ) : (
                    <>
                        <BigButton label="Test mesajı gönder" onPress={onTest} />
                        <Pressable accessibilityRole="button" onPress={() => { feedback.selection(); onClose(); }} style={({ pressed }) => ({ height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                            <Text style={{ color: c.tx2, fontSize: 16, fontFamily: font.bold, fontWeight: '700' }}>Bitti</Text>
                        </Pressable>
                    </>
                )}
            </Animated.View>
        </View>
    );
}

/** Dok düğmesi (.dp): 66 pt, 21 yarıçap — Müdür 16'nın onay kalıbı. */
function BigButton({ label, onPress }: { label: string; onPress: () => void }) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => { feedback.light(); onPress(); }}
            style={({ pressed }) => ({ height: 66, borderRadius: 21, backgroundColor: c.or, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.88 : 1 })}
        >
            <Text style={{ color: '#FFF9F5', fontSize: 17.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 17.5 * -0.01 }}>{label}</Text>
        </Pressable>
    );
}

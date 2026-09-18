import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { DurumUnread } from '../../src/components/Durum';
import { Empty } from '../../src/components/ui';
import { feedback } from '../../src/lib/feedback';
import { formatTRY } from '../../src/lib/customerCard';
import { useManagerRead } from '../../src/lib/managerRead';
import { fetchPackageSaleRows } from '../../src/lib/managerSource';
import { createPackage } from '../../src/lib/managerWrite';
import {
    clampSessions, duplicateLine, duplicateOf, MAX_SESSIONS, MIN_SESSIONS, newPlanId, parsePrice,
    perSession, planTitle, saleMemo, saleOptions, suggestedPrice, type SaleOption,
} from '../../src/lib/packageSale';
import { genitive } from '../../src/lib/text';
import { font, onAccent, useTheme } from '../../src/theme';

type Rows = NonNullable<Awaited<ReturnType<typeof fetchPackageSaleRows>>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;

/** Hareket — tasarımın tablosu. Adım girişi 240, eğri kartın eğrisi. */
const EASE = Easing.bezier(0.215, 0.61, 0.355, 1);
const STEP_IN_MS = 240;
const WARN_IN = { ms: 140, delay: 60, lift: 6 };

/**
 * Müdür 35 · Paket sat — iki adım: Paket · Onay.
 *
 * Kaynak: `Downloads/finalssooo/A-paket-sat.html`. Masaüstünün dört adımından
 * Müşteri (kart zaten o) ve Ödeme (telefon para yazmıyor) düşüyor.
 *
 * Sonuç ekranda SÖYLENMİYOR: sayfa karta döner, yeni satır orada belirir.
 * Yazılamazsa da karta dönülür; sebep ve "Yeniden dene" Hesap bölümünde
 * (A3). Kimlik istemcide üretildiği için yeniden denemek ikinci paket açmaz.
 */
export default function PackageSale() {
    const { c, dark, reduceMotion } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ customerId?: string }>();
    const customerId = first(params.customerId);

    const read = useCallback(async (): Promise<Rows | null> => {
        if (!customerId) return null;
        return fetchPackageSaleRows(customerId);
    }, [customerId]);
    const snap = useManagerRead<Rows | null>(read, null, { poll: false });
    const rows = snap.data;

    const [step, setStep] = useState<1 | 2>(1);
    const [pickedId, setPickedId] = useState<string | null>(null);
    const [sessions, setSessions] = useState(4);
    const [priceText, setPriceText] = useState('');
    const [busy, setBusy] = useState(false);
    // Kimlik sayfa açılınca bir kez: iki kez basılsa da tek paket.
    const [planId] = useState(newPlanId);

    const catalog = useMemo(() => (rows ? saleOptions({
        templates: rows.templates,
        services: rows.services,
        rules: rows.riskRules,
        fields: rows.customer.fields,
    }) : null), [rows]);
    const picked = catalog?.options.find((option) => option.id === pickedId && !option.closed) ?? null;
    const count = picked?.lockedSessions ?? clampSessions(sessions);
    const price = parsePrice(priceText);
    const duplicate = picked && rows ? duplicateOf(picked.name, rows.packages) : null;

    const pick = (option: SaleOption) => {
        if (option.closed) return;
        feedback.selection();
        setPickedId(option.id);
        setPriceText(formatTRY(suggestedPrice(option, option.lockedSessions ?? sessions)));
    };
    const changeSessions = (next: number) => {
        const value = clampSessions(next);
        if (value === sessions) return;
        feedback.selection();
        setSessions(value);
        // Müdür bedeli elle değiştirmediyse öneri seansla birlikte yürür.
        if (picked && parsePrice(priceText) === suggestedPrice(picked, sessions)) {
            setPriceText(formatTRY(suggestedPrice(picked, value)));
        }
    };

    // ── Adım girişi: içerik sağdan 40 pt, kabuk ve alt çubuk yerinde ──────
    const [stepIn] = useState(() => new Animated.Value(1));
    const firstStep = useRef(true);
    useEffect(() => {
        if (firstStep.current) { firstStep.current = false; return; }
        if (reduceMotion) { stepIn.setValue(1); return; }
        stepIn.setValue(0);
        Animated.timing(stepIn, { toValue: 1, duration: STEP_IN_MS, easing: EASE, useNativeDriver: true }).start();
    }, [step, reduceMotion, stepIn]);

    const back = () => {
        feedback.selection();
        if (step === 2) { setStep(1); return; }
        router.back();
    };

    const submit = async () => {
        if (!rows || !picked || price == null || busy) return;
        setBusy(true);
        const input = {
            id: planId,
            customerId: rows.customer.id,
            title: planTitle(picked.name, count),
            sessionCount: count,
            totalAmount: price,
        };
        const outcome = await createPackage(input).catch(() => ({ ok: false, kind: 'failed' } as const));
        setBusy(false);
        if (outcome.ok) {
            feedback.success();
            saleMemo.created(rows.customer.id, planId);
        } else {
            feedback.warning();
            saleMemo.failed(rows.customer.id, input, outcome.kind);
        }
        router.back();
    };

    const amberFill = dark ? 'rgba(217,164,59,0.10)' : 'rgba(154,102,0,0.08)';
    const amberEdge = dark ? 'rgba(217,164,59,0.32)' : 'rgba(154,102,0,0.30)';
    const closedFill = dark ? 'rgba(224,114,114,0.10)' : 'rgba(193,59,59,0.07)';
    const closedEdge = dark ? 'rgba(224,114,114,0.44)' : 'rgba(193,59,59,0.40)';

    // ── Okunmadıysa ─────────────────────────────────────────────────────────
    if (!rows || !catalog) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                <Bar step={step} onBack={() => router.back()} />
                {snap.state === 'error' ? (
                    <DurumUnread
                        what="Paket listesini"
                        notMeaning="Salonda paket olmadığı"
                        onRetry={() => { void snap.reload(); }}
                        style={{ paddingHorizontal: 16 }}
                    />
                ) : snap.state === 'ok' ? (
                    <Empty title="Müşteri bulunamadı" hint="Silinmiş ya da başka bir kayda taşınmış olabilir." />
                ) : null}
            </View>
        );
    }

    const templateMode = catalog.mode === 'template';
    const phone = rows.customer.phone?.trim() || null;
    const firstName = rows.customer.name.trim().split(/\s+/)[0] ?? rows.customer.name;
    const canNext = step === 1 ? Boolean(picked) && price != null : Boolean(picked) && price != null && !busy;

    const priceField = picked ? (
        <View style={{ marginTop: 12, marginHorizontal: 16, gap: 6 }}>
            <Caps color={c.tx3}>BEDEL</Caps>
            <View style={{
                minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: c.bd2, backgroundColor: c.surf,
                flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 3,
            }}>
                <Text style={{ color: c.tx, fontSize: 24, fontFamily: font.extraBold, fontWeight: '800' }}>₺</Text>
                <TextInput
                    value={priceText}
                    onChangeText={(text) => {
                        const value = parsePrice(text);
                        setPriceText(value == null ? '' : formatTRY(value));
                    }}
                    keyboardType="number-pad"
                    selectionColor={c.or}
                    accessibilityLabel="Paket bedeli, lira"
                    placeholder="0"
                    placeholderTextColor={c.tx3}
                    style={{
                        flex: 1, minWidth: 0, paddingVertical: 10,
                        color: c.tx, fontSize: 24, fontFamily: font.extraBold, fontWeight: '800',
                        letterSpacing: 24 * -0.03, fontVariant: ['tabular-nums'],
                    }}
                />
                {/* Uzun tutarda etiket düşer; rakam kırpılmaz. */}
                {priceText.length < 8 ? (
                    <Text style={{ color: c.tx3, fontSize: 12.5, fontFamily: font.semiBold, fontWeight: '600' }}>
                        düzenle
                    </Text>
                ) : null}
            </View>
            <Text style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500' }}>
                {price != null
                    ? `seans başı ₺${formatTRY(perSession(price, count))} · ${picked.lockedSessions != null
                        ? 'şablon fiyatı önerildi'
                        : `hizmet fiyatı × ${count}`}`
                    : 'Bedel girilmedi'}
            </Text>
        </View>
    ) : null;

    const warn = duplicate ? (
        <FadeLift key={`warn-${picked?.id}`} lift={WARN_IN.lift} ms={WARN_IN.ms} delay={WARN_IN.delay}>
            <View style={{
                marginTop: 8, marginHorizontal: 16, marginBottom: 4, flexDirection: 'row', gap: 10,
                padding: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                borderColor: amberEdge, backgroundColor: amberFill,
            }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.am, marginTop: 6 }} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={{ color: c.am, fontSize: 13.5, fontFamily: font.extraBold, fontWeight: '800' }}>
                        Bu müşteride aynı hizmette aktif paket var
                    </Text>
                    <Text style={{ color: c.tx2, fontSize: 13, fontFamily: font.medium, fontWeight: '500', lineHeight: 13 * 1.4 }}>
                        {duplicateLine(duplicate)}. Yine de satılabilir.
                    </Text>
                </View>
            </View>
        </FadeLift>
    ) : null;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}
        >
            <Bar step={step} onBack={back} />

            <Animated.View style={{
                flex: 1,
                opacity: stepIn,
                transform: [{ translateX: stepIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
            }}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {step === 1 ? (
                        <>
                            <PageTitle
                                title={templateMode ? 'Paket seç' : 'Hizmet ve seans'}
                                sub={templateMode
                                    ? 'Şablondan seçin; seans sayısı şablondan gelir.'
                                    : 'Şablon yok: hizmeti seçin, seans sayısını girin.'}
                            />
                            <ForWho name={rows.customer.name} phone={phone} />
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9, paddingTop: 15, paddingHorizontal: 16, paddingBottom: 7 }}>
                                <Caps color={c.tx3}>{templateMode ? 'PAKET ŞABLONU' : 'HİZMET'}</Caps>
                                <Text style={{ marginLeft: 'auto', color: c.tx2, fontSize: 11.5, fontFamily: font.semiBold, fontWeight: '600' }}>
                                    {catalog.options.length} {templateMode ? 'şablon' : 'hizmet'}
                                </Text>
                            </View>
                            {catalog.options.length === 0 ? (
                                <Text style={{ paddingHorizontal: 16, paddingVertical: 12, color: c.tx2, fontSize: 14, fontFamily: font.medium, fontWeight: '500', lineHeight: 14 * 1.45 }}>
                                    Salonda hizmet de paket şablonu da tanımlı değil. Paket tanımları masaüstünde yapılır.
                                </Text>
                            ) : null}
                            {catalog.options.map((option) => {
                                const selected = option.id === picked?.id;
                                return (
                                    <View key={option.id}>
                                        <OptionRow
                                            option={option}
                                            selected={selected}
                                            closedFill={closedFill}
                                            closedEdge={closedEdge}
                                            onPress={() => pick(option)}
                                        />
                                        {selected && !templateMode ? (
                                            <>
                                                <Stepper value={count} onChange={changeSessions} />
                                                {priceField}
                                            </>
                                        ) : null}
                                        {selected ? warn : null}
                                    </View>
                                );
                            })}
                            <View style={{ height: 24 }} />
                        </>
                    ) : picked ? (
                        <>
                            <PageTitle title="Onay" sub="Paket bu bilgilerle oluşturulacak." />
                            <View style={{ marginTop: 2, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: c.bd, backgroundColor: c.surf, overflow: 'hidden' }}>
                                <SumRow label="KİME" value={rows.customer.name} sub={phone} first />
                                <SumRow
                                    label="PAKET"
                                    value={picked.name}
                                    sub={picked.lockedSessions != null ? `şablon · ${picked.name} · ${count} seans` : `hizmet · ${picked.name}`}
                                />
                                <SumRow label="HAK" value={`${count} seans`} sub={`kullanım kartta 0/${count} olarak başlar`} />
                            </View>
                            {priceField}
                            <View style={{
                                marginTop: 12, marginHorizontal: 16, flexDirection: 'row', gap: 10, padding: 12,
                                borderRadius: 14, borderWidth: 1, borderColor: amberEdge, backgroundColor: amberFill,
                            }}>
                                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.am, marginTop: 6 }} />
                                <Text style={{ flex: 1, color: c.tx2, fontSize: 13.5, fontFamily: font.medium, fontWeight: '500', lineHeight: 13.5 * 1.45 }}>
                                    Bedel{' '}
                                    <Text style={{ color: c.tx, fontFamily: font.extraBold, fontWeight: '800' }}>
                                        {genitive(firstName)} hesabına borç
                                    </Text>
                                    {' '}olarak yazılır.{' '}
                                    <Text style={{ color: c.tx, fontFamily: font.extraBold, fontWeight: '800' }}>
                                        Peşinat ve taksit masaüstünden
                                    </Text>
                                    {' '}alınır.
                                </Text>
                            </View>
                            <View style={{ height: 24 }} />
                        </>
                    ) : null}
                </ScrollView>
            </Animated.View>

            {/* Alt çubuk ekrana çapalı: birincil düğme kaydırmanın içine girmez. */}
            <View style={{
                paddingTop: 8, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 14),
                gap: 8, backgroundColor: c.bg, borderTopWidth: 1, borderColor: c.bd,
            }}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={step === 1 ? 'Devam' : 'Paketi oluştur'}
                    accessibilityState={{ disabled: !canNext, busy }}
                    disabled={!canNext}
                    onPress={() => {
                        if (step === 1) { feedback.selection(); setStep(2); return; }
                        void submit();
                    }}
                    style={({ pressed }) => ({
                        height: 52, borderRadius: 14,
                        backgroundColor: canNext || busy ? c.or : c.surf2,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: busy ? 0.6 : pressed ? 0.92 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                >
                    <Text style={{
                        color: canNext || busy ? onAccent : c.tx3,
                        fontSize: 17, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 17 * -0.02,
                    }}>
                        {step === 1 ? 'Devam' : 'Paketi oluştur'}
                    </Text>
                    {step === 1 && canNext ? <ChevronRight color={onAccent} /> : null}
                </Pressable>
                <Text style={{ color: c.tx3, fontSize: 12, fontFamily: font.semiBold, fontWeight: '600', textAlign: 'center' }}>
                    Kayıt güvenli · çift oluşturma engelli
                </Text>
            </View>
        </KeyboardAvoidingView>
    );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

function Bar({ step, onBack }: { step: 1 | 2; onBack: () => void }) {
    const { c } = useTheme();
    return (
        <View style={{
            height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 10,
            borderBottomWidth: 1, borderColor: c.bd,
        }}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Geri"
                onPress={onBack}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                    <Path d="M15 5l-7 7 7 7" stroke={c.tx} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
            </Pressable>
            <Text numberOfLines={1} style={{ flex: 1, color: c.tx, fontSize: 15.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 15.5 * -0.02 }}>
                Paket sat
            </Text>
            <Text
                accessibilityLabel={`Adım ${step}, toplam 2`}
                style={{ color: c.tx2, fontSize: 13, fontFamily: font.bold, fontWeight: '700', paddingRight: 6, fontVariant: ['tabular-nums'] }}
            >
                {step} / 2
            </Text>
        </View>
    );
}

function PageTitle({ title, sub }: { title: string; sub: string }) {
    const { c } = useTheme();
    return (
        <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12, gap: 4 }}>
            <Text accessibilityRole="header" style={{ color: c.tx, fontSize: 24, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 24 * -0.03, lineHeight: 24 * 1.12 }}>
                {title}
            </Text>
            <Text style={{ color: c.tx2, fontSize: 13, fontFamily: font.medium, fontWeight: '500', lineHeight: 13 * 1.4 }}>
                {sub}
            </Text>
        </View>
    );
}

/** Kime satılıyor — basılabilir değil: müşteri karttan geldi. */
function ForWho({ name, phone }: { name: string; phone: string | null }) {
    const { c } = useTheme();
    return (
        <View style={{
            marginHorizontal: 16, marginBottom: 4, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10,
            flexDirection: 'row', alignItems: 'center', gap: 9,
            borderRadius: 12, borderWidth: 1, borderColor: c.bd, backgroundColor: c.surf,
        }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.or }} />
            <Text style={{ flex: 1, color: c.tx2, fontSize: 13.5, fontFamily: font.semiBold, fontWeight: '600' }}>
                <Text style={{ color: c.tx, fontFamily: font.extraBold, fontWeight: '800' }}>{name}</Text>
                {phone ? ` · ${phone}` : ''}
            </Text>
        </View>
    );
}

function OptionRow({ option, selected, closedFill, closedEdge, onPress }: {
    option: SaleOption;
    selected: boolean;
    closedFill: string;
    closedEdge: string;
    onPress: () => void;
}) {
    const { c } = useTheme();
    const locked = option.lockedSessions;
    const meta = locked != null
        ? `${locked} seans · seans başı ₺${formatTRY(perSession(option.price, locked))}`
        : [option.duration ? `${option.duration} dk` : null, option.price > 0 ? `liste ₺${formatTRY(option.price)}` : null]
            .filter(Boolean).join(' · ');
    const stripe = (
        <View style={{ width: 4, alignSelf: 'stretch', marginRight: 12, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: option.closed ? c.rd : option.color || c.tx3 }} />
    );

    // KAPALI satır Pressable DEĞİL: "disabled" değil, hiç basılabilir değil.
    if (option.closed) {
        return (
            <View
                accessible
                accessibilityLabel={`${option.name}, kapalı. ${option.closed.replace(' · ', ', ')}.`}
                style={{ minHeight: 60, paddingVertical: 11, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: c.bd, backgroundColor: closedFill }}
            >
                {stripe}
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                        <Text style={{ color: c.tx3, fontSize: 16, fontFamily: font.bold, fontWeight: '700', letterSpacing: 16 * -0.015 }}>{option.name}</Text>
                        <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: closedEdge, justifyContent: 'center' }}>
                            <Text style={{ color: c.rd, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 10.5 * 0.1 }}>KAPALI</Text>
                        </View>
                    </View>
                    <Text style={{ color: c.rd, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500' }}>{option.closed}</Text>
                </View>
                <Text style={{ color: c.tx3, fontSize: 16, fontFamily: font.extraBold, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    ₺{formatTRY(option.price)}
                </Text>
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={[option.name, meta, `₺${formatTRY(option.price)}`].filter(Boolean).join(', ')}
            onPress={onPress}
            style={({ pressed }) => ({
                minHeight: 60, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12,
                borderTopWidth: 1, borderColor: c.bd,
                backgroundColor: selected ? c.surf : pressed ? c.surf2 : 'transparent',
            })}
        >
            {stripe}
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={{ color: c.tx, fontSize: 16, fontFamily: font.bold, fontWeight: '700', letterSpacing: 16 * -0.015, lineHeight: 16 * 1.2 }}>
                    {option.name}
                </Text>
                {meta ? (
                    <Text numberOfLines={1} style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500' }}>{meta}</Text>
                ) : null}
            </View>
            <Text style={{ color: c.tx, fontSize: 16, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 16 * -0.02, fontVariant: ['tabular-nums'] }}>
                ₺{formatTRY(option.price)}
            </Text>
            <View style={{
                width: 24, height: 24, borderRadius: 12, marginRight: 16,
                borderWidth: selected ? 0 : 1.6, borderColor: c.bd2, backgroundColor: selected ? c.or : 'transparent',
                alignItems: 'center', justifyContent: 'center',
            }}>
                {selected ? <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: onAccent }} /> : null}
            </View>
        </Pressable>
    );
}

/** Şablonsuz salonda seans sayısı: iki 44 pt düğme; sınırda düğme sönük. */
function Stepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
    const { c, reduceMotion } = useTheme();
    const [pop] = useState(() => new Animated.Value(1));
    const shown = useRef(value);
    useEffect(() => {
        if (shown.current === value) return;
        shown.current = value;
        if (reduceMotion) return;
        pop.setValue(0.92);
        Animated.spring(pop, { toValue: 1, damping: 20, stiffness: 330, mass: 0.5, useNativeDriver: true }).start();
    }, [value, reduceMotion, pop]);
    const button = (label: string, path: string, next: number, off: boolean) => (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={() => onChange(next)}
            style={({ pressed }) => ({
                width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: c.bd2,
                backgroundColor: pressed ? c.surf2 : c.bg, alignItems: 'center', justifyContent: 'center',
                opacity: off ? 0.34 : 1,
            })}
        >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d={path} stroke={c.tx} strokeWidth={2.1} strokeLinecap="round" />
            </Svg>
        </Pressable>
    );
    return (
        <View style={{
            minHeight: 68, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
            borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.bd, backgroundColor: c.surf,
        }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Caps color={c.tx3}>SEANS SAYISI</Caps>
                <Text style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500' }}>
                    {MIN_SESSIONS}–{MAX_SESSIONS} arası · elle girilir
                </Text>
            </View>
            {button('Azalt', 'M5 12h14', value - 1, value <= MIN_SESSIONS)}
            <Animated.Text
                accessibilityLabel={`${value} seans`}
                style={{
                    minWidth: 44, textAlign: 'center', color: c.tx, fontSize: 30, fontFamily: font.extraBold, fontWeight: '800',
                    letterSpacing: 30 * -0.03, fontVariant: ['tabular-nums'], transform: [{ scale: pop }],
                }}
            >
                {value}
            </Animated.Text>
            {button('Arttır', 'M12 5v14M5 12h14', value + 1, value >= MAX_SESSIONS)}
        </View>
    );
}

function SumRow({ label, value, sub, first = false }: { label: string; value: string; sub?: string | null; first?: boolean }) {
    const { c } = useTheme();
    return (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderColor: c.bd }}>
            <View style={{ width: 96 }}><Caps color={c.tx3}>{label}</Caps></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: c.tx, fontSize: 15.5, fontFamily: font.bold, fontWeight: '700', letterSpacing: 15.5 * -0.015, lineHeight: 15.5 * 1.3 }}>{value}</Text>
                {sub ? <Text style={{ color: c.tx2, fontSize: 12.5, fontFamily: font.medium, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{sub}</Text> : null}
            </View>
        </View>
    );
}

/** Büyük harf METİN KATMANINDA — `textTransform` Türkçe i → İ'yi bozuyor. */
function Caps({ children, color }: { children: ReactNode; color: string }) {
    return (
        <Text style={{ color, fontSize: 10.5, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 10.5 * 0.14, lineHeight: 12 }}>
            {children}
        </Text>
    );
}

/** Çift paket uyarısı: 60 ms sonra, 140 ms, 6 pt'den. */
function FadeLift({ children, lift, ms, delay }: { children: ReactNode; lift: number; ms: number; delay: number }) {
    const { reduceMotion } = useTheme();
    const [value] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
    useEffect(() => {
        if (reduceMotion) { value.setValue(1); return; }
        Animated.timing(value, { toValue: 1, duration: ms, delay, easing: EASE, useNativeDriver: true }).start();
    // Bir kez — uyarı seçimle birlikte doğar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <Animated.View style={{
            opacity: value,
            transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [lift, 0] }) }],
        }}>
            {children}
        </Animated.View>
    );
}

function ChevronRight({ color }: { color: string }) {
    return (
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}

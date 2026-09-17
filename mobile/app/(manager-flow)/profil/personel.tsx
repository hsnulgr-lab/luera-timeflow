import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
    Chevron,
    Foot,
    GhostButton,
    Group,
    PrimaryButton,
    ProfileNav,
} from '../../../src/components/ProfileParts';
import { DurumBlock, DurumUnread } from '../../../src/components/Durum';
import { authApi } from '../../../src/api/session';
import { orgDurum } from '../../../src/lib/managerDurum';
import { useManagerRead } from '../../../src/lib/managerRead';
import { forgetOrg } from '../../../src/lib/managerSource';
import {
    activeTeamCode, createTeamCode, fetchTeamStatus, rememberTeamCode, resetStaffPin, type TeamFailure,
} from '../../../src/lib/teamAccess';
import {
    countdown, isFreshPin, memberLine, sortTeam, spacedCode, teamHeadline,
    type TeamCode, type TeamMember,
} from '../../../src/lib/teamAccessView';
import { pinInk } from '../../../src/lib/pinInk';
import { feedback } from '../../../src/lib/feedback';
import { initialsOf, upperTR } from '../../../src/lib/text';
import { font, profileMetrics as M, radius, useTheme } from '../../../src/theme';

/**
 * Müdür · Profil → Personel — Personel Girişi 099 tasarımı (§M1).
 *
 * Opak "içeridesin" dili: üstte kodun ömrü, altta ekibin hâli. Kod kapalıyken
 * de ekip listesi okunuyor — müdürün buraya gelme sebeplerinden biri kod
 * üretmek, öteki "kim girdi" diye bakmak.
 *
 * Tasarımın kararları:
 *   • Kod 44 pt, 3+3 gruplu; altında 3 pt ömür çizgisi ve geri sayım. Son 60
 *     saniyede renk turuncu ve cümle "bitince ne yapılacağını" söylüyor.
 *   • "Ekrana yaz" SUNUM hâli: tam ekran, 72 pt, düz zemin (cam açılı bakışta
 *     okunmuyor), ekran KARARMIYOR — telefon tezgâha bırakılır.
 *   • "Şifresini belirledi · bugün 23:31" 12 saat yeşil ve listenin başında —
 *     müdürün "doğru kişi mi belirledi" kontrolü.
 *   • Sıfırlama Alert değil SAYFA: sonuçları var ve biri (oturum kapanır)
 *     atlanmamalı. Turuncu, kırmızı değil — kişi hiçbir veri kaybetmiyor.
 *
 * Koddan düzeltilen tasarım iddiası: kilit KİŞİYE ait ve şifre sıfırlanınca
 * kalkıyor (082 tetikleyicisi `pin_locked_until`ı temizliyor). Kilitli satıra
 * dokunmak bu yüzden sıfırlama sayfasını açıyor.
 */
export default function ManagerStaffAccess() {
    const { c, dark } = useTheme();
    const ink = pinInk(dark);
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const read = useCallback(() => fetchTeamStatus(), []);
    const snap = useManagerRead<TeamMember[] | 'owner_required' | null>(read, null, { poll: false });

    const [code, setCode] = useState<TeamCode | null>(() => activeTeamCode(Date.now()));
    const [codeBusy, setCodeBusy] = useState(false);
    const [codeError, setCodeError] = useState<TeamFailure | null>(null);
    const [presenting, setPresenting] = useState(false);
    const [resetting, setResetting] = useState<TeamMember | null>(null);
    const [resetBusy, setResetBusy] = useState(false);
    const [resetError, setResetError] = useState<string | null>(null);
    /** Sıfırlanan satırda chevron'un yerinde 2 sn duran teal onay. */
    const [justReset, setJustReset] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    // Saniyede bir yalnız kod açıkken; yoksa dakikada bir (satırların "12 dk kilitli"si).
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), code ? 1000 : 30_000);
        return () => clearInterval(id);
    }, [code]);

    useEffect(() => {
        if (!justReset) return undefined;
        const id = setTimeout(() => setJustReset(null), 2000);
        return () => clearTimeout(id);
    }, [justReset]);

    const secondsLeft = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 1000)) : 0;
    const expired = Boolean(code) && secondsLeft === 0;
    const lastMinute = secondsLeft > 0 && secondsLeft <= 60;
    const life = code ? Math.min(1, secondsLeft / (15 * 60)) : 0;

    const makeCode = useCallback(async () => {
        if (codeBusy) return;
        setCodeBusy(true);
        setCodeError(null);
        try {
            const result = await createTeamCode();
            if (result.ok) {
                feedback.success();
                setNow(Date.now());
                setCode(result.code);
                rememberTeamCode(result.code);
            } else {
                feedback.warning();
                setCodeError(result.reason);
            }
        } catch {
            setCodeError('failed');
        } finally {
            setCodeBusy(false);
        }
    }, [codeBusy]);

    const closeCode = () => {
        setCode(null);
        rememberTeamCode(null);
        setCodeError(null);
        setPresenting(false);
    };

    const confirmReset = async () => {
        if (!resetting || resetBusy) return;
        setResetBusy(true);
        setResetError(null);
        const result = await resetStaffPin(resetting.id).catch(() => ({ ok: false as const, reason: 'failed' as const }));
        setResetBusy(false);
        if (!result.ok) {
            feedback.warning();
            setResetError(result.reason === 'owner_required'
                ? 'Şifreyi yalnız işletme sahibi sıfırlayabilir.'
                : result.reason === 'offline'
                    ? 'Bağlantı yok. Şifre değişmedi; bağlanınca tekrar deneyin.'
                    : 'Şifre değişmedi. Birazdan tekrar deneyin.');
            return;
        }
        feedback.success();
        setJustReset(resetting.id);
        setResetting(null);
        void snap.reload();
    };

    const onRefusalAction = useCallback(async () => {
        if (snap.refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [snap.refusal, router]);

    const ownerOnly = snap.data === 'owner_required';
    const members = Array.isArray(snap.data) ? sortTeam(snap.data, now) : null;
    const headline = members ? teamHeadline(members, now) : '';

    const body = { color: c.tx2, fontSize: 13.5, lineHeight: 19, fontFamily: font.semiBold, fontWeight: '600' as const };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Personel" onBack={() => router.back()} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: M.padX, paddingBottom: M.bottomInset, gap: 10 }}
            >
                {snap.refusal ? (
                    <DurumBlock
                        tone={orgDurum(snap.refusal).tone}
                        title={orgDurum(snap.refusal).title}
                        lines={orgDurum(snap.refusal).lines}
                        actions={[{ label: orgDurum(snap.refusal).action.label, onPress: () => { void onRefusalAction(); } }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : null}

                {/* ── Telefon bağla ─────────────────────────────────────── */}
                <Group head={upperTR('Telefon bağla')}>
                    <View style={{ paddingHorizontal: M.rowPadX, paddingBottom: 14, gap: 12 }}>
                        {ownerOnly ? (
                            <Text style={body}>Kod üretmeyi yalnız işletme sahibi yapabilir.</Text>
                        ) : code ? (
                            <>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Kodu ekrana büyük yaz"
                                    disabled={expired}
                                    onPress={() => setPresenting(true)}
                                    style={{ gap: 10, paddingTop: 4 }}
                                >
                                    <Text style={{
                                        color: c.tx,
                                        opacity: expired ? 0.32 : 1,
                                        fontSize: 44,
                                        lineHeight: 48,
                                        fontFamily: font.extraBold,
                                        fontWeight: '800',
                                        letterSpacing: 44 * 0.02,
                                        fontVariant: ['tabular-nums'],
                                    }}>
                                        {spacedCode(code.code)}
                                    </Text>
                                    <View style={{ height: 3, borderRadius: radius.pill, backgroundColor: c.bd2, overflow: 'hidden' }}>
                                        <View style={{ width: `${life * 100}%`, height: 3, borderRadius: radius.pill, backgroundColor: c.or }} />
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                        {!expired ? (
                                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: lastMinute ? c.or : c.gr }} />
                                        ) : null}
                                        <Text style={{
                                            color: expired ? c.tx2 : lastMinute ? c.or2 : c.tx,
                                            fontSize: 14,
                                            fontFamily: font.bold,
                                            fontWeight: '700',
                                            fontVariant: ['tabular-nums'],
                                        }}>
                                            {expired ? 'Süresi doldu' : `${countdown(secondsLeft)} geçerli`}
                                        </Text>
                                    </View>
                                </Pressable>
                                <Text style={body}>
                                    {expired
                                        ? 'Personel henüz yazmadıysa yeni bir kod üretin.'
                                        : lastMinute
                                            ? 'Girmeyen kalırsa süre dolduğunda yeni kod üretebilirsiniz.'
                                            : 'Bütün ekip bu kodu yazabilir. Yeni kod ürettiğinizde bu kod kapanır.'}
                                </Text>
                                {expired ? (
                                    <PrimaryButton
                                        label={codeBusy ? 'Üretiliyor…' : 'Yeni kod üret'}
                                        disabled={codeBusy}
                                        onPress={() => { void makeCode(); }}
                                    />
                                ) : (
                                    <>
                                        <PrimaryButton label="Ekrana yaz" onPress={() => setPresenting(true)} />
                                        <GhostButton label="Kodu kapat" onPress={closeCode} />
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={body}>
                                    Ekip kendi telefonundan girecekse tek seferlik bir kod üretin. Kodu yazan kişi
                                    listeden kendini seçer ve şifresini kendisi belirler.
                                </Text>
                                <PrimaryButton
                                    label={codeBusy ? 'Üretiliyor…' : 'Telefon bağla'}
                                    disabled={codeBusy}
                                    onPress={() => { void makeCode(); }}
                                />
                            </>
                        )}
                        {codeError ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Text style={{ flex: 1, color: codeError === 'offline' ? c.am : c.rd, fontSize: 13, fontFamily: font.bold, fontWeight: '700' }}>
                                    {codeError === 'owner_required'
                                        ? 'Kod üretmeyi yalnız işletme sahibi yapabilir.'
                                        : codeError === 'offline'
                                            ? 'Kod üretmek için internet gerekiyor.'
                                            : 'Kod üretilemedi.'}
                                </Text>
                                {codeError !== 'owner_required' ? (
                                    <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { void makeCode(); }}>
                                        <Text style={{ color: c.tx, fontSize: 13, fontFamily: font.bold, fontWeight: '700' }}>Tekrar dene</Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                </Group>

                {/* ── Ekip ──────────────────────────────────────────────── */}
                {!snap.refusal && snap.data === null && snap.state === 'error' ? (
                    <DurumUnread
                        what="Ekibin giriş durumunu"
                        notMeaning="Kimsenin giremediği"
                        onRetry={() => { void snap.reload(); }}
                        style={{ paddingHorizontal: 0 }}
                    />
                ) : null}
                {members && members.length === 0 ? (
                    <Foot>Henüz personel eklenmemiş. Bilgisayardan Personel sayfasından ekleyin.</Foot>
                ) : null}
                {members && members.length > 0 ? (
                    <Group head={upperTR(`Ekip · ${members.length} kişi${headline ? ` · ${headline}` : ''}`)}>
                        {members.map((member, index) => {
                            const line = memberLine(member, now);
                            const fresh = isFreshPin(member, now);
                            const lineColor = line.tone === 'ok' ? c.gr : line.tone === 'error' ? c.rd : c.tx2;
                            const tappable = member.hasPin && !ownerOnly;
                            return (
                                <Pressable
                                    key={member.id}
                                    accessibilityRole={tappable ? 'button' : undefined}
                                    accessibilityLabel={`${member.name}, ${line.text}`}
                                    disabled={!tappable}
                                    onPress={() => { setResetError(null); setResetting(member); }}
                                    style={({ pressed }) => ({
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 12,
                                        minHeight: 56,
                                        paddingVertical: 9,
                                        paddingHorizontal: M.rowPadX,
                                        borderTopWidth: index === 0 ? 0 : 1,
                                        borderColor: c.bd,
                                        backgroundColor: pressed || fresh ? c.surf2 : 'transparent',
                                    })}
                                >
                                    <View style={{
                                        width: 38, height: 38, borderRadius: radius.pill,
                                        borderWidth: 1.6,
                                        borderColor: member.hasPin ? c.bd2 : ink.tealEdge,
                                        backgroundColor: member.hasPin ? c.surf2 : ink.tealFill,
                                        alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Text style={{ color: member.hasPin ? c.tx : ink.teal, fontSize: 13, fontFamily: font.extraBold, fontWeight: '800' }}>
                                            {initialsOf(member.name)}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                        <Text numberOfLines={1} style={{ color: c.tx, fontSize: 15, fontFamily: font.bold, fontWeight: '700', letterSpacing: 15 * -0.015 }}>
                                            {member.name}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            {line.dot ? (
                                                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: lineColor, marginRight: 6 }} />
                                            ) : null}
                                            <Text numberOfLines={2} style={{
                                                flex: 1, color: lineColor, fontSize: 12.5, lineHeight: 12.5 * 1.35,
                                                fontFamily: line.tone === 'quiet' ? font.medium : font.bold,
                                                fontWeight: line.tone === 'quiet' ? '500' : '700',
                                            }}>
                                                {line.text}
                                            </Text>
                                        </View>
                                    </View>
                                    {justReset === member.id ? (
                                        <Svg width={20} height={20} viewBox="0 0 24 24">
                                            <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={ink.teal} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                        </Svg>
                                    ) : tappable ? <Chevron color={c.tx3} /> : null}
                                </Pressable>
                            );
                        })}
                    </Group>
                ) : null}

                <Foot>
                    Personel eklemek ve çıkarmak bilgisayardan: Luera → Personel. Şifresini unutan
                    personelin satırına dokunup sıfırlayın; yenisini kendisi belirler.
                </Foot>
            </ScrollView>

            {code && !expired ? (
                <PresentCode visible={presenting} code={code} secondsLeft={secondsLeft} onClose={() => setPresenting(false)} />
            ) : null}

            <Modal
                visible={resetting !== null}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setResetting(null)}
            >
                {resetting ? (
                    <ResetPage
                        member={resetting}
                        locked={memberLine(resetting, now).tone === 'error'}
                        busy={resetBusy}
                        error={resetError}
                        onConfirm={() => { void confirmReset(); }}
                        onCancel={() => setResetting(null)}
                    />
                ) : null}
            </Modal>
        </View>
    );
}

/**
 * Sunum hâli — kodun ekibe gösterildiği yer. Tam ekran, 72 pt, DÜZ zemin
 * (#F3EDE3 / #120E08, 14,8:1). Ekran kararmıyor (`useKeepAwake`, yalnız bu
 * bileşen monte edildiğinde). Ekrana dokununca kapanır; kod canlı kalır.
 */
function PresentCode({ visible, code, secondsLeft, onClose }: {
    visible: boolean;
    code: TeamCode;
    secondsLeft: number;
    onClose: () => void;
}) {
    return (
        <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            {visible ? <PresentBody code={code} secondsLeft={secondsLeft} onClose={onClose} /> : null}
        </Modal>
    );
}

function PresentBody({ code, secondsLeft, onClose }: { code: TeamCode; secondsLeft: number; onClose: () => void }) {
    useKeepAwake();
    const { c } = useTheme();
    const lastMinute = secondsLeft <= 60;
    const life = Math.min(1, secondsLeft / (15 * 60));
    const digits = code.code;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={onClose}
            style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
        >
            <Text style={{ color: c.tx3, fontSize: 13, fontFamily: font.bold, fontWeight: '700', letterSpacing: 13 * 0.2, marginBottom: 26 }}>
                {upperTR('Luera ekip kodu')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 18 }}>
                {[digits.slice(0, 3), digits.slice(3)].map((part) => (
                    <Text
                        key={part + digits}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                        style={{ color: c.tx, fontSize: 72, lineHeight: 80, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 72 * 0.01, fontVariant: ['tabular-nums'] }}
                    >
                        {part}
                    </Text>
                ))}
            </View>
            <Text style={{ color: lastMinute ? c.or2 : c.tx2, fontSize: 20, fontFamily: font.bold, fontWeight: '700', marginTop: 18, fontVariant: ['tabular-nums'] }}>
                {countdown(secondsLeft)} geçerli
            </Text>
            <View style={{ width: 220, height: 3, borderRadius: radius.pill, backgroundColor: c.bd2, overflow: 'hidden', marginTop: 14 }}>
                <View style={{ width: `${life * 100}%`, height: 3, backgroundColor: c.or }} />
            </View>
            <Text style={{ color: c.tx2, fontSize: 14, lineHeight: 20, fontFamily: font.medium, fontWeight: '500', marginTop: 26, textAlign: 'center' }}>
                Ekip bu kodu kendi telefonuna yazar. Ekran kapanmayacak.
            </Text>
            <Text style={{ color: c.tx, fontSize: 15, fontFamily: font.bold, fontWeight: '700', marginTop: 34, textDecorationLine: 'underline' }}>
                Kapat
            </Text>
        </Pressable>
    );
}

/**
 * Şifreyi sıfırla — onay SAYFASI. Müdür şifre yazmıyor. Sonuçlar tek tek
 * yazılı; biri (açık oturum kapanır) atlanmamalı.
 */
function ResetPage({ member, locked, busy, error, onConfirm, onCancel }: {
    member: TeamMember;
    locked: boolean;
    busy: boolean;
    error: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const items = [
        'Şu anki şifresi silinir.',
        'Açık oturumu kapanır; telefonundan çıkar.',
        ...(locked ? ['Kilidi de kalkar.'] : []),
        'Bir sonraki girişte yeni şifresini kendisi belirler.',
        'Telefonu işletmeye bağlı kalır; yeni kod gerekmez.',
    ];
    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: 22, paddingTop: 28, paddingBottom: Math.max(insets.bottom, 24) }}>
            <Text style={{ color: c.tx3, fontSize: 12, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 12 * 0.14 }}>
                {upperTR('Şifreyi sıfırla')}
            </Text>
            <Text style={{ color: c.tx, fontSize: 26, lineHeight: 30, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 26 * -0.03, marginTop: 8 }}>
                {member.name}
            </Text>
            <Text style={{ color: c.tx2, fontSize: 15, lineHeight: 22, fontFamily: font.medium, fontWeight: '500', marginTop: 10 }}>
                Şifreyi siz yazmıyorsunuz. Sıfırlarsanız kendisi yeni bir şifre belirler.
            </Text>
            <View style={{ marginTop: 22, gap: 12 }}>
                {items.map((item) => (
                    <View key={item} style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.tx3, marginTop: 8 }} />
                        <Text style={{ flex: 1, color: c.tx, fontSize: 15, lineHeight: 22, fontFamily: font.semiBold, fontWeight: '600' }}>
                            {item}
                        </Text>
                    </View>
                ))}
            </View>
            <View style={{ flex: 1 }} />
            {error ? (
                <Text style={{ color: c.rd, fontSize: 13.5, fontFamily: font.bold, fontWeight: '700', marginBottom: 12 }}>{error}</Text>
            ) : null}
            <View style={{ gap: 9 }}>
                <PrimaryButton label={busy ? 'Sıfırlanıyor…' : 'Şifreyi sıfırla'} disabled={busy} onPress={onConfirm} />
                <GhostButton label="Vazgeç" onPress={onCancel} />
            </View>
        </View>
    );
}

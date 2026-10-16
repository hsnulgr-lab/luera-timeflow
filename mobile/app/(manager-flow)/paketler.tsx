import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { EmptyBlock, Group, ProfileNav, ProfileRow } from '../../src/components/ProfileParts';
import { authApi } from '../../src/api/session';
import { splitName } from '../../src/lib/customerBook';
import { formatTRY } from '../../src/lib/customerCard';
import { feedback } from '../../src/lib/feedback';
import { orgDurum } from '../../src/lib/managerDurum';
import { useManagerRead } from '../../src/lib/managerRead';
import { fetchPackageBook, fetchPackageTypes, forgetOrg } from '../../src/lib/managerSource';
import {
    doneFoldLabel, lastSession, packageCounts, packageLine, packageSections, packageSummary,
    typesSummary, type PackageBookRow, type PackageType,
} from '../../src/lib/packageBook';
import { upperTR } from '../../src/lib/text';
import { font, numeric, profileMetrics as M, useTheme } from '../../src/theme';

/**
 * Paketler (1.0.1) — salonun satılmış paketleri + paket türleri.
 *
 * Kapı Profil'de, Müşteriler'in üstünde; yalnız paket satan sektörlerde
 * (`fetchPackageGlance`). Müdürün sorusu "kimin paketi var, kaç seansı kaldı,
 * kim ödemedi" — bugüne kadar cevabı yalnız tek tek müşteri kartındaydı.
 *
 * ── Ekran PARA ALMAZ ────────────────────────────────────────────────────────
 * Satıra dokunmak müşteri kartını açar; "Ödeme al" orada ve kendi kuralıyla
 * (`planPayment`). İkinci bir tahsilat kapısı, aynı borcu iki yerden almanın
 * en kısa yolu olurdu. Sayılar da kartla aynı (`packageBook.ts`).
 *
 * ── Sıra = iş sırası ────────────────────────────────────────────────────────
 * Önce ödenmeyen, sonra son seansı kalan, sonra öteki. İşi kalmamış paketler
 * "Bitenler"de katlı (Gün'ün "Bitenler"i gibi): geçmişi gösterir ama bugünün
 * listesini uzatmaz.
 */
const ROW = { height: 72, heightSm: 64, name: 19, nameSm: 17.5 } as const;

export default function ManagerPackages() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [foldOpen, setFoldOpen] = useState(false);

    /*
     * Defter ve türler TEK okumada. Türler okunamazsa defter yine çizilir;
     * tür satırı yalnız özetsiz kalır — kapı ölmez.
     */
    const read = useCallback(async () => {
        const [book, types] = await Promise.all([
            fetchPackageBook(),
            fetchPackageTypes().catch((): PackageType[] | null => null),
        ]);
        return { book, types };
    }, []);
    // Yoklama KAPALI: defter saniyede değişen bir şey değil. Satış, tahsilat
    // ve tür değişikliği zil ile geliyor.
    const snap = useManagerRead<{ book: PackageBookRow[]; types: PackageType[] | null } | null>(read, null,
        { poll: false, tables: ['treatment_plans', 'payments', 'customers', 'package_templates'] });

    const sections = useMemo(() => (snap.data ? packageSections(snap.data.book) : null), [snap.data]);
    const counts = useMemo(() => (snap.data ? packageCounts(snap.data.book) : null), [snap.data]);

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

    const open = (row: PackageBookRow) => {
        feedback.selection();
        // Zaten var olan müşteri kartı: paketleri, "Ödeme al"ı ve "Paket
        // sat"ı orada. Kimlik doğru kaydı seçer; ad, kart bulunamazsa ne
        // arandığını söyleyebilsin diye.
        router.push({
            pathname: '/(staff-flow)/customer',
            params: { customerId: row.customerId, customerName: row.customerName },
        });
    };
    const openTypes = () => {
        feedback.selection();
        router.push('/(manager-flow)/profil/paket-turleri');
    };

    const typesRow = (
        <Group>
            <ProfileRow
                first
                big
                title="Paket türleri"
                sub={snap.data?.types ? typesSummary(snap.data.types.length) : undefined}
                onPress={openTypes}
            />
        </Group>
    );

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Paketler" onBack={() => router.back()} />
            </View>

            <View style={{ paddingHorizontal: M.padX, paddingBottom: 6 }}>
                {/* Özet BAŞLIĞIN ALTINDA. Okunamadıysa sayıdan söz edilmiyor. */}
                <Text style={{ fontSize: 12.5, fontWeight: '500', color: c.tx3 }}>
                    {snap.state === 'error' ? 'Paketler okunamadı'
                        : snap.state === 'loading' || !counts ? 'Okunuyor…'
                            : packageSummary(counts)}
                </Text>
            </View>

            {snap.refusal ? (
                <DurumBlock
                    tone={orgDurum(snap.refusal).tone}
                    title={orgDurum(snap.refusal).title}
                    lines={orgDurum(snap.refusal).lines}
                    actions={[{
                        label: orgDurum(snap.refusal).action.label,
                        onPress: () => { void onRefusalAction(); },
                    }]}
                />
            ) : snap.state === 'error' && !snap.data ? (
                <DurumUnread
                    what="Paketleri"
                    notMeaning="Paket olmadığı"
                    onRetry={() => { void snap.reload(); }}
                    style={{ flex: 1, paddingHorizontal: M.padX }}
                />
            ) : !sections ? (
                /* Yükleniyor SESSİZ: liste çoğu zaman bir saniyeden kısa sürede
                   geliyor; o kadar kısa süre için ekranı doldurmak geleni zıplatır. */
                <View style={{ flex: 1 }} />
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: M.padX,
                        paddingBottom: M.bottomInset + insets.bottom,
                        gap: 18,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {sections.open.length === 0 && sections.done.length === 0 ? (
                        <EmptyBlock
                            title="Henüz paket satılmadı"
                            hint="Paket, müşteri kartındaki “Paket sat” ile satılır. Satılan her paket burada kalan seansı ve ödenmeyen bedeliyle görünür."
                        />
                    ) : (
                        <View>
                            {sections.open.length === 0 ? (
                                <Text style={{
                                    paddingVertical: 14, fontSize: 13.5, fontWeight: '500', color: c.tx3,
                                }}>
                                    Süren paket yok — hepsinin seansı bitti ve ödendi.
                                </Text>
                            ) : sections.open.map((row, index) => (
                                <Row
                                    key={row.planId}
                                    row={row}
                                    last={index === sections.open.length - 1 && sections.done.length === 0}
                                    onOpen={() => open(row)}
                                />
                            ))}

                            {sections.done.length > 0 ? (
                                <>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{ expanded: foldOpen }}
                                        accessibilityLabel={`${doneFoldLabel(sections.done.length)}, ${foldOpen ? 'gizle' : 'göster'}`}
                                        onPress={() => { feedback.selection(); setFoldOpen((value) => !value); }}
                                        style={({ pressed }) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            minHeight: 48,
                                            borderBottomWidth: foldOpen ? 1 : 0,
                                            borderBottomColor: c.bd,
                                            opacity: pressed ? 0.6 : 1,
                                        })}
                                    >
                                        <Text style={{
                                            fontSize: 10.5, fontWeight: '700', letterSpacing: 1.58, color: c.tx3,
                                        }}>
                                            {upperTR(doneFoldLabel(sections.done.length))}
                                        </Text>
                                        <Svg
                                            width={14}
                                            height={14}
                                            viewBox="0 0 24 24"
                                            style={{ transform: [{ rotate: foldOpen ? '180deg' : '0deg' }] }}
                                        >
                                            <Path
                                                d="M6 9l6 6 6-6"
                                                stroke={c.tx3}
                                                strokeWidth={2.2}
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </Svg>
                                    </Pressable>
                                    {foldOpen ? sections.done.map((row, index) => (
                                        <Row
                                            key={row.planId}
                                            row={row}
                                            dim
                                            last={index === sections.done.length - 1}
                                            onOpen={() => open(row)}
                                        />
                                    )) : null}
                                </>
                            ) : null}
                        </View>
                    )}

                    {typesRow}
                </ScrollView>
            )}
        </View>
    );
}

/**
 * Satır: ad · paket ve kalan · sağda ödenmeyen bedel.
 *
 * Renk İŞARETTE: ödenmeyen tutar amber, son seans turuncu. Gerisi mürekkep.
 * Ödenmişse sağ sütun BOŞ — "₺0" yazmak bir sayı gibi okunur, bilgi değil.
 */
function Row({ row, last, dim = false, onOpen }: {
    row: PackageBookRow;
    last: boolean;
    /** Bitenler: aynı satır, sönük — geçmiş, iş değil. */
    dim?: boolean;
    onOpen: () => void;
}) {
    const { c, small } = useTheme();
    const name = splitName(row.customerName || 'Adı okunamadı');
    const size = small ? ROW.nameSm : ROW.name;
    const line = packageLine(row);
    const owed = row.owed > 0;
    const final = !owed && lastSession(row);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={[
                row.customerName || 'Adı okunamadı',
                line,
                owed ? `${formatTRY(row.owed)} lira ödenmedi` : null,
            ].filter(Boolean).join(', ')}
            onPress={onOpen}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                minHeight: small ? ROW.heightSm : ROW.height,
                paddingVertical: small ? 9 : 11,
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: c.bd,
                opacity: pressed ? 0.6 : dim ? 0.62 : 1,
            })}
        >
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text numberOfLines={1} style={{
                    fontSize: size,
                    lineHeight: size * 1.1,
                    letterSpacing: -size * 0.02,
                    fontFamily: font.extraLight,
                    color: c.tx2,
                }}>
                    {name.light}
                    <Text style={{ fontFamily: font.bold, color: c.tx }}>{name.bold}</Text>
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '500', color: c.tx2 }}>
                    {line}
                </Text>
            </View>

            {owed ? (
                <View style={{ alignItems: 'flex-end', gap: 3, alignSelf: 'flex-start', paddingTop: 2 }}>
                    <Text style={[{ fontSize: 16, fontFamily: font.bold, fontWeight: '700', color: c.am }, numeric]}>
                        ₺{formatTRY(row.owed)}
                    </Text>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 1.43, color: c.tx3 }}>
                        {upperTR('ödenmedi')}
                    </Text>
                </View>
            ) : final ? (
                <Text style={{
                    alignSelf: 'flex-start',
                    paddingTop: 5,
                    fontSize: 10.5,
                    fontWeight: '700',
                    letterSpacing: 1.58,
                    color: c.or,
                }}>
                    {upperTR('son seans')}
                </Text>
            ) : null}
        </Pressable>
    );
}

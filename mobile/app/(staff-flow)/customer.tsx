import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CustomerCard } from '../../src/components/CustomerCard';
import { CustomerNoteSheet } from '../../src/components/CustomerNoteSheet';
import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { Empty } from '../../src/components/ui';
import { authApi } from '../../src/api/session';
import { dialPhone, type CustomerCard as CardData } from '../../src/lib/customerCard';
import { customerCardOf } from '../../src/lib/customerCardLive';
import { localClock } from '../../src/lib/createLive';
import { orgDurum } from '../../src/lib/managerDurum';
import { useManagerRead } from '../../src/lib/managerRead';
import { fetchCustomerCardRows, forgetOrg } from '../../src/lib/managerSource';
import { createPackage } from '../../src/lib/managerWrite';
import { saleFailureText, saleMemo, type PackageSaleInput } from '../../src/lib/packageSale';
import { useTheme } from '../../src/theme';

type CustomerRouteParams = {
    customerName?: string | string[];
    customerId?: string | string[];
    id?: string | string[];
    name?: string | string[];
    phone?: string | string[];
    reservationId?: string | string[];
    date?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    const clean = first?.trim();
    return clean || undefined;
}

/**
 * Müdür 23 — Müşteri kartı rotası.
 *
 * VERİ CANLI: müşteri KİMLİĞİYLE okunuyor (`fetchCustomerCardRows` →
 * `customerCardOf`). Bir süre dört sahte müşteri arasında aranıyordu ve
 * canlı kipte her gerçek müşteri için "Müşteri bulunamadı" yazıyordu.
 *
 * Adla arama YOK. Kimliği olmayan randevu (kayda bağlanmamış, numarasız
 * müşteri) için ekran bunu SÖYLÜYOR; aynı adlı başka birinin kartını açmıyor.
 *
 * Dört hâl ayrı: okunuyor · okunamadı · kayıt yok · kart.
 */
export default function CustomerScreen() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<CustomerRouteParams>();

    const customerId = firstParam(params.customerId) ?? firstParam(params.id) ?? null;
    const customerName = firstParam(params.customerName) ?? firstParam(params.name) ?? null;

    const read = useCallback(async (): Promise<CardData | null> => {
        if (!customerId) return null;
        // Gün ve saat okuma ANINDA: "yaklaşan" ve "ilk ziyaret bugün" buna bakıyor.
        const now = localClock(Date.now());
        const rows = await fetchCustomerCardRows(customerId, now.dateISO);
        if (!rows) return null;
        const hh = String(Math.floor(now.minutes / 60)).padStart(2, '0');
        const mm = String(now.minutes % 60).padStart(2, '0');
        return customerCardOf({ ...rows, todayISO: now.dateISO, nowClock: `${hh}:${mm}` });
    }, [customerId]);
    const snap = useManagerRead<CardData | null>(read, null, { poll: false });
    const card = snap.data;
    const [noting, setNoting] = useState(false);

    /*
     * Müdür 35 · satıştan dönüş. Satış sayfası sonucu bellekte bırakıyor;
     * kart ona odaklanınca bir kez okuyor. Başarı → yeni satır bir kez
     * belirir. Başarısızlık → sebep + "Yeniden dene" (aynı kimlikle: ikinci
     * paket doğmaz).
     */
    const [freshPlanId, setFreshPlanId] = useState<string | null>(null);
    const [failed, setFailed] = useState<{ input: PackageSaleInput; text: string } | null>(null);
    const [retrying, setRetrying] = useState(false);
    useFocusEffect(useCallback(() => {
        if (!customerId) return;
        const memo = saleMemo.peek(customerId);
        if (!memo) return;
        if (memo.kind === 'created') {
            saleMemo.clear(customerId);
            setFailed(null);
            setFreshPlanId(memo.planId);
        } else {
            setFailed({ input: memo.input, text: saleFailureText(memo.reason) });
        }
    }, [customerId]));
    const retrySale = useCallback(async () => {
        if (!failed || retrying || !customerId) return;
        setRetrying(true);
        const outcome = await createPackage(failed.input).catch(() => ({ ok: false, kind: 'failed' } as const));
        setRetrying(false);
        if (outcome.ok) {
            saleMemo.clear(customerId);
            setFailed(null);
            setFreshPlanId(failed.input.id);
            void snap.reload();
            return;
        }
        saleMemo.failed(customerId, failed.input, outcome.kind);
        setFailed({ input: failed.input, text: saleFailureText(outcome.kind) });
    }, [failed, retrying, customerId, snap]);

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

    const close = useCallback(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/mudur/calendar');
    }, [router]);

    const handleCall = useCallback(() => {
        if (!card) return;
        const phone = dialPhone(card);
        if (phone) {
            void Linking.openURL(`tel:${phone}`);
        }
    }, [card]);

    const handleWhatsApp = useCallback(() => {
        if (!card) return;
        const phone = dialPhone(card);
        if (phone) {
            const clean = phone.replace(/[^\d]/g, '');
            void Linking.openURL(`https://wa.me/${clean}`);
        }
    }, [card]);

    const handleBook = useCallback(() => {
        if (!card) return;
        router.navigate({
            pathname: '/mudur/create',
            params: { customerId: card.id },
        });
    }, [card, router]);

    if (!card) {
        /*
         * Hangi boş hâl: red · okunamadı · okunuyor · kayıt bağlı değil ·
         * kayıt yok. "Bulunamadı" YALNIZ okuma başarılı ve satır yoksa.
         */
        const unlinked = !customerId;
        const missing = Boolean(customerId) && snap.state === 'ok';
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Geri"
                        hitSlop={8}
                        onPress={close}
                        style={({ pressed }) => ({
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.surf,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={c.tx} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 4l-6 6 6 6" />
                        </Svg>
                    </Pressable>
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
                        style={{ marginHorizontal: 18, marginBottom: 0 }}
                    />
                ) : unlinked ? (
                    <Empty
                        title={customerName ?? 'Müşteri kaydı yok'}
                        hint="Bu randevu bir müşteri kaydına bağlı değil. Kart, müşteri masaüstünde kayda bağlanınca açılır."
                    />
                ) : snap.state === 'error' ? (
                    <DurumUnread
                        what="Müşteri kartını"
                        notMeaning="Müşterinin silindiği"
                        onRetry={() => { void snap.reload(); }}
                        style={{ paddingHorizontal: 18 }}
                    />
                ) : missing ? (
                    <Empty
                        title="Müşteri bulunamadı"
                        hint="Silinmiş ya da başka bir kayda taşınmış olabilir."
                    />
                ) : null}
            </View>
        );
    }

    return (
        <>
            <CustomerCard
                card={card}
                onBack={close}
                onCall={dialPhone(card) ? handleCall : undefined}
                onWhatsApp={dialPhone(card) ? handleWhatsApp : undefined}
                onBook={handleBook}
                onOpenUpcoming={(id) => router.push({ pathname: '/randevu/[id]', params: { id } })}
                onEditNote={() => setNoting(true)}
                onOpenHistory={() => router.push({
                    pathname: '/(manager-flow)/musteri-gecmis',
                    params: { customerId: card.id, customerName: card.name },
                })}
                onSellPackage={() => router.push({
                    pathname: '/(manager-flow)/paket-sat',
                    params: { customerId: card.id },
                })}
                sale={{ freshPlanId, failure: failed?.text ?? null, retrying }}
                onRetrySale={() => { void retrySale(); }}
            />
            <CustomerNoteSheet
                visible={noting}
                customerId={card.id}
                initial={card.notesText ?? card.notes.join('\n\n')}
                onDismiss={() => setNoting(false)}
                onSaved={() => { setNoting(false); void snap.reload(); }}
            />
        </>
    );
}

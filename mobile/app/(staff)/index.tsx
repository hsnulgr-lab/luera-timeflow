import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api, flushQueue, queueLength, type Appointment } from '../../src/api/staff';
import { Button, Card, Empty, Num, Row, T } from '../../src/components/ui';
import { Glass } from '../../src/components/Glass';
import { hit, radius, space, useTheme } from '../../src/theme';

// Personel ana ekranı — tasarım: "Personel 04/05 — Bugün".
//
// BU EKRAN AKIŞ DEĞİL. Instagram yerleşimi müdür modunda; burada tek bir soru
// var: "şimdi ne yapacağım?" Ekranın yarısını sıradaki randevu kaplar ve tek
// bir büyük buton vardır. Kalan randevular kaydırma gerektirmeyecek kadar az
// gösterilir — personel müşteri karşısında, kaydırmaya vakti yok.

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5);

/** Geçen süre — sayaç dakika:saniye, tasarımın biçimi. */
function elapsed(fromIso: string): string {
    const s = Math.max(0, Math.floor((Date.now() - Date.parse(fromIso)) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Today() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const [rows, setRows] = useState<Appointment[] | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [queued, setQueued] = useState(0);
    const [tick, setTick] = useState(0);

    const load = useCallback(async () => {
        try {
            const r = await api.agenda();
            setRows(r.appointments ?? []);
            setErr(null);
        } catch {
            // Kilitleme: bağlantı yoksa elimizdeki listeyi göstermeye devam et.
            setErr('baglanti');
        }
        setQueued(await queueLength());
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Sayaç saniyede bir yeniden çizilsin; yalnız devam eden işlem varken.
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const onRefresh = useCallback(async () => {
        setBusy(true);
        await flushQueue();
        await load();
        setBusy(false);
    }, [load]);

    const open = rows?.find((r) => r.arrived_at && r.status !== 'completed');
    const rest = (rows ?? []).filter((r) => r.id !== open?.id && r.status !== 'completed');
    const next = rest[0];
    const later = rest.slice(1, small ? 3 : 5);

    const start = async (r: Appointment) => {
        setBusy(true);
        await api.visitStart(r.id);
        await load();
        setBusy(false);
        router.push(`/visit/${r.id}`);
    };

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: c.bg }}
            contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: 120, gap: space.md }}
            refreshControl={<RefreshControl refreshing={busy} onRefresh={onRefresh} tintColor={c.tx2} />}
        >
            {/* Çevrimdışı şeridi — kaç işlemin sırada beklediğini SÖYLER.
                "Bağlantı yok" demek yetmez; personel gönderdiğini sanıp
                gitmesin. */}
            {(err || queued > 0) && (
                <View style={{
                    marginHorizontal: space.lg, padding: space.md, borderRadius: radius.md,
                    backgroundColor: c.am + '22', borderWidth: 1, borderColor: c.am + '55',
                }}>
                    <T v="small" c={c.tx}>
                        {queued > 0
                            ? `${queued} işlem bağlantı gelince gönderilecek.`
                            : 'Bağlantı yok — liste güncel olmayabilir.'}
                    </T>
                </View>
            )}

            <View style={{ paddingHorizontal: space.lg }}>
                <T v="h1">Bugün</T>
                <T v="small" c={c.tx2}>
                    {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {rows ? ` · ${rest.length} randevu` : ''}
                </T>
            </View>

            {/* Devam eden işlem şeridi — cam, çünkü kabuk sayılır ve her
                ekrandan işleme dönmeyi sağlar. */}
            {open && (
                <Glass
                    interactive
                    style={{
                        marginHorizontal: space.lg, borderRadius: radius.lg, overflow: 'hidden',
                        minHeight: hit.row, paddingHorizontal: space.lg, paddingVertical: space.md,
                        flexDirection: 'row', alignItems: 'center', gap: space.md,
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <T v="tiny" c={c.or}>İŞLEM SÜRÜYOR</T>
                        <T v="h3" numberOfLines={1}>{open.customer_name}</T>
                    </View>
                    <Num size={26}>{elapsed(open.arrived_at!)}</Num>
                    <Button label="Aç" kind="gho" onPress={() => router.push(`/visit/${open.id}`)} />
                </Glass>
            )}

            {rows === null ? (
                <Card style={{ marginHorizontal: space.lg, height: 190, opacity: 0.5 }}>
                    <T v="small" c={c.tx2}>Yükleniyor…</T>
                </Card>
            ) : next ? (
                <Card style={{ marginHorizontal: space.lg, gap: space.md, minHeight: small ? 190 : 220 }}>
                    <T v="tiny" c={c.tx2}>SIRADAKİ</T>
                    <View style={{ gap: 2 }}>
                        <T v="h1" numberOfLines={1}>{next.customer_name}</T>
                        <T v="body" c={c.tx2} numberOfLines={1}>
                            {hhmm(next.start_time)} · {next.service}
                        </T>
                    </View>
                    {next.notes ? <T v="small" c={c.tx2} numberOfLines={2}>{next.notes}</T> : null}
                    <View style={{ flex: 1 }} />
                    <Button big label="İşleme başla" onPress={() => void start(next)} disabled={busy} />
                </Card>
            ) : (
                <Empty
                    title="Bugün randevunuz yok."
                    hint="Yeni bir randevu geldiğinde burada görünecek ve size bildirim gelecek."
                />
            )}

            {later.length > 0 && (
                <View style={{ marginTop: space.sm }}>
                    <T v="tiny" c={c.tx2} style={{ paddingHorizontal: space.lg, marginBottom: space.xs }}>
                        GÜNÜN KALANI
                    </T>
                    {later.map((r) => (
                        <Row key={r.id} onPress={() => router.push(`/appointment/${r.id}`)}>
                            <Num size={15}>{hhmm(r.start_time)}</Num>
                            <View style={{ flex: 1 }}>
                                <T v="body" numberOfLines={1}>{r.customer_name}</T>
                                <T v="small" c={c.tx2} numberOfLines={1}>{r.service}</T>
                            </View>
                        </Row>
                    ))}
                    {rest.length > later.length + 1 && (
                        <View style={{ padding: space.md, alignItems: 'center' }}>
                            <T v="small" c={c.tx2}>+{rest.length - later.length - 1} randevu daha</T>
                        </View>
                    )}
                </View>
            )}
            {/* Sayaç yeniden çizimi için — tick okunmazsa React atlar. */}
            <View style={{ height: 0 }} key={tick} />
        </ScrollView>
    );
}

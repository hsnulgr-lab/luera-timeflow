import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { ProfileNav } from '../../src/components/ProfileParts';
import { SearchField } from '../../src/components/SearchField';
import { authApi } from '../../src/api/session';
import { agoLabel, splitName } from '../../src/lib/customerBook';
import { todayISO } from '../../src/lib/calendar';
import { feedback } from '../../src/lib/feedback';
import {
    bookLine, bookMatches, bookSummary, managerBookRows, sortManagerBook,
    type ManagerBookRow,
} from '../../src/lib/managerBook';
import { orgDurum } from '../../src/lib/managerDurum';
import { useManagerRead } from '../../src/lib/managerRead';
import { fetchCrew, fetchCustomerBook, forgetOrg } from '../../src/lib/managerSource';
import { initialsOf, upperTR } from '../../src/lib/text';
import { font, numeric, profileMetrics as M, useTheme } from '../../src/theme';

/**
 * Müdürün müşteri defteri.
 *
 * Müdürün elinde bugüne kadar müşteriye giden iki yol vardı ve ikisi de
 * DAR: akıştaki balona dokunmak (yalnız bugün görünen kişiler) ve randevu
 * kurarken aramak (yalnız adını bildiğin kişi). Salonun defterini bir bütün
 * olarak görecek bir yer yoktu.
 *
 * ── Kapı neden Profil'de ────────────────────────────────────────────────────
 * Altıncı sekme açılmadı: iOS'ta beş sekme sınır ve altıncısı "Randevu"nun
 * ortadaki eylem olma niteliğini bozardı. Profil'deki ilk grup zaten ayar
 * değil, İŞLETMENİN KAYITLARI — çalışma saatleri, hizmetler, personel.
 * Müşteriler aynı cinsten; uygulama bu kararı personel listesini oraya
 * koyarken bir kez vermişti.
 *
 * Bedeli dürüstçe: arama iki dokunuş uzakta. Gerçek salonda sık aranıyorsa
 * ikinci bir kapı (Takvim başlığında arama) sonra açılır — ekran aynı kalır.
 *
 * ── Personelin defterinden farkı ────────────────────────────────────────────
 * Orada disk "bunu ben yaptım" diyor. Müdürde öyle bir ayrım yok: salonun
 * tamamı onun. Disk KİMDE olduğunu söylüyor, rozet yuvası da "benim
 * müşterim" yerine GELMEDİ sayısını taşıyor — müdürün risk sorusu bu.
 *
 * Bakiye satırda YOK ve bu bilinçli: bakiyenin tek kaynağı masaüstündeki
 * `patientBalance` (paket dağıtımı, kısmi ödeme, tedavi planı). Aynı hesabı
 * telefonda ikinci kez yazmak, aynı müşteri için iki farklı borç göstermenin
 * en kısa yolu olurdu.
 */
const ROW = { height: 76, heightSm: 68, disc: 34, discSm: 31, name: 19, nameSm: 17.5 } as const;

export default function ManagerCustomers() {
    const { c } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');

    const today = todayISO();
    /*
     * Defter ve kadro TEK okumada. Kadro personelin ADI için: satırda "E"
     * değil "Elif" yazıyor — müdür ekibini adlarıyla tanıyor.
     */
    const read = useCallback(async () => {
        const [book, crew] = await Promise.all([fetchCustomerBook(today), fetchCrew()]);
        const names = new Map(crew.map((person) => [person.id, person.name]));
        return managerBookRows(book.people, book.visits, names, today);
    }, [today]);
    // Yoklama KAPALI: defter saniyede değişen bir şey değil, ve arama
    // yazarken listenin altından değişmesi kullanıcıyı şaşırtır.
    const snap = useManagerRead<ManagerBookRow[] | null>(read, null,
        { poll: false, tables: ['customers', 'reservations'] });

    const rows = useMemo(
        () => (snap.data ? sortManagerBook(snap.data, today) : []),
        [snap.data, today],
    );
    const shown = useMemo(
        () => rows.filter((row) => bookMatches(row, query)),
        [rows, query],
    );
    const searching = query.trim().length > 0;

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

    const open = (row: ManagerBookRow) => {
        feedback.selection();
        Keyboard.dismiss();
        // Zaten var olan Müdür 23 müşteri kartı. Kimlik VE ad birlikte gider:
        // kimlik doğru kaydı seçer, ad kayıt bulunamazsa ekran ne arandığını
        // söyleyebilsin diye.
        router.push({
            pathname: '/(staff-flow)/customer',
            params: { customerId: row.id, customerName: row.name },
        });
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: M.padX - 2 }}>
                <ProfileNav title="Müşteriler" onBack={() => router.back()} />
            </View>

            <View style={{ paddingHorizontal: M.padX, paddingBottom: 12, gap: 12 }}>
                {/* Özet BAŞLIĞIN ALTINDA: kaç kişi ve kaçı bu hafta hareket
                    etti. Okunamadıysa sayıdan söz edilmiyor — "0 kişi" derken
                    gövdenin "okuyamadık" demesi, aynı ekranda iki gerçek. */}
                <Text style={{ fontSize: 12.5, fontWeight: '500', color: c.tx3 }}>
                    {snap.state === 'error' ? 'Defter okunamadı'
                        : snap.state === 'loading' ? 'Okunuyor…'
                            : searching ? `${shown.length} sonuç` : bookSummary(rows, today)}
                </Text>
                <SearchField value={query} onChange={setQuery} />
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
            ) : snap.state === 'error' ? (
                <DurumUnread
                    what="Defteri"
                    notMeaning="Müşteri olmadığı"
                    onRetry={() => { void snap.reload(); }}
                    style={{ flex: 1, paddingHorizontal: M.padX }}
                />
            ) : snap.state === 'loading' ? (
                /* Yükleniyor SESSİZ: liste çoğu zaman bir saniyeden kısa
                   sürede geliyor, o kadar kısa süre için ekranı doldurmak
                   geleni zıplatır. */
                <View style={{ flex: 1 }} />
            ) : shown.length === 0 ? (
                <Empty query={searching ? query.trim() : null} />
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: M.padX,
                        paddingBottom: M.bottomInset + insets.bottom,
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    automaticallyAdjustKeyboardInsets
                    showsVerticalScrollIndicator={false}
                >
                    {shown.map((row, index) => (
                        <Row
                            key={row.id}
                            row={row}
                            today={today}
                            last={index === shown.length - 1}
                            onOpen={() => open(row)}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function Row({ row, today, last, onOpen }: {
    row: ManagerBookRow;
    today: string;
    last: boolean;
    onOpen: () => void;
}) {
    const { c, small } = useTheme();
    const name = splitName(row.name);
    const ago = row.upcomingTime
        ? { text: row.upcomingTime, recent: true }
        : agoLabel(row.lastVisitDate, today);
    const disc = small ? ROW.discSm : ROW.disc;
    const size = small ? ROW.nameSm : ROW.name;
    const line = bookLine(row);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.name}, ${line}, ${ago.text}${
                row.noShows > 0 ? `, ${row.noShows} kez gelmedi` : ''}`}
            onPress={onOpen}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                minHeight: small ? ROW.heightSm : ROW.height,
                paddingVertical: small ? 9 : 11,
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: c.bd,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            {/* Disk KİMDE olduğunu söylüyor. Personel bilinmiyorsa boş durur —
                uydurma bir harf, yanlış kişiyi işaret etmekten kötü. */}
            <View style={{
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: c.bd2,
            }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2, color: c.tx3 }}>
                    {row.lastStaffName ? initialsOf(row.lastStaffName) : ''}
                </Text>
            </View>

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
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{
                        fontSize: 13.5, fontWeight: '500', color: c.tx2, flexShrink: 1,
                    }}>
                        {line}
                    </Text>
                    {/* GELMEDİ bir olgu, bir suçlama değil: sayı yazılıyor,
                        renk verilmiyor. Müdür kararı kendisi versin. */}
                    {row.noShows > 0 ? (
                        <Text style={{
                            fontSize: 9.5,
                            fontWeight: '700',
                            letterSpacing: 1.43,
                            color: c.tx3,
                            borderWidth: 1,
                            borderColor: c.bd,
                            borderRadius: 999,
                            paddingHorizontal: 7,
                            paddingTop: 2,
                            paddingBottom: 1,
                        }}>
                            {upperTR(row.noShows > 1 ? `gelmedi ×${row.noShows}` : 'gelmedi')}
                        </Text>
                    ) : null}
                </View>
            </View>

            <Text style={[{
                alignSelf: 'flex-start',
                paddingTop: 5,
                fontSize: 10.5,
                fontWeight: '700',
                letterSpacing: 1.58,
                color: ago.recent ? c.or : c.tx3,
            }, numeric]}>
                {ago.text}
            </Text>
        </Pressable>
    );
}

/**
 * İki boş hâl, iki ayrı sebep: defter hiç yok · arama eşleşmedi. Okunamadı
 * ise ÜÇÜNCÜ bir şey ve yukarıda kendi bloğunda — "müşteri yok" demek,
 * okuyamadığımız bir listeyi yok saymak olurdu.
 */
function Empty({ query }: { query: string | null }) {
    const { c } = useTheme();
    return (
        <View style={{ flex: 1, paddingHorizontal: M.padX, paddingTop: 28, gap: 8 }}>
            <Text style={{ fontSize: 16, fontFamily: font.bold, color: c.tx }}>
                {query ? 'Eşleşen yok' : 'Defter boş'}
            </Text>
            <Text style={{ fontSize: 13.5, fontWeight: '500', lineHeight: 19, color: c.tx3, maxWidth: 330 }}>
                {/* "kayıt" DURUM DİLİNDE yasaklı: salonun defterinde duran şey
                    bir kayıt değil, bir müşteri. */}
                {query
                    ? `“${query}” için kimseyi bulamadık. Adın bir parçasını ya da telefonun son dört hanesini deneyin.`
                    : 'Salonda henüz müşteri yok. İlk randevuyu kurduğunuzda müşteri buraya eklenir.'}
            </Text>
        </View>
    );
}

/**
 * Personel 09 — Müşteriler.
 *
 * Liste bir dizin DEĞİL, cevabın kendisi. Kuaför buraya bir kişiyi bulmak
 * için gelir ve bulduğu anda tek şey sorar: "bu müşteride ne yapmıştım?"
 * Satır beş olguyu birlikte söylüyor — ad · ne zaman · ne yapıldı · kim
 * yaptı · formül kaydı var mı. Vakaların çoğunda cevap satırda bitiyor;
 * sayfa yalnız formülün İÇERİĞİ için açılıyor.
 *
 * "Kendi müşterilerim" bir bölüm değil, bir İŞARET: dolu disk benim, boş
 * disk meslektaşımın baş harfleri. Bölüm listeyi ikiye kesip "hangi
 * koşudayım" sorusunu doğuruyordu.
 *
 * Sıralama kontrolsüz — bkz. `sortBook`.
 */

import { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchField } from '../../src/components/SearchField';
import { DurumUnread } from '../../src/components/Durum';
import {
    agoLabel, matches, mineCount, sortBook, splitName,
    type BookCustomer,
} from '../../src/lib/customerBook';
import { useBook } from '../../src/lib/bookSource';
import { todayISO } from '../../src/lib/calendar';
import { feedback } from '../../src/lib/feedback';
import { upperTR } from '../../src/lib/text';
import { font, numeric, useTheme } from '../../src/theme';

/** Tasarımın ölçüleri — `personel09.js` ve HTML'in CSS'inden. */
const M = {
    row: 76, rowSm: 68,
    disc: 34, discSm: 31,
    name: 19, nameSm: 17.5,
    title: 32, titleSm: 27,
    search: 50,
    pad: 20, padSm: 16,
    /** Sekme çubuğu içeriğin üstünde duruyor; liste onun altına akmıyor. */
    bottom: 106, bottomSm: 88,
} as const;

export default function Customers() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [query, setQuery] = useState('');

    const today = todayISO();
    /**
     * Defter artık SENKRON DEĞİL. Sahte kaynak anında dönüyordu; gerçek sunucu
     * dönmeyebilir de — ve okunamayan bir defterin "müşteri yok" gibi
     * görünmesi, olmayan bir gerçeği söylemek olurdu.
     */
    const { state: bookState, rows, reload } = useBook(today);
    const book = useMemo(() => sortBook(rows, today), [rows, today]);
    const shown = useMemo(
        () => book.filter((customer) => matches(customer, query)),
        [book, query],
    );

    const pad = small ? M.padSm : M.pad;
    const searching = query.trim().length > 0;
    const noneMine = bookState === 'ok' && mineCount(book) === 0;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <View style={{ paddingHorizontal: pad, paddingTop: 6, paddingBottom: 12, gap: 12 }}>
                {/* Başlık ARAMA SIRASINDA DA DURUYOR.
                    Tasarım onu düşürüyordu ("ekranın üstü sonuçlara açılsın"),
                    ama klavye zaten ekranın alt yarısını alıyor: ilk harfte
                    başlık kayboluyor, arama alanı ve altındaki liste 44 pt
                    yukarı sıçrıyor ve yazılar üst üste binmiş gibi görünüyordu.
                    Kazanılan 44 pt, klavye açıkken hiçbir satır daha
                    göstermiyor — bedeli ise her aramada bir sıçrama. */}
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                    {/* Başlık TAMAMEN kalın. İnce/kalın bölünmesi ADIN
                        muamelesi — kişiyi ayırt etmek için var. Sekmenin kendi
                        adında ayırt edilecek bir şey yok; orada bölünme süse
                        dönüşüyordu. */}
                    <Text style={{
                        fontSize: small ? M.titleSm : M.title,
                        lineHeight: (small ? M.titleSm : M.title) * 1.18,
                        letterSpacing: -(small ? M.titleSm : M.title) * 0.03,
                        fontFamily: font.bold,
                        color: c.tx,
                    }}>
                        Müşteriler
                    </Text>
                    {/* Sayı arama sırasında EŞLEŞENİ söylüyor: başlık durduğuna
                        göre sağdaki sayı da güncel olmalı, yoksa "10 kayıt"
                        yazarken üç satır göstermek çelişki olurdu. */}
                    <Text style={{
                        marginLeft: 'auto',
                        fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68, color: c.tx3,
                    }}>
                        {/* Okunamadıysa sayıdan söz edilmiyor: `book.length`
                            sıfır görünüyordu ve başlık "0 KAYIT" derken gövde
                            "okuyamadık" diyordu — aynı ekranda iki gerçek. */}
                        {bookState === 'error' ? '—'
                            : bookState === 'loading' ? '…'
                                : searching ? `${shown.length} SONUÇ` : `${book.length} KAYIT`}
                    </Text>
                </View>

                <SearchField value={query} onChange={setQuery} />
            </View>

            {/* Üçüncü boş hâl bir ekran değil, çalışan listenin üstünde bir
                altyazı: yeni personel boş bir ekranla karşılaşmıyor. */}
            {noneMine && !searching ? (
                <Text style={{
                    paddingHorizontal: pad, paddingBottom: 10, maxWidth: 330,
                    fontSize: 12, fontWeight: '500', lineHeight: 17.4, color: c.tx3,
                }}>
                    Henüz kimseye bakmadınız. İlk işlemi bitirdiğinizde o müşterinin diski dolu görünecek.
                </Text>
            ) : null}

            {bookState === 'error' ? (
                <DurumUnread what="Defteri" notMeaning="Müşteriniz olmadığı" onRetry={() => { void reload(); }} style={{ flex: 1, paddingHorizontal: small ? M.padSm : M.pad }} />
            ) : bookState === 'loading' ? (
                /* Yükleniyor SESSİZ — `personel/index.tsx` ile aynı gerekçe:
                   liste çoğu zaman bir saniyeden kısa sürede geliyor ve o
                   kadar kısa süre için ekranı doldurmak, geleni zıplatır. */
                <View style={{ flex: 1 }} />
            ) : shown.length === 0 ? (
                <Empty
                    query={searching ? query.trim() : null}
                    empty={book.length === 0}
                />
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: pad,
                        paddingBottom: (small ? M.bottomSm : M.bottom) + insets.bottom,
                    }}
                    keyboardShouldPersistTaps="handled"
                    // Klavye TAKILIP KALMASIN. Arama alanının dışında dokunulacak
                    // bir yer yok — liste satırına dokunmak sayfa açıyor — o
                    // yüzden kapanma yolu listeyi sürüklemek. iOS'un kendi
                    // sözlüğü de bu.
                    keyboardDismissMode="on-drag"
                    // Klavye açıkken son satırlar onun ALTINDA kalıyordu: liste
                    // klavyenin yüksekliği kadar içeriden çiziliyor.
                    automaticallyAdjustKeyboardInsets
                    showsVerticalScrollIndicator={false}
                >
                    {shown.map((customer, index) => (
                        <Row
                            key={customer.id}
                            customer={customer}
                            today={today}
                            last={index === shown.length - 1}
                            onOpen={() => {
                                feedback.selection();
                                Keyboard.dismiss();
                                router.push({
                                    pathname: '/(staff-flow)/musteri',
                                    params: { customerId: customer.id, name: customer.name },
                                });
                            }}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

function Row({ customer, today, last, onOpen }: {
    customer: BookCustomer;
    today: string;
    last: boolean;
    onOpen: () => void;
}) {
    const { c, small } = useTheme();
    const name = splitName(customer.name);
    const ago = customer.upcomingTime
        ? { text: customer.upcomingTime, recent: true }
        : agoLabel(customer.lastVisitDate, today);
    const disc = small ? M.discSm : M.disc;

    // Formülü olan ve ilk kez gelen aynı yuvayı paylaşıyor: ikisi de olgu,
    // ikisi de uyarı değil.
    const mark = customer.hasFormula ? 'formül' : customer.lastVisitDate ? null : 'ilk kez';

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${customer.name}, ${customer.lastService ?? 'randevu yok'}, ${ago.text}${
                customer.hasFormula ? ', formül kaydı var' : ''}`}
            onPress={onOpen}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                minHeight: small ? M.rowSm : M.row,
                paddingVertical: small ? 9 : 11,
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: c.bd,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            {/* Disk: dolu ise benim müşterim, boş ise meslektaşımın baş
                harfleri. Tek işaret, üç yerde aynı şeyi söylüyor. */}
            <View style={{
                width: disc, height: disc, borderRadius: disc / 2,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: customer.mine ? c.fld : 'transparent',
                borderWidth: customer.mine ? 1 : 0,
                borderColor: c.bd2,
            }}>
                <Text style={{
                    fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2,
                    color: customer.mine ? c.tx : c.tx3,
                }}>
                    {customer.lastStaffInitials}
                </Text>
            </View>

            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text numberOfLines={1} style={{
                    fontSize: small ? M.nameSm : M.name,
                    lineHeight: (small ? M.nameSm : M.name) * 1.1,
                    letterSpacing: -(small ? M.nameSm : M.name) * 0.02,
                    fontFamily: font.extraLight,
                    color: c.tx2,
                }}>
                    {name.light}
                    <Text style={{ fontFamily: font.bold, color: c.tx }}>{name.bold}</Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '500', color: c.tx2, flexShrink: 1 }}>
                        {customer.lastService ?? 'Bugün ilk randevu'}
                    </Text>
                    {mark ? (
                        <Text style={{
                            fontSize: 9.5, fontWeight: '700', letterSpacing: 1.43,
                            color: c.tx3,
                            borderWidth: 1, borderColor: c.bd, borderRadius: 999,
                            paddingHorizontal: 7, paddingTop: 2, paddingBottom: 1,
                        }}>
                            {upperTR(mark)}
                        </Text>
                    ) : null}
                </View>
            </View>

            {/* Turuncu ZAMAN demek — bugün ve dün. Önem değil. */}
            <Text style={[{
                alignSelf: 'flex-start', paddingTop: 5,
                fontSize: 10.5, fontWeight: '700', letterSpacing: 1.58,
                color: ago.recent ? c.or : c.tx3,
            }, numeric]}>
                {ago.text}
            </Text>
        </Pressable>
    );
}

/**
 * OKUNAMADI — boş defterle aynı şey DEĞİL.
 *
 * "Salonda kayıtlı müşteri yok" cümlesi, okuyamadığımız bir listeyi yok
 * saymak demek. Ayrı görsel icat edilmiyor: aynı yerleşim, ayrı cümle ve tek
 * bir eylem (`personel/index.tsx` · hata dalıyla aynı dil).
 */

/**
 * İki boş hâl, iki ayrı sebep: veri hiç yok · sorgu eşleşmedi. Üçüncüsü
 * (henüz kimseye bakılmadı) burada değil, çünkü dolu bir listeyle birlikte
 * var olabiliyor.
 */
function Empty({ query, empty }: { query: string | null; empty: boolean }) {
    const { c, small } = useTheme();
    return (
        /* Kaydırılabilir: boş hâlde de klavyeyi sürükleyerek kapatmak
           mümkün olmalı. Eskiden burada düz bir `View` vardı ve arama sonuç
           vermediğinde klavyenin kapanacağı hiçbir yer kalmıyordu. */
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
                flexGrow: 1, justifyContent: 'center', gap: 8,
                paddingHorizontal: small ? M.padSm : M.pad,
                paddingBottom: 130,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
        >
            <Text style={{
                fontSize: 19, lineHeight: 22.8, letterSpacing: -0.38,
                fontFamily: font.extraLight, color: c.tx,
            }}>
                {empty ? (
                    <>Salonda kayıtlı <Text style={{ fontFamily: font.bold }}>müşteri yok</Text>.</>
                ) : (
                    <><Text style={{ fontFamily: font.bold }}>«{query}»</Text> ile eşleşen kayıt yok.</>
                )}
            </Text>
            <Text style={{ fontSize: 13.5, fontWeight: '500', lineHeight: 20.25, color: c.tx2, maxWidth: 310 }}>
                {empty
                    ? 'Kayıt randevudan doğuyor: ilk randevu oluşturulduğunda müşteri burada görünür.'
                    : 'Ad ya da telefonun son dört hanesiyle aranır. Arama salonun tamamında çalışır.'}
            </Text>
        </ScrollView>
    );
}

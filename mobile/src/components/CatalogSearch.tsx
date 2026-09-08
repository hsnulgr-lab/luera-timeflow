/**
 * Personel 13 · katalogda arama — alt sayfanın ikinci yüzü.
 *
 * Klavye bu kullanıcıya düşman (eller boyalı, eldivenli) ama arama ekranın
 * yarısı: gerçek bir salonun kataloğu yüzlerce kalem. Uzlaşma Personel 12'nin
 * kalıbı — klavye gövdenin ÜSTÜNE değil YERİNE geliyor. Alt sayfa tek adımlık
 * bir yüze geçiyor: alan en üstte, altında sonuçlar, altında klavye. Kutular
 * ve "Bitti" bu adımda ÇİZİLMİYOR; klavyenin altında kalan hiçbir kontrol yok.
 *
 * Boş sorguda liste boş kalmıyor — aynı kalemler satır olarak duruyor. Arama
 * açmak hiçbir şeyi kaybettirmiyor.
 *
 * SATIRIN ANATOMİSİ, turun en kritik kararı:
 *   · kod adın önünde yürüyor ve tabular rakamla diziliyor, böylece yakın
 *     kodlar aynı x'te başlayıp SÜTUN olarak okunuyor
 *   · vurgu ters: yazılan kısım sönük, AYIRAN hane koyu
 *   · eşleşme bulanık değil — `7.3` yazınca `8.3` gelmiyor
 *   · kararı veren işaret "bu müşteride": kuaför aynı saça aynı kodu sürüyor
 */

import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
    KIND_ORDER, KIND_LABEL, emphasise, searchState, splitCode,
    type CatalogItem, type LineKind,
} from '../lib/adisyon';
import { feedback } from '../lib/feedback';
import { upperTR } from '../lib/text';
import { numeric, useTheme } from '../theme';

const ROW_H = 64;

export function CatalogSearch({ query, results, frequent, onQuery, onPick, onFree, onBack }: {
    query: string;
    results: readonly CatalogItem[];
    /**
     * Boş sorguda liste BOŞ KALMIYOR: kutudaki aynı altı kalem satır olarak
     * duruyor. Arama açmak hiçbir şeyi kaybettirmiyor.
     */
    frequent: readonly CatalogItem[];
    onQuery: (next: string) => void;
    onPick: (item: CatalogItem) => void;
    /** Katalogda yoksa yazılan ad fiyatsız gidiyor; tutarı kasada yazılıyor. */
    onFree: (name: string, kind: LineKind) => void;
    onBack: () => void;
}) {
    const { c } = useTheme();
    const state = searchState(results, query);

    return (
        <>
            <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10,
            }}>
                <View style={{
                    flex: 1, height: 50, borderRadius: 16, backgroundColor: c.surf2,
                    borderWidth: 1, borderColor: c.bd2, paddingHorizontal: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                }}>
                    {/* Artık gerçek bir alan: eskiden burası `Text` içeren bir
                        `View`di — giriş alanı gibi çizilmiş, dokunulunca
                        hiçbir şey yapmayan bir yüzey. */}
                    <TextInput
                        value={query}
                        onChangeText={onQuery}
                        autoFocus
                        placeholder="Katalogda ara"
                        placeholderTextColor={c.tx3}
                        selectionColor={c.or}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="done"
                        style={{ flex: 1, fontSize: 15.5, fontWeight: '600', color: c.tx }}
                    />
                    {query ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Aramayı temizle"
                            hitSlop={10}
                            onPress={() => { feedback.selection(); onQuery(''); }}
                        >
                            <Text style={{ fontSize: 15, fontWeight: '700', color: c.tx3 }}>✕</Text>
                        </Pressable>
                    ) : null}
                </View>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => { feedback.selection(); onBack(); }}
                    style={({ pressed }) => ({ height: 50, justifyContent: 'center', paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}
                >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.tx2 }}>Kapat</Text>
                </Pressable>
            </View>

            <ScrollView
                style={{ paddingHorizontal: 16 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
            >
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, color: c.tx3, paddingBottom: 6 }}>
                    {upperTR(state === 'idle' ? 'Sık kullanılanlar' : `${results.length} sonuç`)}
                </Text>

                {state === 'none' ? (
                    <View style={{ paddingTop: 12, gap: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: '500', lineHeight: 20, color: c.tx2, maxWidth: 320 }}>
                            <Text style={{ fontWeight: '700' }}>Katalogda yok.</Text>
                            {' '}Salon yeni ürün almış olabilir; katalog müdürün işi ve gecikebiliyor.
                        </Text>
                        {/* Ölü uç yok: yazılan ad adisyona girebiliyor.
                            TÜRÜNÜ personel seçiyor — üç tür karışmıyor ve
                            malzeme olup olmadığı formülü doğrudan ilgilendiriyor.
                            Kalem fiyatsız gidiyor, tutarını kasada müdür yazıyor. */}
                        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700', color: c.tx }}>
                            “{query.trim()}” diye ekle
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {KIND_ORDER.map((kind) => (
                                <Pressable
                                    key={kind}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${query.trim()} kalemini ${KIND_LABEL[kind]} olarak ekle`}
                                    onPress={() => { feedback.light(); onFree(query, kind); }}
                                    style={({ pressed }) => ({
                                        flex: 1, height: 68, borderRadius: 18,
                                        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
                                        backgroundColor: c.surf2, borderWidth: 1, borderColor: c.bd,
                                        opacity: pressed ? 0.7 : 1,
                                    })}
                                >
                                    <Text numberOfLines={2} style={{
                                        fontSize: 11, fontWeight: '700', letterSpacing: 0.9,
                                        color: c.tx, textAlign: 'center',
                                    }}>
                                        {KIND_LABEL[kind]}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.tx3 }}>
                            Tutarı kasada yazılır — katalog dışı kalemin fiyatı burada girilmiyor.
                        </Text>
                    </View>
                ) : (state === 'idle' ? frequent : results).map((item) => (
                    <ResultRow key={item.id} item={item} query={query} onPick={() => onPick(item)} />
                ))}
                <View style={{ height: 12 }} />
            </ScrollView>
        </>
    );
}

function ResultRow({ item, query, onPick }: {
    item: CatalogItem; query: string; onPick: () => void;
}) {
    const { c } = useTheme();
    const { code, rest } = splitCode(item.name);
    const parts = emphasise(code ?? item.name, query);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${KIND_LABEL[item.kind]}${item.usedHere ? ', bu müşteride daha önce kullanıldı' : ''}`}
            onPress={() => { feedback.light(); onPick(); }}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                minHeight: ROW_H, paddingVertical: 8,
                borderBottomWidth: 1, borderBottomColor: c.bd,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            {/* Kod SÜTUN: sabit genişlik, tabular rakam. Yakın kodlar aynı
                x'te başlıyor ve farklı uzunluk farklı uzunluk görünüyor. */}
            {code ? (
                <Text numberOfLines={1} style={[{ width: 62, fontSize: 15.5, fontWeight: '700' }, numeric]}>
                    {parts.map((part, index) => (
                        <Text key={index}>
                            <Text style={{ color: c.tx3 }}>{part.dim}</Text>
                            <Text style={{ color: c.tx }}>{part.bold}</Text>
                        </Text>
                    ))}
                </Text>
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '600', letterSpacing: -0.23, color: c.tx }}>
                    {code ? rest : (
                        parts.map((part, index) => (
                            <Text key={index}>
                                <Text style={{ color: c.tx3 }}>{part.dim}</Text>
                                <Text style={{ color: c.tx }}>{part.bold}</Text>
                            </Text>
                        ))
                    )}
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.47, color: c.tx3 }}>
                    {KIND_LABEL[item.kind]}
                </Text>
            </View>
            {/* Kararı veren tek işaret. TARİHSİZ ve SAYISIZ: ekran müşterinin
                gözü önünde ve ona kendi defterini okutmuyoruz. */}
            {item.usedHere ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.tx3 }} />
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: c.tx3 }}>
                        bu müşteride
                    </Text>
                </View>
            ) : null}
        </Pressable>
    );
}

import { useCallback, useMemo, useState } from 'react';
import {
    Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, HeroAmount, MovementCard, Money, RatioBar } from '../../src/components/CashParts';
import { MovementSheet } from '../../src/components/CashSheets';
import { DurumBlock, DurumUnread } from '../../src/components/Durum';
import { authApi } from '../../src/api/session';
import {
    counterLine, deltaOf, emptyComparison, hasPending,
    periodLabel, PERIODS, ratioSpeech,
    summaryLine, totalsOf,
    DAY_END, EMPTY_TITLE, formatAmount, pendingSubtitle, pendingTitle,
    type CashPeriod, type Movement,
} from '../../src/lib/cash';
import { hhmm } from '../../src/lib/calendar';
import { useManagerCash } from '../../src/lib/managerCash';
import { orgDurum } from '../../src/lib/managerDurum';
import { pendingOf } from '../../src/lib/managerFlow';
import { forgetOrg } from '../../src/lib/managerSource';
import { useManagerDay } from '../../src/state/managerDay';
import { cashMetrics, font, useTheme } from '../../src/theme';

/**
 * Müdür 14 — Kasa.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 14 Kasa.html`; ölçüler
 * oradaki CSS seçicilerinden okundu.
 *
 * EKRANIN İŞİ tek soruyu bir bakışta cevaplamak: "para akıyor mu, bir terslik
 * var mı?" Sıralama müdürün soru sıklığından türedi — ne kadar girdi, neyle
 * girdi, kim aldı, yanlış olan var mı. Yukarıdan aşağı soru sıklığı azalır.
 *
 * İKİ KART İSTİFİ: önde koyu kahraman panel (GİREN PARA), arkasından turuncu
 * panel taşıyor (HENÜZ GİRMEMİŞ PARA). İstif dekoratif değil; iki para hâlini
 * fiziksel olarak katmanlıyor. Turuncu panel koyu panelin ALTINA giriyor
 * (marginTop −26), bu yüzden üst kenarı görünmüyor ve ayrı bir kenar hattına
 * gerek kalmıyor.
 *
 * TURUNCU ENVANTERİ — BİLİNÇLİ İSTİSNA. Uygulamanın geri kalanında turuncu
 * yalnız zaman ve eylem demek. Burada bekleyen tahsilat paneli turuncu; karar
 * kullanıcının ve tasarımın. İstisna `tests/mobile-mudur-kasa.test.mjs`
 * içinde AÇIKÇA yazılı — kural sessizce gevşetilmedi, turuncu başka bir yere
 * sızarsa test yine yakalar.
 *
 * KAHRAMAN PANEL İKİ TEMADA DA KOYU. Açık temada krem sayfanın üstünde koyu
 * bir blok duruyor; referansın kontrast gücü açık temada da korunuyor ve iki
 * tema tek tasarım gibi hissettiriyor.
 *
 * Gün cetveli (Müdür 13) BU EKRANDA YOK: müdür paraya bakarken bugünü,
 * haftayı ve ayı soruyor, rastgele bir günü değil.
 *
 * VERİ CANLI (müdür planı 6. adım): hareketler `useManagerCash`, bekleyen
 * adisyonlar akışın ortak gün verisinden. Toplamların ölçüsü masaüstü Kasa —
 * kural `cashBuild.ts`in başında yazılı.
 *
 * SALT OKUNUR. Veritabanında iptal ya da düzeltme izi yok; "İptal et" yalnız
 * cihazda bir işaret bırakıyordu ve sayfa yenilenince tahsilat geri geliyordu.
 * Kullanıcının kararı: düzeltme ve iptal masaüstündeki Kasa'dan yapılır.
 */

/** Okunmamış dönemin listesi — her çizimde yeni bir dizi üretmesin. */
const NO_MOVEMENTS: readonly Movement[] = [];

/** Damganın saati — "son güncelleme 11:42". */
const clockAt = (ms: number) => {
    const at = new Date(ms);
    return hhmm(at.getHours() * 60 + at.getMinutes());
};
export default function ManagerKasa() {
    const { c, dark, small } = useTheme();
    const insets = useSafeAreaInsets();
    const { fontScale } = useWindowDimensions();
    const [period, setPeriod] = useState<CashPeriod>('today');

    const cash = useManagerCash(period);
    /*
     * BİLİNEN veri yalnız SEÇİLİ döneme ait olan. Şerit "Bu ay"a çevrildiğinde
     * bugünün hareketleri yenisi gelene kadar elde duruyor; onları "BU AY
     * GİREN" başlığının altına yazmak yanlış bir rakam göstermek olurdu.
     */
    const known = cash.data.period === period;
    const movements = known ? cash.data.movements : NO_MOVEMENTS;
    /** Açık sheet — tek bir kaydı işaret eder. */
    const [openId, setOpenId] = useState<string | null>(null);

    const totals = useMemo(() => totalsOf(movements), [movements]);
    const delta = known ? deltaOf(totals.total, cash.data.previousTotal, period) : null;
    const empty = known && totals.count === 0;
    // Bekleyen adisyonlar AKIŞTAKİ satırlardan türer. Kasa kendi sabit
    // sayısını taşıyordu ve iki ekran iki farklı gerçek söylüyordu.
    // Boş günde de bekleyen olabilir: para girmemiş ama bekleyen var — bu
    // ayrım müdür için önemli, o yüzden panel yine görünür.
    const { events, reload } = useManagerDay();
    const router = useRouter();
    const pending = useMemo(() => pendingOf(events), [events]);

    /**
     * Aşağı çekip yenileme — Akış'takiyle aynı refleks, aynı davranış.
     * İki ekranda farklı davranan bir jest, uygulamayı iki ayrı ürün yapar.
     */
    const [refreshing, setRefreshing] = useState(false);
    const reloadCash = cash.reload;
    const onRefresh = useCallback(() => {
        setRefreshing(true);
        // Çark iki okuma da bitene kadar dönüyor: hemen durdurmak, müdüre
        // "yenilendi" deyip eski rakamı göstermek olurdu.
        void Promise.all([reloadCash(), reload()]).finally(() => setRefreshing(false));
    }, [reload, reloadCash]);

    const openMovement = movements.find((m) => m.id === openId) ?? null;

    /*
     * Red üç yere çıkar ama AYNI yere değil: erişimi kaldırılmış müdürün
     * oturumu kapanır, salon seçmesi gerekenin oturumu durur (takvimle aynı).
     */
    const refusal = cash.refusal;
    const onRefusalAction = useCallback(async () => {
        if (refusal === 'ambiguous') {
            forgetOrg();
            router.push('/(auth)/manager/business');
            return;
        }
        await authApi.resume.signOut().catch(() => undefined);
        forgetOrg();
        router.replace('/(auth)/welcome');
    }, [refusal, router]);

    /*
     * Başlıktaki sayaç okumanın hâlini de taşıyor: "okunamadı" ile "0 işlem"
     * aynı şey değil. Bayatsa saat ekleniyor — yoklama sessizce cevap
     * alamıyorsa rakam donuyor ve bunun tek izi bu satır.
     */
    const counter = !known
        ? cash.state === 'error' ? 'okunamadı' : '…'
        : cash.stale && cash.at !== null
            ? `${counterLine(totals)} · son güncelleme ${clockAt(cash.at)}`
            : counterLine(totals);
    // Erişilebilirlik eşiği: bunun üstünde yatay düzenler dikeye yığılıyor.
    const ax = fontScale > cashMetrics.axFontScale;
    const moneySize = ax ? cashMetrics.moneyAx : small ? cashMetrics.moneySmall : cashMetrics.money;

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            {/* Panel her zaman koyu — durum çubuğu iki temada da açık. */}
            <StatusBar style="light" />

            {/* ── İstif ─────────────────────────────────────────────────── */}
            <View>
                {/* Önde: kahraman panel. Üst güvenli alanı kendi örtüyor. */}
                {/**
                  * GÖLGE VE KIRPMA AYRI KATMANLARDA.
                  *
                  * iOS'ta `overflow:'hidden'` gölgeyi de kırpıyor; ikisi aynı
                  * View'da olursa gölge hiç çizilmez. Gölge burada önemli:
                  * turuncu panelin üstüne düşüp iki nesneyi ayırıyor. O ayrım
                  * olmayınca etek turuncusu ile panel turuncusu birbirine
                  * karışıyor ve istif tek kütleye dönüşüyor.
                  */}
                <View
                    style={{
                        zIndex: 2,
                        elevation: cashMetrics.heroElevation,
                        backgroundColor: cashMetrics.heroBg,
                        borderBottomLeftRadius: cashMetrics.heroRadius,
                        borderBottomRightRadius: cashMetrics.heroRadius,
                        shadowColor: '#000',
                        shadowOffset: cashMetrics.heroShadowOffset,
                        shadowRadius: cashMetrics.heroShadowRadius,
                        shadowOpacity: cashMetrics.heroShadowOpacity,
                    }}
                >
                <View
                    style={{
                        alignItems: 'center',
                        paddingTop: insets.top,
                        paddingBottom: cashMetrics.heroPadBottom,
                        borderBottomLeftRadius: cashMetrics.heroRadius,
                        borderBottomRightRadius: cashMetrics.heroRadius,
                        overflow: 'hidden',
                    }}
                >
                    {/* Etek: arkadaki turuncu panelin ışığını emiyor. Isınma
                        alt kenara kadar KESİNTİSİZ artar; en sıcak nokta tam
                        kenar. Gradyan — bulanıklık değil. */}
                    <LinearGradient
                        pointerEvents="none"
                        colors={[...cashMetrics.skirtColors]}
                        locations={cashMetrics.skirtLocations}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0,
                            height: `${cashMetrics.skirtRatio * 100}%`,
                        }}
                    />

                    {/* Dönem şeridi — referansta avatar/ikonun durduğu hatta. */}
                    <View style={{
                        flexDirection: ax ? 'column' : 'row',
                        alignSelf: 'center',
                        gap: cashMetrics.segGap,
                        marginTop: cashMetrics.segTop,
                        padding: cashMetrics.segPad,
                        borderRadius: cashMetrics.segRadius,
                        borderWidth: 1,
                        borderColor: 'rgba(243,237,227,0.11)',
                        backgroundColor: 'rgba(243,237,227,0.07)',
                    }}>
                        {PERIODS.map((p) => {
                            const on = p.id === period;
                            return (
                                <Pressable
                                    key={p.id}
                                    onPress={() => setPeriod(p.id)}
                                    hitSlop={cashMetrics.segHitSlop}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: on }}
                                    style={{
                                        height: cashMetrics.segHeight - cashMetrics.segPad * 2,
                                        minWidth: ax ? undefined : cashMetrics.segButtonMinWidth,
                                        paddingHorizontal: cashMetrics.segButtonPadX,
                                        borderRadius: cashMetrics.segButtonRadius,
                                        alignItems: 'center', justifyContent: 'center',
                                        backgroundColor: on ? 'rgba(243,237,227,0.13)' : 'transparent',
                                    }}
                                >
                                    <Text style={{
                                        fontFamily: font.bold,
                                        fontSize: cashMetrics.segFont,
                                        letterSpacing: -0.14,
                                        color: on ? '#F3EDE3' : 'rgba(243,237,227,0.58)',
                                    }}>
                                        {p.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={{
                        marginTop: cashMetrics.labelTop,
                        fontFamily: font.bold,
                        fontSize: cashMetrics.labelFont,
                        letterSpacing: cashMetrics.labelSpacing,
                        color: 'rgba(243,237,227,0.58)',
                    }}>
                        {periodLabel(period)}
                    </Text>

                    {/* Dev rakam ölçeklenmiyor — ekranın tek istisnası.
                        Kullanıcı metni büyütürken listeyi okumak istiyor. */}
                    <View
                        accessible
                        // Ekranda yazmayan sayaç sesli okumada duruyor: görsel
                        // sadelik uğruna bilgi kaybedilmiyor.
                        accessibilityLabel={known
                            ? `${periodLabel(period)}: ${formatAmount(totals.total)} lira. ${summaryLine(totals)}`
                            : `${periodLabel(period)}: ${cash.state === 'error' ? 'okunamadı' : 'okunuyor'}`}
                    >
                        {/* Okunmamış dönem ₺0 DEĞİL: rakamın yerinde çizgi. */}
                        <HeroAmount value={known ? totals.total : null} size={moneySize} />
                    </View>

                    {delta ? (
                        <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: cashMetrics.deltaGap,
                            height: cashMetrics.deltaHeight, paddingHorizontal: cashMetrics.deltaPadX,
                            borderRadius: cashMetrics.deltaRadius, borderWidth: 1,
                            // Yukarı yeşil, aşağı NÖTR: sakin gün hata değil.
                            backgroundColor: delta.tone === 'up' ? 'rgba(95,191,100,0.13)' : '#252015',
                            borderColor: delta.tone === 'up' ? 'rgba(95,191,100,0.26)' : 'rgba(243,237,227,0.11)',
                        }}>
                            <Text style={{
                                fontSize: 11,
                                color: delta.tone === 'up' ? '#5FBF64' : 'rgba(243,237,227,0.58)',
                            }}>
                                {delta.tone === 'up' ? '▲' : '▼'}
                            </Text>
                            <Money style={{
                                fontFamily: font.bold, fontSize: cashMetrics.deltaFont, fontWeight: '700',
                                color: delta.tone === 'up' ? '#5FBF64' : 'rgba(243,237,227,0.58)',
                            }}>
                                {delta.text}
                            </Money>
                        </View>
                    ) : empty ? (
                        // Boş günde hap çıkmaz (önceki dönem de sıfır olabilir);
                        // yerine sakin bir karşılaştırma satırı: müdür ekranın
                        // bozuk olmadığını anlasın.
                        <Text style={{
                            fontFamily: font.medium, fontSize: cashMetrics.sumFont,
                            letterSpacing: -0.13, color: 'rgba(243,237,227,0.58)',
                        }}>
                            {emptyComparison(period)}
                        </Text>
                    ) : null}

                    <RatioBar totals={totals} speech={ratioSpeech(totals)} />
                </View>
                </View>

                {/* Arkada: henüz girmemiş para. Koyu panelin ALTINA giriyor. */}
                {hasPending(pending) ? (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${pendingTitle(pending)}. ${pendingSubtitle(pending)}`}
                        /*
                         * Şerit bir SORU soruyordu ama cevabı olan yere
                         * götürmüyordu: sağında ok vardı, dokununca hiçbir şey
                         * olmuyordu. Bekleyen adisyonların TEK gerçek yeri
                         * Akış — orada her biri kendi satırında, "Tahsil et"
                         * düğmesiyle duruyor. Şerit oraya götürüyor.
                         *
                         * (Yalnız bekleyenleri gösteren ayrı bir liste daha
                         * iyi olurdu; ama olmayan bir ekrana götürmektense
                         * var olana götürmek doğru.)
                         */
                        onPress={() => router.navigate('/mudur')}
                        style={{
                            zIndex: 1,
                            elevation: cashMetrics.pendElevation,
                            marginTop: cashMetrics.pendOverlap,
                            marginHorizontal: cashMetrics.pendSideMargin,
                            borderBottomLeftRadius: cashMetrics.pendRadius,
                            borderBottomRightRadius: cashMetrics.pendRadius,
                            overflow: 'hidden',
                            minHeight: cashMetrics.pendMinHeight,
                        }}
                    >
                        <LinearGradient
                            colors={[...cashMetrics.pendGradient]}
                            locations={cashMetrics.pendLocations}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        />
                        <View style={{
                            flexDirection: ax ? 'column' : 'row',
                            alignItems: ax ? 'flex-start' : 'center',
                            gap: cashMetrics.pendGap,
                            paddingTop: cashMetrics.pendPadTop,
                            paddingBottom: cashMetrics.pendPadBottom,
                            paddingHorizontal: cashMetrics.pendPadX,
                        }}>
                            <View style={{ flex: ax ? undefined : 1, minWidth: 0, gap: 3 }}>
                                <Text style={{
                                    fontFamily: font.semiBold, fontSize: cashMetrics.pendTitleFont,
                                    color: cashMetrics.pendInk,
                                }}>
                                    {pendingTitle(pending)}
                                </Text>
                                <Money
                                    numberOfLines={ax ? undefined : 1}
                                    style={{
                                        fontSize: cashMetrics.pendSubFont, fontWeight: '400',
                                        color: dark ? cashMetrics.pendSubInkDark : cashMetrics.pendSubInkLight,
                                    }}
                                >
                                    {pendingSubtitle(pending)}
                                </Money>
                            </View>
                            <Chevron size={20} color="rgba(255,255,255,0.8)" />
                        </View>
                    </Pressable>
                ) : null}
            </View>

            {/* ── Hareketler ────────────────────────────────────────────── */}
            <View style={{
                flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
                paddingHorizontal: cashMetrics.kickerX,
                paddingTop: cashMetrics.kickerTop, paddingBottom: cashMetrics.kickerBottom,
            }}>
                <Text style={{
                    fontFamily: font.bold, fontSize: cashMetrics.kickerFont,
                    letterSpacing: cashMetrics.kickerSpacing, color: c.tx2,
                }}>
                    HAREKETLER
                </Text>
                <Money style={{ fontFamily: font.bold, fontSize: cashMetrics.counterFont, fontWeight: '700', color: c.tx3 }}>
                    {counter}
                </Money>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={(
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.tx2} />
                )}
                contentContainerStyle={{
                    gap: cashMetrics.listGap,
                    paddingHorizontal: cashMetrics.listX,
                    paddingBottom: cashMetrics.padBottom,
                }}
            >
                {refusal ? (
                    <DurumBlock
                        tone={orgDurum(refusal).tone}
                        title={orgDurum(refusal).title}
                        lines={orgDurum(refusal).lines}
                        actions={[{
                            label: orgDurum(refusal).action.label,
                            onPress: () => { void onRefusalAction(); },
                        }]}
                        style={{ marginHorizontal: 0, marginBottom: 0 }}
                    />
                ) : !known && cash.state === 'error' ? (
                    <DurumUnread
                        what="Kasayı"
                        notMeaning="Tahsilat olmadığı"
                        onRetry={() => { void reloadCash(); }}
                        style={{ paddingHorizontal: 0 }}
                    />
                ) : !known ? null : movements.length === 0 ? (
                    <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: c.tx2, lineHeight: 20 }}>
                        {EMPTY_TITLE}
                    </Text>
                ) : (
                    movements.map((m) => (
                        <MovementCard
                            key={m.id}
                            movement={m}
                            largest={totals.largest}
                            onPress={() => setOpenId(m.id)}
                        />
                    ))
                )}

                <View style={{ alignItems: 'center', paddingTop: cashMetrics.dayEndTop }}>
                    <Pressable
                        accessibilityRole="button"
                        style={{
                            height: cashMetrics.dayEndHeight, paddingHorizontal: 16, borderRadius: 14,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        <Text style={{ fontFamily: font.bold, fontSize: cashMetrics.dayEndFont, letterSpacing: -0.15, color: c.tx2 }}>
                            {DAY_END}
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>

            {openMovement ? (
                /*
                 * SALT OKUNUR fiş: eylem vermeden açılıyor. `onVoid` ve
                 * `onCorrect` verilmediğinde fiş eylem şeridinin yerine
                 * `READ_ONLY_NOTE`u çiziyor.
                 */
                <MovementSheet
                    movement={openMovement}
                    onClose={() => setOpenId(null)}
                />
            ) : null}
        </View>
    );
}

/**
 * Personel 09 — müşteri sayfası.
 *
 * Altı bilgi var ve hepsi aynı ağırlıkta duramaz. Üç kayıt seviyesi:
 *
 *   plaka         ad + ara/yaz · kabuksuz · en büyük tipografi
 *   kapalı bilgi  risk + not · noktalı · 60 pt satır
 *   defter        son formül · paket · geçmiş · bölüm etiketli düz satırlar
 *
 * Sayfada TEK KABUK var: son formül kartı. Kabuk sorunun cevabında, başka
 * hiçbir yerde değil.
 *
 * Sıra sorunun sırası: kim → beni ne durdurur → ne yapmıştım → ne kaldı →
 * ne oldu.
 *
 * "Önceki formüller" bölümü BİLİNÇLİ olarak yok. 08'in 4b maddesi geçmiş
 * satırlarını dokunulabilir yapınca o bölüm aynı kayıtları ikinci kez
 * listeleyen bir kopya hâline geldi; iki liste "hangisinden açayım"
 * sorusunu doğuruyordu.
 *
 * Para hiçbir yerde yok: bu bir hizmet defteri, muhasebe değil.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph } from '../../src/components/Glyph';
import { Empty } from '../../src/components/ui';
import { DurumUnread } from '../../src/components/Durum';
import { historyMark } from '../../src/lib/formula';
import { splitName } from '../../src/lib/customerBook';
import {
    type FileFormula, type FileHistoryRow, type FilePackage,
} from '../../src/lib/customerFile';
import { useCustomerFile } from '../../src/lib/fileSource';
import { feedback } from '../../src/lib/feedback';
import { upperTR } from '../../src/lib/text';
import { font, numeric, useTheme } from '../../src/theme';

const REVEAL_MS = 6000;

export default function CustomerFile() {
    const { c, small } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams<{ customerId?: string; name?: string }>();

    const pad = small ? 16 : 20;

    // Sayfa KİMLİKTEN okunuyor. Ekran daha önce `customerId`'yi hiç
    // kullanmıyordu ve gövdesinin tamamı tek bir sabitten geliyordu: hangi
    // müşteriye basılırsa basılsın aynı kişinin alerjisi görünüyordu.
    // Sayfa TÜRETİLMİYOR, OKUNUYOR — ve formül sayfasından dönüldüğünde
    // yeniden okunuyor: kaydedilen formül geçmiş satırında ve kartta
    // görünmeli, yoksa "Kaydet" yine hiçbir şey yapmamış gibi olur.
    // `mudur/profile.tsx` ile aynı desen: durum + `useFocusEffect(load)`.
    const { state: fileState, file, capped, reload } = useCustomerFile(
        params.customerId,
        params.name,
    );

    const back = (
        <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => ({
                height: 44, flexDirection: 'row', alignItems: 'center', gap: 2,
                paddingHorizontal: 14, opacity: pressed ? 0.55 : 1,
            })}
        >
            <Glyph name="back" size={22} color={c.tx2} />
            <Text style={{ color: c.tx2, fontSize: 15, fontWeight: '600' }}>Müşteriler</Text>
        </Pressable>
    );

    /*
     * OKUNAMADI ile BULUNAMADI ayrı hâller ve ayrı cümleler.
     *
     * "Kayıt silinmiş olabilir" cümlesini bir ağ hatasında söylemek, duran bir
     * kaydı silinmiş gibi göstermek olurdu — personel müşteriyi yeniden
     * kaydetmeye kalkardı. Sunucu 404 dediğinde kayıt GERÇEKTEN yok; geri
     * kalan her şey "okuyamadık".
     */
    if (fileState === 'error') {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                {back}
                {/* "Kayıt" kelimesi kalktı — tur onu yasaklıyor
                    (`Durumlar.html` · Ortak kurallar). Gövde de beş ekranda
                    tekrarlanan koddan tek bileşene indi. */}
                <DurumUnread
                    what="Dosyayı"
                    notMeaning="Dosya silinmiş"
                    onRetry={() => { void reload(); }}
                    style={{ paddingHorizontal: pad }}
                />
            </View>
        );
    }

    // Yükleniyor SESSİZ — listelerle aynı gerekçe.
    if (fileState === 'loading') {
        return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>{back}</View>;
    }

    // Bulunamadıysa UYDURULMUŞ bir gövde değil, boşluk. Yanlış kişinin
    // alerjisini göstermek hiç göstermemekten kötüdür.
    if (!file) {
        return (
            <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
                {back}
                <Empty
                    title="Müşteri bulunamadı"
                    hint="Kayıt silinmiş ya da başka bir deftere taşınmış olabilir."
                />
            </View>
        );
    }

    const name = splitName(file.name);

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            {back}

            {/* ── PLAKA ── kabuksuz, en büyük tipografi ── */}
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingHorizontal: pad, paddingTop: 6, paddingBottom: 16 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
                    {/* Satır yüksekliği tasarımda 1.02; RN'de o kadar dar bir
                        kutu BÜYÜK HARFİN üstündeki işareti kırpıyor —
                        "Öztürk" ekranda "Oztürk" görünüyordu. CSS kırpmıyor,
                        RN kırpıyor: ölçü değil, taşıyıcı düzeltiliyor. */}
                    <Text numberOfLines={1} style={{
                        fontSize: small ? 28 : 34, lineHeight: (small ? 28 : 34) * 1.22,
                        letterSpacing: -(small ? 28 : 34) * 0.035,
                        fontFamily: font.extraLight, color: c.tx2,
                    }}>
                        {name.light}
                        <Text style={{ fontFamily: font.bold, color: c.tx }}>{name.bold}</Text>
                    </Text>

                    {/* Hiç gelmemiş müşteride "son geliş" satırı YAZILMAZ —
                        boş bir tarih, olmayan bir ziyareti ima ederdi. */}
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
                        {file.lastVisit ? (
                            <>
                                <Text numberOfLines={1} style={{
                                    fontSize: 11, fontWeight: '600', letterSpacing: 1.76,
                                    color: c.tx3,
                                }}>
                                    {upperTR(`Son geliş ${file.lastVisit}`)}
                                </Text>
                                <Text style={{
                                    fontSize: 11, fontWeight: '600', letterSpacing: 1.76,
                                    color: c.tx3,
                                }}>
                                    {upperTR(`${file.ago} önce`)}
                                </Text>
                            </>
                        ) : (
                            <Text style={{
                                fontSize: 11, fontWeight: '600', letterSpacing: 1.76,
                                color: c.tx3,
                            }}>
                                {upperTR('İlk randevusu')}
                            </Text>
                        )}
                    </View>

                    {/* Sayısal satır: kaç randevu, kaçında formül. */}
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={[{ fontSize: small ? 20 : 23, fontWeight: '700', letterSpacing: -0.58, color: c.tx }, numeric]}>
                            {/* Sunucu son 10 ziyareti dönüyor. Tam onsa daha
                                fazlası olabilir ve "10 randevu" yazmak makul
                                bir yalan olurdu. */}
                            {file.visits}{capped ? '+' : ''}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '500', color: c.tx3 }}>randevu</Text>
                        <Text style={{ fontSize: small ? 20 : 23, fontFamily: font.extraLight, color: c.tx3 }}>·</Text>
                        <Text style={[{ fontSize: small ? 20 : 23, fontWeight: '700', letterSpacing: -0.58, color: c.tx }, numeric]}>
                            {file.formulas}{capped ? '+' : ''}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '500', color: c.tx3 }}>formül</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                        {file.lastService ? <Pill>{file.lastService}</Pill> : null}
                        {/* Adı bilinmiyorsa pil hiç çizilmiyor: baş harf bir
                            ad değildir ve "MK" yazan bir pil bilgi vermez. */}
                        {file.lastStaff ? (
                            <Pill avatar={file.lastStaffInitials}>{file.lastStaff}</Pill>
                        ) : null}
                    </View>
                </View>

                {/* Tek turuncu eylem: aramak. Yazmak ikincil.
                    Numara yoksa düğmeler GÖRÜNÜR biçimde sönük — sessizce
                    hiçbir şey yapmayan bir düğme ölü kontroldür. */}
                <View style={{ gap: 8 }}>
                    <ActionDisc
                        label="Müşteriyi ara"
                        glyph="phone"
                        primary
                        onPress={file.phone
                            ? () => Linking.openURL(`tel:${file.phone!.replace(/\s/g, '')}`)
                            : undefined}
                    />
                    <ActionDisc
                        label="Mesaj yaz"
                        glyph="msg"
                        onPress={file.phone
                            ? () => Linking.openURL(`sms:${file.phone!.replace(/\s/g, '')}`)
                            : undefined}
                    />
                </View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 106 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {/* ── KAPALI BİLGİ ── ekran müşterinin gözü önünde ──
                    Kaydı olmayan satır HİÇ çizilmiyor. Boş bir "RİSK" satırı
                    her müşteride bir risk varmış izlenimi verirdi. */}
                {file.risk ? <MaskRow data={file.risk} danger /> : null}
                {file.note ? <MaskRow data={file.note} /> : null}

                {/* ── DEFTER ── */}
                {file.formula ? (
                    <>
                        <Section title="Son formül" note={file.formula.date} />
                        <FormulaCard formula={file.formula} />
                    </>
                ) : null}

                {file.packages.length > 0 ? (
                    <>
                        <Section title="Paket" />
                        {/*
                          * Ada göre anahtar ÇAKIŞIR: müşteri aynı paketi ikinci
                          * kez almışsa iki satır aynı adı taşır. `FilePackage`in
                          * kimliği yok, sıra da değişmiyor — ad + sıra yeterli.
                          */}
                        {file.packages.map((pack, index) => (
                            <PackageRow key={`${pack.name}-${index}`} pack={pack} />
                        ))}
                    </>
                ) : null}

                <Section title="Geçmiş" note={file.history.length > 0 ? 'son 10 randevu' : undefined} />
                {file.history.length === 0 ? (
                    <Text style={{ fontSize: 13.5, fontWeight: '500', lineHeight: 19, color: c.tx3, paddingTop: 2 }}>
                        Henüz geçmiş yok.
                    </Text>
                ) : file.history.map((row, index) => (
                    /*
                     * Anahtar `${row.date}-${row.service}` idi ve ÇAKIŞIYORDU:
                     * aynı gün aynı hizmetten iki randevu olabiliyor (müşteri
                     * defterinde "24 Eylül botox" iki kez). React ikisini tek
                     * satır sanıp birini düşürüyordu — defter eksik gösteriyordu.
                     * `row.id` rezervasyonun kimliği, benzersiz.
                     */
                    <HistoryLine
                        key={row.id}
                        row={row}
                        last={index === file.history.length - 1}
                        onOpen={() => {
                            feedback.selection();
                            router.push({
                                pathname: '/(staff-flow)/formul',
                                params: {
                                    // Kimlik olmadan formül sayfası neye
                                    // yazacağını bilemiyordu.
                                    id: row.id,
                                    // Müşteri kimliği KARŞILAŞTIRMA için:
                                    // sayfa "geçen sefer ne yapmıştım"a cevap
                                    // veriyor ve cevap kişinin geçmişinde.
                                    // Geçmezse sabit bir formül gösteriyordu.
                                    customerId: file.id,
                                    from: file.name,
                                    date: row.date,
                                    service: row.service,
                                    // Süre BİLİNMİYORSA hiç geçilmiyor:
                                    // formül sayfası "· 0 dk" yazardı ve o
                                    // uydurma bir ölçüm olurdu.
                                    ...(row.minutes > 0 ? { minutes: String(row.minutes) } : {}),
                                    who: row.who,
                                    initials: row.initials,
                                    mine: row.mine ? '1' : '0',
                                    lockedAt: `${row.date} kasaya gitti`,
                                    mode: row.locked
                                        ? (row.formula ? 'locked' : 'lockedEmpty')
                                        : (row.formula ? 'edit' : 'new'),
                                    // Ayrıntı O SATIRIN kendi formülünden.
                                    // Önceden hangi satır açılırsa açılsın tek
                                    // bir formülün oranı ve sonucu gidiyordu.
                                    ...(row.detail ? {
                                        ratio: row.detail.ratio,
                                        result: row.detail.result,
                                        wait: String(parseInt(row.detail.wait, 10) || 0),
                                        ...(row.detail.waitSpan ? { waitSpan: row.detail.waitSpan } : {}),
                                        ...(row.detail.note ? { note: row.detail.note } : {}),
                                    } : {}),
                                },
                            });
                        }}
                    />
                ))}

                {file.history.length > 0 ? (
                    <Text style={{ fontSize: 11.5, fontWeight: '500', lineHeight: 17.25, color: c.tx3, maxWidth: 300, paddingTop: 14 }}>
                        Defter son 10 randevuyu tutuyor. Daha eskisi sunucudan gelmiyor.
                    </Text>
                ) : null}
            </ScrollView>
        </View>
    );
}

// ── Parçalar ────────────────────────────────────────────────────────────────

function Pill({ children, avatar }: { children: string; avatar?: string }) {
    const { c, small } = useTheme();
    return (
        <View style={{
            height: small ? 34 : 38, borderRadius: 19, paddingHorizontal: small ? 12 : 14,
            flexDirection: 'row', alignItems: 'center', gap: 9,
            backgroundColor: c.fld, maxWidth: '100%',
        }}>
            {avatar ? (
                <View style={{
                    width: 24, height: 24, borderRadius: 12, marginLeft: -5,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: c.bd2,
                }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: c.tx2 }}>{avatar}</Text>
                </View>
            ) : null}
            <Text numberOfLines={1} style={{ fontSize: small ? 12.5 : 13.5, fontWeight: '600', color: c.tx }}>
                {children}
            </Text>
        </View>
    );
}

/**
 * `onPress` YOKSA düğme devre dışı ve GÖRÜNÜR biçimde sönük.
 *
 * Numarası olmayan müşteride eskiden düğme normal görünüyor ve dokununca
 * hiçbir şey olmuyordu. Sessizce çalışmayan bir kontrol, kullanıcıya
 * uygulamanın bozuk olduğunu düşündürür.
 */
function ActionDisc({ label, glyph, primary, onPress }: {
    label: string; glyph: 'phone' | 'msg'; primary?: boolean; onPress?: () => void;
}) {
    const { c } = useTheme();
    const off = !onPress;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={off ? `${label} — numara kayıtlı değil` : label}
            accessibilityState={{ disabled: off }}
            disabled={off}
            onPress={onPress}
            style={({ pressed }) => ({
                width: 46, height: 46, borderRadius: 23,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: off ? c.fld : primary ? 'rgba(255,90,31,0.14)' : c.fld,
                opacity: off ? 0.38 : pressed ? 0.7 : 1,
            })}
        >
            <Glyph name={glyph} size={20} color={off ? c.tx3 : primary ? c.or2 : c.tx2} />
        </Pressable>
    );
}

function Section({ title, note }: { title: string; note?: string }) {
    const { c, small } = useTheme();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'baseline', gap: 10,
            paddingTop: small ? 18 : 22, paddingBottom: 9,
        }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 2, color: c.tx3 }}>
                {upperTR(title)}
            </Text>
            {note ? (
                <Text style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: '600', color: c.tx3 }}>{note}</Text>
            ) : null}
        </View>
    );
}

/**
 * Maske — para maskesinin ikinci veri türüne uzaması.
 *
 * Etiket ve sayı OKUNUR (`RİSK · ALERJİ`, `NOT · 2 SATIR`), içerik üç nokta.
 * Alerji istisna: TÜRÜ maskesiz, çünkü müşteri kendi alerjisini zaten
 * biliyor — gizlenmesi gereken şey salonun notu.
 */
function MaskRow({ data, danger }: {
    data: { label: string; sub: string; text: string };
    danger?: boolean;
}) {
    const { c, small, reduceMotion } = useTheme();
    const [open, setOpen] = useState(false);
    const [left, setLeft] = useState(REVEAL_MS / 1000);
    const p = useRef(new Animated.Value(1)).current;
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const toggle = () => {
        if (timer.current) clearTimeout(timer.current);
        if (open) { setOpen(false); return; }
        feedback.selection();
        setOpen(true);
        setLeft(REVEAL_MS / 1000);
        if (!reduceMotion) {
            p.setValue(1);
            Animated.timing(p, { toValue: 0, duration: REVEAL_MS, easing: Easing.linear, useNativeDriver: true }).start();
        }
        // Telefon cebe girerken not ekranda kalmasın: satır kendi kapanıyor.
        timer.current = setTimeout(() => setOpen(false), REVEAL_MS);
    };

    useEffect(() => {
        if (!open || !reduceMotion) return;
        const id = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
        return () => clearInterval(id);
    }, [open, reduceMotion]);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? `${data.label}: ${data.text}` : `${data.label}, ${data.sub}. Göstermek için dokunun.`}
            onPress={toggle}
            style={{
                height: small ? 56 : 60,
                flexDirection: 'row', alignItems: 'center', gap: 14,
                borderBottomWidth: 1, borderBottomColor: c.bd,
                overflow: 'hidden',
            }}
        >
            <View style={{ width: 112, gap: 3 }}>
                <Text style={{
                    fontSize: 10, fontWeight: '700', letterSpacing: 1.7,
                    color: danger ? c.rd : c.tx2,
                }}>
                    {upperTR(data.label)}
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '600', letterSpacing: 0.42, color: open ? c.am : c.tx3 }}>
                    {open ? (reduceMotion ? `${left} sn` : '6 sn') : data.sub}
                </Text>
            </View>

            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {open ? (
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', lineHeight: 18.2, color: danger ? c.rd : c.tx }}>
                        {data.text}
                    </Text>
                ) : (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {[0, 1, 2].map((index) => (
                            <View key={index} style={{
                                width: 6, height: 6, borderRadius: 3,
                                backgroundColor: danger ? c.rd : c.tx3,
                                opacity: danger ? 0.7 : 1,
                            }} />
                        ))}
                    </View>
                )}
                <Glyph name={open ? 'eye' : 'eyeoff'} size={17} color={c.tx3} />
            </View>

            {open && !reduceMotion ? (
                <Animated.View style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
                    backgroundColor: c.am,
                    transform: [
                        { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) },
                        { scaleX: p },
                    ],
                }} />
            ) : null}
        </Pressable>
    );
}

/** Sayfadaki TEK kabuk: sorunun cevabı. */
function FormulaCard({ formula }: { formula: FileFormula }) {
    const { c } = useTheme();
    const f = formula;
    const rows: [string, string, 'gr' | 'am' | null][] = [
        ['malzeme', f.materials, null],
        ['oran', f.ratio, null],
        ['bekleme', f.wait, null],
        ['sonuç', f.result, f.tone],
    ];
    return (
        <View style={{
            gap: 13, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 14,
            borderRadius: 22, backgroundColor: c.surf, borderWidth: 1, borderColor: c.bd,
        }}>
            <View style={{ gap: 9 }}>
                {rows.map(([key, value, tone]) => (
                    <View key={key} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14 }}>
                        <Text style={{
                            width: 78, fontSize: 9.5, fontWeight: '700', letterSpacing: 1.52,
                            color: c.tx3,
                        }}>
                            {upperTR(key)}
                        </Text>
                        <Text style={{
                            flex: 1, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.23,
                            color: tone === 'gr' ? c.gr : tone === 'am' ? c.am : c.tx,
                        }}>
                            {value}
                        </Text>
                    </View>
                ))}
            </View>
            {f.note ? (
                <Text style={{
                    fontSize: 13, fontWeight: '500', lineHeight: 18.85, color: c.tx2,
                    paddingTop: 2, borderTopWidth: 1, borderTopColor: c.bd,
                }}>
                    {f.note}
                </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: c.bd2,
                    backgroundColor: f.mine ? c.fld : 'transparent',
                }}>
                    <Text style={{ fontSize: 8.5, fontWeight: '700', color: f.mine ? c.tx : c.tx2 }}>{f.initials}</Text>
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.tx3 }}>
                    {f.mine ? 'Sen yazdın' : `${f.who} yazdı`} · {f.date}
                </Text>
            </View>
        </View>
    );
}

/** Paket bir SAYIM: zaman değil, o yüzden turuncu değil. */
function PackageRow({ pack }: { pack: FilePackage }) {
    const { c } = useTheme();
    // Yirmi seanslık pakette yirmi çizgi sığmaz; sekizden sonra oran çubuğu.
    const ticks = pack.total <= 8;
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.15, color: c.tx }}>
                    {pack.name}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '500', color: c.tx3 }}>{pack.sub}</Text>
            </View>
            {ticks ? (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                    {Array.from({ length: pack.total }, (_, index) => (
                        <View key={index} style={{
                            width: 9, height: 4, borderRadius: 2,
                            backgroundColor: index < pack.used ? c.tx2 : c.bd2,
                        }} />
                    ))}
                </View>
            ) : (
                <View style={{ width: 88, height: 4, borderRadius: 2, backgroundColor: c.bd2, overflow: 'hidden' }}>
                    <View style={{ width: `${(pack.used / pack.total) * 100}%`, height: 4, borderRadius: 2, backgroundColor: c.tx2 }} />
                </View>
            )}
            <Text style={[{ fontSize: 13.5, fontWeight: '700', color: c.tx2, minWidth: 38, textAlign: 'right' }, numeric]}>
                {pack.used} / {pack.total}
            </Text>
        </View>
    );
}

/**
 * Geçmiş satırı — 08 · 4b: DOKUNULABİLİR.
 *
 * Üç hâl: formülü olan çerçeveli hap, formülü olmayan çerçevesiz amber
 * kelime, boya işi geçmemiş ziyaret hiçbir şey (ve düz satır, chevron yok).
 * Yokluğun işareti varlığınkinden sessiz olduğu için liste kirlenmiyor.
 */
function HistoryLine({ row, last, onOpen }: {
    row: FileHistoryRow; last: boolean; onOpen: () => void;
}) {
    const { c, small } = useTheme();
    const mark = historyMark({ hasFormula: row.formula, hadMaterial: row.hadMaterial, status: row.status });

    const body = (
        <>
            <Text style={[{ width: 72, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.13, color: c.tx3 }, numeric]}>
                {row.date}
            </Text>
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: '500', color: c.tx }}>
                {row.service}
            </Text>
            {row.status === 'no_show' ? (
                <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 1.43, color: c.rd }}>
                    {upperTR('gelmedi')}
                </Text>
            ) : null}
            {mark ? (
                <Text style={{
                    fontSize: 9.5, fontWeight: '700', letterSpacing: 1.43,
                    color: mark === 'formül' ? c.tx3 : c.am,
                    borderWidth: mark === 'formül' ? 1 : 0,
                    borderColor: c.bd,
                    borderRadius: 999,
                    paddingHorizontal: mark === 'formül' ? 7 : 0,
                    paddingTop: 2, paddingBottom: 1,
                }}>
                    {upperTR(mark)}
                </Text>
            ) : null}
            {mark ? <Glyph name="chev" size={17} color={c.tx3} /> : null}
        </>
    );

    const style = {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 14,
        minHeight: small ? 42 : 46,
        paddingVertical: 6,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.bd,
    };

    // Formül beklenmeyen ziyaret DÜZ bir satır: dokunulacak bir şey yok.
    if (!mark) return <View style={style}>{body}</View>;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${row.date}, ${row.service}, ${mark}`}
            onPress={onOpen}
            style={({ pressed }) => ({ ...style, opacity: pressed ? 0.6 : 1 })}
        >
            {body}
        </Pressable>
    );
}

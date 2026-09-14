/**
 * DURUM BİLEŞENLERİ — `Luera Mobil - Durumlar.html` turunun uygulaması.
 *
 * Kurallar `src/lib/durum.ts`te ve saf; burası yalnız çizim.
 *
 * ── Neden tek aile ──────────────────────────────────────────────────────────
 * Canlıya geçerken sekiz ayrı durum bloğu elle yazıldı. Her biri kendi
 * bağlamında doğruydu, ama toplamı bir sistem değildi: üç punto, iki
 * yükseklik, üç kelime. En kötüsü ağırlık tersti — adisyon kaybını söyleyen
 * blok, listenin geç gelmesini söyleyenden küçüktü.
 *
 * ── İki öge, iki iş ─────────────────────────────────────────────────────────
 *   Blok  bir şey oldu ve personelin karar vermesi gerekiyor.
 *         Başlık + gövde + en fazla iki eylem, 52–60 pt.
 *
 *   Şerit tek satırlık bir olgu; kararı yok, yalnız haberi var.
 *         Tamamı dokunulabilir — turun çevrimdışı bandıyla aynı model
 *         ("dokununca liste açılır"), ayrı bir düğme taşımıyor.
 *
 * Şeride 56 pt'lik bir düğme sokmak turu YANLIŞ okumak olurdu: o ölçü "durum
 * EKRANINDA en fazla iki eylem" kuralının parçası, bandın değil.
 */

import { Pressable, Text, View } from 'react-native';

import { ACTION_MIN_HEIGHT, MAX_ACTIONS, type DurumTone } from '../lib/durum';
import { feedback } from '../lib/feedback';
import { font, useTheme } from '../theme';

/** Turun iki tonu. Amber: iş durmuyor. Kırmızı: gerçekten başarısız. */
function skin(tone: DurumTone, c: { am: string; rd: string }) {
    return tone === 'red'
        ? { dot: c.rd, bg: 'rgba(201,64,64,0.10)', bd: 'rgba(201,64,64,0.30)' }
        : { dot: c.am, bg: 'rgba(217,164,59,0.11)', bd: 'rgba(217,164,59,0.32)' };
}

export interface DurumActionSpec {
    label: string;
    onPress: () => void;
}

/**
 * Tek başına eylem düğmesi — turun ölçüsünde.
 *
 * Bloğun dışında da gerekiyor: kumandanın "randevu okunamadı" hâli kendi
 * yerleşimini taşıyor ve kutuya girmiyor, ama düğmesi aynı ölçüde olmak
 * zorunda. Ölçü `ACTION_MIN_HEIGHT`ten geliyor, elle yazılmıyor — beş kopyanın
 * 40 pt'te donup kalmasının sebebi tam olarak elle yazılmış olmasıydı.
 */
export function DurumAction({ label, onPress }: DurumActionSpec) {
    const { c } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({
                alignSelf: 'flex-start',
                marginTop: 8,
                minHeight: ACTION_MIN_HEIGHT,
                paddingHorizontal: 22,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.fld,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <Text style={{ color: c.tx, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        </Pressable>
    );
}

/**
 * Durum bloğu.
 *
 * `lines` olgular (ne kaybedildi, ne değişti); `note` ne yapılacağı. İkisi
 * ayrı çünkü turun kuralı bu: "Her ekran ne olduğunu VE ne yapılacağını
 * söyler." Yapılacak bir şey yoksa `note` verilmiyor — boş bir umut cümlesi
 * kurmaktansa susmak.
 */
export function DurumBlock({ tone = 'amber', title, lines = [], note, actions, style }: {
    tone?: DurumTone;
    title: string;
    lines?: readonly string[];
    note?: string | null;
    actions: readonly DurumActionSpec[];
    style?: { marginHorizontal?: number; marginBottom?: number };
}) {
    const { c } = useTheme();
    const s = skin(tone, c);
    // Turun sınırı KODDA: üçüncü bir düğme kararı zorlaştırıyor ve sessizce
    // eklenmesi kolay. Fazlası çizilmiyor.
    const shown = actions.slice(0, MAX_ACTIONS);

    return (
        <View
            accessible
            accessibilityLabel={[title, ...lines, note].filter(Boolean).join('. ')}
            style={{
                marginHorizontal: style?.marginHorizontal ?? 16,
                marginBottom: style?.marginBottom ?? 12,
                padding: 14,
                gap: 8,
                borderRadius: 14,
                backgroundColor: s.bg,
                borderWidth: 1,
                borderColor: s.bd,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.dot }} />
                <Text style={{ flex: 1, minWidth: 0, fontSize: 14, fontFamily: font.extraBold, fontWeight: '800', color: c.tx, letterSpacing: -0.28 }}>
                    {title}
                </Text>
            </View>

            {lines.map((line) => (
                <Text key={line} style={{ fontSize: 12.5, fontWeight: '500', lineHeight: 18, color: c.tx2 }}>
                    {line}
                </Text>
            ))}

            {note ? (
                <Text style={{ fontSize: 12.5, fontWeight: '700', lineHeight: 18, color: c.tx2 }}>
                    {note}
                </Text>
            ) : null}

            {/* Eylemler altta ve BAŞPARMAK ÖLÇÜSÜNDE. Tur 52–60 diyor; buradaki
                blok satır içi olduğu için alt sınırda duruyor. */}
            <View style={{ flexDirection: 'row', gap: 8, paddingTop: 2 }}>
                {shown.map((action) => (
                    <Pressable
                        key={action.label}
                        accessibilityRole="button"
                        onPress={() => { feedback.selection(); action.onPress(); }}
                        style={({ pressed }) => ({
                            flex: shown.length > 1 ? 1 : 0,
                            minHeight: ACTION_MIN_HEIGHT,
                            paddingHorizontal: 18,
                            borderRadius: 16,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: c.fld,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text style={{ color: c.tx, fontSize: 15, fontWeight: '700' }}>{action.label}</Text>
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

/**
 * Durum şeridi — tek satır, tamamı dokunulabilir.
 *
 * Turun çevrimdışı bandıyla aynı model. Ayrı bir düğmesi YOK: 30 pt'lik bir
 * şeride 56 pt'lik düğme sığmaz ve sığdırmaya çalışmak turu yanlış okumak
 * olurdu.
 */
export function DurumBand({ tone = 'amber', label, tail, onPress, hint }: {
    tone?: DurumTone;
    label: string;
    /** Sağdaki ince kuyruk — saat, sayı. Tek satır, kırpılır. */
    tail?: string;
    onPress?: () => void;
    /** Ekran okuyucunun duyacağı eylem cümlesi. */
    hint?: string;
}) {
    const { c } = useTheme();
    const s = skin(tone, c);
    const body = (
        <>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.dot }} />
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: '600', color: c.tx2 }}>
                {label}
            </Text>
            {tail ? (
                <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: c.tx }}>{tail}</Text>
            ) : null}
        </>
    );
    const shell = {
        marginHorizontal: 16,
        marginBottom: 12,
        minHeight: 44,
        paddingVertical: 9,
        paddingHorizontal: 13,
        borderRadius: 12,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.bd,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 9,
    };

    if (!onPress) return <View accessible accessibilityLabel={`${label}${tail ? ` · ${tail}` : ''}`} style={shell}>{body}</View>;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}${tail ? ` · ${tail}` : ''}`}
            accessibilityHint={hint}
            onPress={() => { feedback.selection(); onPress(); }}
            style={({ pressed }) => ({ ...shell, opacity: pressed ? 0.7 : 1 })}
        >
            {body}
        </Pressable>
    );
}

/**
 * OKUNAMADI — içerik alanını dolduran hâl.
 *
 * Beş ekranda birebir aynı kod yazılıydı (Bugün · Müşteriler · müşteri dosyası
 * · Vardiyam · kumandanın ziyareti): aynı 19 pt ince başlık, aynı paragraf,
 * aynı düğme. Beş kopya beş ayrı yerde bozulabilirdi ve biri zaten bozuktu —
 * düğme 40 pt'ti, turun 52–60 aralığının altında.
 *
 * Cümlenin ŞEKLİ sabit, yalnız ÖZNESİ değişiyor: "<şey>i okuyamadık" +
 * "<yokluk> anlamına gelmez". İkinci satır turun kuralı — suç yüklemiyor ve
 * okunamayan bir şeyi yok saymıyor.
 */
export function DurumUnread({ what, notMeaning, onRetry, style }: {
    /** "Defteri" · "Bu günü" · "Vardiyanızı" — cümlenin öznesi. */
    what: string;
    /** "Müşteriniz olmadığı" · "Randevunuz olmadığı" — neyin ima EDİLMEDİĞİ. */
    notMeaning: string;
    onRetry: () => void;
    style?: { paddingHorizontal?: number; flex?: number };
}) {
    const { c, small } = useTheme();
    return (
        <View style={{
            flex: style?.flex,
            gap: 8,
            paddingTop: 24,
            paddingHorizontal: style?.paddingHorizontal ?? (small ? 16 : 20),
        }}>
            <Text style={{
                fontSize: 19, lineHeight: 22.8, letterSpacing: -0.38,
                fontFamily: font.extraLight, color: c.tx,
            }}>
                {what} <Text style={{ fontFamily: font.bold }}>okuyamadık</Text>.
            </Text>
            <Text style={{ fontSize: 13.5, fontWeight: '500', lineHeight: 20.25, color: c.tx2, maxWidth: 310 }}>
                {notMeaning} anlamına gelmez. Bağlantınızı kontrol edip tekrar deneyin.
            </Text>
            <DurumAction label="Tekrar dene" onPress={onRetry} />
        </View>
    );
}

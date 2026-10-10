import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import { feedback } from '../lib/feedback';
import {
    COLLECT_METHODS,
    collectErrorLine,
    collectLabel,
    collectRetryLabel,
    type CollectMethod,
    type CollectStage,
} from '../lib/collect';
import { font, soloDayMetrics as M, useTheme } from '../theme';

/**
 * Kumandanın son adımı, TEK KİŞİLİK modda (108 · v4 K3/K4).
 *
 * ── Neyin yerine geçiyor ────────────────────────────────────────────────────
 * Ekip modunda burada `SendToCash` duruyor: "Adisyonu kasaya gönder". Personel
 * işi kapatır, parayı başkası alır. Tek kişilik modda o başkası yok — aynı
 * kişi hem bitiriyor hem tahsil ediyor ve bilgisayarı da yok. Tasarımın kendi
 * cümlesi: "Değişen yalnız son adım."
 *
 * İki düğme, iki ayrı iş:
 *   Kartla tahsil et → adisyon kasaya gider VE para kaydı yazılır
 *   Sonra tahsil et  → adisyon kasaya gider, para bekler (Gün'de G4 kartı)
 *
 * ── Tutar NEDEN yazmıyor ────────────────────────────────────────────────────
 * Ekran müşterinin gözünün önünde; rakam yukarıda maskeli duruyor ve burada
 * da yazılmıyor. Tutarı sunucu hesaplıyor, kullanıcı rakam girmiyor. Yanlışsa
 * düzeltme yeri Kasa (v4 · C3) — kasiyerin önünde pazarlık ekranı değil.
 *
 * ── Yöntem seçilmeden düğme KAPALI ──────────────────────────────────────────
 * Varsayılan bir yöntem koymak, nakit alınan işi karta yazmanın en kolay yolu
 * olurdu. Kapalı düğme eksiğin ne olduğunu da söylüyor.
 */
export function CollectBar({
    method, stage, errorCode, onPick, onCollect, onLater,
}: {
    method: CollectMethod | null;
    stage: CollectStage;
    /** Sunucunun ya da ağın söylediği sebep; `null` "bilinmiyor". */
    errorCode: string | null;
    onPick: (next: CollectMethod) => void;
    onCollect: () => void;
    onLater: () => void;
}) {
    const { c } = useTheme();

    const busy = stage === 'sending';
    const { enabled } = collectLabel(method);
    const label = collectRetryLabel(stage, method);
    const error = collectErrorLine(stage, errorCode);
    // Gönderim bir kez olduysa "Sonra tahsil et" yapacak bir iş kalmıyor.
    const laterUseful = stage !== 'collect_failed' && stage !== 'done' && stage !== 'pending';

    return (
        <View style={{
            marginTop: 'auto',
            paddingHorizontal: M.collectPadX,
            paddingBottom: M.collectPadBottom,
            gap: M.collectGap,
        }}>
            {/* Yöntem seçici — Kasa'nın Bugün/Bu hafta/Bu ay seçicisiyle aynı biçim. */}
            <View style={{
                flexDirection: 'row',
                padding: M.segPad,
                gap: M.segGap,
                borderRadius: M.segRadius,
                backgroundColor: c.fld,
                borderWidth: 1,
                borderColor: c.bd,
            }}>
                {COLLECT_METHODS.map((item) => {
                    const on = item.key === method;
                    return (
                        <Pressable
                            key={item.key}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={`Ödeme yöntemi: ${item.label}`}
                            disabled={busy}
                            onPress={() => { feedback.selection(); onPick(item.key); }}
                            style={({ pressed }) => ({
                                flex: 1,
                                height: M.segItemHeight,
                                borderRadius: M.segItemRadius,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: on ? c.card : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text style={{
                                color: on ? c.tx : c.tx2,
                                fontSize: M.segText,
                                fontFamily: font.bold,
                                fontWeight: '700',
                            }}>
                                {item.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/*
              * SEBEP DÜĞMENİN HEMEN ÜSTÜNDE (v4 · K4).
              *
              * "Ekran sunucu kabul etmeden değişmez. Ret sebebi kullanıcının
              * baktığı yerde." Üstte bir bildirim şeridi olsaydı, parmağı
              * düğmede olan kişi onu hiç görmezdi.
              */}
            {error ? (
                <View style={{
                    flexDirection: 'row',
                    gap: M.errGap,
                    paddingHorizontal: M.errPadX,
                    alignItems: 'flex-start',
                }}>
                    <View style={{ paddingTop: 1 }}>
                        <Glyph name="warn" size={M.errIcon} color={c.rd} />
                    </View>
                    <Text style={{
                        flex: 1,
                        color: c.rd,
                        fontSize: M.errText,
                        fontFamily: font.semiBold,
                        fontWeight: '600',
                        lineHeight: M.errText * M.errLine,
                    }}>
                        {error}
                    </Text>
                </View>
            ) : null}

            <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !enabled || busy, busy }}
                accessibilityLabel={label}
                disabled={!enabled || busy}
                onPress={() => { feedback.light(); onCollect(); }}
                style={({ pressed }) => ({
                    height: M.payHeight,
                    borderRadius: M.payRadius,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: M.payGap,
                    backgroundColor: enabled ? c.or : c.fld,
                    borderWidth: enabled ? 0 : M.payBorder,
                    borderColor: c.bd2,
                    opacity: pressed ? 0.9 : 1,
                })}
            >
                {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <Glyph name="cash" size={M.payIcon} color={enabled ? '#FFFFFF' : c.tx3} />
                )}
                <Text numberOfLines={1} style={{
                    color: enabled ? '#FFFFFF' : c.tx3,
                    fontSize: M.payText,
                    fontFamily: font.extraBold,
                    fontWeight: '800',
                    letterSpacing: M.payText * M.payTrack,
                }}>
                    {busy ? 'Kaydediliyor…' : label}
                </Text>
            </Pressable>

            {/*
              * "SONRA TAHSİL ET" bir vazgeçme değil, geçerli bir iş: müşteri
              * parayı sonra verecek. Adisyon açık kalıyor ve Gün'de kart
              * "ADİSYON AÇIK"a dönüyor — kaybolmuyor, hatırlatıyor.
              *
              * Tahsilat denenip düştükten SONRA çizilmiyor: gönderim o anda
              * zaten olmuştu, yapacağı bir iş kalmadı ve basılınca hiçbir şey
              * olmayan bir düğme olurdu.
              */}
            {laterUseful ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sonra tahsil et"
                    accessibilityHint="Adisyon açık kalır, Gün ekranında hatırlatılır"
                    disabled={busy}
                    onPress={() => { feedback.selection(); onLater(); }}
                    style={({ pressed }) => ({
                        height: M.ghostHeight,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                    })}
                >
                    <Text style={{
                        color: c.tx2,
                        fontSize: M.ghostText,
                        fontFamily: font.bold,
                        fontWeight: '700',
                    }}>
                        Sonra tahsil et
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

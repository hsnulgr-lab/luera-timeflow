import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SheetGrab } from '../../../src/components/Sheet';
import { WaButton, WarnLine } from '../../../src/components/WaLinkParts';
import { disconnectWa } from '../../../src/lib/waLinkSource';
import { feedback } from '../../../src/lib/feedback';
import { apptCardMetrics, font, useTheme } from '../../../src/theme';

/**
 * WhatsApp › Bağlantıyı kes — onay (Müdür 37 · F2 · kes).
 *
 * iOS'un sayfası, boyu içerik kadar; aşağı çekince kapanır. Metin masaüstündeki
 * onayla aynı. Vazgeç dolu ve üstte (başparmağın ilk değdiği yer), Bağlantıyı
 * kes kırmızı çerçeveli ve altta. Kesilince sayfa kapanır; WhatsApp sayfası
 * odağa dönünce durumu yeniden sorar ve B'ye geçer — ayrı "kesildi" ekranı yok.
 */
export default function WhatsAppCutSheet() {
    const { c } = useTheme();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(false);

    const cut = async () => {
        setBusy(true);
        setProblem(false);
        const ok = await disconnectWa();
        setBusy(false);
        if (!ok) { feedback.error(); setProblem(true); return; }
        feedback.success();
        router.back();
    };

    return (
        <View style={{ backgroundColor: c.bg }}>
            <SheetGrab />
            <View style={{ paddingTop: 6, paddingHorizontal: 22, paddingBottom: 4, gap: 10 }}>
                <Text accessibilityRole="header" style={{ color: c.tx, fontSize: 23, lineHeight: 26, fontFamily: font.extraBold, fontWeight: '800', letterSpacing: 23 * -0.03 }}>
                    Bağlantı kesilsin mi?
                </Text>
                <Text style={{ color: c.tx2, fontSize: 16, lineHeight: 23, fontFamily: font.medium, fontWeight: '500' }}>
                    Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için kodu tekrar almanız gerekir.
                </Text>
                {problem ? <WarnLine title="Kesilemedi." body="İnternetinizi kontrol edip tekrar deneyin." size={14.5} /> : null}
            </View>
            {/* Alt pay öbür içerik boyundaki sayfalarla aynı (`sheetPadBottom`);
                güvenli alanı sistemin sayfası zaten bırakıyor — üstüne eklenince
                altta boş bir şerit kalıyordu (telefonda görüldü). */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: apptCardMetrics.sheetPadBottom, gap: 10 }}>
                <WaButton label="Vazgeç" variant="nt" onPress={() => router.back()} disabled={busy} />
                <WaButton label="Bağlantıyı kes" variant="rd" busy={busy} onPress={() => { void cut(); }} />
            </View>
        </View>
    );
}

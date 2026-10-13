/**
 * EKİPTEN ÇIKAR — saf karar katmanı (2026-10-13).
 *
 * Telefonda kullanıcı: "Tek kişilik hesapta personel ekleyince müdür açılıyor,
 * doğru; ama geri dönüş yok. Personel işten çıktı, tek kişilik ekranına
 * dönemiyorum. Personeli çıkar olmalı; çıkardıktan sonra tek kişiliğe
 * geçmeli."
 *
 * Dönüş kapısı (115 · `end_team`) vardı ama yalnız ekipte bir kişi kalınca
 * görünüyordu ve telefonda kimseyi ekipten çıkarmanın yolu yoktu ("Personel
 * eklemek ve çıkarmak bilgisayardan") — tek kişilikten gelenin bilgisayarı yok.
 *
 * ── Kim kalır ───────────────────────────────────────────────────────────────
 * Sunucu tek kişiliğe dönüşte KALAN tek aktif satırı tutuyor; kimin sahip
 * olduğunu bilmiyor (satırda işaret yok). Bu yüzden telefon kimseyi "siz"
 * diye tahmin etmiyor: son adımda kalacak kişinin ADI açıkça yazıyor —
 * yanlış satırı seçen, onayı vermeden görür.
 *
 * Saf — React ve Expo taşımıyor; Node testleri doğrudan okuyor.
 */

export interface RemovableMember {
    id: string;
    name: string;
}

export type RemovePlan =
    /** Ekipte başkaları da kalıyor: yalnız çıkarılıyor. */
    | { kind: 'remove'; remaining: number }
    /** Yalnız bir kişi kalıyor: çıkarılıyor ve işletme tek kişiliğe dönüyor. */
    | { kind: 'solo'; keeper: string }
    /** Ekipte tek kişi var: çıkarılırsa kimse kalmaz. */
    | { kind: 'last' };

export function removePlan(members: readonly RemovableMember[], removeId: string): RemovePlan {
    const remaining = members.filter((member) => member.id !== removeId);
    if (remaining.length === 0) return { kind: 'last' };
    if (remaining.length === 1) return { kind: 'solo', keeper: remaining[0].name };
    return { kind: 'remove', remaining: remaining.length };
}

export interface RemoveCopy {
    title: string;
    lines: string[];
    action: string;
    busy: string;
}

/**
 * Onay sayfasının cümleleri — sonuçlar tek tek yazılı.
 *
 * İleri randevular: ekipte kalınca takvimde ayrılan kişinin sütununda duruyor
 * (müdür taşır); tek kişiliğe dönülünce `end_team` onları kalan kişiye
 * geçiriyor, o saatte dolu olan personelsiz kalıyor.
 */
export function removeCopy(plan: RemovePlan, name: string): RemoveCopy {
    const common = [
        `${name} telefonundan çıkar; bir daha giriş yapamaz.`,
        'Geçmiş randevularında ve Kasa’da adı kalır.',
    ];
    if (plan.kind === 'solo') {
        return {
            title: 'Ekipten çıkar',
            lines: [
                ...common,
                `Ekipte yalnız ${plan.keeper} kalır ve işletme tek kişilik düzene döner.`,
                'İleri randevuları kalan kişiye geçer; o saatte dolu olan personelsiz kalır.',
            ],
            action: 'Çıkar ve tek kişiliğe dön',
            busy: 'Çıkarılıyor…',
        };
    }
    return {
        title: 'Ekipten çıkar',
        lines: [
            ...common,
            'İleri randevuları takvimde onun sütununda kalır; başka birine taşıyın.',
        ],
        action: 'Ekipten çıkar',
        busy: 'Çıkarılıyor…',
    };
}

/** Ekipte tek kişi kaldıysa: çıkarılamaz, dönüşün yeri söyleniyor. */
export const REMOVE_LAST_LINE = 'Ekipte tek kişi var; çıkarılırsa kimse kalmaz. Tek kişilik düzene dönmek için: İşletme › Tek kişiliğe dön.';

export type RemoveFailure = 'offline' | 'not_allowed' | 'failed';

export function removeProblem(reason: RemoveFailure): string {
    if (reason === 'offline') return 'Bağlantı yok. Kimse çıkarılmadı; bağlanınca tekrar deneyin.';
    if (reason === 'not_allowed') return 'Personeli yalnız işletme sahibi çıkarabilir.';
    return 'Kimse çıkarılmadı. Birazdan tekrar deneyin.';
}

/**
 * Çıkarıldı ama tek kişiliğe dönüş olmadıysa: iş yarıda kalmadı, kapı
 * İşletme'de açık (`Tek kişiliğe dön` satırı ekipte bir kişi kalınca çıkıyor).
 */
export function soloAfterRemoveProblem(name: string, reason: string): string {
    return `${name} ekipten çıkarıldı; tek kişiliğe dönüş olmadı (${reason}). İşletme › Tek kişiliğe dön’den tamamlayın.`;
}

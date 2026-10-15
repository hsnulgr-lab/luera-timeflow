/**
 * YAPAY ZEKÂYA MÜŞTERİ ADI GİTMİYOR — yer tutucu (D5, 2026-10-16).
 *
 * Mesaj taslağını yazan model (Gemini, Groq) yurt dışında çalışıyor. Apple
 * 5.1.2(i) kişisel verinin üçüncü taraf yapay zekâyla paylaşılmasını açık
 * bildirim ve izne bağlıyor; KVKK da adı yurt dışına aktarmayı. Ad hiç
 * gitmezse ikisi de doğmuyor ve özellik yaşamaya devam ediyor.
 *
 * Kural: istemde adın yerine `{AD}` yazıyor, model mesajı onunla kuruyor,
 * dönen metne gerçek ön ad SUNUCUDA konuyor. Yer tutucu yoksa ya da birden
 * fazlaysa (model adı uydurmuş ya da tekrarlamış olabilir) mesaj kullanılmıyor
 * ve şablona düşülüyor — şablon zaten her yolun güvenlik ağı.
 *
 * Bu dosyanın BİREBİR kopyası `draft-messages/aiName.ts`te: `_shared`e
 * konsaydı her deploy bütün fonksiyonları kapsamak zorunda kalırdı. Testler
 * iki kopyanın aynı kaldığını kilitliyor (`d5-yapay-zeka-ad.test.mjs`).
 */

export const NAME_TOKEN = '{AD}';

/** İsteme eklenen kural cümlesi — modelin adı bilmediğini ve ne yazacağını söylüyor. */
export const NAME_RULE =
    `Müşterinin adını bilmiyorsun ve UYDURMA: adının geçeceği yere tam olarak bir kez ${NAME_TOKEN} yaz `
    + '(süslü parantezleriyle, değiştirmeden).';

/** Ön ad — ilk kelime; boşsa boş. */
export function firstNameOf(full: string | null | undefined): string {
    return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Modelin metnine gerçek ön adı koyar.
 *
 * `null` → bu metin KULLANILMAZ, şablona düşülür: yer tutucu yok ya da birden
 * fazla, ya da ad bilinmiyor (şablon adsız durumu kendi biçiminde yazıyor).
 */
export function fillName(text: string | null | undefined, fullName: string | null | undefined): string | null {
    if (typeof text !== 'string') return null;
    const parts = text.split(NAME_TOKEN);
    if (parts.length !== 2) return null;
    const name = firstNameOf(fullName);
    if (!name) return null;
    const filled = parts.join(name).trim();
    return filled || null;
}

// Niyet tespiti — kodun kesin bildiği kısım.
//
// Onay, ret, iptal ve opt-out modele SORULMAZ. Bunlar botun geri alınamaz
// işlemlerini tetikleyen kelimeler; bir modelin "evet"i "hayır" anlaması ya da
// sağlayıcı düştüğünde hiçbir şey anlamaması kabul edilemez.
//
// Model yalnız buradan çözülemeyen serbest metin için devreye girer.

import { foldTr } from './dates.ts';

export type Confirm = 'yes' | 'no' | null;

export type Intent =
    | 'book'        // randevu almak istiyor
    | 'cancel'      // konuşmadan/işlemden vazgeçiyor
    | 'greeting'
    | 'optout'      // "DUR"
    | 'optin'       // "BAŞLAT"
    | 'other';

const YES = /(^|\s)(evet|evt|olur|tamam|tmm|onay|onayliyorum|ok|okey|okay|tabii|tabi|yes|peki|uygun)(\s|$|[.!,])/;
const NO = /(^|\s)(hayir|yok|olmaz|vazgectim|istemiyorum|no)(\s|$|[.!,])/;
const CANCEL = /(^|\s)(iptal|vazgec|vazgectim|bosver|bos ver)/;

// Opt-out tek başına yazılmalı: "iptal et" cümlesi randevu iptali de olabilir,
// abonelik iptali de. Tek kelimelik mesaj niyeti tartışmasız kılar.
const OPT_OUT = /^\s*(dur|stop|cikar|abone iptal|mesaj istemiyorum)\s*$/;
const OPT_IN = /^\s*(baslat|start|devam)\s*$/;

const GREETING = /^\s*(merhaba|selam|slm|iyi gunler|iyi aksamlar|gunaydin|hey|hi|hello|selamun aleykum|meraba)[\s!.]*$/;

/** Emoji ile onay/ret — 👍 ✅ 👎 tek başına yollandığında. */
const YES_EMOJI = /[\u{1F44D}\u{2705}\u{1F64C}]/u;
const NO_EMOJI = /[\u{1F44E}\u{274C}]/u;

/**
 * Onay mı ret mi? Belirsizse null — çağıran o zaman tekrar sorar.
 * İkisi birden geçiyorsa (nadiren "evet ama hayır") null döner: geri alınamaz
 * işlemde tereddüt, tahminden iyidir.
 */
export function detectConfirm(text: string): Confirm {
    const s = foldTr(text);
    const yes = YES.test(s) || YES_EMOJI.test(text);
    const no = NO.test(s) || NO_EMOJI.test(text);
    if (yes && no) return null;
    if (yes) return 'yes';
    if (no) return 'no';
    return null;
}

/**
 * Kaba niyet. `awaitingConfirm` bir onay bekleniyorsa true geçilmeli: o an
 * "iptal" kelimesi konuşmayı değil, önerilen randevuyu reddetmek demektir ve
 * cancel'a düşerse müşterinin oturumu boşuna silinir.
 */
export function detectIntent(text: string, opts: { awaitingConfirm?: boolean } = {}): Intent {
    const s = foldTr(text);
    if (OPT_OUT.test(s)) return 'optout';
    if (OPT_IN.test(s)) return 'optin';
    if (GREETING.test(s)) return 'greeting';
    if (!opts.awaitingConfirm && CANCEL.test(s)) return 'cancel';
    return 'other';
}

/**
 * Mesaj işlenmeye değer mi? Evolution grup mesajı, kendi gönderdiğimiz mesaj ve
 * medya için de webhook atıyor.
 */
export function inboundKind(payload: {
    fromMe?: boolean;
    remoteJid?: string;
    text?: string;
    hasMedia?: boolean;
}): 'text' | 'media' | 'skip' {
    if (payload.fromMe) return 'skip';
    if (!payload.remoteJid || payload.remoteJid.includes('@g.us')) return 'skip';
    if (payload.text && payload.text.trim()) return 'text';
    if (payload.hasMedia) return 'media';
    return 'skip';
}

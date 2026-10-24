// Abonelik e-postaları — SAF kısım: kime, ne zaman, hangi e-posta, ne yazar.
//
// Kurallar: docs/abonelik-kurallari.md §2 (Faz 2.5). Telefon uygulaması
// ödemeden söz edemez (App Store 3.1.1 / 3.1.3); deneme ve ödeme iletişimi
// YALNIZ e-postayla, uygulamanın dışından yapılır.
//
// Ağ ve Deno bağımlılığı YOK: tests/abonelik-eposta.test.mjs bu dosyayı
// doğrudan import edip çalıştırır. G/Ç (veritabanı, giriş servisi, Resend)
// index.ts'te.
//
// ── Beş e-posta ─────────────────────────────────────────────────────────────
//   hosgeldin  kartsız deneme başladı (bitişe 4+ gün varken) · siteden
//              ödeme önce açılan hesap (sihirli bağlantı, göç 127)
//   uc_gun     bitişe 3 gün ya da daha az           (sihirli bağlantı)
//   bitti      bitişin günü ve sonraki 2 gün        (sihirli bağlantı)
//   son        bitişten 3–6 gün sonra; sonra YOK     (sihirli bağlantı)
//   odeme      ödeme alınamadı, ek süre sürüyor      (sihirli bağlantı)
//
// Her e-posta (işletme, tür, dönem) başına BİR kez gider — defter göç 125.

export type MailKind = 'hosgeldin' | 'uc_gun' | 'bitti' | 'son' | 'odeme';

export const MAIL_KINDS: readonly MailKind[] = ['hosgeldin', 'uc_gun', 'bitti', 'son', 'odeme'];

/**
 * Kartsız denemenin olay adları: göç 124 (`trial_phone`, telefondan açılan
 * işletme) ve açılış betiği (`trial_opening`, ops/abonelik/acilis-deneme.sql).
 * Hediye (`comp_manual`), demo (`demo_manual`) ve Dodo aboneliği bu listede
 * YOK — onlara deneme e-postası gitmez.
 */
export const CARDLESS_EVENTS: readonly string[] = ['trial_phone', 'trial_opening'];

/**
 * Kartsız denemenin uzunluğu — 124 ve acilis-deneme.sql ikisi de
 * `now() + interval '7 days'` yazar. Yalnız hoş geldiniz metninde geçer.
 */
export const CARDLESS_TRIAL_DAYS = 7;

/**
 * Sihirli bağlantının ömrü. Giriş servisinin (GoTrue) OTP ömrüne BAĞLI:
 * auth kabında OTP ayarı yok → varsayılan 86400 sn (devir 11 "Sunucu kod
 * ömrü"). Bir gün `GOTRUE_MAILER_OTP_EXP` kurulursa burası da değişmeli —
 * yoksa e-posta "24 saat" der, bağlantı daha erken ölür.
 */
export const MAGIC_LINK_HOURS = 24;

/** Düğmesi sihirli bağlantı olan türler. Hoş geldiniz düz giriş bağlantısı:
 *  7 gün okunabilir, 24 saatlik bağlantı orada çoğu zaman ölü olurdu. */
export const MAGIC_KINDS: readonly MailKind[] = ['uc_gun', 'bitti', 'son', 'odeme'];

/**
 * Siteden ödeme önce açılan hesabın hoş geldiniz e-postası (göç 127): hesabı
 * Dodo'ya yazılan e-postayla ödeme açtı, kişinin bilinen bir şifresi YOK.
 * Ödeme sekmesini kapatan panele bu e-postanın düğmesiyle döner — bu yüzden
 * bu hoş geldiniz SİHİRLİ bağlantılı; ödemeden dakikalar sonra okunur.
 */
export const CHECKOUT_EVENT = 'checkout_claim';

/** Ödeme talebi bundan eskiyse hoş geldiniz gitmez (tarama durmuşsa geç e-posta yok). */
export const CHECKOUT_WELCOME_MAX_MS = 2 * 86_400_000;

/** Düğme sihirli bağlantı mı? */
export function isMagic(tur: MailKind, event?: string | null): boolean {
    return MAGIC_KINDS.includes(tur) || (tur === 'hosgeldin' && event === CHECKOUT_EVENT);
}

/** Taramanın okuduğu ödeme talebi alanları (checkout_claims). */
export interface ClaimRow {
    id: string;
    organization_id: string | null;
    user_created: boolean;
    attached_at: string | null;
}

/**
 * Bu ödeme talebine hoş geldiniz düşüyor mu? Yalnız hesabı talebin AÇTIĞI
 * (var olan hesaba eklenen aboneliğe değil — o kişinin şifresi var) ve
 * işletmeye yeni bağlanmış talepler. Dönem talebe özgü: kartsız denemenin
 * hoş geldinizini bloke etmez, aynı talebe iki kez gitmez.
 */
export function claimWelcomeDue(claim: ClaimRow, now: number): Due | null {
    if (!claim.user_created || !claim.organization_id) return null;
    const at = ms(claim.attached_at);
    if (at === null || now - at > CHECKOUT_WELCOME_MAX_MS) return null;
    return { tur: 'hosgeldin', donem: `site-${claim.id}` };
}

/**
 * Gönderen. Apple gizli e-posta kaydında (Apple Developer › Sign in with
 * Apple for Email Communication) bu adres ve alan adı KAYITLI (2026-10-20);
 * başka bir gönderen yazılırsa `…@privaterelay.appleid.com` adreslerine
 * giden e-postalar geri döner — önce Apple'a kaydedilmeli.
 */
export const MAIL_FROM = 'Luera TimeFlow <no-reply@lueratech.com>';
/** Yanıtlar gerçek posta kutusuna gider (no-reply kimseye ulaşmaz). */
export const MAIL_REPLY_TO = 'info@lueratech.com';

/** Taramanın okuduğu ayna alanları (org_entitlement). */
export interface MailRow {
    organization_id: string;
    state: string;
    dodo_subscription_id?: string | null;
    last_event?: string | null;
    trial_ends_at?: string | null;
    expires_at?: string | null;
    grace_until?: string | null;
}

export interface Due {
    tur: MailKind;
    /**
     * Hangi deneme / ek süre — defterde (işletme, tür, dönem) tekil. Deneme
     * uzar ya da yeni bir ek süre açılırsa dönem değişir, e-posta yeniden hak
     * edilir.
     */
    donem: string;
}

const MIN = 60_000;
const DAY = 86_400_000;
/** Türkiye UTC+3, yaz saati yok (remind ile aynı sabit). */
const TR_OFFSET_MS = 3 * 60 * MIN;

function ms(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

/** Türkiye takvim günü (gün sayısı). "3 gün kaldı" saatle değil takvimle sayılır:
 *  pazartesi 23:00'te biten deneme cuma 10:00'da "3 gün kaldı"dır. */
export function trDay(t: number): number {
    return Math.floor((t + TR_OFFSET_MS) / DAY);
}

/** Bitişe kalan Türkiye takvim günü (bugün biterse 0, geçtiyse eksi). */
export function trDaysLeft(end: number, now: number): number {
    return trDay(end) - trDay(now);
}

/**
 * Kartsız deneme satırı mı? `_shared/entitlement.ts · isCardlessTrial`
 * yalnız "Dodo aboneliği yok"a bakar; burada OLAY ADI da şart: elle yazılmış
 * eski bir 'trial' satırına (iç hesap, onarım) satış e-postası gitmesin.
 */
export function isCardlessTrialRow(row: MailRow): boolean {
    return row.state === 'trial'
        && !row.dodo_subscription_id
        && CARDLESS_EVENTS.includes(row.last_event ?? '');
}

/**
 * Bu satıra ŞU AN hangi e-posta düşüyor? Yoksa null.
 *
 * Sıra ve sınırlar docs/devir/13 §2; her aşama bir öncekinin dönemini
 * değil kendi dönemini taşır. Kısa denemede (açılışta 3 gün kalmış) hoş
 * geldiniz ATLANIR, doğrudan "3 gün kaldı" gelir — ikisi aynı gün gitmesin.
 */
export function dueMail(row: MailRow, now: number): Due | null {
    // Ödeme alınamadı: yalnız ek süre SÜRERKEN. Süresi geçmiş 'grace' satırı
    // (webhook kaçmışsa) e-posta hak etmez — "son gün" çoktan geçmiş olurdu.
    if (row.state === 'grace') {
        const grace = ms(row.grace_until);
        return grace !== null && grace > now ? { tur: 'odeme', donem: new Date(grace).toISOString() } : null;
    }

    if (!isCardlessTrialRow(row)) return null;
    // Kartsız denemede expires_at = trial_ends_at (124); biri boşsa öteki.
    const end = ms(row.expires_at) ?? ms(row.trial_ends_at);
    if (end === null) return null;
    const donem = new Date(end).toISOString();

    if (now < end) {
        if (trDaysLeft(end, now) <= 3) return { tur: 'uc_gun', donem };
        // Hoş geldiniz deneme TÜRÜ başına bir kez: açılışta telefon denemesi
        // bitmiş birine 'trial_opening' ile ikinci bir karşılama gider (metni
        // farklı), aynı denemeye iki kez gitmez.
        return { tur: 'hosgeldin', donem: row.last_event ?? 'trial' };
    }

    const since = trDay(now) - trDay(end);
    if (since <= 2) return { tur: 'bitti', donem };
    if (since <= 6) return { tur: 'son', donem };
    // Anahtar geç açılırsa aylar önce bitmiş birine e-posta gitmesin.
    return null;
}

/**
 * Sessiz saat: hatırlatma türleri yalnız TR 09:00–21:00 arasında gider
 * (remind'in WhatsApp kuralıyla aynı). Hoş geldiniz (kayıt anına bağlı) ve
 * ödeme alınamadı (ek süre yalnız 2 gün) her saat — geciktirmek anlamlarını
 * yok eder.
 */
export function sendableAt(tur: MailKind, now: number): boolean {
    if (tur === 'hosgeldin' || tur === 'odeme') return true;
    const minuteOfDay = Math.floor(((now + TR_OFFSET_MS) % DAY) / MIN);
    return minuteOfDay >= 9 * 60 && minuteOfDay < 21 * 60;
}

// ── Bağlantılar ─────────────────────────────────────────────────────────────

function base(appUrl: string): string {
    return appUrl.replace(/\/+$/, '');
}

/**
 * Sihirli bağlantı. Jeton PARÇADA (#): sunucu günlüğüne düşmez ve JS
 * çalıştırmayan e-posta tarayıcıları (bağlantı önizleyiciler) onu yakmaz.
 * Sayfa: src/pages/EpostaBaglantiPage.tsx. GoTrue'nun kendi `action_link`i
 * KULLANILMAZ — API_EXTERNAL_URL iç ağ adresi, kimsenin tarayıcısında açılmaz.
 */
export function magicUrl(appUrl: string, hashedToken: string, git?: 'panel'): string {
    return `${base(appUrl)}/baglanti#t=${encodeURIComponent(hashedToken)}${git ? `&git=${git}` : ''}`;
}

/** Düz bağlantı: giriş, sonra paket ekranı (LoginPage `sonra=abonelik`). */
export function paywallLoginUrl(appUrl: string): string {
    return `${base(appUrl)}/login?sonra=abonelik`;
}

// ── Kişisel veri ────────────────────────────────────────────────────────────

/** Günlüğe ve ops çıktısına adres düz düşmez: k***@gmail.com */
export function maskEmail(email: string | null | undefined): string {
    if (!email || !email.includes('@')) return '(adres yok)';
    const [user, domain] = email.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * E-postada yazılacak işletme adı; uygun değilse null ("İşletmeniz").
 *
 * E-postayla kayıtta `settings.business_name` bugün e-posta ADRESİ
 * (121 · COALESCE(name, email); devir 12 §2 kusur 1) — "kemal@gmail.com için
 * denemeniz başladı" yazmasın. Metinler adı hep "… için" kalıbında kullanır,
 * böylece "İşletmeniz için" de doğru okunur.
 */
export function displayName(raw: string | null | undefined): string | null {
    const name = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.includes('@')) return null;
    return name.length > 80 ? `${name.slice(0, 79)}…` : name;
}

// ── Tarih ───────────────────────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long',
});
const dayTimeFmt = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long',
    hour: '2-digit', minute: '2-digit',
});

/** "27 Ekim Salı" */
export function trDate(iso: string): string {
    return dayFmt.format(new Date(iso));
}

/** "23 Ekim Perşembe 14:30" */
export function trDateTime(iso: string): string {
    return dayTimeFmt.format(new Date(iso));
}

// ── Metinler ────────────────────────────────────────────────────────────────

export interface MailContext {
    /** displayName() sonucu; null → "İşletmeniz". */
    business: string | null;
    /** Alıcının adresi — altbilgi "bu adresli hesabınız" der. */
    to: string;
    /** Düğmenin gideceği adres. */
    link: string;
    /** Düğme sihirli bağlantı mı (değilse giriş sayfası)? Not buna göre çıkar. */
    magic: boolean;
    /** app_secrets.ENTITLEMENT_ENFORCE = 'true' → "salt okunur" cümleleri. */
    enforce: boolean;
    /** Denemenin bitişi ya da ek sürenin sonu (ISO). */
    endsAt: string;
    /** Hoş geldiniz metni deneme türüne göre (trial_phone / trial_opening). */
    event?: string | null;
    now: number;
}

export interface MailContent {
    subject: string;
    preheader: string;
    html: string;
    text: string;
}

/** Bir e-postanın içeriği — HTML'e ve düz metne aynı kaynaktan dönüşür. */
interface Body {
    subject: string;
    preheader: string;
    heading: string;
    paras: string[];
    info?: { label: string; value: string };
    after?: string[];
    button: string;
}

// Cümleler tek yerde: ENFORCE açılınca ne söylendiği burada okunur.
const READ_ONLY_LATER = 'Paket seçilmezse deneme bitince uygulama salt okunur olur: kayıtlarınızı görürsünüz ama yeni randevu yazılamaz; WhatsApp hatırlatmaları ve online randevu durur.';
const READ_ONLY_NOW = 'Uygulama şu an salt okunur: kayıtlarınızı görebilirsiniz ama yeni randevu yazılamaz; WhatsApp hatırlatmaları ve online randevu durdu.';
const DATA_KEPT = 'Müşterileriniz, randevularınız ve ayarlarınız silinmedi, olduğu gibi duruyor.';

function body(tur: MailKind, ctx: MailContext): Body {
    const biz = ctx.business ?? 'İşletmeniz';
    const end = trDate(ctx.endsAt);

    switch (tur) {
        case 'hosgeldin': {
            if (ctx.event === CHECKOUT_EVENT) {
                return {
                    subject: 'Luera TimeFlow hesabınız hazır',
                    preheader: 'Tek tıkla panele girin; şifrenizi sonra belirleyebilirsiniz.',
                    heading: 'Hesabınız hazır.',
                    paras: [
                        `${biz} için TimeFlow hesabınız açıldı ve ücretsiz denemeniz başladı. İlk ödeme deneme bitince alınır; o güne kadar Ayarlar › Abonelik'ten iptal ederseniz ücret alınmaz.`,
                    ],
                    info: { label: 'Hesabınızın e-postası', value: ctx.to },
                    after: [
                        "Kendi şifrenizi panelde Ayarlar › Hesabım'dan belirleyebilirsiniz. O zamana kadar giriş ekranında bu adresi yazıp \"Şifremi unuttum\"u seçerek de girebilirsiniz.",
                    ],
                    button: 'Panele gir',
                };
            }
            const opening = ctx.event === 'trial_opening';
            return {
                subject: opening ? 'TimeFlow ücretsiz denemeniz başladı' : "Luera TimeFlow'a hoş geldiniz",
                preheader: `${CARDLESS_TRIAL_DAYS} gün boyunca her şey açık, kart bilgisi istemiyoruz.`,
                heading: opening ? 'Ücretsiz denemeniz başladı.' : 'Hoş geldiniz.',
                paras: [
                    `${biz} için ${CARDLESS_TRIAL_DAYS} günlük ücretsiz denemeniz başladı. Bu süre boyunca her şey açık, kart bilgisi istemiyoruz.`,
                ],
                info: { label: 'Deneme bitişi', value: end },
                after: [
                    "Deneme bitince devam etmek için web'den bir paket seçmeniz yeterli. Erken seçerseniz ilk ödeme yine denemeniz bittiğinde alınır.",
                ],
                button: 'Paketleri gör',
            };
        }
        case 'uc_gun': {
            const d = Math.max(0, trDaysLeft(Date.parse(ctx.endsAt), ctx.now));
            const title = d === 0 ? 'Denemeniz bugün bitiyor'
                : d === 1 ? 'Denemeniz yarın bitiyor'
                    : `Denemenizin bitmesine ${d} gün kaldı`;
            return {
                subject: title,
                preheader: 'Şimdi paket seçerseniz ilk ödeme denemeniz bittiğinde alınır.',
                heading: `${title}.`,
                paras: [
                    `${biz} için denemeniz ${end} günü bitiyor. Kesintisiz devam etmek için şimdi bir paket seçin: ilk ödeme denemeniz bittiğinde alınır, o güne kadar ücret yok.`,
                    ...(ctx.enforce ? [READ_ONLY_LATER] : []),
                ],
                button: 'Paketimi seç',
            };
        }
        case 'bitti':
            return {
                subject: 'Denemeniz bitti',
                preheader: 'Verileriniz duruyor; paket seçtiğiniz an kaldığınız yerden devam edersiniz.',
                heading: 'Denemeniz bitti.',
                paras: [
                    `${biz} için ücretsiz denemeniz ${end} günü sona erdi. ${DATA_KEPT}`,
                    ctx.enforce
                        ? `${READ_ONLY_NOW} Bir paket seçtiğiniz an kaldığınız yerden devam edersiniz.`
                        : 'Bir paket seçip kesintisiz devam edin.',
                ],
                button: 'Paketimi seç',
            };
        case 'son':
            return {
                subject: 'Son hatırlatma: verileriniz sizi bekliyor',
                preheader: 'Bu konudaki son e-postamız.',
                heading: 'Verileriniz sizi bekliyor.',
                paras: [
                    `${biz} için denemeniz ${end} günü bitti. ${DATA_KEPT} Bir paket seçtiğiniz an kaldığınız yerden devam edersiniz.`,
                    ...(ctx.enforce ? ['Paket seçene kadar uygulama salt okunur kalır.'] : []),
                    'Bu son hatırlatmamız; bundan sonra bu konuda e-posta göndermeyeceğiz.',
                ],
                after: [
                    `Verilerinizi dışa aktarmak isterseniz ${MAIL_REPLY_TO} adresine yazmanız yeterli; bunun için abonelik gerekmez.`,
                ],
                button: 'Paketimi seç',
            };
        case 'odeme':
            return {
                subject: 'Son ödemeniz alınamadı',
                preheader: 'Kartınızı güncellediğiniz an ödeme tekrar denenir.',
                heading: 'Son ödemeniz alınamadı.',
                // Sebep TAHMİN EDİLMEZ, kırmızı/suçlama yok (PaywallPage Durum 3).
                paras: [
                    `${biz} için son abonelik ödemenizi bankanız geçirmedi. Bu genelde kart limiti ya da bankanın doğrulamasıyla ilgilidir.`,
                ],
                info: { label: 'Kartınızı güncellemek için son gün', value: trDateTime(ctx.endsAt) },
                after: [
                    'Kartınızı güncellediğiniz an ödeme yeni karttan tekrar denenir ve aboneliğiniz sürer.',
                    ...(ctx.enforce
                        ? ['Bu tarihe kadar güncellenmezse uygulama salt okunur olur; WhatsApp hatırlatmaları ve online randevu durur. Verileriniz silinmez.']
                        : []),
                ],
                button: 'Kartımı güncelle',
            };
    }
}

function magicNote(): string {
    return `Düğme sizi şifre sormadan hesabınıza sokar. Bağlantı ${MAGIC_LINK_HOURS} saat geçerli ve tek kullanımlıktır; süresi geçtiyse timeflow.lueratech.com adresinden giriş yapın. Bu e-postayı kimseyle paylaşmayın.`;
}

function footer(to: string): string {
    return `Bu e-posta ${to} adresli Luera TimeFlow hesabınızın aboneliğiyle ilgili olduğu için gönderildi. Sorularınız için bu e-postayı yanıtlayın ya da ${MAIL_REPLY_TO} adresine yazın.`;
}

export function mailContent(tur: MailKind, ctx: MailContext): MailContent {
    const b = body(tur, ctx);
    const notes = ctx.magic ? [magicNote()] : [];
    return {
        subject: b.subject,
        preheader: b.preheader,
        html: renderHtml(b, ctx, notes),
        text: renderText(b, ctx, notes),
    };
}

// ── Görünüm ─────────────────────────────────────────────────────────────────
// scripts/eposta-sablonlari.mjs ile aynı aile: renkler, yazı, logo, 480 px
// kart, 20 px köşe. Düğme mürekkep zemin + krem yazı — turuncu zeminde beyaz
// yazının kontrastı 3:1, okunur sayılmaz.

/**
 * Tam marka: "luera" + turuncu "timeflow" hapı (kullanıcı, 2026-10-21) —
 * resim, çünkü e-posta programları sitenin yazı tipini güvenilir yüklemez.
 * Üretimi: node scripts/eposta-logo.mjs (437×89, 3×; e-postada 146×30).
 * Resim ENGELLENİNCE (Outlook varsayılanı) yerine biçimli alt metin çıkar:
 * kalın "Luera TimeFlow" 146 px'e sığar — eski 44 px'lik ikon kutusunda alt
 * metin taşıyordu (ekran görüntüsü, 2026-10-21).
 */
const LOGO = 'https://timeflow.lueratech.com/eposta/logo-timeflow.png';
const RENK = {
    zemin: '#F3EDE3', kart: '#FFFFFF', cizgi: '#ECE4D6', murekkep: '#0E0E0E',
    metin: '#4F4840', soluk: '#8C8478', turuncu: '#FF5A1F', krem: '#F3EDE3', kutu: '#FAF6EF',
};
const YAZI = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Gmail e-posta adreslerini ve alan adlarını kendiliğinden mavi bağlantıya
 * çeviriyor (eposta-sablonlari.mjs dersi). Metinde geçen bilinen adresler
 * kendi biçimimizle <a> içine alınır. Girdi ÖNCEDEN kaçırılmış olmalı.
 */
function linkify(escaped: string, color: string = RENK.murekkep): string {
    const a = (href: string, label: string) =>
        `<a href="${href}" style="color:${color};text-decoration:none;font-weight:600;">${label}</a>`;
    return escaped
        .replace(/info@lueratech\.com/g, a('mailto:info@lueratech.com', 'info@lueratech.com'))
        .replace(/(^|[^/@.])timeflow\.lueratech\.com/g, (_m: string, pre: string) => `${pre}${a('https://timeflow.lueratech.com/login', 'timeflow.lueratech.com')}`);
}

function para(text: string, size = 15, color = RENK.metin, margin = '0 0 14px 0'): string {
    return `<p style="margin:${margin};font-size:${size}px;line-height:${size === 15 ? 24 : 20}px;color:${color};">${linkify(escapeHtml(text))}</p>`;
}

function renderHtml(b: Body, ctx: MailContext, notes: string[]): string {
    const to = escapeHtml(ctx.to);
    const toLink = `<a href="mailto:${to}" style="color:${RENK.soluk};text-decoration:none;">${to}</a>`;
    // Adres kullanıcı verisi: yer tutucuyla kaçırılıp en son kendi <a>sı konur.
    const foot = linkify(escapeHtml(footer('{{adres}}')), RENK.turuncu).replace('{{adres}}', toLink);
    const info = b.info
        ? `<tr>
          <td style="padding:6px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${RENK.kutu};border:1px solid ${RENK.cizgi};border-radius:14px;">
              <tr>
                <td style="padding:14px 18px;font-family:${YAZI};">
                  <div style="font-size:12px;line-height:18px;color:${RENK.soluk};font-weight:600;">${escapeHtml(b.info.label)}</div>
                  <div style="font-size:17px;line-height:24px;color:${RENK.murekkep};font-weight:700;">${escapeHtml(b.info.value)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
        : '';
    const after = (b.after ?? []).length
        ? `<tr>
          <td style="padding:${b.info ? '18px' : '0'} 32px 0 32px;font-family:${YAZI};">
            ${(b.after ?? []).map((t) => para(t)).join('\n            ')}
          </td>
        </tr>`
        : '';
    const href = escapeHtml(ctx.link);
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(b.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${RENK.zemin};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(b.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${RENK.zemin};">
  <tr>
    <td align="center" style="padding:40px 16px 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${RENK.kart};border:1px solid ${RENK.cizgi};border-radius:20px;">
        <tr>
          <td style="padding:32px 32px 0 32px;"><img src="${LOGO}" width="146" height="30" alt="Luera TimeFlow" style="display:block;width:146px;height:30px;border:0;font-family:${YAZI};font-size:16px;line-height:30px;font-weight:700;color:${RENK.murekkep};"></td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0 32px;font-family:${YAZI};">
            <h1 style="margin:0 0 12px 0;font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.4px;color:${RENK.murekkep};">${escapeHtml(b.heading)}</h1>
            ${b.paras.map((t) => para(t)).join('\n            ')}
          </td>
        </tr>
        ${info}
        ${after}
        <tr>
          <td style="padding:${b.after?.length ? '8px' : '10px'} 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${RENK.murekkep}" style="background:${RENK.murekkep};border-radius:12px;">
                  <a href="${href}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${YAZI};font-size:15px;line-height:20px;font-weight:700;color:${RENK.krem};text-decoration:none;border-radius:12px;">${escapeHtml(b.button)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;"><div style="height:1px;line-height:1px;font-size:1px;background:${RENK.cizgi};">&nbsp;</div></td>
        </tr>
        <tr>
          <td style="padding:20px 32px 32px 32px;font-family:${YAZI};">
            ${notes.map((t) => para(t, 13, RENK.soluk, '0 0 8px 0')).join('\n            ')}
            <p style="margin:0;font-size:13px;line-height:20px;color:${RENK.soluk};">${foot}</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding:20px 24px 0 24px;font-family:${YAZI};font-size:12px;line-height:19px;color:${RENK.soluk};">
            Luera TimeFlow · Randevu takip ve gün yönetimi
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

function renderText(b: Body, ctx: MailContext, notes: string[]): string {
    const lines = [
        b.heading,
        '',
        ...b.paras.flatMap((p) => [p, '']),
        ...(b.info ? [`${b.info.label}: ${b.info.value}`, ''] : []),
        ...(b.after ?? []).flatMap((p) => [p, '']),
        `${b.button}: ${ctx.link}`,
        '',
        ...notes.flatMap((n) => [n, '']),
        '—',
        footer(ctx.to),
        'Luera TimeFlow · Randevu takip ve gün yönetimi',
    ];
    return lines.join('\n');
}

/**
 * WhatsApp Sekreter v2 · P1 — zamanlayıcı (göç 131, wa-scheduler).
 *
 * Planın saat hesabı veritabanında (PGlite ile ayrıca sınandı); burada
 * gönderim anının kararları, puan okuma, şablonlar ve eski akışın bu
 * işletmelerde gerçekten susması sınanır.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    istanbulMinute, istanbulMs, nextIstanbulHour, nudgeDueMs, sendDecision, todayIstanbul,
} from '../supabase/functions/_shared/scheduler/timing.ts';
import { isUnhappy, parseRating, shouldSendReviewLink } from '../supabase/functions/_shared/scheduler/feedback.ts';
import { relativeDayLabel, timeLocative, timeLocativeKi } from '../supabase/functions/_shared/booking/tr.ts';
import * as MSG from '../supabase/functions/_shared/booking/messages.ts';
import { buildRebookInvite, buildRebookMessage } from '../src/services/waTemplates.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const at = (date, time) => istanbulMs(date, time);
const H = 3600_000;

// ── Saat ────────────────────────────────────────────────────────────────────

test('istanbul saati: UTC+3, sıradaki saat bugün geçtiyse yarın', () => {
    assert.equal(istanbulMinute(Date.parse('2026-10-29T00:15:00Z')), 3 * 60 + 15);
    assert.equal(nextIstanbulHour(at('2026-10-29', '03:00'), 9), at('2026-10-29', '09:00'));
    assert.equal(nextIstanbulHour(at('2026-10-29', '22:00'), 9), at('2026-10-30', '09:00'));
    // UTC'de hâlâ dün, İstanbul'da bugün.
    assert.equal(todayIstanbul(Date.parse('2026-10-29T22:30:00Z')), '2026-10-30');
});

test('24 saat: gece zamanı gelen sabaha kayar, randevuya 3 saatten az kaldıysa gitmez', () => {
    const start = at('2026-10-29', '13:00');
    assert.deepEqual(sendDecision('reminder_24h', at('2026-10-28', '15:00'), start, start), { action: 'send' });
    assert.deepEqual(sendDecision('reminder_24h', at('2026-10-29', '03:09'), start, start),
        { action: 'postpone', dueMs: at('2026-10-29', '09:00') });
    assert.deepEqual(sendDecision('reminder_24h', at('2026-10-29', '10:30'), start, start), { action: 'skip', reason: 'too_late' });
    // 11:00 randevusu: gece 03'te sabaha kayarsa 09:00 > 08:00 son an → hiç gitmez.
    const early = at('2026-10-29', '11:00');
    assert.deepEqual(sendDecision('reminder_24h', at('2026-10-29', '03:00'), early, early),
        { action: 'skip', reason: 'quiet_until_deadline' });
});

test('2 saat: 07:00 öncesi gitmez (08:00 randevusuna 06:00 mesajı yok)', () => {
    const start = at('2026-10-30', '08:00');
    assert.deepEqual(sendDecision('reminder_2h', at('2026-10-30', '06:00'), start, start),
        { action: 'postpone', dueMs: at('2026-10-30', '07:00') });
    const veryEarly = at('2026-10-30', '07:15');
    assert.deepEqual(sendDecision('reminder_2h', at('2026-10-30', '05:15'), veryEarly, veryEarly),
        { action: 'skip', reason: 'quiet_until_deadline' });
    assert.deepEqual(sendDecision('reminder_2h', at('2026-10-30', '10:00'), at('2026-10-30', '12:00'), 0), { action: 'send' });
});

test('memnuniyet: gece 22:00 bitişi ertesi sabaha; bekleme listesi teklifi randevudan 1 saat öncesine kadar', () => {
    const end = at('2026-10-30', '21:30');
    assert.deepEqual(sendDecision('satisfaction', at('2026-10-30', '22:00'), end, end),
        { action: 'postpone', dueMs: at('2026-10-31', '09:00') });
    const start = at('2026-10-31', '12:00');
    assert.deepEqual(sendDecision('slot_offer', at('2026-10-31', '10:00'), start, start), { action: 'send' });
    assert.deepEqual(sendDecision('slot_offer', at('2026-10-31', '11:30'), start, start), { action: 'skip', reason: 'too_late' });
});

test('dürtme: 4 saat sonra; gece ya da randevuya 3 saatten az kalırsa yok', () => {
    const start = at('2026-10-31', '12:00');
    assert.equal(nudgeDueMs(at('2026-10-30', '12:00'), start), at('2026-10-30', '16:00'));
    assert.equal(nudgeDueMs(at('2026-10-30', '18:00'), start), null);
    assert.equal(nudgeDueMs(at('2026-10-31', '04:00'), start), null);
    assert.equal(nudgeDueMs(at('2026-10-31', '06:00'), start), null);
    assert.ok(nudgeDueMs(at('2026-10-30', '09:00'), start) - at('2026-10-30', '09:00') === 4 * H);
});

// ── Puan ────────────────────────────────────────────────────────────────────

test('puan: rakam, yıldız, yazı ve kelime cevapları', () => {
    const cases = {
        '5': 5, '4/5 güzeldi': 4, '3, biraz bekledim': 3, '⭐⭐⭐⭐': 4, 'beş': 5, 'bence 4': 4,
        'harikaydı': 5, 'Teşekkürler': 4, 'iyi değil': 2, 'hiç memnun değilim': 1, 'fena değil': 4,
        'memnun kalmadım': 2, 'idare eder': 3,
    };
    for (const [t, r] of Object.entries(cases)) assert.equal(parseRating(t)?.rating, r, t);
    assert.equal(parseRating('3, biraz bekledim').comment, 'biraz bekledim');
    assert.equal(parseRating('5').comment, null);
});

test('puan sanılmaması gerekenler bota gider', () => {
    for (const t of ['10', '15 dakika bekledim', 'saat 5te gelebilir miyim', "5'te gelebilir miyim",
        'Bir sorum var', 'yarın için yer var mı, çok memnun kaldım', 'randevu almak istiyorum', 'Merhaba', '17:30 olur mu']) {
        assert.equal(parseRating(t), null, t);
    }
});

test('Google linki: varsayılan herkese, "happy" seçilirse yalnız 4–5; 3 ve altı işletmeye bildirilir', () => {
    assert.equal(shouldSendReviewLink(2, undefined, true), true);
    assert.equal(shouldSendReviewLink(2, 'all', true), true);
    assert.equal(shouldSendReviewLink(2, 'happy', true), false);
    assert.equal(shouldSendReviewLink(5, 'happy', true), true);
    assert.equal(shouldSendReviewLink(5, 'all', false), false);
    assert.equal(isUnhappy(3), true);
    assert.equal(isUnhappy(4), false);
});

// ── Türkçe ekler ────────────────────────────────────────────────────────────

test('saat eki: de/da/te/ta ve deki', () => {
    const cases = { '12:00': "'de", '12:30': "'da", '13:00': "'te", '10:40': "'ta", '09:15': "'te", '16:00': "'da" };
    for (const [t, ek] of Object.entries(cases)) assert.equal(timeLocative(t), ek, t);
    assert.equal(timeLocativeKi('12:00'), "'deki");
    assert.equal(relativeDayLabel('2026-10-30', '2026-10-29'), 'Yarın');
});

// ── Şablonlar ───────────────────────────────────────────────────────────────

const CTX = { comms: { ...MSG.NEUTRAL_COMMS, serviceWord: 'bakım', emoji: '✨' }, businessName: 'Test Salon 2', firstName: 'Nisanur' };

test('24 saat hatırlatması: etiketli satırlar, soru yalnız asistan açıkken, konum sonda', () => {
    const withAsk = MSG.reminder24h(CTX, {
        service: 'ağda', dateLabel: 'Yarın, 30 Ekim Cuma', time: '12:00', mapsUrl: 'https://maps.example/x', askConfirm: true,
    });
    assert.equal(withAsk,
        'Merhaba Nisanur 👋\n*Test Salon 2* olarak randevunuzu hatırlatmak istedik.\n\n'
        + '*Bakım:* ağda\n*Tarih:* Yarın, 30 Ekim Cuma\n*Saat:* 12:00\n\n'
        + 'Gelebilecek misiniz? *Evet* ya da *Hayır* yazmanız yeterli.\n\n📍 Konum: https://maps.example/x');
    const noAsk = MSG.reminder24h(CTX, { service: 'ağda', dateLabel: 'Yarın', time: '12:00', askConfirm: false });
    assert.doesNotMatch(noAsk, /Gelebilecek misiniz|Konum/);
});

test('2 saat, dürtme ve memnuniyet metinleri', () => {
    assert.equal(MSG.reminder2h(CTX, { service: 'ağda', time: '12:00' }),
        'Merhaba Nisanur 👋\nRandevunuza 2 saat kaldı.\n\n*Bakım:* ağda\n*Saat:* 12:00\n\nGörüşmek üzere. ✨');
    assert.equal(MSG.attendanceNudge(CTX, { when: "yarın *12:00*'deki" }),
        "Merhaba Nisanur, yarın *12:00*'deki randevunuz için gelebilecek misiniz? *Evet* ya da *Hayır* yazmanız yeterli.");
    assert.match(MSG.satisfactionAsk(CTX, { sameDay: true }), /^Merhaba Nisanur ✨\nBugünkü ziyaretiniz için teşekkür ederiz\.\n\nMemnun kaldınız mı\? 1 ile 5 arasında/);
    assert.match(MSG.satisfactionAsk(CTX, { sameDay: false }), /\nDünkü ziyaretiniz/);
});

test('memnuniyet cevabı ve bekleme listesi teklifi metinleri', () => {
    assert.match(MSG.feedbackHappy(CTX, { reviewUrl: 'https://g.page/r/x' }), /Google'da paylaşırsanız[\s\S]*👉 https:\/\/g\.page\/r\/x$/);
    assert.doesNotMatch(MSG.feedbackHappy(CTX, { reviewUrl: null }), /Google/);
    assert.match(MSG.feedbackUnhappy(CTX, { reviewUrl: 'https://g.page/r/x' }), /ekibimiz sizinle iletişime geçecek\.\n\nDilerseniz/);
    assert.equal(MSG.slotOffer(CTX, { service: 'ağda', dateLabel: '31 Ekim Cumartesi', time: '12:00', minutes: 30 }),
        'Merhaba Nisanur 👋\nBeklediğiniz randevu için yer açıldı:\n\n*Bakım:* ağda\n*Tarih:* 31 Ekim Cumartesi\n*Saat:* 12:00\n\n'
        + 'İster misiniz? *Evet* yazarsanız sizin adınıza ayırıyorum. Teklif 30 dakika geçerli.');
});

// ── Kaynak denetimleri ──────────────────────────────────────────────────────

test('eski akış zamanlayıcı açık işletmede susar (çift hatırlatma yok)', () => {
    const remind = read('supabase/functions/remind/index.ts');
    assert.match(remind, /const schedulerOn = featureOn\(orgWa as OrgWa, 'scheduler_v2', false\);/);
    assert.match(remind, /const \{ data: list24h \} = !sendableHour \|\| schedulerOn \? \{ data: \[\] \}/);
    assert.match(remind, /const \{ data: list2h \} = schedulerOn \? \{ data: \[\] \}/);
    assert.match(remind, /if \(!schedulerOn && featureOn\(orgWa, 'review'\)/);
    const waitlist = read('supabase/functions/notify-waitlist/index.ts');
    assert.match(waitlist, /if \(featureOn\(orgWa, 'scheduler_v2', false\)\) \{\s*return json\(\{ notified: 0/);
});

test('cevap işleyicisi bottan ve asistan anahtarından önce', () => {
    const src = read('supabase/functions/whatsapp-booking/index.ts');
    const handler = src.indexOf('handleScheduledReply(admin, {');
    const assistant = src.indexOf("if (!featureOn(orgWa, 'assistant', false)) return ok({ skipped: 'assistant_off' });");
    const access = src.indexOf("if (!access.ok) return ok({ skipped: 'no_subscription' });");
    assert.ok(access > 0 && handler > access && assistant > handler);
    assert.match(src, /if \(msgKind === 'text' && featureOn\(orgWa, 'scheduler_v2', false\)\) \{/);
});

test('hatırlatmaya Evet/Hayır: kod okur, yalnız son giden mesaj hatırlatmaysa ve asistan açıkken', () => {
    const src = read('supabase/functions/_shared/scheduler/replies.ts');
    // Sıra: teklif → hatırlatma → memnuniyet.
    const offer = src.indexOf('(await handleOfferReply(admin, o, phone))');
    const reminder = src.indexOf('?? (await handleReminderReply(admin, o, phone))');
    const feedback = src.indexOf('?? (await handleFeedbackReply(admin, o, phone))');
    assert.ok(offer > 0 && reminder > offer && feedback > reminder);
    const fn = src.slice(src.indexOf('async function handleReminderReply'), src.indexOf('// ── Memnuniyet'));
    assert.match(fn, /if \(!o\.assistantOn\) return null;/);
    assert.match(fn, /\.eq\('direction', 'out'\)\.eq\('status', 'sent'\)/);
    assert.match(fn, /REMINDER_REPLY_KINDS\.includes\(String\(last\.kind\)\)/);
    assert.match(fn, /\.is\('customer_confirm', null\)/);
    assert.match(fn, /\.update\(\{ status: 'cancelled', customer_confirm: 'no', customer_confirm_at: at \}\)/);
    assert.match(src, /REMINDER_REPLY_KINDS = \['reminder_24h', 'nudge', 'reminder_2h'\]/);
    const booking = read('supabase/functions/whatsapp-booking/index.ts');
    assert.match(booking, /assistantOn: featureOn\(orgWa, 'assistant', false\),/);
    const ctx = { comms: MSG.NEUTRAL_COMMS, businessName: 'Test Salon 2', firstName: 'Nisa' };
    assert.match(MSG.reminderConfirmed(ctx, { dateLabel: '31 Ekim Cumartesi', time: '10:00' }), /saat 10:00'da bekliyoruz/);
    assert.match(MSG.reminderConfirmed(ctx, { dateLabel: '31 Ekim Cumartesi', time: '12:00' }), /saat 12:00'de bekliyoruz/);
});

// ── Sıradaki randevu daveti (132) ────────────────────────────────────────────

test('davet: akşam kapanan hesabın daveti ertesi sabah 10:00\'a, iki günden eski ziyarete gitmez', () => {
    const s = at('2026-10-29', '19:00'); const e = at('2026-10-29', '20:00');
    assert.deepEqual(sendDecision('rebook', at('2026-10-29', '15:00'), s, e), { action: 'send' });
    assert.deepEqual(sendDecision('rebook', at('2026-10-29', '21:30'), s, e), { action: 'postpone', dueMs: at('2026-10-30', '10:00') });
    assert.deepEqual(sendDecision('rebook', at('2026-10-30', '09:15'), s, e), { action: 'postpone', dueMs: at('2026-10-30', '10:00') });
    assert.equal(sendDecision('rebook', e + 49 * H, s, e).action, 'skip');
});

test('davet metni: teşekkür tekrarı ve işletme adı eki yok; önizleme sunucuyla aynı', () => {
    const server = MSG.rebookInvite(CTX, { service: 'cilt bakımı', note: '%10 erken rezervasyon', bookingUrl: 'https://x/book/s' });
    assert.equal(server, 'Merhaba Nisanur 👋\nBir sonraki *cilt bakımı* randevunuzu şimdiden ayırtmak ister misiniz?\n\n'
        + 'Uygun gününüzü yazmanız ya da bağlantıdan seçmeniz yeterli.\n\n🎁 %10 erken rezervasyon\n\n👉 https://x/book/s');
    assert.doesNotMatch(server, /teşekkür|Test Salon 2/);
    assert.equal(buildRebookInvite({ customerName: 'Nisanur', service: 'cilt bakımı', note: '%10 erken rezervasyon', bookingUrl: 'https://x/book/s' }), server);
    assert.equal(MSG.rebookInvite({ ...CTX, firstName: null }, { service: 'ağda' }),
        buildRebookInvite({ customerName: '', service: 'ağda' }));
    // Eski (bayrak kapalı) davette elle yazılmış "'daki" eki gitti.
    assert.doesNotMatch(buildRebookMessage({ customerName: 'A', service: 'ağda', businessName: 'Test Salon 2' }), /\*'d[ae]ki/);
});

test('davet: zamanlayıcı açıkken kasada gitmez; gönderirken kapanış, ileri randevu ve memnuniyet sorulur', () => {
    const client = read('src/hooks/useReservations.ts');
    assert.match(client, /if \(waErr \|\| \(wa\?\.features as Record<string, unknown> \| null\)\?\.scheduler_v2 === true\) return;/);
    const src = read('supabase/functions/wa-scheduler/index.ts');
    const fn = src.slice(src.indexOf('async function runRebook'), src.indexOf('// ── Boşalan saat'));
    assert.match(src, /if \(r\.status !== 'completed' \|\| !r\.is_paid\) \{ await setJob\(admin, job, 'cancelled', 'kapanış geri alındı'\)/);
    assert.match(fn, /if \(!org\.rebook\.enabled\)/);
    assert.match(fn, /if \(r\.rebook_sent\)/);
    assert.match(fn, /isUnhappy\(fb\.rating\)/);
    assert.match(fn, /'ileri randevusu var'/);
    assert.match(fn, /update\(\{ rebook_sent: true \}\)/);
    // Ayar sahibin satırından okunur (settings kullanıcı başına).
    assert.match(src, /\.eq\('user_id', ownerId\)/);
});

test('göç 132: kapanış (tamamlandı + ödendi) erken çıkıştan önce yakalanır, 1,5 saat sonra', () => {
    const sql = read('supabase/132_wa_davet.sql');
    const rebook = sql.indexOf("'rebook', now() + interval '90 minutes'");
    const early = sql.indexOf('RETURN NEW; -- not, ödeme, hatırlatma bayrağı');
    assert.ok(rebook > 0 && early > rebook, 'davet planı erken çıkıştan sonra kalırsa yalnız ödeme gelen kapanış kaçar');
    assert.match(sql, /NOT \(OLD\.status = 'completed' AND COALESCE\(OLD\.is_paid, false\)\)/);
    assert.match(sql, /AND NOT COALESCE\(NEW\.rebook_sent, false\)/);
    assert.match(sql, /CHECK \(kind IN \('reminder_24h', 'reminder_2h', 'nudge', 'satisfaction', 'slot_offer', 'rebook'\)\)/);
    assert.match(sql, /RAISE WARNING 'wa_plan_jobs rebook: %'/);
});

test('wa-scheduler: yalnız zamanlayıcı çağırır, bayat işi göndermez, tek gönderim kapısı', () => {
    const src = read('supabase/functions/wa-scheduler/index.ts');
    assert.match(src, /caller\.kind !== 'cron' && caller\.kind !== 'service'/);
    assert.match(src, /admin\.rpc\('wa_claim_jobs'/);
    assert.match(src, /job\.stamp !== `\$\{r\.date\} \$\{hhmm\(r\.start_time\)\}`/);
    assert.doesNotMatch(src, /message\/sendText/);
    // Memnuniyet "Google değerlendirme" anahtarına bağlı; abonelik bitince susulur.
    assert.match(src, /if \(!featureOn\(org\.orgWa, 'review'\)\)/);
    assert.match(src, /if \(!org\.accessOk\)/);
});

test('göç 131: tetikleyici randevu yazımını engellemez, tablolar kapalı, tek bekleyen iş', () => {
    const sql = read('supabase/131_wa_zamanlayici.sql');
    assert.match(sql, /EXCEPTION WHEN OTHERS THEN[\s\S]{0,120}RAISE WARNING 'wa_plan_jobs: %'/);
    for (const t of ['wa_jobs', 'wa_feedback', 'wa_waitlist_offers']) {
        assert.match(sql, new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`), t);
    }
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_jobs_pending[\s\S]*WHERE status = 'pending'/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.wa_claim_jobs\(INTEGER\)\s+FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /COALESCE\(\(features->>'scheduler_v2'\)::boolean, false\)/);
    // Yalnız SELECT politikası (memnuniyet listesi ekranı için), yazma yok.
    assert.match(sql, /CREATE POLICY wa_feedback_org_read ON public\.wa_feedback\s+FOR SELECT/);
    assert.doesNotMatch(sql, /CREATE POLICY[^;]*ON public\.wa_jobs/);
});

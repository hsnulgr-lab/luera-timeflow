/**
 * Tek ses (2026-11-07): asistanın konuşması ile işletmenin kendiliğinden
 * gönderdiği mesajlar (onay, hatırlatma, davetler, sıra, bekleme listesi)
 * aynı dosyadan, aynı kurallarla çıkar: Hanım/Bey hitabı, mesaj başına en çok
 * bir emoji (sektörün), künye *Hizmet:* etiketli, "siz".
 *
 * Panelin önizlemesi (src/services/waTemplates.ts) sunucunun fonksiyonunu
 * çağırır; burada ikisinin aynı metni verdiği kilitlenir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as M from '../supabase/functions/_shared/booking/messages.ts';
import { bookingDateLabel } from '../supabase/functions/_shared/booking/tr.ts';
import * as T from '../src/services/waTemplates.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const COMMS = { ...M.NEUTRAL_COMMS, persona: 'x', serviceWord: 'bakım', emoji: '✨', recall: { concept: 'dip boyası', afterDays: 45 } };
const CTX = { comms: COMMS, businessName: 'Test Salon 2', firstName: 'Nisa Hanım' };

const EMOJI = /\p{Extended_Pictographic}/gu;
const emojiCount = (s) => (s.match(EMOJI) ?? []).length;

test('onay: selam + işletme + künye; uzman ve konum isteğe bağlı', () => {
    const text = M.bookingConfirmation(CTX, {
        items: [{ service: 'Cilt bakımı', dateLabel: 'Yarın, 8 Kasım Cumartesi', time: '10:00', staff: 'Zeynep' }],
        mapsUrl: 'https://maps.example/x',
    });
    assert.equal(text,
        'Merhaba Nisa Hanım ✨\n*Test Salon 2* olarak randevunuzu oluşturduk.\n\n'
        + '*Hizmet:* Cilt bakımı\n*Tarih:* Yarın, 8 Kasım Cumartesi\n*Saat:* 10:00\n*Uzman:* Zeynep\n\n'
        + 'Sizi bekliyoruz. Değişiklik gerekirse bu mesaja yazmanız yeterli.\n\n*Konum:* https://maps.example/x');
});

test('onay: çoklu hizmet tek mesaj; onay bekleyen randevu "talep" der', () => {
    const text = M.bookingConfirmation({ ...CTX, firstName: null }, {
        items: [
            { service: 'Ağda', dateLabel: '2 Aralık Salı', time: '10:00' },
            { service: 'Manikür', dateLabel: '2 Aralık Salı', time: '11:00' },
        ],
        pending: true,
        manageUrl: 'https://x/booking/abc',
    });
    assert.match(text, /^Merhaba ✨\n\*Test Salon 2\* olarak randevu taleplerinizi aldık\./);
    assert.match(text, /\*Hizmet:\* Ağda[\s\S]*\*Hizmet:\* Manikür/);
    assert.match(text, /Onaylanınca size haber vereceğiz\.\n\nİptal veya değişiklik için:\nhttps:\/\/x\/booking\/abc$/);
});

test('her duyuru en çok bir emoji taşır, eski süsler yok', () => {
    const texts = [
        M.bookingConfirmation(CTX, { items: [{ service: 'A', dateLabel: 'Yarın', time: '10:00' }], mapsUrl: 'https://m' }),
        M.reviewInvite(CTX, { reviewUrl: 'https://g.page/r/x' }),
        M.recallInvite(CTX),
        M.winback(CTX) + M.discountLine({ percent: 10, code: 'ABC234', until: '30 Kasım' }),
        M.renewalInvite(CTX, { packageTitle: '10 Seans Lazer' }),
        M.queueJoined(CTX, { position: 3, etaMin: 40 }),
        M.queueReady(CTX),
        M.waitlistOpening(CTX, { bookingUrl: 'https://x/book/s' }),
        M.reminder24h(CTX, { service: 'A', dateLabel: 'Yarın', time: '10:00', askConfirm: true, mapsUrl: 'https://m' }),
        M.reminder2h(CTX, { service: 'A', time: '10:00' }),
    ];
    for (const t of texts) {
        assert.ok(emojiCount(t) <= 1, t);
        assert.doesNotMatch(t, /👋|🙏|👉|🎁|📍|🎉|✅|⏳|💠|🕐|📅|👤/, t);
        assert.doesNotMatch(t, /\bsen\b|randevunu oluştur|kayd[ıi]n[ıi]z/i, t);
        assert.match(t, /^Merhaba Nisa Hanım ✨\n/, t);
    }
});

test('paket yenileme: müşteriye "emeğinize sağlık" denmez', () => {
    const t = M.renewalInvite(CTX, { packageTitle: '10 Seans Lazer' });
    assert.doesNotMatch(t, /emeğinize sağlık/i);
    assert.match(t, /\*10 Seans Lazer\* paketinizdeki bütün seansları tamamladınız\./);
});

test('dönüş daveti sektörün kavramını kullanır; indirim satırı süreli/süresiz', () => {
    assert.match(M.recallInvite(CTX), /\*dip boyası\* zamanınız geldi/);
    assert.equal(M.discountLine({ percent: 15, code: 'K7M2PQ', until: null }),
        '\n\n*Size özel %15 indirim*\nKod: *K7M2PQ*\nRandevunuzda bu kodu söylemeniz yeterli.');
    assert.match(M.discountLine({ percent: 15, code: 'K7M2PQ', until: '30 Kasım' }), /\(30 Kasım tarihine kadar\)/);
});

test('künye tarihi: bugün/yarın önekli, ötesi yalnız tarih', () => {
    assert.equal(bookingDateLabel('2026-11-08', '2026-11-07'), 'Yarın, 8 Kasım Pazar');
    assert.equal(bookingDateLabel('2026-11-07', '2026-11-07'), 'Bugün, 7 Kasım Cumartesi');
    assert.equal(bookingDateLabel('2026-11-20', '2026-11-07'), '20 Kasım Cuma');
});

test('panel önizlemesi = sunucunun metni (Hanım/Bey dahil)', () => {
    const p = { customerName: 'Ayşe Demir', businessName: 'Test Salon 2', comms: COMMS };
    const ctx = { comms: COMMS, businessName: 'Test Salon 2', firstName: 'Ayşe Hanım' };
    assert.equal(T.buildReviewMessage({ ...p, reviewUrl: 'https://g' }), M.reviewInvite(ctx, { reviewUrl: 'https://g' }));
    assert.equal(T.buildRecallMessage(p), M.recallInvite(ctx));
    assert.equal(T.buildWinbackMessage(p), M.winback(ctx));
    assert.equal(T.buildRenewalMessage({ ...p, packageTitle: 'P' }), M.renewalInvite(ctx, { packageTitle: 'P' }));
    assert.equal(T.build2hMessage({ ...p, startTime: '10:00', service: 'A' }), M.reminder2h(ctx, { service: 'A', time: '10:00' }));
    assert.match(T.build24hMessage({ ...p, startTime: '10:00', service: 'A', askConfirm: true }), /^Merhaba Ayşe Hanım ✨[\s\S]*\*Tarih:\* Yarın, [\s\S]*Gelebilecek misiniz\?/);
    assert.doesNotMatch(T.build24hMessage({ ...p, startTime: '10:00', service: 'A' }), /Gelebilecek/);
    assert.match(T.buildConfirmationMessage({ ...p, date: '2026-12-02', startTime: '10:00', service: 'A', staffName: 'Zeynep' }),
        /^Merhaba Ayşe Hanım ✨\n\*Test Salon 2\* olarak randevunuzu oluşturduk\.\n\n\*Hizmet:\* A\n\*Tarih:\* 2 Aralık Çarşamba\n\*Saat:\* 10:00\n\*Uzman:\* Zeynep/);
    // Ad yer tutucuysa ad yok; unisex ad unvansız.
    assert.match(T.buildQueueReadyMessage({ customerName: 'Geçici Müşteri', businessName: 'X', comms: COMMS }), /^Merhaba ✨\n/);
    assert.match(T.buildQueueReadyMessage({ customerName: 'Deniz', businessName: 'X', comms: COMMS }), /^Merhaba Deniz ✨\n/);
});

test('gönderen uçlar ortak şablonu çağırır, kendi metnini yazmaz', () => {
    const remind = read('supabase/functions/remind/index.ts');
    for (const fn of ['M.reminder24h(', 'M.reminder2h(', 'M.recallInvite(', 'M.reviewInvite(', 'M.winback(', 'M.renewalInvite(']) {
        assert.ok(remind.includes(fn), fn);
    }
    assert.doesNotMatch(remind, /Merhaba \$\{/);
    const pub = read('supabase/functions/public-booking/index.ts');
    assert.match(pub, /M\.bookingConfirmation\(/);
    assert.doesNotMatch(pub, /Merhaba \$\{|💼|🗓️|⏰/);
    const wl = read('supabase/functions/notify-waitlist/index.ts');
    assert.match(wl, /M\.waitlistOpening\(/);
    assert.doesNotMatch(wl, /Merhaba \$\{/);
    const tpl = read('src/services/waTemplates.ts');
    assert.doesNotMatch(tpl, /Merhaba \$\{|👋/);
});

test('panelden iptal: tek ses şablonu, kota dışı, Geri Al süresi dolunca gider', () => {
    const t = M.cancelledByBusiness(CTX, { service: 'ağda', dateLabel: 'Yarın, 8 Kasım Pazar', time: '17:00' });
    assert.equal(t, 'Merhaba Nisa Hanım ✨\n*Test Salon 2* olarak randevunuzu iptal ettik.\n\n'
        + '*Hizmet:* ağda\n*Tarih:* Yarın, 8 Kasım Pazar\n*Saat:* 17:00\n\nYeni bir randevu için bu mesaja yazmanız yeterli.');
    assert.match(read('supabase/functions/_shared/wa.ts'), /'feedback', 'cancellation', 'reschedule'\]\);/);
    const modal = read('src/components/reservations/AdisyonModal.tsx');
    assert.match(modal, /useState\(true\);\n    const canNotify/);
    assert.match(modal, /if \(undone\) return;/);
    assert.match(modal, /sendWhatsApp\(r\.customerPhone, text, 'cancellation'/);
    assert.doesNotMatch(modal, /yakında, otomatik mesaj/);
});

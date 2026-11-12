/**
 * Telefon uygulaması · WhatsApp metinleri masaüstüyle TEK SES (1.0.2, 2026-11-09).
 *
 * Telefon `mobile/` dışını paketleyemediği için sunucunun kalıpları
 * `mobile/src/lib/waShared/` altında BİREBİR kopya. Burada:
 *   1. kopyalar kaynakla bayt bayt aynı (kaynak değişip kopya kalırsa kırılır;
 *      düzeltmek: node mobile/scripts/sync-wa-shared.mjs),
 *   2. telefonun tarih etiketi (Intl'siz) sunucununkiyle aynı,
 *   3. telefonun onay ve iptal metni sunucunun/masaüstünün ürettiğiyle aynı.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as S from '../supabase/functions/_shared/booking/messages.ts';
import { greetingName } from '../supabase/functions/_shared/booking/identity.ts';
import { bookingDateLabel } from '../supabase/functions/_shared/booking/tr.ts';
import { waCancellation, waConfirmation, waDateLabel } from '../mobile/src/lib/waText.ts';
import { confirmationText } from '../mobile/src/lib/createLive.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('waShared: beş dosya sunucudakiyle bayt bayt aynı', () => {
    for (const f of ['messages', 'tr', 'slots', 'identity', 'hitap']) {
        assert.equal(read(`mobile/src/lib/waShared/${f}.ts`), read(`supabase/functions/_shared/booking/${f}.ts`),
            `${f}.ts kopyası eski — node mobile/scripts/sync-wa-shared.mjs`);
    }
});

test('tarih etiketi: telefonun takvimi sunucunun Intl çıktısıyla aynı (400 gün)', () => {
    const today = '2026-11-09';
    const d0 = Date.parse(`${today}T00:00:00Z`);
    for (let i = -3; i < 400; i++) {
        const iso = new Date(d0 + i * 86_400_000).toISOString().slice(0, 10);
        assert.equal(waDateLabel(iso, today), bookingDateLabel(iso, today), iso);
    }
});

const KUAFOR = { persona: 'x', audience: 'müşterimiz', servicePhrase: 'işleminizi', emoji: '💇', sector: 'kuafor' };

test('onay: telefon = sunucu (hitap, sektör tonu, uzman, hazırlık, konum)', () => {
    const cases = [
        { customerName: 'Zeynep Kaya', dateISO: '2026-11-10', startTime: '10:30:00', service: 'Saç boyama', businessName: 'Luera Kuaför',
            staffName: 'Merve', mapsUrl: 'https://maps.example/x', comms: KUAFOR, prepNote: 'Saçınızı yıkamadan gelin.' },
        { customerName: 'Geçici', dateISO: '2026-11-09', startTime: '17:00', service: 'Kaş', businessName: 'Test Salon 2', comms: null },
        { customerName: 'Ahmet Yılmaz', dateISO: '2026-12-24', startTime: '09:00:00', service: 'Kesim', businessName: 'Berber', staffName: null, mapsUrl: null },
    ];
    for (const c of cases) {
        const want = S.bookingConfirmation(
            { comms: S.resolveComms(c.comms), businessName: c.businessName, firstName: greetingName(c.customerName) },
            { items: [{ service: c.service, dateLabel: bookingDateLabel(c.dateISO, '2026-11-09'), time: c.startTime.slice(0, 5),
                staff: c.staffName ?? undefined, prep: c.prepNote ?? undefined }], mapsUrl: c.mapsUrl ?? undefined });
        assert.equal(waConfirmation({ ...c, todayISO: '2026-11-09' }), want, c.customerName);
        assert.equal(confirmationText({ ...c, todayISO: '2026-11-09' }), want, `createLive: ${c.customerName}`);
    }
    const t = waConfirmation({ ...cases[0], todayISO: '2026-11-09' });
    assert.match(t, /^Merhaba Zeynep Hanım 💇/);
    assert.match(t, /\*Tarih:\* Yarın, 10 Kasım Salı/);
    assert.match(t, /\*Hazırlık:\* Saçınızı yıkamadan gelin\./);
    assert.doesNotMatch(t, /👋|kaydınız oluşturuldu/, 'eski telefon metni kalmadı');
});

test('iptal: telefon = sunucu', () => {
    const c = { customerName: 'Nisa Yılmaz', dateISO: '2026-11-11', startTime: '13:30:00', service: 'Lazer', businessName: 'Test Salon 2', comms: KUAFOR };
    const want = S.cancelledByBusiness(
        { comms: S.resolveComms(c.comms), businessName: c.businessName, firstName: greetingName(c.customerName) },
        { service: c.service, dateLabel: bookingDateLabel(c.dateISO, '2026-11-09'), time: '13:30' });
    assert.equal(waCancellation({ ...c, todayISO: '2026-11-09' }), want);
    assert.match(want, /olarak randevunuzu iptal ettik/);
});

test('telefon: sektör tonu ayardan, hazırlık notu katalogdan gelir; eski SECTOR_COMMS metni yok', () => {
    const src = read('mobile/src/lib/managerSource.ts');
    assert.match(src, /'business_name, sector, working_hours, webhook_url, risk_rules, comms'\)/);
    assert.match(src, /read\('id, name, duration, price, color, tags, prep_note'\)/);
    const flow = read('mobile/src/components/CreateFlow.tsx');
    assert.match(flow, /comms: context\.settings\.comms,\s*prepNote: draft\.service\?\.prepNote \?\? null,/);
    const live = read('mobile/src/lib/createLive.ts');
    assert.match(live, /return waConfirmation\(\{ \.\.\.params, todayISO: params\.todayISO \?\? todayISO\(\) \}\);/);
});

test('telefondan iptal: kutu işaretli gelir, haber yalnız iptal yazılınca ve tür cancellation', () => {
    const detail = read('mobile/src/components/AppointmentDetail.tsx');
    assert.match(detail, /const \[notifyCancel, setNotifyCancel\] = useState\(true\);/);
    assert.match(detail, /notify=\{appointment\.customer_phone\s*\? \{ checked: notifyCancel/);
    assert.match(detail, /onCancel\?\.\(\{ notify: Boolean\(appointment\.customer_phone\) && notifyCancel \}\)/);
    const sheet = read('mobile/src/components/ApptSheets.tsx');
    assert.match(sheet, /action === 'cancel' && notify \? \(\s*<Checkbox/);
    assert.match(sheet, /label="Müşteriye WhatsApp'tan haber ver"/);
    const write = read('mobile/src/lib/managerWrite.ts');
    const fn = write.slice(write.indexOf('export async function sendCancelNotice'), write.indexOf('Akıştaki "Personele söyle"'));
    assert.match(fn, /kind: 'cancellation'/);
    assert.match(fn, /waCancellation\(\{/);
    assert.match(fn, /fetchOrgSettings\('business_name, comms'\)/);
    // Sunucu bu türü panelden kabul ediyor (139 izin listesi).
    assert.match(read('supabase/functions/whatsapp-proxy/index.ts'), /'manual', 'cancellation',/);
});

test('iptal penceresi: kutu varken cümle "haber gitmez" demez, yoksa der; hiçbir hâlde "gider" vaat etmez', async () => {
    const { confirmCopy, CANCEL_BODY_WITH_NOTIFY } = await import('../mobile/src/lib/appointmentDetail.ts');
    const appt = { id: 'r', customer_id: 'c', customer_name: 'Lukera', customer_phone: '905524740440', date: '2026-11-09',
        start_time: '11:00:00', end_time: '12:30:00', service: 'ağda', status: 'confirmed', staff_id: null };
    const withBox = confirmCopy('cancel', appt, null, true);
    assert.equal(withBox.body, CANCEL_BODY_WITH_NOTIFY);
    assert.doesNotMatch(withBox.body, /haber gitmez|haber gider/);
    const noBox = confirmCopy('cancel', { ...appt, customer_phone: null }, null, false);
    assert.match(noBox.body, /Müşteriye otomatik haber gitmez, siz arayın/);
    assert.equal(confirmCopy('delete', appt, null, true).body.includes('geri gelmez'), true, 'silme etkilenmez');
    assert.match(read('mobile/src/components/ApptSheets.tsx'), /confirmCopy\(action, appointment, staffName, Boolean\(notify\)\)/);
});

/**
 * Telefon · "taşındı" sayfasında WhatsApp'tan haber ver (2026-11-10).
 *
 * Telefondan taşınan randevu için müşteriye hiçbir şey gitmiyordu; yeni saati
 * ancak 24 saat önceki hatırlatmada öğreniyordu. Kilitlenenler:
 *   1. Metin kullanıcının onayladığı hâliyle (sunucu kalıbı) ve telefon = sunucu.
 *   2. Düğme yalnız numara varken, saat gerçekten değiştiğinde ve yeni saat
 *      geçmemişken var.
 *   3. Mesaj gittiyse ya da yoldaysa Geri al kalkar.
 *   4. Tür `reschedule`: sunucunun izin listesinde ve kota dışı.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as S from '../supabase/functions/_shared/booking/messages.ts';
import { greetingName } from '../supabase/functions/_shared/booking/identity.ts';
import { bookingDateLabel } from '../supabase/functions/_shared/booking/tr.ts';
import { waReschedule } from '../mobile/src/lib/waText.ts';
import {
    moveNoticeCopy, moveNoticeOf, moveNoticeOffered, moveUndoLocked,
} from '../mobile/src/lib/moveAppointment.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('metin: onaylanan hâl, eski saat yeni saatin yanında', () => {
    const c = { comms: { ...S.resolveComms(null), emoji: '✨' }, businessName: 'Luera Güzellik', firstName: 'Nisa Hanım' };
    const t = S.rescheduledByBusiness(c, {
        service: 'Cilt bakımı', dateLabel: 'Yarın, 11 Kasım Çarşamba', time: '10:30', oldTime: '09:00',
    });
    assert.equal(t, 'Merhaba Nisa Hanım ✨\n*Luera Güzellik* olarak randevunuzun saatini değiştirdik.\n\n'
        + '*Hizmet:* Cilt bakımı\n*Tarih:* Yarın, 11 Kasım Çarşamba\n*Saat:* 10:30 _(önceki: 09:00)_\n\n'
        + 'Uygun değilse bu mesaja yazmanız yeterli.');
});

test('telefon = sunucu (hitap, ton, tarih etiketi)', () => {
    const KUAFOR = { persona: 'x', audience: 'müşterimiz', servicePhrase: 'işleminizi', emoji: '💇', sector: 'kuafor' };
    const cases = [
        { customerName: 'Nisa Özer', dateISO: '2026-11-11', startTime: '10:30:00', oldStartTime: '09:00:00', service: 'cilt bakımı', businessName: 'Test Salon 2', comms: KUAFOR },
        { customerName: 'Geçici', dateISO: '2026-11-10', startTime: '17:15', oldStartTime: '16:00', service: 'Kaş', businessName: 'Berber', comms: null },
    ];
    for (const p of cases) {
        const want = S.rescheduledByBusiness(
            { comms: S.resolveComms(p.comms), businessName: p.businessName, firstName: greetingName(p.customerName) },
            { service: p.service, dateLabel: bookingDateLabel(p.dateISO, '2026-11-10'), time: p.startTime.slice(0, 5), oldTime: p.oldStartTime.slice(0, 5) });
        assert.equal(waReschedule({ ...p, todayISO: '2026-11-10' }), want, p.customerName);
    }
});

const appt = (phone) => ({ id: 'a1', customer_name: 'Nisa Özer', customer_phone: phone, service: 'ağda', date: '2026-11-11', start_time: '11:15:00', end_time: '12:45:00' });
const result = (o = {}) => ({ appointment: appt('05321112233'), fromStartMinutes: 540, fromStaffName: 'Furkan', toStartMinutes: 675, toStaffName: 'Furkan', ...o });

test('düğme ne zaman var', () => {
    assert.equal(moveNoticeOffered(result()), true);
    assert.equal(moveNoticeOffered(result({ appointment: appt(null) })), false, 'numara yok');
    assert.equal(moveNoticeOffered(result({ toStartMinutes: 540, toStaffName: 'Kemal' })), false, 'yalnız uzman değişti');
    assert.equal(moveNoticeOffered(result(), 700), false, 'yeni saat geçmiş');
    assert.equal(moveNoticeOffered(result(), 600), true);
});

test('sonuç → hâl, yazı; Geri al ne zaman kalkar', () => {
    assert.equal(moveNoticeOf('ok'), 'sent');
    assert.equal(moveNoticeOf('not_connected'), 'off');
    assert.equal(moveNoticeOf('queued'), 'queued');
    assert.equal(moveNoticeOf('opt_out'), 'opt_out');
    assert.equal(moveNoticeOf('failed'), 'failed');
    assert.deepEqual(moveNoticeCopy('ready'), { label: 'WhatsApp\'tan haber ver', pressable: true });
    assert.deepEqual(moveNoticeCopy('off'), { label: 'WhatsApp bağlı değil · Bağla', pressable: true });
    assert.equal(moveNoticeCopy('sent').pressable, false);
    assert.equal(moveNoticeCopy('failed').pressable, true);
    for (const n of ['sending', 'sent', 'queued']) assert.equal(moveUndoLocked(n), true, n);
    for (const n of ['ready', 'off', 'failed', 'opt_out', 'invalid_phone']) assert.equal(moveUndoLocked(n), false, n);
});

test('gönderim: tür reschedule, sunucu kalıbı, izin listesi ve kota dışı', () => {
    const write = read('mobile/src/lib/managerWrite.ts');
    const fn = write.slice(write.indexOf('export async function sendRescheduleNotice'), write.indexOf('Akıştaki "Personele söyle"'));
    assert.match(fn, /const text = waReschedule\(\{/);
    assert.match(fn, /kind: 'reschedule',/);
    assert.match(read('supabase/functions/whatsapp-proxy/index.ts'), /'manual', 'cancellation', 'reschedule',\n\]\);/);
    assert.match(read('supabase/functions/_shared/wa.ts'), /'feedback', 'cancellation', 'reschedule'\]\);/);
});

test('sayfa: gittiyse Geri al kalkar; hat kapalıysa önce sayfa kapanır, sonra bağlama', () => {
    const ui = read('mobile/src/components/MoveParts.tsx');
    assert.match(ui, /\{undo\.alive && onUndo && !moveUndoLocked\(notice\.state\) \? \(/);
    assert.match(ui, /if \(notice\.state === 'off'\) \{\s*\/\/[^\n]*\n\s*onDone\(\);\s*router\.push\('\/\(manager-flow\)\/whatsapp-bagla\?from=move'\);/);
    assert.match(ui, /void sendRescheduleNotice\(moved, hhmm\(result\.fromStartMinutes\)\)/);
});
